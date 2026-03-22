import { adminDb } from '../firebaseAdmin';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  type AdminAnalyticsResponse,
  type AdminOverviewResponse,
  type ConnectionHealth,
  type IntegrationConnectionRecord,
  type IntegrationSyncJob,
  type NormalizedDomainSnapshot,
  type RawPayloadRecord,
  type TenantRecord,
  type UnifiedBillingStatusRecord,
  type UnifiedCustomerRecord,
  type UnifiedExceptionRecord,
  type UnifiedProofOfServiceRecord,
  type UnifiedRouteRecord,
  type UnifiedRouteRunRecord,
  type UnifiedServiceEventRecord,
  type UnifiedServiceLocationRecord,
  type UnifiedStopRecord,
  type UnifiedVehicleRecord,
  type UserDashboardResponse,
} from '../../shared/unified';
import { buildTenantScopedKey, stableId } from './ids';
import { recordMatchesTenant } from './tenantScope';
import { listConnectorCatalog as listConnectorCatalogFromRegistry, getConnectorAdapter } from './connectors/registry';
import { buildDefaultRoutewareConnection } from './connectors/routewareFirestoreConnector';
import { buildNormalizedSnapshotFromAdapter, type ConnectorRuntimeContext } from './connectors/types';

const COLLECTIONS = {
  tenants: 'unifiedTenants',
  connections: 'integrationConnections',
  syncJobs: 'integrationSyncJobs',
  rawPayloads: 'integrationRawPayloads',
  customers: 'domainCustomers',
  serviceLocations: 'domainServiceLocations',
  routes: 'domainRoutes',
  routeRuns: 'domainRouteRuns',
  stops: 'domainStops',
  vehicles: 'domainVehicles',
  drivers: 'domainDrivers',
  serviceEvents: 'domainServiceEvents',
  exceptions: 'domainExceptions',
  proofs: 'domainProofs',
  billingStatuses: 'domainBillingStatuses',
} as const;

const syncLocks = new Map<string, Promise<IntegrationSyncJob>>();

function nowIso() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    ) as T;
  }
  return value;
}

