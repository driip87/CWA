import {
  type NormalizedDomainSnapshot,
  type RawPayloadRecord,
  type UnifiedBillingStatusRecord,
  type UnifiedCustomerRecord,
  type UnifiedDriverRecord,
  type UnifiedExceptionRecord,
  type UnifiedProofOfServiceRecord,
  type UnifiedRouteRecord,
  type UnifiedRouteRunRecord,
  type UnifiedServiceEventRecord,
  type UnifiedServiceLocationRecord,
  type UnifiedStopRecord,
  type UnifiedVehicleRecord,
} from '../../shared/unified';
import { DEFAULT_TENANT_ID } from '../../shared/unified';
import { normalizeAddress, normalizeEmail, normalizePhone } from '../../shared/customer';
import { buildTenantScopedKey, nextOccurrenceIso, normalizeDayName, stableId, toIsoDate } from './ids';

interface LegacyUserRecord {
  id: string;
  tenantId?: string;
  email?: string;
  name?: string;
  phone?: string;
  address?: string;
  role?: string;
  createdAt?: string;
  subscriptionStatus?: 'active' | 'inactive';
  claimStatus?: string;
  linkedAuthUid?: string | null;
  pendingLinkedAuthUid?: string | null;
  plan?: string;
  collectionDay?: string;
  recordStatus?: 'active' | 'archived';
  latestInviteSentAt?: string | null;
}

interface LegacyPickupRecord {
  id: string;
  tenantId?: string;
  userId: string;
  date?: string;
  createdAt?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  binLocation?: string;
}

interface LegacyInventoryRecord {
  id: string;
  tenantId?: string;
  type?: string;
  status?: 'active' | 'maintenance' | 'retired';
  location?: string;
  coordinates?: string;
  assignedTo?: string;
}

interface LegacyPaymentRecord {
  id: string;
  tenantId?: string;
  userId: string;
  amount?: number;
  status?: string;
  date?: string;
  description?: string;
  recordType?: string;
}

interface LegacyInteractionRecord {
  id: string;
  tenantId?: string;
  userId?: string;
  type?: string;
  content?: string;
  date?: string;
  status?: string;
}

export interface RoutewareLegacySnapshot {
  users: LegacyUserRecord[];
  pickups: LegacyPickupRecord[];
  inventory: LegacyInventoryRecord[];
  payments: LegacyPaymentRecord[];
  interactions: LegacyInteractionRecord[];
}

function buildBaseRecord(
  tenantId: string,
  vendor: 'routeware',
  entityType: string,
  externalId: string,
  rawPayloadId: string | null,
  syncedAt: string,
  sourceUpdatedAt?: string | null,
) {
  return {
    id: stableId(tenantId, vendor, entityType, externalId),
    tenantId,
    vendor,
    externalId,
    rawPayloadId,
    sourceUpdatedAt: sourceUpdatedAt || null,
    lastSyncedAt: syncedAt,
  };
}

function registerRawPayload(
  payloads: Map<string, RawPayloadRecord>,
  tenantId: string,
  entityType: string,
  externalId: string,
  label: string,
  payload: object,
  syncedAt: string,
) {
  const rawPayloadId = stableId(tenantId, 'routeware', 'raw', entityType, externalId);
  if (!payloads.has(rawPayloadId)) {
    payloads.set(rawPayloadId, {
      ...buildBaseRecord(tenantId, 'routeware', 'raw', `${entityType}:${externalId}`, null, syncedAt, syncedAt),
      id: rawPayloadId,
      entityType,
      label,
      payload: payload as Record<string, unknown>,
    });
  }
  return rawPayloadId;
}

function latestPickupForCustomer(pickups: LegacyPickupRecord[], customerId: string) {
  return pickups
    .filter((pickup) => pickup.userId === customerId)
    .sort((a, b) => new Date(toIsoDate(b.date || b.createdAt)).getTime() - new Date(toIsoDate(a.date || a.createdAt)).getTime())[0] || null;
}

