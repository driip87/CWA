import { DEFAULT_TENANT_ID } from '../../shared/unified';

export function recordMatchesTenant(recordTenantId: string | null | undefined, tenantId: string) {
  if (recordTenantId) {
    return recordTenantId === tenantId;
  }

  return tenantId === DEFAULT_TENANT_ID;
}
