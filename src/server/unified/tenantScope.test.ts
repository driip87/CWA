import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_ID } from '../../shared/unified';
import { recordMatchesTenant } from './tenantScope';

describe('recordMatchesTenant', () => {
  it('treats missing tenantId as default-tenant data only', () => {
    expect(recordMatchesTenant(undefined, DEFAULT_TENANT_ID)).toBe(true);
    expect(recordMatchesTenant(undefined, 'tenant-b')).toBe(false);
  });

  it('requires explicit equality for tenant-stamped records', () => {
    expect(recordMatchesTenant('tenant-a', 'tenant-a')).toBe(true);
    expect(recordMatchesTenant('tenant-a', 'tenant-b')).toBe(false);
  });
});
