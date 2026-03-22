import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_ID } from '../shared/unified';
import { inferExpenseTenantAssignment, UNASSIGNED_EXPENSE_TENANT_ID } from './expenses';

describe('inferExpenseTenantAssignment', () => {
  const lookups = {
    users: new Map([
      ['customer-1', 'tenant-a'],
      ['customer-2', DEFAULT_TENANT_ID],
    ]),
    accounts: new Map([
      ['auth-1', 'tenant-a'],
      ['auth-2', 'tenant-b'],
    ]),
    inventory: new Map([
      ['vehicle-1', 'tenant-a'],
    ]),
  };

  it('keeps explicitly stamped tenant ids untouched', () => {
    const assignment = inferExpenseTenantAssignment({ tenantId: 'tenant-z', userId: 'customer-1' }, lookups);

    expect(assignment.assignment).toBe('existing');
    expect(assignment.tenantId).toBe('tenant-z');
    expect(assignment.reason).toBe('existing_tenant_id');
  });

  it('infers tenant id from a consistent ownership signal', () => {
    const assignment = inferExpenseTenantAssignment({ userId: 'customer-1' }, lookups);

    expect(assignment.assignment).toBe('inferred');
    expect(assignment.tenantId).toBe('tenant-a');
    expect(assignment.reason).toBe('userId');
  });

  it('accepts multiple consistent signals for the same tenant', () => {
    const assignment = inferExpenseTenantAssignment({ userId: 'customer-1', createdBy: 'auth-1', vehicleId: 'vehicle-1' }, lookups);

    expect(assignment.assignment).toBe('inferred');
    expect(assignment.tenantId).toBe('tenant-a');
    expect(assignment.reason).toBe('userId,createdBy,vehicleId');
    expect(assignment.signals).toHaveLength(3);
  });

  it('parks conflicting ownership signals in the unassigned bucket', () => {
    const assignment = inferExpenseTenantAssignment({ userId: 'customer-1', createdBy: 'auth-2' }, lookups);

    expect(assignment.assignment).toBe('unassigned');
    expect(assignment.tenantId).toBe(UNASSIGNED_EXPENSE_TENANT_ID);
    expect(assignment.reason).toBe('conflicting_signals');
  });

  it('parks expenses without a reliable signal in the unassigned bucket', () => {
    const assignment = inferExpenseTenantAssignment({ amount: 20, category: 'fuel' }, lookups);

    expect(assignment.assignment).toBe('unassigned');
    expect(assignment.tenantId).toBe(UNASSIGNED_EXPENSE_TENANT_ID);
    expect(assignment.reason).toBe('no_reliable_signal');
  });
});
