import { describe, expect, it } from 'vitest';
import { buildAdapterExportPayload } from './migrationAdapters';
import type { MigrationJobRecord, MigrationJobRowRecord } from '../shared/migration';

describe('migration adapter exports', () => {
  it('groups imported rows by route and preserves stop order', () => {
    const job: MigrationJobRecord = {
      id: 'job-1',
      fileName: 'routesmart.csv',
      sourceSystem: 'routesmart_api',
      adapterType: 'routesmart_api',
      status: 'imported',
      inviteMode: 'auto',
      autoSendInvites: true,
      createdAt: '2026-03-21T00:00:00.000Z',
      createdBy: 'admin-1',
      updatedAt: '2026-03-21T00:00:00.000Z',
      confirmedAt: '2026-03-21T00:00:00.000Z',
      confirmedBy: 'admin-1',
      rerunOfJobId: null,
      importRunCount: 1,
      version: 1,
      columnMapping: {},
      sourceHeaders: [],
      sourceRowCount: 2,
      summary: {
        totalRows: 2,
        readyRows: 0,
        warningRows: 0,
        errorRows: 0,
        duplicateRows: 0,
        importedRows: 2,
        invitedRows: 1,
        updatedRows: 1,
        createdRows: 1,
      },
      latestAdapterExport: null,
    };

    const rows: MigrationJobRowRecord[] = [
      {
        id: 'job-1:2',
        jobId: 'job-1',
        rowIndex: 2,
        sourceSystem: 'routesmart_api',
        rawSourceRow: {},
        rawServiceDays: 'Thursday',
        rawServiceType: 'residential',
        rawStopSequence: '20',
        externalAccountId: 'A-2',
        name: 'Second Stop',
        email: 'second@example.com',
        phone: '9015550102',
        address: '2 Main St',
        routeId: 'Route-1',
        stopSequence: 20,
        serviceDays: ['Thursday'],
        serviceType: 'residential',
        plan: 'Standard',
        collectionDay: 'Thursday',
        normalizedEmail: 'second@example.com',
        normalizedPhone: '9015550102',
        normalizedAddress: '2 main st',
        sourceFingerprint: 'routesmart_api:external:a-2',
        validationStatus: 'ready',
        validationIssues: [],
        dedupeResult: { mode: 'none', matchedCustomerIds: [] },
        canonicalTargetCustomerId: 'customer-2',
        importedCustomerId: 'customer-2',
        importedAt: '2026-03-21T00:00:00.000Z',
      },
      {
        id: 'job-1:1',
        jobId: 'job-1',
        rowIndex: 1,
        sourceSystem: 'routesmart_api',
        rawSourceRow: {},
        rawServiceDays: 'Thursday',
        rawServiceType: 'residential',
        rawStopSequence: '10',
        externalAccountId: 'A-1',
        name: 'First Stop',
        email: 'first@example.com',
        phone: '9015550101',
        address: '1 Main St',
        routeId: 'Route-1',
        stopSequence: 10,
        serviceDays: ['Thursday'],
        serviceType: 'residential',
        plan: 'Standard',
        collectionDay: 'Thursday',
        normalizedEmail: 'first@example.com',
        normalizedPhone: '9015550101',
        normalizedAddress: '1 main st',
        sourceFingerprint: 'routesmart_api:external:a-1',
        validationStatus: 'ready',
        validationIssues: [],
        dedupeResult: { mode: 'none', matchedCustomerIds: [] },
        canonicalTargetCustomerId: 'customer-1',
        importedCustomerId: 'customer-1',
        importedAt: '2026-03-21T00:00:00.000Z',
      },
    ];

    const payload = buildAdapterExportPayload(job, rows);

    expect(payload.adapterType).toBe('routesmart_api');
    expect(payload.routes).toHaveLength(1);
    expect(payload.routes[0]?.routeId).toBe('Route-1');
    expect(payload.routes[0]?.stops.map((stop) => stop.externalAccountId)).toEqual(['A-1', 'A-2']);
  });
});
