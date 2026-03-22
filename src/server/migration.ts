import { adminDb } from './firebaseAdmin';
import { createInviteForCustomer } from './phase1';
import type { CustomerProfile } from '../shared/customer';
import { normalizeAddress, normalizeEmail, normalizePhone } from '../shared/customer';
import {
  CANONICAL_FIELDS,
  CANONICAL_SERVICE_TYPES,
  buildCanonicalImportRow,
  buildRawRowRecord,
  errorExportRowsToCsv,
  inferColumnMapping,
  normalizeServiceType,
  parseCsvTable,
  parseServiceDays,
  summarizeMigrationRows,
  toErrorExportRows,
  type AdapterExportPayload,
  type CanonicalImportRow,
  type ColumnMapping,
  type MigrationAuditRecord,
  type MigrationDashboard,
  type MigrationDedupeResult,
  type MigrationJobRecord,
  type MigrationJobRowRecord,
  type MigrationRowStatus,
  type MigrationSourceSystem,
  type MigrationValidationIssue,
} from '../shared/migration';
import { buildAdapterExportPayload } from './migrationAdapters';

const MIGRATION_JOBS = 'migrationJobs';
const MIGRATION_ROWS = 'migrationJobRows';
const MIGRATION_AUDIT = 'migrationAuditLog';

type ImportStats = {
  createdRows: number;
  updatedRows: number;
  invitedRows: number;
};

function nowIso() {
  return new Date().toISOString();
}

function createEmptySummary() {
  return summarizeMigrationRows([]);
}

function sanitizeCustomer(customerId: string, raw?: FirebaseFirestore.DocumentData | null): CustomerProfile | null {
  if (!raw) return null;

  return {
    id: customerId,
    ...raw,
    normalizedEmail: raw.normalizedEmail || normalizeEmail(raw.email),
    normalizedPhone: raw.normalizedPhone || normalizePhone(raw.phone),
    normalizedAddress: raw.normalizedAddress || normalizeAddress(raw.address),
    recordStatus: raw.recordStatus || 'active',
    pendingLinkedAuthUid: raw.pendingLinkedAuthUid || null,
    sourceSystem: raw.sourceSystem || null,
    externalAccountId: raw.externalAccountId || null,
    routeId: raw.routeId || null,
    stopSequence: raw.stopSequence ?? null,
    serviceDays: Array.isArray(raw.serviceDays) ? raw.serviceDays : [],
    serviceType: raw.serviceType || null,
    sourceFingerprint: raw.sourceFingerprint || null,
    lastMigrationJobId: raw.lastMigrationJobId || null,
    lastMigrationAppliedAt: raw.lastMigrationAppliedAt || null,
  };
}

function applyImportStatsToSummary(rows: MigrationJobRowRecord[], importStats: ImportStats) {
  return summarizeMigrationRows(rows, importStats);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function getActiveCustomers() {
  const snapshot = await adminDb.collection('users').get();
  return snapshot.docs
    .map((doc) => sanitizeCustomer(doc.id, doc.data()))
    .filter((customer): customer is CustomerProfile => Boolean(customer))
    .filter((customer) => customer.recordStatus !== 'archived');
}

async function getMigrationJob(jobId: string) {
  const snapshot = await adminDb.collection(MIGRATION_JOBS).doc(jobId).get();
  if (!snapshot.exists) {
    throw new Error('Migration job not found');
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<MigrationJobRecord, 'id'>),
  } as MigrationJobRecord;
}

async function getMigrationRows(jobId: string) {
  const snapshot = await adminDb.collection(MIGRATION_ROWS).where('jobId', '==', jobId).get();
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<MigrationJobRowRecord, 'id'>),
    }))
    .sort((left, right) => left.rowIndex - right.rowIndex);
}

async function getMigrationAudit(jobId: string) {
  const snapshot = await adminDb.collection(MIGRATION_AUDIT).where('jobId', '==', jobId).get();
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<MigrationAuditRecord, 'id'>),
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function writeAudit(jobId: string, eventType: MigrationAuditRecord['eventType'], actorUid: string | null, details: Record<string, unknown>) {
  await adminDb.collection(MIGRATION_AUDIT).add({
    jobId,
    eventType,
    actorUid,
    createdAt: nowIso(),
    details,
  });
}

