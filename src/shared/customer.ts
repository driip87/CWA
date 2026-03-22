export type ClaimStatus =
  | 'not_invited'
  | 'invited'
  | 'pending_verification'
  | 'claimed'
  | 'expired'
  | 'revoked'
  | 'needs_review'
  | 'conflict'
  | 'missing_email';

export type RecordStatus = 'active' | 'archived';

export interface CustomerProfile {
  id?: string;
  tenantId?: string;
  email?: string;
  name?: string;
  role?: 'user' | 'admin';
  phone?: string;
  address?: string;
  createdAt?: string;
  subscriptionStatus?: 'active' | 'inactive';
  claimStatus?: ClaimStatus;
  linkedAuthUid?: string | null;
  pendingLinkedAuthUid?: string | null;
  imported?: boolean;
  importSource?: string | null;
  importBatchId?: string | null;
  normalizedEmail?: string | null;
  normalizedPhone?: string | null;
  normalizedAddress?: string | null;
  plan?: string;
  collectionDay?: string;
  recordStatus?: RecordStatus;
  mergedIntoCustomerId?: string | null;
  latestInviteId?: string | null;
  latestInviteSentAt?: string | null;
  latestInviteExpiresAt?: string | null;
  latestInviteResendCount?: number;
  billingProvider?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePriceId?: string | null;
  subscriptionPlanName?: string | null;
  subscriptionAmount?: number | null;
  subscriptionCurrency?: string | null;
  subscriptionInterval?: string | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionCanceledAt?: string | null;
  subscriptionActivatedAt?: string | null;
  subscriptionUpdatedAt?: string | null;
}

export interface ImportedCustomerInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  collectionDay: string;
  plan: string;
}

export interface CustomerMatchResult {
  mode: 'email' | 'phone_address' | 'none' | 'ambiguous';
  matches: CustomerProfile[];
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || '';
}

export function normalizePhone(value?: string | null) {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function normalizeAddress(value?: string | null) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeImportedCustomer(input: ImportedCustomerInput) {
  return {
    ...input,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    collectionDay: input.collectionDay.trim() || 'Monday',
    plan: input.plan.trim() || 'Standard Residential',
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone),
    normalizedAddress: normalizeAddress(input.address),
  };
}

function isEligibleMatch(candidate: CustomerProfile) {
  return candidate.recordStatus !== 'archived' && candidate.linkedAuthUid == null;
}

export function findCustomerMatches(
  customers: CustomerProfile[],
  imported: ReturnType<typeof normalizeImportedCustomer>,
) : CustomerMatchResult {
  const eligible = customers.filter(isEligibleMatch);

  if (imported.normalizedEmail) {
    const emailMatches = eligible.filter(
      (candidate) => normalizeEmail(candidate.normalizedEmail || candidate.email) === imported.normalizedEmail,
    );
    if (emailMatches.length === 1) {
      return { mode: 'email', matches: emailMatches };
    }
    if (emailMatches.length > 1) {
      return { mode: 'ambiguous', matches: emailMatches };
    }
  }

  if (imported.normalizedPhone && imported.normalizedAddress) {
    const phoneAddressMatches = eligible.filter((candidate) => {
      const candidatePhone = normalizePhone(candidate.normalizedPhone || candidate.phone);
      const candidateAddress = normalizeAddress(candidate.normalizedAddress || candidate.address);
      return candidatePhone === imported.normalizedPhone && candidateAddress === imported.normalizedAddress;
    });

    if (phoneAddressMatches.length === 1) {
      return { mode: 'phone_address', matches: phoneAddressMatches };
    }
    if (phoneAddressMatches.length > 1) {
      return { mode: 'ambiguous', matches: phoneAddressMatches };
    }
  }

  return { mode: 'none', matches: [] };
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  return rows.slice(1).map((values) => {
    return {
      name: values[0] || '',
      email: values[1] || '',
      phone: values[2] || '',
      address: values[3] || '',
      collectionDay: values[4] || 'Monday',
      plan: values[5] || 'Standard Residential',
    };
  });
}