async function writeRecords<T extends { id: string }>(collectionName: string, records: T[]) {
  if (!records.length) return;

  let batch = adminDb.batch();
  let count = 0;

  for (const record of records) {
    batch.set(adminDb.collection(collectionName).doc(record.id), stripUndefined(record), { merge: true });
    count += 1;

    if (count === 400) {
      await batch.commit();
      batch = adminDb.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

async function getAllDocs<T>(collectionName: string): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
}

async function listTenantDocs<T extends { tenantId: string }>(collectionName: string, tenantId: string): Promise<T[]> {
  const docs = await getAllDocs<T>(collectionName);
  return docs.filter((doc) => doc.tenantId === tenantId);
}

async function listLegacyCollection<T>(collectionName: string): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
}

async function ensureTenant(tenantId = DEFAULT_TENANT_ID) {
  const tenantRef = adminDb.collection(COLLECTIONS.tenants).doc(tenantId);
  const snapshot = await tenantRef.get();
  const timestamp = nowIso();

  if (!snapshot.exists) {
    const tenant: TenantRecord = {
      id: tenantId,
      name: DEFAULT_TENANT_NAME,
      slug: slugify(DEFAULT_TENANT_NAME),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await tenantRef.set(tenant);
    return tenant;
  }

  const existing = snapshot.data() as TenantRecord;
  const needsDefaultNameRefresh =
    tenantId === DEFAULT_TENANT_ID && (!existing.name || existing.name === 'Cordova Default Tenant');

  if (!existing.updatedAt || needsDefaultNameRefresh || !existing.slug) {
    await tenantRef.set(
      {
        ...(needsDefaultNameRefresh
          ? {
              name: DEFAULT_TENANT_NAME,
              slug: slugify(DEFAULT_TENANT_NAME),
            }
          : {}),
        ...(existing.slug ? {} : { slug: slugify(existing.name || DEFAULT_TENANT_NAME) }),
        updatedAt: timestamp,
      },
      { merge: true },
    );
  }
  return {
    id: tenantId,
    ...existing,
    ...(needsDefaultNameRefresh ? { name: DEFAULT_TENANT_NAME, slug: slugify(DEFAULT_TENANT_NAME) } : {}),
    updatedAt: existing.updatedAt || timestamp,
  };
}

function buildDefaultConnection(tenantId: string): IntegrationConnectionRecord {
  const timestamp = nowIso();
  const connectionId = stableId(tenantId, 'connection', 'routeware', 'primary');
  return buildDefaultRoutewareConnection(tenantId, connectionId, timestamp);
}

export async function ensureDefaultConnection(tenantId: string) {
  await ensureTenant(tenantId);
  const connectionId = stableId(tenantId, 'connection', 'routeware', 'primary');
  const ref = adminDb.collection(COLLECTIONS.connections).doc(connectionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    const connection = buildDefaultConnection(tenantId);
    await ref.set(connection);
    return connection;
  }
  const existing = snapshot.data() as Omit<IntegrationConnectionRecord, 'id'>;
  const needsNameRefresh = !existing.name || existing.name === 'Primary Routeware Bridge';
  if (needsNameRefresh) {
    await ref.set(
      {
        name: 'Primary Operations Sync',
        updatedAt: nowIso(),
      },
      { merge: true },
    );
  }
  return {
    id: snapshot.id,
    ...existing,
    ...(needsNameRefresh ? { name: 'Primary Operations Sync' } : {}),
  };
}

export async function listConnections(tenantId: string) {
  await ensureDefaultConnection(tenantId);
  const connections = await listTenantDocs<IntegrationConnectionRecord>(COLLECTIONS.connections, tenantId);
  return connections.sort((a, b) => a.name.localeCompare(b.name));
}

export function listConnectorCatalog() {
  return listConnectorCatalogFromRegistry();
}

export async function createConnection(
  tenantId: string,
  input: Partial<Pick<IntegrationConnectionRecord, 'name' | 'vendor' | 'syncScheduleMinutes' | 'adapterMode' | 'settings'>>,
) {
  const vendor = input.vendor || 'routeware';
  const adapter = getConnectorAdapter(vendor);
  if (!adapter) {
    throw new Error(`${vendor} is not implemented yet.`);
  }

  const existing = await ensureDefaultConnection(tenantId);
  const nextConnection: IntegrationConnectionRecord = {
    ...existing,
    name: input.name?.trim() || existing.name,
    vendor,
    syncScheduleMinutes: input.syncScheduleMinutes || existing.syncScheduleMinutes,
    adapterMode: input.adapterMode || adapter.adapterMode,
    capabilities: adapter.discoverCapabilities(),
    settings: { ...existing.settings, ...(input.settings || {}) },
    status: 'active',
    updatedAt: nowIso(),
  };
  await adminDb.collection(COLLECTIONS.connections).doc(existing.id).set(nextConnection, { merge: true });
  return nextConnection;
}

async function setConnectionHealth(connectionId: string, health: ConnectionHealth, patch?: Partial<IntegrationConnectionRecord>) {
  await adminDb.collection(COLLECTIONS.connections).doc(connectionId).set(
    {
      health,
      updatedAt: nowIso(),
      ...(patch || {}),
    },
    { merge: true },
  );
}

async function persistNormalizedSnapshot(tenantId: string, snapshot: NormalizedDomainSnapshot) {
  await Promise.all([
    writeRecords<RawPayloadRecord>(COLLECTIONS.rawPayloads, snapshot.rawPayloads),
    writeRecords(COLLECTIONS.customers, snapshot.customers),
    writeRecords(COLLECTIONS.serviceLocations, snapshot.serviceLocations),
    writeRecords(COLLECTIONS.routes, snapshot.routes),
    writeRecords(COLLECTIONS.routeRuns, snapshot.routeRuns),
    writeRecords(COLLECTIONS.stops, snapshot.stops),
    writeRecords(COLLECTIONS.vehicles, snapshot.vehicles),
    writeRecords(COLLECTIONS.drivers, snapshot.drivers),
    writeRecords(COLLECTIONS.serviceEvents, snapshot.serviceEvents),
    writeRecords(COLLECTIONS.exceptions, snapshot.exceptions),
    writeRecords(COLLECTIONS.proofs, snapshot.proofs),
    writeRecords(COLLECTIONS.billingStatuses, snapshot.billingStatuses),
  ]);

  const tenantRef = adminDb.collection(COLLECTIONS.tenants).doc(tenantId);
  await tenantRef.set({ updatedAt: nowIso() }, { merge: true });
}

function buildCounts(snapshot: NormalizedDomainSnapshot) {
  return {
    raw_payloads: snapshot.rawPayloads.length,
    customers: snapshot.customers.length,
    service_locations: snapshot.serviceLocations.length,
    routes: snapshot.routes.length,
    route_runs: snapshot.routeRuns.length,
    stops: snapshot.stops.length,
    vehicles: snapshot.vehicles.length,
    drivers: snapshot.drivers.length,
    service_events: snapshot.serviceEvents.length,
    exceptions: snapshot.exceptions.length,
    proofs: snapshot.proofs.length,
    billing_statuses: snapshot.billingStatuses.length,
  };
}

export async function runConnectionSync(connectionId: string, triggeredBy: string | null, mode: 'manual' | 'auto' = 'manual') {
  if (syncLocks.has(connectionId)) {
    return syncLocks.get(connectionId)!;
  }

  const run = (async () => {
    const connectionRef = adminDb.collection(COLLECTIONS.connections).doc(connectionId);
    const connectionSnap = await connectionRef.get();
    if (!connectionSnap.exists) {
      throw new Error('Integration connection not found');
    }
    const connection = { id: connectionSnap.id, ...(connectionSnap.data() as Omit<IntegrationConnectionRecord, 'id'>) };
    const adapter = getConnectorAdapter(connection.vendor);
    if (!adapter) {
      throw new Error('Selected connector is not implemented yet');
    }

    const jobId = stableId(connection.tenantId, connectionId, 'sync', Date.now(), Math.random());
    const startedAt = nowIso();
    const job: IntegrationSyncJob = {
      id: jobId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      vendor: connection.vendor,
      status: 'running',
      mode,
      triggeredBy,
      startedAt,
      finishedAt: null,
      message: null,
      counts: {},
    };

    await adminDb.collection(COLLECTIONS.syncJobs).doc(jobId).set(job);
    await setConnectionHealth(connection.id, 'syncing', { lastSyncStatus: 'running', lastSyncMessage: 'Sync in progress' });

    try {
      const runtimeContext: ConnectorRuntimeContext = {
        tenantId: connection.tenantId,
        connection,
        startedAt,
        memo: new Map(),
      };
      const normalizedSnapshot = await buildNormalizedSnapshotFromAdapter(adapter, runtimeContext);
      await persistNormalizedSnapshot(connection.tenantId, normalizedSnapshot);

      const completedJob: IntegrationSyncJob = {
        ...job,
        status: 'completed',
        finishedAt: nowIso(),
        message: 'Sync completed successfully',
        counts: buildCounts(normalizedSnapshot),
      };

      await adminDb.collection(COLLECTIONS.syncJobs).doc(jobId).set(completedJob, { merge: true });
      await setConnectionHealth(connection.id, 'healthy', {
        lastSyncAt: completedJob.finishedAt,
        lastSyncStatus: completedJob.status,
        lastSyncMessage: completedJob.message,
      });
      return completedJob;
    } catch (error: any) {
      const failedJob: Partial<IntegrationSyncJob> = {
        status: 'failed',
        finishedAt: nowIso(),
        message: error.message || 'Sync failed',
      };
      await adminDb.collection(COLLECTIONS.syncJobs).doc(jobId).set(failedJob, { merge: true });
      await setConnectionHealth(connection.id, 'error', {
        lastSyncStatus: 'failed',
        lastSyncAt: nowIso(),
        lastSyncMessage: failedJob.message || 'Sync failed',
      });
      throw error;
    }
  })().finally(() => {
    syncLocks.delete(connectionId);
  });

  syncLocks.set(connectionId, run);
  return run;
}

export async function ensureTenantHydrated(tenantId: string) {
  await ensureDefaultConnection(tenantId);
}

async function listAllConnections() {
  return getAllDocs<IntegrationConnectionRecord>(COLLECTIONS.connections);
}

export function isConnectionSyncDue(connection: IntegrationConnectionRecord, now = Date.now()) {
  if (connection.status !== 'active') {
    return false;
  }

  if (!connection.lastSyncAt) {
    return true;
  }

  const intervalMs = Math.max(connection.syncScheduleMinutes, 1) * 60_000;
  return now - new Date(connection.lastSyncAt).getTime() >= intervalMs;
}

export async function runDueConnectionSyncs(now = Date.now()) {
  const connections = await listAllConnections();
  const dueConnections = connections.filter((connection) => isConnectionSyncDue(connection, now));
  await Promise.all(
    dueConnections.map(async (connection) => {
      if (syncLocks.has(connection.id)) return;
      try {
        await runConnectionSync(connection.id, null, 'auto');
      } catch (error) {
        console.error(`Scheduled sync failed for ${connection.id}`, error);
      }
    }),
  );
  return dueConnections.length;
}

export async function listSyncJobs(tenantId: string) {
  const jobs = await listTenantDocs<IntegrationSyncJob>(COLLECTIONS.syncJobs, tenantId);
  return jobs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

async function getTenant(tenantId: string) {
  await ensureTenant(tenantId);
  const snapshot = await adminDb.collection(COLLECTIONS.tenants).doc(tenantId).get();
  return { id: snapshot.id, ...(snapshot.data() as Omit<TenantRecord, 'id'>) } as TenantRecord;
}

async function getCustomers(tenantId: string) {
  const customers = await listTenantDocs<UnifiedCustomerRecord>(COLLECTIONS.customers, tenantId);
  return customers.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function getBillingStatuses(tenantId: string) {
  return listTenantDocs<UnifiedBillingStatusRecord>(COLLECTIONS.billingStatuses, tenantId);
}

async function getRoutes(tenantId: string) {
  return listTenantDocs<UnifiedRouteRecord>(COLLECTIONS.routes, tenantId);
}

async function getRouteRuns(tenantId: string) {
  return listTenantDocs<UnifiedRouteRunRecord>(COLLECTIONS.routeRuns, tenantId);
}

async function getStops(tenantId: string) {
  return listTenantDocs<UnifiedStopRecord>(COLLECTIONS.stops, tenantId);
}

async function getVehicles(tenantId: string) {
  return listTenantDocs<UnifiedVehicleRecord>(COLLECTIONS.vehicles, tenantId);
}

async function getServiceEvents(tenantId: string) {
  return listTenantDocs<UnifiedServiceEventRecord>(COLLECTIONS.serviceEvents, tenantId);
}

async function getExceptions(tenantId: string) {
  return listTenantDocs<UnifiedExceptionRecord>(COLLECTIONS.exceptions, tenantId);
}

async function getProofs(tenantId: string) {
  return listTenantDocs<UnifiedProofOfServiceRecord>(COLLECTIONS.proofs, tenantId);
}

async function getServiceLocations(tenantId: string) {
  return listTenantDocs<UnifiedServiceLocationRecord>(COLLECTIONS.serviceLocations, tenantId);
}

export async function getAdminOverview(tenantId: string): Promise<AdminOverviewResponse> {
  await ensureTenantHydrated(tenantId);

  const [tenant, connections, customers, routeRuns, events, exceptions, vehicles, billingStatuses] = await Promise.all([
    getTenant(tenantId),
    listConnections(tenantId),
    getCustomers(tenantId),
    getRouteRuns(tenantId),
    getServiceEvents(tenantId),
    getExceptions(tenantId),
    getVehicles(tenantId),
    getBillingStatuses(tenantId),
  ]);

  const outstandingBalance = billingStatuses.reduce((sum, status) => sum + status.outstandingBalance, 0);
  const recentActivity = [...events]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5)
    .map((event) => ({
      id: event.id,
      type: event.eventType,
      title:
        event.status === 'completed'
          ? 'Service completed'
          : event.status === 'cancelled'
            ? 'Service cancelled'
            : 'Service scheduled',
      subtitle: event.notes || 'Vendor-sourced route activity',
      occurredAt: event.occurredAt,
      sourceLabel: event.sourceLabel,
    }));

  return {
    tenant,
    stats: {
      totalCustomers: customers.length,
      activeRoutes: routeRuns.filter((routeRun) => routeRun.status !== 'completed').length,
      completedServices: events.filter((event) => event.status === 'completed').length,
      openExceptions: exceptions.filter((exception) => exception.status === 'open').length,
      activeVehicles: vehicles.filter((vehicle) => vehicle.status === 'active').length,
      outstandingBalance,
    },
    sources: connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      vendor: connection.vendor,
      health: connection.health,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
    })),
    recentActivity,
  };
}

