import { adminDb } from '../../firebaseAdmin';
import { DEFAULT_TENANT_ID } from '../../../shared/unified';
import type { IntegrationCapability, IntegrationConnectionRecord, NormalizedDomainSnapshot } from '../../../shared/unified';
import { buildRoutewareSnapshot, type RoutewareLegacySnapshot } from '../routewareNormalizer';
import { recordMatchesTenant } from '../tenantScope';
import type { ConnectorAdapter, ConnectorRuntimeContext } from './types';

const ROUTEWARE_CAPABILITIES: IntegrationCapability[] = [
  { domain: 'customers', read: true, write: false },
  { domain: 'service_locations', read: true, write: false },
  { domain: 'routes', read: true, write: false },
  { domain: 'route_runs', read: true, write: false },
  { domain: 'stops', read: true, write: false },
  { domain: 'vehicles', read: true, write: false },
  { domain: 'drivers', read: true, write: false },
  { domain: 'service_events', read: true, write: false },
  { domain: 'exceptions', read: true, write: false },
  { domain: 'proofs', read: true, write: false },
  { domain: 'billing_statuses', read: true, write: false },
];

async function listLegacyCollection<T>(collectionName: string): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
}

async function listCollectionByTenant<T>(collectionName: string, tenantId: string): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).where('tenantId', '==', tenantId).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
}

async function listCollectionByUserIds<T>(collectionName: string, fieldName: string, userIds: string[]): Promise<T[]> {
  if (userIds.length === 0) return [];

  const results: T[] = [];
  for (let index = 0; index < userIds.length; index += 10) {
    const chunk = userIds.slice(index, index + 10);
    const snapshot = await adminDb.collection(collectionName).where(fieldName, 'in', chunk).get();
    results.push(...snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T)));
  }
  return results;
}

function dedupeById<T extends { id: string }>(records: T[]) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

async function collectLegacySnapshot(tenantId: string): Promise<RoutewareLegacySnapshot> {
  if (tenantId === DEFAULT_TENANT_ID) {
    const [users, pickups, inventory, payments, interactions] = await Promise.all([
      listLegacyCollection<RoutewareLegacySnapshot['users'][number]>('users'),
      listLegacyCollection<RoutewareLegacySnapshot['pickups'][number]>('pickups'),
      listLegacyCollection<RoutewareLegacySnapshot['inventory'][number]>('inventory'),
      listLegacyCollection<RoutewareLegacySnapshot['payments'][number]>('payments'),
      listLegacyCollection<RoutewareLegacySnapshot['interactions'][number]>('interactions'),
    ]);

    const tenantUsers = users.filter((user) => recordMatchesTenant(user.tenantId, tenantId));
    const tenantUserIds = new Set(tenantUsers.map((user) => user.id));

    return {
      users: tenantUsers,
      pickups: pickups.filter(
        (pickup) => recordMatchesTenant(pickup.tenantId, tenantId) || (!pickup.tenantId && tenantUserIds.has(pickup.userId)),
      ),
      inventory: inventory.filter((item) => recordMatchesTenant(item.tenantId, tenantId)),
      payments: payments.filter(
        (payment) => recordMatchesTenant(payment.tenantId, tenantId) || (!payment.tenantId && tenantUserIds.has(payment.userId)),
      ),
      interactions: interactions.filter(
        (interaction) =>
          recordMatchesTenant(interaction.tenantId, tenantId) ||
          (!interaction.tenantId && interaction.userId ? tenantUserIds.has(interaction.userId) : false),
      ),
    };
  }

  const tenantUsers = await listCollectionByTenant<RoutewareLegacySnapshot['users'][number]>('users', tenantId);
  const tenantUserIds = tenantUsers.map((user) => user.id);
  const [users, pickups, inventory, payments, interactions] = await Promise.all([
    Promise.resolve(tenantUsers),
    Promise.all([
      listCollectionByTenant<RoutewareLegacySnapshot['pickups'][number]>('pickups', tenantId),
      listCollectionByUserIds<RoutewareLegacySnapshot['pickups'][number]>('pickups', 'userId', tenantUserIds),
    ]).then(([tagged, byUser]) => dedupeById([...tagged, ...byUser])),
    listCollectionByTenant<RoutewareLegacySnapshot['inventory'][number]>('inventory', tenantId),
    Promise.all([
      listCollectionByTenant<RoutewareLegacySnapshot['payments'][number]>('payments', tenantId),
      listCollectionByUserIds<RoutewareLegacySnapshot['payments'][number]>('payments', 'userId', tenantUserIds),
    ]).then(([tagged, byUser]) => dedupeById([...tagged, ...byUser])),
    Promise.all([
      listCollectionByTenant<RoutewareLegacySnapshot['interactions'][number]>('interactions', tenantId),
      listCollectionByUserIds<RoutewareLegacySnapshot['interactions'][number]>('interactions', 'userId', tenantUserIds),
    ]).then(([tagged, byUser]) => dedupeById([...tagged, ...byUser])),
  ]);

  const tenantUserIdSet = new Set(users.map((user) => user.id));

  return {
    users,
    pickups: pickups.filter(
      (pickup) => recordMatchesTenant(pickup.tenantId, tenantId) || (!pickup.tenantId && tenantUserIdSet.has(pickup.userId)),
    ),
    inventory: inventory.filter((item) => recordMatchesTenant(item.tenantId, tenantId)),
    payments: payments.filter(
      (payment) => recordMatchesTenant(payment.tenantId, tenantId) || (!payment.tenantId && tenantUserIdSet.has(payment.userId)),
    ),
    interactions: interactions.filter(
      (interaction) =>
        recordMatchesTenant(interaction.tenantId, tenantId) ||
        (!interaction.tenantId && interaction.userId ? tenantUserIdSet.has(interaction.userId) : false),
    ),
  };
}

