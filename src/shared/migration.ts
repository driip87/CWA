import { normalizeAddress, normalizeEmail, normalizePhone } from './customer';

export const CANONICAL_SERVICE_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const CANONICAL_SERVICE_TYPES = [
  'residential',
  'commercial',
  'recycling',
  'yard_waste',
  'bulk',
] as const;

export const CANONICAL_FIELDS = [
  'externalAccountId',
  'name',
  'email',
  'phone',
  'address',
  'routeId',
  'stopSequence',
  'serviceDays',
  'serviceType',
  'plan',
] as const;

export type MigrationSourceSystem = 'generic_csv' | 'routesmart_api';
export type CanonicalField = typeof CANONICAL_FIELDS[number];
export type MigrationJobStatus = 'draft' | 'mapped' | 'validated' | 'imported';
export type MigrationRowStatus = 'ready' | 'warning' | 'error' | 'duplicate_review';
export type ValidationSeverity = 'warning' | 'error';
export type CanonicalServiceDay = typeof CANONICAL_SERVICE_DAYS[number];
export type CanonicalServiceType = typeof CANONICAL_SERVICE_TYPES[number];

export interface ParsedCsvTable {
  headers: string[];
  rows: string[][];
}

export type ColumnMapping = Partial<Record<CanonicalField, string | null>>;

export interface MigrationValidationIssue {
  code:
    | 'missing_address'
    | 'bad_address'
    | 'missing_email'
    | 'invalid_service_days'
    | 'unsupported_service_type'
    | 'duplicate_in_job'
    | 'duplicate_in_canonical'
    | 'ambiguous_match'
    | 'missing_route_id'
    | 'invalid_stop_sequence';
  severity: ValidationSeverity;
  field?: CanonicalField;
  message: string;
}

export interface MigrationDedupeResult {
  mode: 'none' | 'job' | 'canonical' | 'ambiguous';
  matchedCustomerIds: string[];
}

export interface CanonicalImportRow {
  rowIndex: number;
  sourceSystem: MigrationSourceSystem;
  rawSourceRow: Record<string, string>;
  rawServiceDays: string;
  rawServiceType: string;
  rawStopSequence: string;
  externalAccountId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  routeId: string;
  stopSequence: number | null;
  serviceDays: CanonicalServiceDay[];
  serviceType: string;
  plan: string;
  collectionDay: string;
  normalizedEmail: string;
  normalizedPhone: string;
  normalizedAddress: string;
  sourceFingerprint: string;
  validationStatus: MigrationRowStatus;
  validationIssues: MigrationValidationIssue[];
  dedupeResult: MigrationDedupeResult;
  canonicalTargetCustomerId: string | null;
}

export interface MigrationJobSummary {
  totalRows: number;
  readyRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  importedRows: number;
  invitedRows: number;
  updatedRows: number;
  createdRows: number;
}

export interface MigrationJobRecord {
  id: string;
  fileName: string;
  sourceSystem: MigrationSourceSystem;
  adapterType: MigrationSourceSystem;
  status: MigrationJobStatus;
  inviteMode: 'auto' | 'manual';
  autoSendInvites: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  rerunOfJobId: string | null;
  importRunCount: number;
  version: number;
  columnMapping: ColumnMapping;
  sourceHeaders: string[];
  sourceRowCount: number;
  summary: MigrationJobSummary;
  latestAdapterExport: AdapterExportPayload | null;
}

export interface MigrationJobRowRecord extends CanonicalImportRow {
  id: string;
  jobId: string;
  importedCustomerId: string | null;
  importedAt: string | null;
}

