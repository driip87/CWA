import { describe, expect, it } from 'vitest';
import { findCustomerMatches, normalizeImportedCustomer, normalizePhone, parseCsv } from './customer';

describe('customer matching', () => {
  it('matches a unique imported customer by normalized email', () => {
    const result = findCustomerMatches(
      [
        {
          id: 'customer-1',
          email: 'legacy@example.com',
          normalizedEmail: 'legacy@example.com',
          recordStatus: 'active',
          imported: true,
          linkedAuthUid: null,
        },
      ],
      normalizeImportedCustomer({
        name: 'Legacy User',
        email: 'LEGACY@example.com',
        phone: '',
        address: '',
        collectionDay: 'Monday',
        plan: 'Standard',
      }),
    );

    expect(result.mode).toBe('email');
    expect(result.matches[0]?.id).toBe('customer-1');
  });

  it('matches a unique imported customer by phone and address when email is absent', () => {
    const result = findCustomerMatches(
      [
        {
          id: 'customer-2',
          phone: '(901) 555-0100',
          normalizedPhone: normalizePhone('(901) 555-0100'),
          address: '123 Main St.',
          normalizedAddress: '123 main st',
          recordStatus: 'active',
          imported: true,
          linkedAuthUid: null,
        },
      ],
      normalizeImportedCustomer({
        name: 'Legacy User',
        email: '',
        phone: '9015550100',
        address: '123 Main St',
        collectionDay: 'Tuesday',
        plan: 'Standard',
      }),
    );

    expect(result.mode).toBe('phone_address');
    expect(result.matches[0]?.id).toBe('customer-2');
  });

  it('marks ambiguous matches instead of auto-linking', () => {
    const result = findCustomerMatches(
      [
        {
          id: 'customer-1',
          email: 'legacy@example.com',
          normalizedEmail: 'legacy@example.com',
          recordStatus: 'active',
          imported: true,
          linkedAuthUid: null,
        },
        {
          id: 'customer-2',
          email: 'legacy@example.com',
          normalizedEmail: 'legacy@example.com',
          recordStatus: 'active',
          imported: true,
          linkedAuthUid: null,
        },
      ],
      normalizeImportedCustomer({
        name: 'Legacy User',
        email: 'legacy@example.com',
        phone: '',
        address: '',
        collectionDay: 'Monday',
        plan: 'Standard',
      }),
    );

    expect(result.mode).toBe('ambiguous');
    expect(result.matches).toHaveLength(2);
  });

  it('parses quoted CSV fields with embedded commas', () => {
    const rows = parseCsv([
      'Name,Email,Phone,Address,Collection Day,Plan',
      '"Doe, Jane",jane@example.com,555-0100,"123 Main St, Apt 4B",Tuesday,"Premium, Household"',
    ].join('\n'));

    expect(rows).toEqual([
      {
        name: 'Doe, Jane',
        email: 'jane@example.com',
        phone: '555-0100',
        address: '123 Main St, Apt 4B',
        collectionDay: 'Tuesday',
        plan: 'Premium, Household',
      },
    ]);
  });

  it('keeps blank CSV fields instead of shifting columns', () => {
    const rows = parseCsv([
      'Name,Email,Phone,Address,Collection Day,Plan',
      'Legacy User,,9015550100,"456 River Rd",,',
    ].join('\n'));

    expect(rows).toEqual([
      {
        name: 'Legacy User',
        email: '',
        phone: '9015550100',
        address: '456 River Rd',
        collectionDay: 'Monday',
        plan: 'Standard Residential',
      },
    ]);
  });
});