export async function getAdminCustomers(tenantId: string) {
  await ensureTenantHydrated(tenantId);

  const [customers, locations, billingStatuses] = await Promise.all([
    getCustomers(tenantId),
    getServiceLocations(tenantId),
    getBillingStatuses(tenantId),
  ]);

  const locationById = new Map(locations.map((location) => [location.id, location]));
  const billingByCustomerId = new Map(billingStatuses.map((status) => [status.customerId, status]));

  return customers.map((customer) => ({
    ...customer,
    serviceAddress: locationById.get(customer.serviceLocationId || '')?.address || '',
    address: locationById.get(customer.serviceLocationId || '')?.address || '',
    outstandingBalance: billingByCustomerId.get(customer.id)?.outstandingBalance || 0,
    paymentStatus: billingByCustomerId.get(customer.id)?.status || 'current',
  }));
}

export async function getAdminRoutes(tenantId: string) {
  await ensureTenantHydrated(tenantId);

  const [routes, routeRuns, stops, customers, vehicles] = await Promise.all([
    getRoutes(tenantId),
    getRouteRuns(tenantId),
    getStops(tenantId),
    getCustomers(tenantId),
    getVehicles(tenantId),
  ]);

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  return routes
    .map((route) => {
      const routeRunsForRoute = routeRuns.filter((routeRun) => routeRun.routeId === route.id);
      const primaryRun = selectPrimaryRouteRun(routeRunsForRoute);

      return {
        ...route,
        run: primaryRun,
        vehicle: route.vehicleId ? vehicleById.get(route.vehicleId) || null : null,
        stops: stops
          .filter((stop) => stop.routeId === route.id && (!primaryRun || stop.routeRunId === primaryRun.id))
          .sort((a, b) => a.sequence - b.sequence)
          .map((stop) => ({
            ...stop,
            customerName: customerById.get(stop.customerId)?.displayName || 'Unknown customer',
          })),
      };
    })
    .sort((a, b) => a.serviceDay.localeCompare(b.serviceDay));
}

