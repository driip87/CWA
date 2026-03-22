import { describe, expect, it } from 'vitest';
import {
  buildCanonicalImportRow,
  buildRawRowRecord,
  computeSourceFingerprint,
  errorExportRowsToCsv,
  inferColumnMapping,
  parseCsvTable,
  parseServiceDays,
  summarizeMigrationRows,
  toErrorExportRows,
} from './migration';

describe('migration helpers', () => {
  it('parses a CSV table with quoted commas and keeps headers', () => {
    const table = parseCsvTable([
      'Account ID,Customer Name,Service Address',
      'A-1,"Doe, Jane","123 Main St, Apt 4B"',
    ].join('\n'));

    expect(table.headers).toEqual(['Account ID', 'Customer Name', 'Service Address']);
    expect(table.rows).toEqual([['A-1', 'Doe, Jane', '123 Main St, Apt 4B']]);
  });

  it('infers canonical mappings from common headers', () => {
    expect(
      inferColumnMapping([
        'Account ID',
        'Customer Name',
        'Email Address',
        'Phone Number',
        'Service Address',
        'Route ID',
        'Stop Sequence',
        'Service Days',
        'Service Type',
        'Plan',
      ]),
    ).toEqual({
      externalAccountId: 'Account ID',
      name: 'Customer Name',
      email: 'Email Address',
      phone: 'Phone Number',
      address: 'Service Address',
      routeId: 'Route ID',
      stopSequence: 'Stop Sequence',
      serviceDays: 'Service Days',
      serviceType: 'Service Type',
      plan: 'Plan',
    });
  });

  it('parses service days and reports invalid values', () => {
    expect(parseServiceDays('Mon, Thursday, Freight')).toEqual({
      days: ['Monday', 'Thursday'],
      invalid: ['Freight'],
    });
  });

  it('builds canonical rows with normalized values and route fields', () => {
    const mapping = inferColumnMapping([
      'Account ID',
      'Customer Name',
      'Email Address',
      'Phone Number',
      'Service Address',
      'Route ID',
      'Stop Sequence',
      'Service Days',
      'Service Type',
      'Plan',
    ]);
    const rawRow = buildRawRowRecord(
      [
        'Account ID',
        'Customer Name',
        'Email Address',
        'Phone Number',
        'Service Address',
        'Route ID',
        'Stop Sequence',
        'Service Days',
        'Service Type',
        'Plan',
      ],
      ['A-1', 'Jane Doe', 'JANE@example.com', '(901) 555-0100', '123 Main St.', 'Route-7', '15', 'Mon,Thu', 'Residential', 'Standard'],
    );

    const row = buildCanonicalImportRow(rawRow, mapping, 'routesmart_api', 1);

    expect(row.externalAccountId).toBe('A-1');
    expect(row.normalizedEmail).toBe('jane@example.com');
    expect(row.normalizedPhone).toBe('9015550100');
    expect(row.routeId).toBe('Route-7');
    expect(row.stopSequence).toBe(15);
    expect(row.serviceDays).toEqual(['Monday', 'Thursday']);
    expect(row.serviceType).toBe('residential');
    expect(row.sourceFingerprint).toBe('routesmart_api:external:a-1');
  });

  it('uses stable fallback fingerprints when the external account id is absent', () => {
    expect(
      computeSourceFingerprint({
        sourceSystem: 'generic_csv',
        normalizedPhone: '9015550100',
        normalizedAddress: '123 main st',
        name: 'Jane Doe',
      }),
    ).toBe('generic_csv:phone_address:9015550100:123 main st');
  });

  it('builds error export rows and CSV output', () => {
    const row = {
      rowIndex: 4,
      sourceSystem: 'routesmart_api' as const,
      rawSourceRow: {},
      rawServiceDays: 'BadDay',
      rawServiceType: 'mystery',
      rawStopSequence: '',
      externalAccountId: 'A-4',
      name: 'Bad Row',
      email: '',
      phone: '',
      address: '',
      routeId: '',
      stopSequence: null,
      serviceDays: [],
      serviceType: 'mystery',
      plan: '',
      collectionDay: 'Monday',
      normalizedEmail: '',
      normalizedPhone: '',
      normalizedAddress: '',
      sourceFingerprint: 'routesmart_api:address_name::bad row',
      validationStatus: 'error' as const,
      validationIssues: [{ code: 'missing_address' as const, severity: 'error' as const, message: 'Address required' }],
      dedupeResult: { mode: 'none' as const, matchedCustomerIds: [] },
      canonicalTargetCustomerId: null,
    };

    const exportRows = toErrorExportRows([row]);
    const csv = errorExportRowsToCsv(exportRows);

    expect(exportRows).toHaveLength(1);
    expect(csv).toContain('"Bad Row"');
    expect(csv).toContain('"Address required"');
  });

  it('summarizes migration rows including imported counts', () => {
    const summary = summarizeMigrationRows(
      [
        { validationStatus: 'ready', importedCustomerId: 'customer-1' },
        { validationStatus: 'warning', importedCustomerId: null },
        { validationStatus: 'error', importedCustomerId: null },
        { validationStatus: 'duplicate_review', importedCustomerId: null },
      ],
      { createdRows: 1, updatedRows: 1, invitedRows: 1 },
    );

    expect(summary).toEqual({
      totalRows: 4,
      readyRows: 1,
      warningRows: 1,
      errorRows: 1,
      duplicateRows: 1,
      importedRows: 1,
      invitedRows: 1,
      updatedRows: 1,
      createdRows: 1,
    });
  });
});
