import type {
  AdapterExportPayload,
  AdapterExportStop,
  MigrationJobRecord,
  MigrationJobRowRecord,
  MigrationSourceSystem,
} from '../shared/migration';

function sortRows(rows: MigrationJobRowRecord[]) {
  return [...rows].sort((left, right) => {
    if (left.routeId !== right.routeId) {
      return left.routeId.localeCompare(right.routeId);
    }

    const leftStop = left.stopSequence ?? Number.MAX_SAFE_INTEGER;
    const rightStop = right.stopSequence ?? Number.MAX_SAFE_INTEGER;
    if (leftStop !== rightStop) {
      return leftStop - rightStop;
    }

    return left.rowIndex - right.rowIndex;
  });
}

function toStop(row: MigrationJobRowRecord): AdapterExportStop {
  return {
    externalAccountId: row.externalAccountId,
    customerName: row.name,
    address: row.address,
    email: row.email,
    phone: row.phone,
    stopSequence: row.stopSequence,
    serviceDays: row.serviceDays,
    serviceType: row.serviceType,
  };
}

function buildGroupedRoutePayload(
  adapterType: MigrationSourceSystem,
  job: MigrationJobRecord,
  rows: MigrationJobRowRecord[],
): AdapterExportPayload {
  const grouped = new Map<string, AdapterExportStop[]>();

  for (const row of sortRows(rows)) {
    const routeId = row.routeId || 'UNASSIGNED';
    const current = grouped.get(routeId) || [];
    current.push(toStop(row));
    grouped.set(routeId, current);
  }

  return {
    adapterType,
    generatedAt: new Date().toISOString(),
    sourceJobId: job.id,
    routes: Array.from(grouped.entries()).map(([routeId, stops]) => ({
      routeId,
      stops,
    })),
  };
}

export function buildAdapterExportPayload(job: MigrationJobRecord, rows: MigrationJobRowRecord[]) {
  const importedRows = rows.filter((row) => Boolean(row.importedCustomerId));

  if (job.adapterType === 'routesmart_api') {
    return buildGroupedRoutePayload('routesmart_api', job, importedRows);
  }

  return buildGroupedRoutePayload('generic_csv', job, importedRows);
}