export function buildRoutewareSnapshot(
  input: RoutewareLegacySnapshot,
  options?: {
    tenantId?: string;
    syncedAt?: string;
  },
): NormalizedDomainSnapshot {
  const tenantId = options?.tenantId || DEFAULT_TENANT_ID;
  const syncedAt = options?.syncedAt || new Date().toISOString();
  const rawPayloads = new Map<string, RawPayloadRecord>();

  const users = input.users.filter((user) => user.role === 'user' && user.recordStatus !== 'archived');
  const pickups = [...input.pickups];
  const payments = [...input.payments];
  const interactions = [...input.interactions];
  const inventoryVehicles = input.inventory.filter((item) => item.type === 'vehicle');

  const drivers: UnifiedDriverRecord[] = [];
  const driverByLegacyId = new Map<string, UnifiedDriverRecord>();
  const vehicles: UnifiedVehicleRecord[] = inventoryVehicles.map((item) => {
    const rawPayloadId = registerRawPayload(rawPayloads, tenantId, 'vehicle', item.id, 'Routeware vehicle', item, syncedAt);
    let assignedDriverId: string | null = null;

    if (item.assignedTo) {
      const driverExternalId = item.assignedTo;
      assignedDriverId = stableId(tenantId, 'routeware', 'driver', driverExternalId);
      if (!driverByLegacyId.has(driverExternalId)) {
        const driverRawPayloadId = registerRawPayload(
          rawPayloads,
          tenantId,
          'driver',
          driverExternalId,
          'Routeware driver',
          { legacyDriverId: driverExternalId, assignedVehicleLegacyId: item.id },
          syncedAt,
        );
        const driver: UnifiedDriverRecord = {
          ...buildBaseRecord(tenantId, 'routeware', 'driver', driverExternalId, driverRawPayloadId, syncedAt, syncedAt),
          name: `Driver ${driverExternalId.slice(0, 6)}`,
          legacyDriverId: driverExternalId,
          assignedVehicleId: stableId(tenantId, 'routeware', 'vehicle', item.id),
        };
        driverByLegacyId.set(driverExternalId, driver);
        drivers.push(driver);
      }
    }

    return {
      ...buildBaseRecord(tenantId, 'routeware', 'vehicle', item.id, rawPayloadId, syncedAt, syncedAt),
      name: item.location ? `${item.location} Truck` : `Truck ${item.id.slice(0, 6)}`,
      assetId: item.id,
      status: item.status || 'active',
      location: item.location || 'Operations Yard',
      coordinates: item.coordinates || '',
      assignedDriverId,
    };
  });

  const customers: UnifiedCustomerRecord[] = [];
  const serviceLocations: UnifiedServiceLocationRecord[] = [];
  const customerByLegacyId = new Map<string, UnifiedCustomerRecord>();
  const locationByLegacyId = new Map<string, UnifiedServiceLocationRecord>();

  users.forEach((user) => {
    const customerRawPayloadId = registerRawPayload(rawPayloads, tenantId, 'customer', user.id, 'Routeware customer', user, syncedAt);
    const locationExternalId = `${user.id}:location`;
    const locationRawPayloadId = registerRawPayload(
      rawPayloads,
      tenantId,
      'service_location',
      locationExternalId,
      'Routeware service location',
      {
        customerId: user.id,
        address: user.address || '',
        collectionDay: normalizeDayName(user.collectionDay),
      },
      syncedAt,
    );
    const customerId = stableId(tenantId, 'routeware', 'customer', user.id);
    const serviceLocationId = stableId(tenantId, 'routeware', 'service_location', locationExternalId);
    const tenantScopedLegacyCustomerKey = buildTenantScopedKey(tenantId, user.id);

    const customer: UnifiedCustomerRecord = {
      ...buildBaseRecord(tenantId, 'routeware', 'customer', user.id, customerRawPayloadId, syncedAt, user.createdAt || syncedAt),
      displayName: user.name || user.email || 'Unnamed customer',
      email: normalizeEmail(user.email),
      phone: normalizePhone(user.phone),
      legacyCustomerId: user.id,
      tenantScopedLegacyCustomerKey,
      serviceLocationId,
      accountStatus: user.recordStatus === 'archived' ? 'inactive' : 'active',
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      claimStatus: user.claimStatus || null,
      linkedAuthUid: user.linkedAuthUid || null,
      pendingLinkedAuthUid: user.pendingLinkedAuthUid || null,
      plan: user.plan || 'Standard Residential',
      collectionDay: normalizeDayName(user.collectionDay),
      recordStatus: user.recordStatus || 'active',
      latestInviteSentAt: user.latestInviteSentAt || null,
      sourceLabel: 'Routeware',
    };
    const location: UnifiedServiceLocationRecord = {
      ...buildBaseRecord(tenantId, 'routeware', 'service_location', locationExternalId, locationRawPayloadId, syncedAt, syncedAt),
      customerId,
      name: `${customer.displayName} Service Location`,
      address: normalizeAddress(user.address) ? user.address || '' : '',
      latitude: null,
      longitude: null,
      serviceDays: [normalizeDayName(user.collectionDay)],
      status: user.recordStatus === 'archived' ? 'inactive' : 'active',
    };

    customers.push(customer);
    serviceLocations.push(location);
    customerByLegacyId.set(user.id, customer);
    locationByLegacyId.set(user.id, location);
  });

  const routes: UnifiedRouteRecord[] = [];
  const routeRuns: UnifiedRouteRunRecord[] = [];
  const stops: UnifiedStopRecord[] = [];
  const routeIdByDay = new Map<string, string>();
  const routeRunIdByDay = new Map<string, string>();

  const groupedCustomers = new Map<string, UnifiedCustomerRecord[]>();
  customers.forEach((customer) => {
    const day = normalizeDayName(customer.collectionDay);
    const existing = groupedCustomers.get(day) || [];
    existing.push(customer);
    groupedCustomers.set(day, existing);
  });

  const sortedDays = [...groupedCustomers.keys()].sort();
  sortedDays.forEach((day, index) => {
    const dayCustomers = (groupedCustomers.get(day) || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const externalRouteId = `route:${day.toLowerCase()}`;
    const routeRawPayloadId = registerRawPayload(
      rawPayloads,
      tenantId,
      'route',
      externalRouteId,
      'Derived Routeware route',
      {
        day,
        customerLegacyIds: dayCustomers.map((customer) => customer.legacyCustomerId),
      },
      syncedAt,
    );
    const serviceDate = nextOccurrenceIso(day, new Date(syncedAt));
    const routeRunExternalId = `${externalRouteId}:${serviceDate.slice(0, 10)}`;
    const routeRunRawPayloadId = registerRawPayload(
      rawPayloads,
      tenantId,
      'route_run',
      routeRunExternalId,
      'Derived Routeware route run',
      {
        routeExternalId: externalRouteId,
        serviceDate,
      },
      syncedAt,
    );
    const assignedVehicle = vehicles[index % Math.max(vehicles.length, 1)] || null;
    const routeId = stableId(tenantId, 'routeware', 'route', externalRouteId);
    const routeRunId = stableId(tenantId, 'routeware', 'route_run', routeRunExternalId);
    const route: UnifiedRouteRecord = {
      ...buildBaseRecord(tenantId, 'routeware', 'route', externalRouteId, routeRawPayloadId, syncedAt, syncedAt),
      name: `${day} Residential Route`,
      serviceDay: day,
      status: 'active',
      stopCount: dayCustomers.length,
      vehicleId: assignedVehicle?.id || null,
      driverId: assignedVehicle?.assignedDriverId || null,
      sourceLabel: 'Routeware',
    };
    const routeRun: UnifiedRouteRunRecord = {
      ...buildBaseRecord(tenantId, 'routeware', 'route_run', routeRunExternalId, routeRunRawPayloadId, syncedAt, serviceDate),
      routeId,
      serviceDate,
      status: new Date(serviceDate).toDateString() === new Date(syncedAt).toDateString() ? 'in_progress' : 'scheduled',
      startedAt: null,
      completedAt: null,
    };

    routes.push(route);
    routeRuns.push(routeRun);
    routeIdByDay.set(day, routeId);
    routeRunIdByDay.set(day, routeRunId);

    dayCustomers.forEach((customer, stopIndex) => {
      const latestPickup = latestPickupForCustomer(pickups, customer.legacyCustomerId || '');
      const stopExternalId = `${routeRunExternalId}:${customer.externalId}`;
      const stopRawPayloadId = registerRawPayload(
        rawPayloads,
        tenantId,
        'stop',
        stopExternalId,
        'Derived Routeware stop',
        {
          customerLegacyId: customer.legacyCustomerId,
          routeExternalId: externalRouteId,
          routeRunExternalId,
          sequence: stopIndex + 1,
          scheduledFor: serviceDate,
          latestPickupId: latestPickup?.id || null,
        },
        syncedAt,
      );
      stops.push({
        ...buildBaseRecord(tenantId, 'routeware', 'stop', stopExternalId, stopRawPayloadId, syncedAt, latestPickup?.date || serviceDate),
        routeId,
        routeRunId,
        customerId: customer.id,
        serviceLocationId: customer.serviceLocationId || stableId(tenantId, 'routeware', 'service_location', `${customer.externalId}:location`),
        sequence: stopIndex + 1,
        status:
          latestPickup?.status === 'completed'
            ? 'completed'
            : latestPickup?.status === 'cancelled'
              ? 'missed'
              : 'scheduled',
        scheduledFor: serviceDate,
        address: locationByLegacyId.get(customer.legacyCustomerId || '')?.address || '',
        binLocation: latestPickup?.binLocation || 'Curbside',
      });
    });
  });

  const serviceEvents: UnifiedServiceEventRecord[] = pickups
    .filter((pickup) => Boolean(customerByLegacyId.get(pickup.userId)))
    .map((pickup) => {
      const customer = customerByLegacyId.get(pickup.userId)!;
      const day = normalizeDayName(customer.collectionDay);
      const stop = stops.find((candidate) => candidate.customerId === customer.id && candidate.routeRunId === routeRunIdByDay.get(day)) || null;
      const eventRawPayloadId = registerRawPayload(rawPayloads, tenantId, 'service_event', pickup.id, 'Routeware service event', pickup, syncedAt);
      return {
        ...buildBaseRecord(tenantId, 'routeware', 'service_event', pickup.id, eventRawPayloadId, syncedAt, pickup.date || pickup.createdAt || syncedAt),
        customerId: customer.id,
        routeId: routeIdByDay.get(day) || null,
        routeRunId: routeRunIdByDay.get(day) || null,
        stopId: stop?.id || null,
        vehicleId: routes.find((route) => route.id === routeIdByDay.get(day))?.vehicleId || null,
        eventType:
          pickup.status === 'completed'
            ? 'service_completed'
            : pickup.status === 'cancelled'
              ? 'service_cancelled'
              : 'service_scheduled',
        status: pickup.status || 'scheduled',
        occurredAt: toIsoDate(pickup.date || pickup.createdAt, syncedAt),
        notes: pickup.binLocation || 'Curbside',
        sourceLabel: 'Routeware',
      };
    });

  const proofs: UnifiedProofOfServiceRecord[] = serviceEvents
    .filter((event) => event.status === 'completed')
    .map((event) => {
      const proofExternalId = `${event.externalId}:proof`;
      const proofRawPayloadId = registerRawPayload(
        rawPayloads,
        tenantId,
        'proof',
        proofExternalId,
        'Routeware proof of service',
        { serviceEventExternalId: event.externalId, notes: event.notes },
        syncedAt,
      );
      return {
        ...buildBaseRecord(tenantId, 'routeware', 'proof', proofExternalId, proofRawPayloadId, syncedAt, event.occurredAt),
        customerId: event.customerId,
        serviceEventId: event.id,
        occurredAt: event.occurredAt,
        proofType: 'completion',
        activityCode: 'COLLECTED',
        notes: event.notes,
      };
    });

  const exceptions: UnifiedExceptionRecord[] = [];
  serviceEvents
    .filter((event) => event.status === 'cancelled')
    .forEach((event) => {
      const exceptionRawPayloadId = registerRawPayload(
        rawPayloads,
        tenantId,
        'exception',
        `${event.externalId}:cancelled`,
        'Routeware cancelled pickup exception',
        { serviceEventExternalId: event.externalId, status: event.status },
        syncedAt,
      );
      exceptions.push({
        ...buildBaseRecord(tenantId, 'routeware', 'exception', `${event.externalId}:cancelled`, exceptionRawPayloadId, syncedAt, event.occurredAt),
        customerId: event.customerId,
        routeId: event.routeId,
        stopId: event.stopId,
        exceptionType: 'cancelled_pickup',
        status: 'open',
        occurredAt: event.occurredAt,
        description: 'Pickup was cancelled before completion.',
      });
    });

  interactions
    .filter((interaction) => interaction.type === 'service_request')
    .forEach((interaction) => {
      const customer = interaction.userId ? customerByLegacyId.get(interaction.userId) : null;
      const exceptionRawPayloadId = registerRawPayload(
        rawPayloads,
        tenantId,
        'exception',
        `${interaction.id}:request`,
        'Cordova service request',
        interaction,
        syncedAt,
      );
      exceptions.push({
        ...buildBaseRecord(tenantId, 'routeware', 'exception', `${interaction.id}:request`, exceptionRawPayloadId, syncedAt, interaction.date || syncedAt),
        customerId: customer?.id || null,
        routeId: null,
        stopId: null,
        exceptionType: 'customer_request',
        status: interaction.status === 'resolved' ? 'resolved' : 'open',
        occurredAt: toIsoDate(interaction.date, syncedAt),
        description: interaction.content || 'Service request',
      });
    });

  const billingStatuses: UnifiedBillingStatusRecord[] = users.map((user) => {
    const customer = customerByLegacyId.get(user.id)!;
    const customerPayments = payments.filter((payment) => payment.userId === user.id);
    const invoicePayments = customerPayments.filter((payment) => (payment.recordType || 'invoice') !== 'receipt');
    const totalPaid = invoicePayments
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const outstandingBalance = invoicePayments
      .filter((payment) => payment.status !== 'paid')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalInvoiced = invoicePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const lastPayment = customerPayments
      .filter((payment) => Boolean(payment.date))
      .sort((a, b) => new Date(toIsoDate(b.date)).getTime() - new Date(toIsoDate(a.date)).getTime())[0] || null;
    const billingRawPayloadId = registerRawPayload(
      rawPayloads,
      tenantId,
      'billing_status',
      user.id,
      'Routeware billing status',
      {
        legacyCustomerId: user.id,
        paymentIds: invoicePayments.map((payment) => payment.id),
        outstandingBalance,
        totalPaid,
        totalInvoiced,
      },
      syncedAt,
    );

    return {
      ...buildBaseRecord(tenantId, 'routeware', 'billing_status', user.id, billingRawPayloadId, syncedAt, lastPayment?.date || syncedAt),
      customerId: customer.id,
      legacyCustomerId: user.id,
      tenantScopedLegacyCustomerKey: buildTenantScopedKey(tenantId, user.id),
      outstandingBalance,
      totalPaid,
      totalInvoiced,
      lastPaymentAt: lastPayment?.date || null,
      paymentCount: invoicePayments.length,
      status: outstandingBalance > 0 ? 'attention' : 'current',
      sourceLabel: 'Cordova Platform',
    };
  });

  return {
    rawPayloads: [...rawPayloads.values()],
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