export async function getAdminPickups(tenantId: string) {
  await ensureTenantHydrated(tenantId);

  const [events, exceptions, proofs, customers, legacyInteractions] = await Promise.all([
    getServiceEvents(tenantId),
    getExceptions(tenantId),
    getProofs(tenantId),
    getCustomers(tenantId),
    listLegacyCollection<Record<string, unknown>>('interactions'),
  ]);

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const legacyCustomerIds = new Set(customers.map((customer) => customer.legacyCustomerId).filter((value): value is string => Boolean(value)));

  const serviceRequests = legacyInteractions
    .filter(
      (interaction) =>
        recordMatchesTenant((interaction.tenantId as string | undefined) || undefined, tenantId) ||
        (!(interaction.tenantId as string | undefined) && legacyCustomerIds.has(String(interaction.userId || ''))),
    )
    .filter((interaction) => interaction.type === 'service_request')
    .map((interaction) => ({
      id: String(interaction.id),
      userId: String(interaction.userId || ''),
      content: String(interaction.content || ''),
      date: String(interaction.date || ''),
      status: String(interaction.status || 'open'),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    events: events
      .slice()
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .map((event) => ({
        ...event,
        customerName: customerById.get(event.customerId)?.displayName || 'Unknown customer',
      })),
    exceptions: exceptions
      .slice()
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .map((exception) => ({
        ...exception,
        customerName: exception.customerId ? customerById.get(exception.customerId)?.displayName || 'Unknown customer' : 'System',
      })),
    proofs,
    serviceRequests,
  };
}

export async function getAdminAnalytics(tenantId: string): Promise<AdminAnalyticsResponse> {
  await ensureTenantHydrated(tenantId);

  const [events, legacyPayments, legacyExpenses, customers] = await Promise.all([
    getServiceEvents(tenantId),
    listLegacyCollection<Record<string, unknown>>('payments'),
    listLegacyCollection<Record<string, unknown>>('expenses'),
    getCustomers(tenantId),
  ]);

  const legacyCustomerIds = new Set(customers.map((customer) => customer.legacyCustomerId).filter((value): value is string => Boolean(value)));
  const tenantPayments = legacyPayments.filter(
    (payment) =>
      recordMatchesTenant((payment.tenantId as string | undefined) || undefined, tenantId) ||
      (!(payment.tenantId as string | undefined) && legacyCustomerIds.has(String(payment.userId || ''))),
  );
  const tenantExpenses = legacyExpenses.filter((expense) => recordMatchesTenant((expense.tenantId as string | undefined) || undefined, tenantId));

  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  const serviceByDay = days.map((date) => {
    const label = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    const count = events.filter((event) => {
      const eventDate = new Date(event.occurredAt);
      return eventDate.toDateString() === date.toDateString();
    }).length;
    return { name: label, Pickups: count };
  });

  let totalRevenue = 0;
  let totalExpenses = 0;

  const financialByDay = days.map((date) => {
    const label = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    const revenue = tenantPayments
      .filter((payment) => (String(payment.recordType || 'invoice') !== 'receipt'))
      .filter((payment) => payment.status === 'paid')
      .filter((payment) => new Date(String(payment.date || '')).toDateString() === date.toDateString())
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const expenses = tenantExpenses
      .filter((expense) => new Date(String(expense.date || '')).toDateString() === date.toDateString())
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    totalRevenue += revenue;
    totalExpenses += expenses;

    return {
      name: label,
      Revenue: revenue,
      Expenses: expenses,
      Profit: revenue - expenses,
    };
  });

  return {
    serviceByDay,
    financialByDay,
    totals: {
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit: totalRevenue - totalExpenses,
    },
  };
}

function sortDescendingByDate<T>(rows: T[], getDate: (row: T) => string) {
  return rows.sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());
}

function selectPrimaryRouteRun(routeRuns: UnifiedRouteRunRecord[]) {
  if (routeRuns.length === 0) return null;

  const now = Date.now();
  const upcoming = routeRuns
    .filter((routeRun) => new Date(routeRun.serviceDate).getTime() >= now)
    .sort((a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime());
  if (upcoming.length > 0) {
    return upcoming[0]!;
  }

  return routeRuns.sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime())[0]!;
}

async function getCustomerByLegacyId(tenantId: string, legacyCustomerId: string) {
  const customers = await getCustomers(tenantId);
  const key = buildTenantScopedKey(tenantId, legacyCustomerId);
  return customers.find((customer) => customer.tenantScopedLegacyCustomerKey === key) || null;
}

export async function getUserDashboard(tenantId: string, legacyCustomerId: string): Promise<UserDashboardResponse> {
  await ensureTenantHydrated(tenantId);

  const [customer, stops, events, billingStatuses, legacyPayments] = await Promise.all([
    getCustomerByLegacyId(tenantId, legacyCustomerId),
    getStops(tenantId),
    getServiceEvents(tenantId),
    getBillingStatuses(tenantId),
    listLegacyCollection<Record<string, unknown>>('payments'),
  ]);

  if (!customer) {
    return {
      customer: null,
      nextStop: null,
      recentEvents: [],
      recentPayments: [],
      outstandingBalance: 0,
      totalCompletedPickups: 0,
    };
  }

  const customerStops = stops.filter((stop) => stop.customerId === customer.id);
  const nextStop = customerStops
    .filter((stop) => new Date(stop.scheduledFor).getTime() >= Date.now())
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0] || null;
  const recentEvents = sortDescendingByDate(
    events.filter((event) => event.customerId === customer.id),
    (event) => event.occurredAt,
  ).slice(0, 3);
  const billingStatus = billingStatuses.find((status) => status.customerId === customer.id) || null;
  const recentPayments = sortDescendingByDate(
    legacyPayments
      .filter(
        (payment) =>
          payment.userId === legacyCustomerId &&
          (recordMatchesTenant((payment.tenantId as string | undefined) || undefined, tenantId) ||
            !(payment.tenantId as string | undefined)),
      )
      .map((payment) => ({
        id: String(payment.id),
        amount: Number(payment.amount || 0),
        description: String(payment.description || 'Invoice'),
        status: String(payment.status || 'pending'),
        date: String(payment.date || nowIso()),
        sourceLabel: 'Cordova Platform',
      })),
    (payment) => payment.date,
  ).slice(0, 3);

  return {
    customer,
    nextStop,
    recentEvents,
    recentPayments,
    outstandingBalance: billingStatus?.outstandingBalance || 0,
    totalCompletedPickups: events.filter((event) => event.customerId === customer.id && event.status === 'completed').length,
  };
}