async function getSnapshot(context: ConnectorRuntimeContext): Promise<NormalizedDomainSnapshot> {
  const cached = context.memo.get('routeware-snapshot');
  if (cached) {
    return cached as NormalizedDomainSnapshot;
  }

  const legacySnapshot = await collectLegacySnapshot(context.tenantId);
  const snapshot = buildRoutewareSnapshot(legacySnapshot, {
    tenantId: context.tenantId,
    syncedAt: context.startedAt,
  });
  context.memo.set('routeware-snapshot', snapshot);
  return snapshot;
}

export function buildDefaultRoutewareConnection(tenantId: string, connectionId: string, nowIso: string): IntegrationConnectionRecord {
  return {
    id: connectionId,
    tenantId,
    vendor: 'routeware',
    name: 'Primary Operations Sync',
    adapterMode: 'legacy_firestore',
    status: 'active',
    health: 'idle',
    syncScheduleMinutes: 15,
    fieldMappingVersion: 1,
    capabilities: ROUTEWARE_CAPABILITIES,
    credentials: {},
    settings: {
      routeGrouping: 'collection_day',
      source: 'legacy_firestore',
    },
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncMessage: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export const routewareFirestoreConnector: ConnectorAdapter = {
  vendor: 'routeware',
  name: 'Routeware Operations',
  status: 'available',
  adapterMode: 'legacy_firestore',
  capabilities: ROUTEWARE_CAPABILITIES,
  discoverCapabilities() {
    return ROUTEWARE_CAPABILITIES;
  },
  async pullRawPayloads(context) {
    return (await getSnapshot(context)).rawPayloads;
  },
  async pullCustomers(context) {
    return (await getSnapshot(context)).customers;
  },
  async pullServiceLocations(context) {
    return (await getSnapshot(context)).serviceLocations;
  },
  async pullRoutes(context) {
    return (await getSnapshot(context)).routes;
  },
  async pullRouteRuns(context) {
    return (await getSnapshot(context)).routeRuns;
  },
  async pullStops(context) {
    return (await getSnapshot(context)).stops;
  },
  async pullVehicles(context) {
    return (await getSnapshot(context)).vehicles;
  },
  async pullDrivers(context) {
    return (await getSnapshot(context)).drivers;
  },
  async pullServiceEvents(context) {
    return (await getSnapshot(context)).serviceEvents;
  },
  async pullExceptions(context) {
    return (await getSnapshot(context)).exceptions;
  },
  async pullProofSignals(context) {
    return (await getSnapshot(context)).proofs;
  },
  async pullBillingStatuses(context) {
    return (await getSnapshot(context)).billingStatuses;
  },
};