export interface MigrationAuditRecord {
  id: string;
  jobId: string;
  eventType:
    | 'job_created'
    | 'mapping_saved'
    | 'validation_completed'
    | 'import_confirmed'
    | 'rerun_started'
    | 'error_export_generated'
    | 'adapter_export_generated'
    | 'invite_sent';
  actorUid: string | null;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface MigrationDashboard {
  activeJobCount: number;
  jobsAwaitingReview: number;
  totalRowsProcessed: number;
  totalRowsImported: number;
  lastImportedAt: string | null;
}

export interface ErrorExportRow {
  rowIndex: number;
  externalAccountId: string;
  name: string;
  email: string;
  address: string;
  routeId: string;
  stopSequence: string;
  validationStatus: MigrationRowStatus;
  issues: string;
}

export interface AdapterExportStop {
  externalAccountId: string;
  customerName: string;
  address: string;
  email: string;
  phone: string;
  stopSequence: number | null;
  serviceDays: string[];
  serviceType: string;
}

export interface AdapterExportPayload {
  adapterType: MigrationSourceSystem;
  generatedAt: string;
  sourceJobId: string;
  routes: Array<{
    routeId: string;
    stops: AdapterExportStop[];
  }>;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  externalAccountId: ['accountid', 'externalaccountid', 'customerid', 'accountnumber', 'acctid', 'acctnumber'],
  name: ['name', 'customername', 'fullname'],
  email: ['email', 'emailaddress'],
  phone: ['phone', 'phonenumber', 'mobile', 'telephone'],
  address: ['address', 'streetaddress', 'serviceaddress', 'address1'],
  routeId: ['routeid', 'route', 'routeidentifier', 'routename'],
  stopSequence: ['stopsequence', 'sequence', 'stoporder', 'sequencenumber'],
  serviceDays: ['servicedays', 'serviceday', 'collectionday', 'pickupday', 'days'],
  serviceType: ['servicetype', 'serviceline', 'type'],
  plan: ['plan', 'serviceplan', 'planname', 'subscriptionplan'],
};

export function parseCsvTable(text: string): ParsedCsvTable {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0]!.map((header) => header.trim());
  const dataRows = rows.slice(1).filter((values) => values.some((value) => value.length > 0));
  return { headers, rows: dataRows };
}

export function inferColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((header) => ({ raw: header, normalized: normalizeHeader(header) }));
  const mapping: ColumnMapping = {};

  for (const field of CANONICAL_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (match) {
      mapping[field] = match.raw;
    }
  }

  return mapping;
}

export function buildRawRowRecord(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>((acc, header, index) => {
    acc[header] = row[index] || '';
    return acc;
  }, {});
}

function getMappedValue(rawRow: Record<string, string>, mapping: ColumnMapping, field: CanonicalField) {
  const mappedColumn = mapping[field];
  if (!mappedColumn) return '';
  return (rawRow[mappedColumn] || '').trim();
}

export function parseServiceDays(value: string) {
  if (!value.trim()) {
    return { days: [] as CanonicalServiceDay[], invalid: [] as string[] };
  }

  const aliases: Record<string, CanonicalServiceDay> = {
    mon: 'Monday',
    monday: 'Monday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',
    thu: 'Thursday',
    thur: 'Thursday',
    thursday: 'Thursday',
    fri: 'Friday',
    friday: 'Friday',
    sat: 'Saturday',
    saturday: 'Saturday',
    sun: 'Sunday',
    sunday: 'Sunday',
  };

  const seen = new Set<CanonicalServiceDay>();
  const invalid: string[] = [];

  value
    .split(/[|,;/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const normalized = aliases[part.toLowerCase()];
      if (!normalized) {
        invalid.push(part);
        return;
      }
      seen.add(normalized);
    });

  return { days: Array.from(seen), invalid };
}

export function normalizeServiceType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return '';
  return normalized;
}

export function computeSourceFingerprint(input: {
  sourceSystem: MigrationSourceSystem;
  externalAccountId?: string;
  normalizedEmail?: string;
  normalizedPhone?: string;
  normalizedAddress?: string;
  name?: string;
}) {
  const externalAccountId = (input.externalAccountId || '').trim();
  if (externalAccountId) {
    return `${input.sourceSystem}:external:${externalAccountId.toLowerCase()}`;
  }

  if (input.normalizedEmail) {
    return `${input.sourceSystem}:email:${input.normalizedEmail}`;
  }

  if (input.normalizedPhone && input.normalizedAddress) {
    return `${input.sourceSystem}:phone_address:${input.normalizedPhone}:${input.normalizedAddress}`;
  }

  return `${input.sourceSystem}:address_name:${input.normalizedAddress || ''}:${(input.name || '').trim().toLowerCase()}`;
}