function createJobRecord(input: {
  id: string;
  fileName: string;
  sourceSystem: MigrationSourceSystem;
  adapterType: MigrationSourceSystem;
  createdBy: string;
  sourceHeaders: string[];
  sourceRowCount: number;
  columnMapping: ColumnMapping;
}): MigrationJobRecord {
  const timestamp = nowIso();
  return {
    id: input.id,
    fileName: input.fileName,
    sourceSystem: input.sourceSystem,
    adapterType: input.adapterType,
    status: 'draft',
    inviteMode: 'auto',
    autoSendInvites: true,
    createdAt: timestamp,
    createdBy: input.createdBy,
    updatedAt: timestamp,
    confirmedAt: null,
    confirmedBy: null,
    rerunOfJobId: null,
    importRunCount: 0,
    version: 1,
    columnMapping: input.columnMapping,
    sourceHeaders: input.sourceHeaders,
    sourceRowCount: input.sourceRowCount,
    summary: createEmptySummary(),
    latestAdapterExport: null,
  };
}

function toRowDocId(jobId: string, rowIndex: number) {
  return `${jobId}:${rowIndex}`;
}

async function saveRows(jobId: string, rows: MigrationJobRowRecord[]) {
  for (const batchRows of chunk(rows, 200)) {
    const batch = adminDb.batch();
    for (const row of batchRows) {
      const ref = adminDb.collection(MIGRATION_ROWS).doc(toRowDocId(jobId, row.rowIndex));
      batch.set(ref, row, { merge: true });
    }
    await batch.commit();
  }
}

function resetRowForMapping(jobId: string, row: MigrationJobRowRecord, mapping: ColumnMapping, sourceSystem: MigrationSourceSystem): MigrationJobRowRecord {
  const canonical = buildCanonicalImportRow(row.rawSourceRow, mapping, sourceSystem, row.rowIndex);
  return {
    ...row,
    ...canonical,
    jobId,
    importedCustomerId: row.importedCustomerId || null,
    importedAt: row.importedAt || null,
  };
}

function addIssue(issues: MigrationValidationIssue[], issue: MigrationValidationIssue) {
  issues.push(issue);
}

function determineRowStatus(issues: MigrationValidationIssue[]): MigrationRowStatus {
  if (issues.some((issue) => issue.code === 'duplicate_in_job' || issue.code === 'ambiguous_match')) {
    return 'duplicate_review';
  }
  if (issues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }
  if (issues.some((issue) => issue.severity === 'warning')) {
    return 'warning';
  }
  return 'ready';
}

function getRowCanonicalMatches(customers: CustomerProfile[], row: CanonicalImportRow) {
  const fingerprintMatches = customers.filter((customer) => customer.sourceFingerprint && customer.sourceFingerprint === row.sourceFingerprint);
  if (fingerprintMatches.length > 0) {
    return fingerprintMatches;
  }

  if (row.normalizedEmail) {
    const emailMatches = customers.filter(
      (customer) => normalizeEmail(customer.normalizedEmail || customer.email) === row.normalizedEmail,
    );
    if (emailMatches.length > 0) {
      return emailMatches;
    }
  }

  if (row.normalizedPhone && row.normalizedAddress) {
    return customers.filter((customer) => {
      const customerPhone = normalizePhone(customer.normalizedPhone || customer.phone);
      const customerAddress = normalizeAddress(customer.normalizedAddress || customer.address);
      return customerPhone === row.normalizedPhone && customerAddress === row.normalizedAddress;
    });
  }

  return [];
}

function validateAddress(address: string, normalizedAddress: string) {
  if (!address.trim()) {
    return { valid: false, code: 'missing_address' as const, message: 'Address is required for migration.' };
  }

  const hasStreetNumber = /\d/.test(address);
  if (!hasStreetNumber || normalizedAddress.length < 8) {
    return { valid: false, code: 'bad_address' as const, message: 'Address looks incomplete or malformed.' };
  }

  return { valid: true };
}

