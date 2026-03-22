import {
  normalizeAddress,
  normalizeEmail,
  normalizePhone,
  type CustomerProfile,
} from '../shared/customer';

function pickTargetValue(targetValue?: string | null, sourceValue?: string | null) {
  const trimmedTarget = targetValue?.trim();
  if (trimmedTarget) {
    return trimmedTarget;
  }

  return sourceValue?.trim() || '';
}

export function mergeCustomerIntoCanonicalTarget(source: CustomerProfile, target: CustomerProfile) {
  const name = pickTargetValue(target.name, source.name);
  const email = pickTargetValue(target.email, source.email);
  const phone = pickTargetValue(target.phone, source.phone);
  const address = pickTargetValue(target.address, source.address);
  const plan = pickTargetValue(target.plan, source.plan);
  const collectionDay = pickTargetValue(target.collectionDay, source.collectionDay);

  return {
    name,
    email,
    phone,
    address,
    plan,
    collectionDay,
    subscriptionStatus:
      source.subscriptionStatus === 'active' || target.subscriptionStatus === 'active' ? 'active' : 'inactive',
    imported: Boolean(target.imported || source.imported),
    importSource: target.importSource || source.importSource || null,
    importBatchId: target.importBatchId || source.importBatchId || null,
    recordStatus: target.recordStatus || 'active',
    normalizedEmail: normalizeEmail(email),
    normalizedPhone: normalizePhone(phone),
    normalizedAddress: normalizeAddress(address),
  } satisfies Partial<CustomerProfile>;
}
