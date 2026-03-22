import { describe, expect, it } from 'vitest';
import { buildRoutewareSnapshot } from './routewareNormalizer';

describe('buildRoutewareSnapshot', () => {
  it('normalizes Routeware-style legacy data into canonical entities', () => {
    const snapshot = buildRoutewareSnapshot(
      {
        users: [
          {
            id: 'user-1',
            role: 'user',
            name: 'Jane Driver',
            email: 'Jane@example.com',
            phone: '(901) 555-0100',
            address: '123 Main St',
            collectionDay: 'Tuesday',
            plan: 'Residential',
            subscriptionStatus: 'active',
            recordStatus: 'active',
          },
        ],
        pickups: [
          {
            id: 'pickup-1',
            userId: 'user-1',
            date: '2026-03-20T08:00:00.000Z',
            status: 'completed',
            binLocation: 'Curbside',
          },
        ],
        inventory: [
          {
            id: 'vehicle-1',
            type: 'vehicle',
            status: 'active',
            location: 'North Yard',
            assignedTo: 'driver-1',
          },
        ],
        payments: [
          {
            id: 'payment-1',
            userId: 'user-1',
            amount: 42.5,
            status: 'pending',
            date: '2026-03-20T12:00:00.000Z',
          },
        ],
        interactions: [],
      },
      { tenantId: 'tenant-1', syncedAt: '2026-03-21T12:00:00.000Z' },
    );

    expect(snapshot.customers).toHaveLength(1);
    expect(snapshot.serviceLocations).toHaveLength(1);
    expect(snapshot.routes).toHaveLength(1);
    expect(snapshot.routeRuns).toHaveLength(1);
    expect(snapshot.stops).toHaveLength(1);
    expect(snapshot.vehicles).toHaveLength(1);
    expect(snapshot.drivers).toHaveLength(1);
    expect(snapshot.serviceEvents).toHaveLength(1);
    expect(snapshot.proofs).toHaveLength(1);
    expect(snapshot.billingStatuses[0]?.outstandingBalance).toBe(42.5);
    expect(snapshot.customers[0]?.email).toBe('jane@example.com');
    expect(snapshot.customers[0]?.phone).toBe('9015550100');
  });

  it('produces stable IDs for repeat syncs', () => {
    const input = {
      users: [
        {
          id: 'user-1',
          role: 'user',
          name: 'Acme',
          collectionDay: 'Monday',
          recordStatus: 'active' as const,
        },
      ],
      pickups: [],
      inventory: [],
      payments: [],
      interactions: [],
    };

    const first = buildRoutewareSnapshot(input, { tenantId: 'tenant-1', syncedAt: '2026-03-21T10:00:00.000Z' });
    const second = buildRoutewareSnapshot(input, { tenantId: 'tenant-1', syncedAt: '2026-03-21T11:00:00.000Z' });

    expect(first.customers[0]?.id).toBe(second.customers[0]?.id);
    expect(first.routes[0]?.id).toBe(second.routes[0]?.id);
    expect(first.stops[0]?.id).toBe(second.stops[0]?.id);
  });

  it('versions stops by route run when service dates change', () => {
    const input = {
      users: [
        {
          id: 'user-1',
          role: 'user',
          name: 'Acme',
          collectionDay: 'Monday',
          recordStatus: 'active' as const,
        },
      ],
      pickups: [],
      inventory: [],
      payments: [],
      interactions: [],
    };

    const first = buildRoutewareSnapshot(input, { tenantId: 'tenant-1', syncedAt: '2026-03-21T10:00:00.000Z' });
    const second = buildRoutewareSnapshot(input, { tenantId: 'tenant-1', syncedAt: '2026-03-29T10:00:00.000Z' });

    expect(first.routes[0]?.id).toBe(second.routes[0]?.id);
    expect(first.routeRuns[0]?.id).not.toBe(second.routeRuns[0]?.id);
    expect(first.stops[0]?.id).not.toBe(second.stops[0]?.id);
    expect(first.stops[0]?.routeRunId).toBe(first.routeRuns[0]?.id);
    expect(second.stops[0]?.routeRunId).toBe(second.routeRuns[0]?.id);
  });

  it('ignores receipt records when computing billing status', () => {
    const snapshot = buildRoutewareSnapshot(
      {
        users: [
          {
            id: 'user-1',
            role: 'user',
            name: 'Acme',
            collectionDay: 'Monday',
            recordStatus: 'active',
          },
        ],
        pickups: [],
        inventory: [],
        payments: [
          {
            id: 'invoice-1',
            userId: 'user-1',
            amount: 25,
            status: 'paid',
            recordType: 'invoice',
            date: '2026-03-20T12:00:00.000Z',
          },
          {
            id: 'receipt-1',
            userId: 'user-1',
            amount: 25,
            status: 'paid',
            recordType: 'receipt',
            date: '2026-03-20T12:05:00.000Z',
          },
        ],
        interactions: [],
      },
      { tenantId: 'tenant-1', syncedAt: '2026-03-21T12:00:00.000Z' },
    );

    expect(snapshot.billingStatuses[0]?.totalPaid).toBe(25);
    expect(snapshot.billingStatuses[0]?.totalInvoiced).toBe(25);
    expect(snapshot.billingStatuses[0]?.outstandingBalance).toBe(0);
  });
});