function validateRow(
  row: MigrationJobRowRecord,
  jobFingerprintCounts: Map<string, number>,
  customers: CustomerProfile[],
): MigrationJobRowRecord {
  const issues: MigrationValidationIssue[] = [];
  const addressValidation = validateAddress(row.address, row.normalizedAddress);
  const parsedServiceDays = parseServiceDays(row.rawServiceDays);

  if (!addressValidation.valid) {
    addIssue(issues, {
      code: addressValidation.code,
      severity: 'error',
      field: 'address',
      message: addressValidation.message,
    });
  }

  if (!row.email) {
    addIssue(issues, {
      code: 'missing_email',
      severity: 'warning',
      field: 'email',
      message: 'Row is missing an email address. Claim invites will be skipped.',
    });
  }

  if (!row.serviceDays.length) {
    addIssue(issues, {
      code: 'invalid_service_days',
      severity: 'error',
      field: 'serviceDays',
      message: 'At least one valid service day is required.',
    });
  }

  if (parsedServiceDays.invalid.length > 0) {
    addIssue(issues, {
      code: 'invalid_service_days',
      severity: 'error',
      field: 'serviceDays',
      message: `Unsupported service day values: ${parsedServiceDays.invalid.join(', ')}.`,
    });
  }

  if (!row.routeId) {
    addIssue(issues, {
      code: 'missing_route_id',
      severity: 'error',
      field: 'routeId',
      message: 'Route ID is required to preserve source route identifiers.',
    });
  }

  if (!row.rawStopSequence || row.stopSequence == null || Number.isNaN(row.stopSequence) || row.stopSequence <= 0) {
    addIssue(issues, {
      code: 'invalid_stop_sequence',
      severity: 'error',
      field: 'stopSequence',
      message: 'Stop sequence must be a positive integer.',
    });
  }

  const normalizedServiceType = normalizeServiceType(row.rawServiceType || row.serviceType);
  if (!normalizedServiceType || !CANONICAL_SERVICE_TYPES.includes(normalizedServiceType as typeof CANONICAL_SERVICE_TYPES[number])) {
    addIssue(issues, {
      code: 'unsupported_service_type',
      severity: 'error',
      field: 'serviceType',
      message: `Unsupported service type "${row.serviceType || 'blank'}".`,
    });
  }

  if ((jobFingerprintCounts.get(row.sourceFingerprint) || 0) > 1) {
    addIssue(issues, {
      code: 'duplicate_in_job',
      severity: 'warning',
      message: 'Multiple staged rows resolve to the same source fingerprint in this job.',
    });
  }

  const canonicalMatches = getRowCanonicalMatches(customers, row);
  let dedupeResult: MigrationDedupeResult = { mode: 'none', matchedCustomerIds: [] };

  if (canonicalMatches.length === 1) {
    dedupeResult = { mode: 'canonical', matchedCustomerIds: [canonicalMatches[0]!.id!] };
    addIssue(issues, {
      code: 'duplicate_in_canonical',
      severity: 'warning',
      message: 'Row matches an existing customer and will update that record.',
    });
  } else if (canonicalMatches.length > 1) {
    dedupeResult = { mode: 'ambiguous', matchedCustomerIds: canonicalMatches.map((customer) => customer.id!).filter(Boolean) };
    addIssue(issues, {
      code: 'ambiguous_match',
      severity: 'warning',
      message: 'Row matches multiple canonical customers and needs review.',
    });
  }

  return {
    ...row,
    serviceType: normalizedServiceType,
    validationIssues: issues,
    dedupeResult,
    canonicalTargetCustomerId: dedupeResult.mode === 'canonical' ? dedupeResult.matchedCustomerIds[0]! : null,
    validationStatus: determineRowStatus(issues),
  };
}

