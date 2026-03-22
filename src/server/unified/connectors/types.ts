import type {
  IntegrationCapability,
  IntegrationConnectionRecord,
  NormalizedDomainSnapshot,
  RawPayloadRecord,
  UnifiedBillingStatusRecord,
  UnifiedCustomerRecord,
  UnifiedDriverRecord,
  UnifiedExceptionRecord,
  UnifiedProofOfServiceRecord,
  UnifiedRouteRecord,
  UnifiedRouteRunRecord,
  UnifiedServiceEventRecord,
  UnifiedServiceLocationRecord,
  UnifiedStopRecord,
  UnifiedVehicleRecord,
  VendorId,
} from '../../../shared/unified';

export interface ConnectorCatalogEntry {
  vendor: VendorId;
  name: string;
  status: 'available' | 'planned';
  adapterMode: string;
  capabilities: IntegrationCapability[];
}

export interface ConnectorRuntimeContext {
  tenantId: string;
  connection: IntegrationConnectionRecord;
  startedAt: string;
  memo: Map<string, unknown>;
}

export interface ConnectorAdapter extends ConnectorCatalogEntry {
  discoverCapabilities(): IntegrationCapability[];
  pullRawPayloads(context: ConnectorRuntimeContext): Promise<RawPayloadRecord[]>;
  pullCustomers(context: ConnectorRuntimeContext): Promise<UnifiedCustomerRecord[]>;
  pullServiceLocations(context: ConnectorRuntimeContext): Promise<UnifiedServiceLocationRecord[]>;
  pullRoutes(context: ConnectorRuntimeContext): Promise<UnifiedRouteRecord[]>;
  pullRouteRuns(context: ConnectorRuntimeContext): Promise<UnifiedRouteRunRecord[]>;
  pullStops(context: ConnectorRuntimeContext): Promise<UnifiedStopRecord[]>;
  pullVehicles(context: ConnectorRuntimeContext): Promise<UnifiedVehicleRecord[]>;
  pullDrivers(context: ConnectorRuntimeContext): Promise<UnifiedDriverRecord[]>;
  pullServiceEvents(context: ConnectorRuntimeContext): Promise<UnifiedServiceEventRecord[]>;
  pullExceptions(context: ConnectorRuntimeContext): Promise<UnifiedExceptionRecord[]>;
  pullProofSignals(context: ConnectorRuntimeContext): Promise<UnifiedProofOfServiceRecord[]>;
  pullBillingStatuses(context: ConnectorRuntimeContext): Promise<UnifiedBillingStatusRecord[]>;
}

export async function buildNormalizedSnapshotFromAdapter(adapter: ConnectorAdapter, context: ConnectorRuntimeContext): Promise<NormalizedDomainSnapshot> {
  const [
    rawPayloads,
    customers,
    serviceLocations,
    routes,
    routeRuns,
    stops,
    vehicles,
    drivers,
    serviceEvents,
    exceptions,
    proofs,
    billingStatuses,
  ] = await Promise.all([
    adapter.pullRawPayloads(context),
    adapter.pullCustomers(context),
    adapter.pullServiceLocations(context),
    adapter.pullRoutes(context),
    adapter.pullRouteRuns(context),
    adapter.pullStops(context),
    adapter.pullVehicles(context),
    adapter.pullDrivers(context),
    adapter.pullServiceEvents(context),
    adapter.pullExceptions(context),
    adapter.pullProofSignals(context),
    adapter.pullBillingStatuses(context),
  ]);

  return {
    rawPayloads,
    customers,
    serviceLocations,
    routes,
    routeRuns,
    stops,
    vehicles,
    drivers,
    serviceEvents,
    exceptions,
    proofs,
    billingStatuses,
  };
}