export async function getUserPickups(tenantId: string, legacyCustomerId: string) {
  await ensureTenantHydrated(tenantId);
  const customer = await getCustomerByLegacyId(tenantId, legacyCustomerId);
  if (!customer) return [];

  const stops = await getStops(tenantId);
  return sortDescendingByDate(
    stops.filter((stop) => stop.customerId === customer.id),
    (stop) => stop.scheduledFor,
  );
}

export async function getUserPayments(tenantId: string, legacyCustomerId: string) {
  await ensureTenantHydrated(tenantId);

  const [legacyPayments, billingStatuses, customer] = await Promise.all([
    listLegacyCollection<Record<string, unknown>>('payments'),
    getBillingStatuses(tenantId),
    getCustomerByLegacyId(tenantId, legacyCustomerId),
  ]);

  const payments = sortDescendingByDate(
    legacyPayments
      .filter(
        (payment) =>
          payment.userId === legacyCustomerId &&
          (recordMatchesTenant((payment.tenantId as string | undefined) || undefined, tenantId) ||
            !(payment.tenantId as string | undefined)),
      )
      .map((payment) => ({
        id: String(payment.id),
        amount: Number(payment.amount || 0),
        description: String(payment.description || 'Invoice'),
        status: String(payment.status || 'pending'),
        date: String(payment.date || nowIso()),
        sourceLabel: 'Cordova Platform',
      })),
    (payment) => payment.date,
  );
  const billingStatus = customer ? billingStatuses.find((status) => status.customerId === customer.id) || null : null;

  return {
    payments,
    outstandingBalance: billingStatus?.outstandingBalance || 0,
  };
}