export function buildCanonicalImportRow(
  rawRow: Record<string, string>,
  mapping: ColumnMapping,
  sourceSystem: MigrationSourceSystem,
  rowIndex: number,
): CanonicalImportRow {
  const externalAccountId = getMappedValue(rawRow, mapping, 'externalAccountId');
  const name = getMappedValue(rawRow, mapping, 'name');
  const email = getMappedValue(rawRow, mapping, 'email');
  const phone = getMappedValue(rawRow, mapping, 'phone');
  const address = getMappedValue(rawRow, mapping, 'address');
  const routeId = getMappedValue(rawRow, mapping, 'routeId');
  const stopSequenceRaw = getMappedValue(rawRow, mapping, 'stopSequence');
  const serviceDaysRaw = getMappedValue(rawRow, mapping, 'serviceDays');
  const serviceTypeRaw = getMappedValue(rawRow, mapping, 'serviceType');
  const serviceType = normalizeServiceType(serviceTypeRaw);
  const plan = getMappedValue(rawRow, mapping, 'plan');
  const { days } = parseServiceDays(serviceDaysRaw);

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const normalizedAddress = normalizeAddress(address);

  return {
    rowIndex,
    sourceSystem,
    rawSourceRow: rawRow,
    rawServiceDays: serviceDaysRaw,
    rawServiceType: serviceTypeRaw,
    rawStopSequence: stopSequenceRaw,
    externalAccountId,
    name,
    email,
    phone,
    address,
    routeId,
    stopSequence: stopSequenceRaw ? Number.parseInt(stopSequenceRaw, 10) : null,
    serviceDays: days,
    serviceType,
    plan,
    collectionDay: days[0] || 'Monday',
    normalizedEmail,
    normalizedPhone,
    normalizedAddress,
    sourceFingerprint: computeSourceFingerprint({
      sourceSystem,
      externalAccountId,
      normalizedEmail,
      normalizedPhone,
      normalizedAddress,
      name,
    }),
    validationStatus: 'ready',
    validationIssues: [],
    dedupeResult: { mode: 'none', matchedCustomerIds: [] },
    canonicalTargetCustomerId: null,
  };
}

export function summarizeMigrationRows(
  rows: Array<Pick<CanonicalImportRow, 'validationStatus'> & { importedCustomerId?: string | null; dedupeResult?: MigrationDedupeResult }>,
  importStats?: { createdRows?: number; updatedRows?: number; invitedRows?: number },
): MigrationJobSummary {
  return rows.reduce<MigrationJobSummary>(
    (summary, row) => {
      summary.totalRows += 1;
      if (row.validationStatus === 'ready') summary.readyRows += 1;
      if (row.validationStatus === 'warning') summary.warningRows += 1;
      if (row.validationStatus === 'error') summary.errorRows += 1;
      if (row.validationStatus === 'duplicate_review') summary.duplicateRows += 1;
      if (row.importedCustomerId) summary.importedRows += 1;
      return summary;
    },
    {
      totalRows: 0,
      readyRows: 0,
      warningRows: 0,
      errorRows: 0,
      duplicateRows: 0,
      importedRows: 0,
      invitedRows: importStats?.invitedRows || 0,
      updatedRows: importStats?.updatedRows || 0,
      createdRows: importStats?.createdRows || 0,
    },
  );
}

export function toErrorExportRows(rows: CanonicalImportRow[]): ErrorExportRow[] {
  return rows
    .filter((row) => row.validationStatus === 'error' || row.validationStatus === 'duplicate_review')
    .map((row) => ({
      rowIndex: row.rowIndex,
      externalAccountId: row.externalAccountId,
      name: row.name,
      email: row.email,
      address: row.address,
      routeId: row.routeId,
      stopSequence: row.stopSequence == null ? '' : String(row.stopSequence),
      validationStatus: row.validationStatus,
      issues: row.validationIssues.map((issue) => issue.message).join(' | '),
    }));
}

export function errorExportRowsToCsv(rows: ErrorExportRow[]) {
  const headers = ['Row', 'External Account ID', 'Name', 'Email', 'Address', 'Route ID', 'Stop Sequence', 'Status', 'Issues'];
  const csvRows = rows.map((row) => [
    row.rowIndex,
    row.externalAccountId,
    row.name,
    row.email,
    row.address,
    row.routeId,
    row.stopSequence,
    row.validationStatus,
    row.issues,
  ]);

  return [headers, ...csvRows]
    .map((values) =>
      values
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
}