function buildImportPayload(row: MigrationJobRowRecord, jobId: string, existingCustomer?: CustomerProfile | null) {
  const createdAt = existingCustomer?.createdAt || nowIso();
  const email = row.email;

  return {
    name: row.name,
    email,
    phone: row.phone,
    address: row.address,
    role: 'user' as const,
    createdAt,
    subscriptionStatus: existingCustomer?.subscriptionStatus || 'active',
    imported: true,
    importSource: row.sourceSystem,
    importBatchId: jobId,
    normalizedEmail: row.normalizedEmail,
    normalizedPhone: row.normalizedPhone,
    normalizedAddress: row.normalizedAddress,
    plan: row.plan || existingCustomer?.plan || 'Standard Residential',
    collectionDay: row.collectionDay || existingCustomer?.collectionDay || 'Monday',
    recordStatus: existingCustomer?.recordStatus || 'active',
    mergedIntoCustomerId: existingCustomer?.mergedIntoCustomerId || null,
    latestInviteId: existingCustomer?.latestInviteId || null,
    latestInviteSentAt: existingCustomer?.latestInviteSentAt || null,
    latestInviteExpiresAt: existingCustomer?.latestInviteExpiresAt || null,
    latestInviteResendCount: existingCustomer?.latestInviteResendCount || 0,
    linkedAuthUid: existingCustomer?.linkedAuthUid || null,
    pendingLinkedAuthUid: existingCustomer?.pendingLinkedAuthUid || null,
    claimStatus: existingCustomer?.linkedAuthUid
      ? 'claimed'
      : existingCustomer?.pendingLinkedAuthUid
        ? 'pending_verification'
        : email
          ? existingCustomer?.claimStatus === 'invited'
            ? 'invited'
            : 'not_invited'
          : 'missing_email',
    sourceSystem: row.sourceSystem,
    externalAccountId: row.externalAccountId || existingCustomer?.externalAccountId || null,
    routeId: row.routeId,
    stopSequence: row.stopSequence,
    serviceDays: row.serviceDays,
    serviceType: row.serviceType,
    sourceFingerprint: row.sourceFingerprint,
    lastMigrationJobId: jobId,
    lastMigrationAppliedAt: nowIso(),
  };
}

async function fetchCustomerById(customerId: string) {
  const snapshot = await adminDb.collection('users').doc(customerId).get();
  return sanitizeCustomer(snapshot.id, snapshot.data());
}

async function maybeSendInvite(customerId: string, actorUid: string | null) {
  const customer = await fetchCustomerById(customerId);
  if (!customer || !customer.email || customer.linkedAuthUid || customer.pendingLinkedAuthUid) {
    return false;
  }

  if (customer.latestInviteId && customer.claimStatus === 'invited') {
    return false;
  }

  await createInviteForCustomer(customerId, actorUid);
  return true;
}

async function getJobDetails(jobId: string) {
  const [job, rows, auditLog] = await Promise.all([
    getMigrationJob(jobId),
    getMigrationRows(jobId),
    getMigrationAudit(jobId),
  ]);

  const issueCounts = rows.reduce<Record<string, number>>((acc, row) => {
    row.validationIssues.forEach((issue) => {
      acc[issue.code] = (acc[issue.code] || 0) + 1;
    });
    return acc;
  }, {});

  return {
    job,
    rows,
    auditLog,
    reports: {
      issueCounts,
      errorRows: toErrorExportRows(rows),
      duplicateRows: rows.filter((row) => row.validationStatus === 'duplicate_review'),
    },
  };
}

export async function createMigrationJob(input: {
  csvText: string;
  fileName?: string;
  sourceSystem?: MigrationSourceSystem;
  adapterType?: MigrationSourceSystem;
  adminUid: string;
}) {
  const parsed = parseCsvTable(input.csvText || '');
  if (!parsed.headers.length) {
    throw new Error('CSV file must include a header row');
  }

  const sourceSystem = input.sourceSystem || 'routesmart_api';
  const adapterType = input.adapterType || sourceSystem;
  const jobRef = adminDb.collection(MIGRATION_JOBS).doc();
  const columnMapping = inferColumnMapping(parsed.headers);
  const job = createJobRecord({
    id: jobRef.id,
    fileName: input.fileName || 'migration-upload.csv',
    sourceSystem,
    adapterType,
    createdBy: input.adminUid,
    sourceHeaders: parsed.headers,
    sourceRowCount: parsed.rows.length,
    columnMapping,
  });

  const rowDocs: MigrationJobRowRecord[] = parsed.rows.map((row, index) => {
    const rawSourceRow = buildRawRowRecord(parsed.headers, row);
    const canonical = buildCanonicalImportRow(rawSourceRow, columnMapping, sourceSystem, index + 1);

    return {
      id: toRowDocId(jobRef.id, index + 1),
      jobId: jobRef.id,
      ...canonical,
      importedCustomerId: null,
      importedAt: null,
    };
  });

  const summary = summarizeMigrationRows(rowDocs);
  await jobRef.set({
    ...job,
    summary,
  });
  await saveRows(jobRef.id, rowDocs);
  await writeAudit(jobRef.id, 'job_created', input.adminUid, {
    fileName: job.fileName,
    sourceSystem,
    rowCount: parsed.rows.length,
  });

  return getJobDetails(jobRef.id);
}

