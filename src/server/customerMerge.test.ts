import { describe, expect, it } from 'vitest';
import { mergeCustomerIntoCanonicalTarget } from './customerMerge';

describe('mergeCustomerIntoCanonicalTarget', () => {
  it('keeps target identity fields when both records have values', () => {
    const merged = mergeCustomerIntoCanonicalTarget(
      {
        name: 'Source Name',
        email: 'source@example.com',
        phone: '9015550100',
        address: '123 Source St',
        plan: 'Premium',
        collectionDay: 'Friday',
        subscriptionStatus: 'inactive',
        imported: true,
        importSource: 'csv',
      },
      {
        name: 'Target Name',
        email: 'target@example.com',
        phone: '9015550000',
        address: '456 Target Ave',
        plan: 'Standard',
        collectionDay: 'Tuesday',
        subscriptionStatus: 'inactive',
        imported: false,
        importSource: null,
        importBatchId: 'batch-1',
        linkedAuthUid: 'auth-1',
        claimStatus: 'claimed',
      },
    );

    expect(merged.name).toBe('Target Name');
    expect(merged.email).toBe('target@example.com');
    expect(merged.phone).toBe('9015550000');
    expect(merged.address).toBe('456 Target Ave');
    expect(merged.plan).toBe('Standard');
    expect(merged.collectionDay).toBe('Tuesday');
    expect(merged.normalizedEmail).toBe('target@example.com');
    expect(merged.importBatchId).toBe('batch-1');
  });

  it('fills missing service fields from the source and preserves active service state', () => {
    const merged = mergeCustomerIntoCanonicalTarget(
      {
        name: 'Source Name',
        email: 'source@example.com',
        phone: '9015550100',
        address: '123 Source St',
        plan: 'Premium',
        collectionDay: 'Friday',
        subscriptionStatus: 'active',
        imported: true,
        importSource: 'csv',
        importBatchId: 'batch-2',
      },
      {
        name: 'Target Name',
        email: '',
        phone: '',
        address: '',
        plan: '',
        collectionDay: '',
        subscriptionStatus: 'inactive',
        imported: false,
        importSource: null,
        importBatchId: null,
      },
    );

    expect(merged.email).toBe('source@example.com');
    expect(merged.phone).toBe('9015550100');
    expect(merged.address).toBe('123 Source St');
    expect(merged.plan).toBe('Premium');
    expect(merged.collectionDay).toBe('Friday');
    expect(merged.subscriptionStatus).toBe('active');
    expect(merged.importSource).toBe('csv');
    expect(merged.importBatchId).toBe('batch-2');
  });
});
