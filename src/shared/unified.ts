export const DEFAULT_TENANT_ID = 'cwa-main';
export const DEFAULT_TENANT_NAME = 'CWA Operations';

export type VendorId = 'routeware' | 'routesmart' | 'fleetmind' | 'wm';
export type ConnectionStatus = 'active' | 'paused' | 'error';
export type ConnectionHealth = 'idle' | 'healthy' | 'warning' | 'error' | 'syncing';
export type SyncJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type DomainName =
  | 'customers'
  | 'service_locations'
  | 'routes'
  | 'route_runs'
  | 'stops'
  | 'vehicles'
  | 'drivers'
  | 'service_events'
  | 'exceptions'
  | 'proofs'
  | 'billing_statuses';

export interface IntegrationCapability {
  domain: DomainName;
  read: boolean;
  write: boolean;
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedRecord {
  id: string;
  tenantId: string;
  vendor: VendorId;
  externalId: string;
  rawPayloadId: string | null;
  sourceUpdatedAt: string | null;
  lastSyncedAt: string;
}

export interface RawPayloadRecord extends UnifiedRecord {
  entityType: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface IntegrationConnectionRecord {
  id: string;
  tenantId: string;
  vendor: VendorId;
  name: string;
  adapterMode: string;
  status: ConnectionStatus;
  health: ConnectionHealth;
  syncScheduleMinutes: number;
  fieldMappingVersion: number;
  capabilities: IntegrationCapability[];
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  lastSyncAt: string | null;
  lastSyncStatus: SyncJobStatus | null;
  lastSyncMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSyncJob {
  id: string;
  tenantId: string;
  connectionId: string;
  vendor: VendorId;
  status: SyncJobStatus;
  mode: 'manual' | 'auto';
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  counts: Partial<Record<DomainName | 'raw_payloads', number>>;
}

export interface UnifiedCustomerRecord extends UnifiedRecord {
  displayName: string;
  email: string;
  phone: string;
  legacyCustomerId: string | null;
  tenantScopedLegacyCustomerKey: string | null;
  serviceLocationId: string | null;
  accountStatus: 'active' | 'inactive';
  subscriptionStatus: 'active' | 'inactive';
  claimStatus: string | null;
  linkedAuthUid: string | null;
  pendingLinkedAuthUid: string | null;
  plan: string;
  collectionDay: string;
  recordStatus: 'active' | 'archived';
  latestInviteSentAt: string | null;
  sourceLabel: string;
}

export interface UnifiedServiceLocationRecord extends UnifiedRecord {
  customerId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  serviceDays: string[];
  status: 'active' | 'inactive';
}

export interface UnifiedRouteRecord extends UnifiedRecord {
  name: string;
  serviceDay: string;
  status: 'active' | 'inactive';
  stopCount: number;
  vehicleId: string | null;
  driverId: string | null;
  sourceLabel: string;
}

export interface UnifiedRouteRunRecord extends UnifiedRecord {
  routeId: string;
  serviceDate: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
}

export interface UnifiedStopRecord extends UnifiedRecord {
  routeId: string;
  routeRunId: string;
  customerId: string;
  serviceLocationId: string;
  sequence: number;
  status: 'scheduled' | 'completed' | 'missed';
  scheduledFor: string;
  address: string;
  binLocation: string;
}

export interface UnifiedVehicleRecord extends UnifiedRecord {
  name: string;
  assetId: string;
  status: 'active' | 'maintenance' | 'retired';
  location: string;
  coordinates: string;
  assignedDriverId: string | null;
}

export interface UnifiedDriverRecord extends UnifiedRecord {
  name: string;
  legacyDriverId: string | null;
  assignedVehicleId: string | null;
}

export interface UnifiedServiceEventRecord extends UnifiedRecord {
  customerId: string;
  routeId: string | null;
  routeRunId: string | null;
  stopId: string | null;
  vehicleId: string | null;
  eventType: 'service_scheduled' | 'service_completed' | 'service_cancelled';
  status: 'scheduled' | 'completed' | 'cancelled';
  occurredAt: string;
  notes: string;
  sourceLabel: string;
}

export interface UnifiedExceptionRecord extends UnifiedRecord {
  customerId: string | null;
  routeId: string | null;
  stopId: string | null;
  exceptionType: 'missed_pickup' | 'cancelled_pickup' | 'customer_request';
  status: 'open' | 'resolved';
  occurredAt: string;
  description: string;
}

export interface UnifiedProofOfServiceRecord extends UnifiedRecord {
  customerId: string;
  serviceEventId: string;
  occurredAt: string;
  proofType: 'completion' | 'activity_code';
  activityCode: string;
  notes: string;
}

export interface UnifiedBillingStatusRecord extends UnifiedRecord {
  customerId: string;
  legacyCustomerId: string | null;
  tenantScopedLegacyCustomerKey: string | null;
  outstandingBalance: number;
  totalPaid: number;
  totalInvoiced: number;
  lastPaymentAt: string | null;
  paymentCount: number;
  status: 'current' | 'attention';
  sourceLabel: string;
}

export interface NormalizedDomainSnapshot {
  rawPayloads: RawPayloadRecord[];
  customers: UnifiedCustomerRecord[];
  serviceLocations: UnifiedServiceLocationRecord[];
  routes: UnifiedRouteRecord[];
  routeRuns: UnifiedRouteRunRecord[];
  stops: UnifiedStopRecord[];
  vehicles: UnifiedVehicleRecord[];
  drivers: UnifiedDriverRecord[];
  serviceEvents: UnifiedServiceEventRecord[];
  exceptions: UnifiedExceptionRecord[];
  proofs: UnifiedProofOfServiceRecord[];
  billingStatuses: UnifiedBillingStatusRecord[];
}

export interface AdminOverviewResponse {
  tenant: TenantRecord;
  stats: {
    totalCustomers: number;
    activeRoutes: number;
    completedServices: number;
    openExceptions: number;
    activeVehicles: number;
    outstandingBalance: number;
  };
  sources: Array<{
    id: string;
    name: string;
    vendor: VendorId;
    health: ConnectionHealth;
    lastSyncAt: string | null;
    lastSyncStatus: SyncJobStatus | null;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    subtitle: string;
    occurredAt: string;
    sourceLabel: string;
  }>;
}

export interface AdminAnalyticsResponse {
  serviceByDay: Array<{ name: string; Pickups: number }>;
  financialByDay: Array<{ name: string; Revenue: number; Expenses: number; Profit: number }>;
  totals: { revenue: number; expenses: number; profit: number };
}

export interface UserDashboardResponse {
  customer: UnifiedCustomerRecord | null;
  nextStop: UnifiedStopRecord | null;
  recentEvents: UnifiedServiceEventRecord[];
  recentPayments: Array<{
    id: string;
    amount: number;
    description: string;
    status: string;
    date: string;
    sourceLabel: string;
  }>;
  outstandingBalance: number;
  totalCompletedPickups: number;
}