export async function listMigrationJobs() {
  const snapshot = await adminDb.collection(MIGRATION_JOBS).get();
  const jobs = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<MigrationJobRecord, 'id'>),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return { jobs };
}

export async function getMigrationDashboard() {
  const snapshot = await adminDb.collection(MIGRATION_JOBS).get();
  const jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<MigrationJobRecord, 'id'>) })) as MigrationJobRecord[];

  const dashboard: MigrationDashboard = {
    activeJobCount: jobs.filter((job) => job.status !== 'imported').length,
    jobsAwaitingReview: jobs.filter(
      (job) => job.summary.errorRows > 0 || job.summary.duplicateRows > 0 || job.status === 'draft' || job.status === 'mapped',
    ).length,
    totalRowsProcessed: jobs.reduce((sum, job) => sum + job.summary.totalRows, 0),
    totalRowsImported: jobs.reduce((sum, job) => sum + job.summary.importedRows, 0),
    lastImportedAt: jobs
      .filter((job) => job.confirmedAt)
      .map((job) => job.confirmedAt!)
      .sort()
      .at(-1) || null,
  };

  return { dashboard };
}

export async function saveMigrationColumnMapping(jobId: string, input: { columnMapping: ColumnMapping; autoSendInvites?: boolean; adminUid: string }) {
  const job = await getMigrationJob(jobId);
  const rows = await getMigrationRows(jobId);
  const nextRows = rows.map((row) => resetRowForMapping(jobId, row, input.columnMapping, job.sourceSystem));
  const updatedAt = nowIso();

  await saveRows(jobId, nextRows);
  await adminDb.collection(MIGRATION_JOBS).doc(jobId).set(
    {
      columnMapping: input.columnMapping,
      autoSendInvites: input.autoSendInvites ?? job.autoSendInvites,
      status: 'mapped',
      updatedAt,
      version: job.version + 1,
      summary: summarizeMigrationRows(nextRows),
    },
    { merge: true },
  );
  await writeAudit(jobId, 'mapping_saved', input.adminUid, {
    mappedFields: CANONICAL_FIELDS.filter((field) => Boolean(input.columnMapping[field])).length,
    autoSendInvites: input.autoSendInvites ?? job.autoSendInvites,
  });

  return getJobDetails(jobId);
}

export async function validateMigrationJob(jobId: string, adminUid: string) {
  const [job, rows, customers] = await Promise.all([getMigrationJob(jobId), getMigrationRows(jobId), getActiveCustomers()]);
  const fingerprintCounts = rows.reduce<Map<string, number>>((acc, row) => {
    acc.set(row.sourceFingerprint, (acc.get(row.sourceFingerprint) || 0) + 1);
    return acc;
  }, new Map());

  const validatedRows = rows.map((row) => validateRow(row, fingerprintCounts, customers));
  const summary = summarizeMigrationRows(validatedRows);

  await saveRows(jobId, validatedRows);
  await adminDb.collection(MIGRATION_JOBS).doc(jobId).set(
    {
      status: 'validated',
      updatedAt: nowIso(),
      version: job.version + 1,
      summary,
    },
    { merge: true },
  );
  await writeAudit(jobId, 'validation_completed', adminUid, {
    issueCounts: validatedRows.reduce<Record<string, number>>((acc, row) => {
      row.validationIssues.forEach((issue) => {
        acc[issue.code] = (acc[issue.code] || 0) + 1;
      });
      return acc;
    }, {}),
  });

  return getJobDetails(jobId);
}

async function findOrCreateImportTarget(row: MigrationJobRowRecord, jobId: string) {
  const customers = await getActiveCustomers();
  const matches = getRowCanonicalMatches(customers, row);
  const target = row.canonicalTargetCustomerId
    ? matches.find((customer) => customer.id === row.canonicalTargetCustomerId) || (await fetchCustomerById(row.canonicalTargetCustomerId))
    : matches[0] || null;

  if (target?.id) {
    const payload = buildImportPayload(row, jobId, target);
    await adminDb.collection('users').doc(target.id).set(payload, { merge: true });
    return { customerId: target.id, created: false };
  }

  const docRef = adminDb.collection('users').doc();
  await docRef.set(buildImportPayload(row, jobId, null));
  return { customerId: docRef.id, created: true };
}

export async function confirmMigrationJob(
  jobId: string,
  input: { adminUid: string; autoSendInvites?: boolean },
) {
  const job = await getMigrationJob(jobId);
  const rows = await getMigrationRows(jobId);
  const eligibleRows = rows.filter((row) => row.validationStatus === 'ready' || row.validationStatus === 'warning');
  const autoSendInvites = input.autoSendInvites ?? job.autoSendInvites;
  const stats: ImportStats = { createdRows: 0, updatedRows: 0, invitedRows: 0 };
  const updatedRows: MigrationJobRowRecord[] = [];

  for (const row of rows) {
    if (!eligibleRows.some((candidate) => candidate.id === row.id)) {
      updatedRows.push(row);
      continue;
    }

    const importTarget = await findOrCreateImportTarget(row, jobId);
    if (importTarget.created) {
      stats.createdRows += 1;
    } else {
      stats.updatedRows += 1;
    }

    let invited = false;
    if (autoSendInvites) {
      invited = await maybeSendInvite(importTarget.customerId, input.adminUid);
      if (invited) {
        stats.invitedRows += 1;
        await writeAudit(jobId, 'invite_sent', input.adminUid, {
          rowIndex: row.rowIndex,
          customerId: importTarget.customerId,
        });
      }
    }

    const refreshedCustomer = await fetchCustomerById(importTarget.customerId);
    updatedRows.push({
      ...row,
      importedCustomerId: importTarget.customerId,
      importedAt: nowIso(),
      canonicalTargetCustomerId: importTarget.customerId,
      validationStatus: row.validationStatus,
      dedupeResult:
        row.dedupeResult.mode === 'none' && !importTarget.created
          ? { mode: 'canonical', matchedCustomerIds: [importTarget.customerId] }
          : row.dedupeResult,
      validationIssues: invited
        ? row.validationIssues
        : row.validationIssues,
      sourceFingerprint: refreshedCustomer?.sourceFingerprint || row.sourceFingerprint,
    });
  }

  const summary = applyImportStatsToSummary(updatedRows, stats);
  const adapterExport = buildAdapterExportPayload(
    {
      ...job,
      autoSendInvites,
      latestAdapterExport: job.latestAdapterExport,
    },
    updatedRows,
  );

  await saveRows(jobId, updatedRows);
  await adminDb.collection(MIGRATION_JOBS).doc(jobId).set(
    {
      status: 'imported',
      autoSendInvites,
      confirmedAt: nowIso(),
      confirmedBy: input.adminUid,
      updatedAt: nowIso(),
      importRunCount: (job.importRunCount || 0) + 1,
      version: job.version + 1,
      summary,
      latestAdapterExport: adapterExport,
    },
    { merge: true },
  );
  await writeAudit(jobId, 'import_confirmed', input.adminUid, {
    autoSendInvites,
    importStats: stats,
  });

  return getJobDetails(jobId);
}

export async function rerunMigrationJob(jobId: string, adminUid: string) {
  const job = await getMigrationJob(jobId);
  await writeAudit(jobId, 'rerun_started', adminUid, {
    priorImportRunCount: job.importRunCount,
  });

  return confirmMigrationJob(jobId, {
    adminUid,
    autoSendInvites: job.autoSendInvites,
  });
}

export async function exportMigrationErrors(jobId: string, adminUid: string) {
  const rows = await getMigrationRows(jobId);
  const errorRows = toErrorExportRows(rows);
  const csvText = errorExportRowsToCsv(errorRows);
  await writeAudit(jobId, 'error_export_generated', adminUid, {
    rowCount: errorRows.length,
  });

  return {
    fileName: `migration-errors-${jobId}.csv`,
    csvText,
    rows: errorRows,
  };
}

export async function exportMigrationAdapter(jobId: string, adminUid: string) {
  const [job, rows] = await Promise.all([getMigrationJob(jobId), getMigrationRows(jobId)]);
  const payload: AdapterExportPayload = buildAdapterExportPayload(job, rows);

  await adminDb.collection(MIGRATION_JOBS).doc(jobId).set(
    {
      latestAdapterExport: payload,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await writeAudit(jobId, 'adapter_export_generated', adminUid, {
    routeCount: payload.routes.length,
  });

  return { payload };
}

export async function getMigrationJobDetails(jobId: string) {
  return getJobDetails(jobId);
}
