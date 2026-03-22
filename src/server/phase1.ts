import crypto from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { Resend } from 'resend';
import { adminAuth, adminDb } from './firebaseAdmin';
import { DEFAULT_TENANT_ID } from '../shared/unified';
import {
  type ClaimStatus,
  type CustomerProfile,
  type ImportedCustomerInput,
  findCustomerMatches,
  normalizeAddress,
  normalizeEmail,
  normalizeImportedCustomer,
  normalizePhone,
  parseCsv,
} from '../shared/customer';
import { mergeCustomerIntoCanonicalTarget } from './customerMerge';

const INVITE_TTL_DAYS = 7;
const ADMIN_EMAIL = 'kereeonmiller@gmail.com';

export interface AccountRecord {
  tenantId: string;
  email: string;
  role: 'user' | 'admin';
  customerId: string | null;
  providers: string[];
  emailVerified: boolean;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string;
}

export interface ClaimInviteRecord {
  customerId: string;
  email: string;
  tokenHash: string;
  status: 'pending' | 'claimed' | 'expired' | 'revoked';
  expiresAt: string;
  sentAt: string;
  claimedAt: string | null;
  sentBy: string | null;
  resendCount: number;
}

function nowIso() {
  return new Date().toISOString();
}

function daysFromNowIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getAppUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

function isAdminEmail(email?: string | null) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

function providersFromToken(decodedToken: DecodedIdToken) {
  const provider = decodedToken.firebase.sign_in_provider;
  return provider ? [provider] : [];
}

function sanitizeCustomer(customerId: string, raw?: FirebaseFirestore.DocumentData | null): CustomerProfile | null {
  if (!raw) return null;

  const customer: CustomerProfile = {
    id: customerId,
    tenantId: raw.tenantId || DEFAULT_TENANT_ID,
    ...raw,
    claimStatus: raw.claimStatus || inferClaimStatus(raw),
    normalizedEmail: raw.normalizedEmail || normalizeEmail(raw.email),
    normalizedPhone: raw.normalizedPhone || normalizePhone(raw.phone),
    normalizedAddress: raw.normalizedAddress || normalizeAddress(raw.address),
    recordStatus: raw.recordStatus || 'active',
    pendingLinkedAuthUid: raw.pendingLinkedAuthUid || null,
  };

  return customer;
}

function inferClaimStatus(customer: FirebaseFirestore.DocumentData): ClaimStatus {
  if (customer.linkedAuthUid) return 'claimed';
  if (customer.pendingLinkedAuthUid) return 'pending_verification';
  if (!customer.email) return 'missing_email';
  if (customer.latestInviteExpiresAt && new Date(customer.latestInviteExpiresAt).getTime() < Date.now()) {
    return 'expired';
  }
  if (customer.latestInviteId) return 'invited';
  return 'not_invited';
}

function normalizeCustomerPatch(customer: Partial<CustomerProfile>) {
  return {
    ...customer,
    normalizedEmail: normalizeEmail(customer.email),
    normalizedPhone: normalizePhone(customer.phone),
    normalizedAddress: normalizeAddress(customer.address),
  };
}

async function getCustomerById(customerId: string) {
  const customerSnap = await adminDb.collection('users').doc(customerId).get();
  return sanitizeCustomer(customerSnap.id, customerSnap.data());
}

async function getPendingInviteByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const inviteSnap = await adminDb
    .collection('claimInvites')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();

  if (inviteSnap.empty) {
    return null;
  }

  const doc = inviteSnap.docs[0]!;
  const data = doc.data() as ClaimInviteRecord;
  if (data.status !== 'pending') {
    return { id: doc.id, ...data } as const;
  }

  if (new Date(data.expiresAt).getTime() < Date.now()) {
    await doc.ref.update({ status: 'expired' });
    return { id: doc.id, ...data, status: 'expired' as const };
  }

  return { id: doc.id, ...data };
}

async function revokePendingInvites(customerId: string) {
  const snapshot = await adminDb
    .collection('claimInvites')
    .where('customerId', '==', customerId)
    .where('status', '==', 'pending')
    .get();

  if (snapshot.empty) return;

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { status: 'revoked' });
  });
  await batch.commit();
}

async function sendInviteEmail(email: string, claimLink: string, customerName?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(`Invite email not sent to ${email}. Missing Resend config. Claim link: ${claimLink}`);
    return { delivery: 'logged' as const };
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to: email,
    subject: 'Claim your Cordova Waste account',
    text: `Hello ${customerName || ''}\n\nClaim your Cordova Waste account here: ${claimLink}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    html: `
      <div>
        <p>Hello ${customerName || ''},</p>
        <p>Claim your Cordova Waste account by following this link:</p>
        <p><a href="${claimLink}">${claimLink}</a></p>
        <p>This link expires in ${INVITE_TTL_DAYS} days.</p>
      </div>
    `,
  });

  return { delivery: 'sent' as const };
}

function requiresEmailVerification(decodedToken: DecodedIdToken, providerIds: string[]) {
  return providerIds.includes('password') && !decodedToken.email_verified;
}

function buildAccountRecord(decodedToken: DecodedIdToken, customer: CustomerProfile, providerIds: string[]): AccountRecord {
  const timestamp = nowIso();
  return {
    tenantId: customer.tenantId || DEFAULT_TENANT_ID,
    email: decodedToken.email || '',
    role: customer.role || 'user',
    customerId: customer.id || null,
    providers: providerIds,
    emailVerified: Boolean(decodedToken.email_verified),
    status: 'active',
    createdAt: timestamp,
    lastLoginAt: timestamp,
  };
}

function buildCustomerLinkPatch(customer: CustomerProfile, uid: string, claimStatus: ClaimStatus) {
  return {
    linkedAuthUid: claimStatus === 'claimed' ? uid : null,
    pendingLinkedAuthUid: claimStatus === 'pending_verification' ? uid : null,
    claimStatus,
    normalizedEmail: normalizeEmail(customer.email),
    normalizedPhone: normalizePhone(customer.phone),
    normalizedAddress: normalizeAddress(customer.address),
  };
}

async function finalizePendingCustomerClaim(customer: CustomerProfile, uid: string) {
  const updates = {
    linkedAuthUid: uid,
    pendingLinkedAuthUid: null,
    claimStatus: 'claimed',
    normalizedEmail: normalizeEmail(customer.email),
    normalizedPhone: normalizePhone(customer.phone),
    normalizedAddress: normalizeAddress(customer.address),
  };

  if (customer.latestInviteId) {
    const inviteRef = adminDb.collection('claimInvites').doc(customer.latestInviteId);
    const inviteSnap = await inviteRef.get();
    if (inviteSnap.exists) {
      await inviteRef.set(
        {
          status: 'claimed',
          claimedAt: nowIso(),
        },
        { merge: true },
      );
    }
  }

  await adminDb.collection('users').doc(customer.id!).update(updates);
}

async function resetPendingVerificationState(customer: CustomerProfile) {
  const pendingUid = customer.pendingLinkedAuthUid;
  if (!pendingUid) {
    return;
  }

  try {
    await adminAuth.getUser(pendingUid);
    await adminAuth.deleteUser(pendingUid);
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  await adminDb.collection('accounts').doc(pendingUid).delete();

  const resetPayload: Record<string, unknown> = {
    pendingLinkedAuthUid: null,
    linkedAuthUid: null,
    claimStatus: customer.email ? 'not_invited' : 'missing_email',
    latestInviteId: null,
    latestInviteSentAt: null,
    latestInviteExpiresAt: null,
  };

  if (customer.latestInviteId) {
    const inviteRef = adminDb.collection('claimInvites').doc(customer.latestInviteId);
    const inviteSnap = await inviteRef.get();
    if (inviteSnap.exists) {
      await inviteRef.set(
        {
          status: 'revoked',
          claimedAt: null,
        },
        { merge: true },
      );
    }
  }

  await adminDb.collection('users').doc(customer.id!).update(resetPayload);
}

export async function createInviteForCustomer(customerId: string, sentBy: string | null) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }
  if (!customer.email) {
    throw new Error('Customer is missing an email address');
  }
  if (customer.linkedAuthUid) {
    throw new Error('Customer is already linked to an account');
  }
  if (customer.pendingLinkedAuthUid || customer.claimStatus === 'pending_verification') {
    throw new Error('Customer is awaiting email verification');
  }
  if (customer.recordStatus === 'archived') {
    throw new Error('Archived customers cannot receive invites');
  }

  await revokePendingInvites(customerId);

  const rawToken = generateToken();
  const sentAt = nowIso();
  const expiresAt = daysFromNowIso(INVITE_TTL_DAYS);
  const resendCount = (customer.latestInviteResendCount || 0) + 1;
  const inviteRef = adminDb.collection('claimInvites').doc();

  const invite: ClaimInviteRecord = {
    customerId,
    email: customer.email,
    tokenHash: hashToken(rawToken),
    status: 'pending',
    expiresAt,
    sentAt,
    claimedAt: null,
    sentBy,
    resendCount,
  };

  await inviteRef.set(invite);

  const claimLink = `${getAppUrl()}/claim?token=${rawToken}`;

  await adminDb.collection('users').doc(customerId).update({
    claimStatus: 'invited',
    pendingLinkedAuthUid: null,
    latestInviteId: inviteRef.id,
    latestInviteSentAt: sentAt,
    latestInviteExpiresAt: expiresAt,
    latestInviteResendCount: resendCount,
  });

  await sendInviteEmail(customer.email, claimLink, customer.name);

  return {
    inviteId: inviteRef.id,
    claimLink,
    expiresAt,
    sentAt,
    resendCount,
  };
}

export async function resendInviteForCustomer(customerId: string, sentBy: string | null) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  if (customer.linkedAuthUid) {
    throw new Error('Customer is already linked to an account');
  }

  if (customer.pendingLinkedAuthUid || customer.claimStatus === 'pending_verification') {
    await resetPendingVerificationState(customer);
  }

  return createInviteForCustomer(customerId, sentBy);
}

async function upsertAccount(uid: string, account: AccountRecord) {
  await adminDb.collection('accounts').doc(uid).set(account, { merge: true });
}

async function findUniqueImportedCustomerByEmail(email: string) {
  if (!email) return null;

  const snapshot = await adminDb
    .collection('users')
    .where('normalizedEmail', '==', email)
    .where('recordStatus', '==', 'active')
    .get();

  const matches = snapshot.docs
    .map((doc) => sanitizeCustomer(doc.id, doc.data()))
    .filter((customer): customer is CustomerProfile => Boolean(customer))
    .filter((customer) => customer.imported && !customer.linkedAuthUid);

  return matches.length === 1 ? matches[0]! : null;
}

async function createCustomerForSignup(decodedToken: DecodedIdToken, profileName?: string | null) {
  const createdAt = nowIso();
  const email = decodedToken.email || '';
  const role = isAdminEmail(email) ? 'admin' : 'user';
  const resolvedName = profileName?.trim() || decodedToken.name || '';

  const customerPatch = normalizeCustomerPatch({
    email,
    name: resolvedName,
    tenantId: DEFAULT_TENANT_ID,
    role,
    createdAt,
    subscriptionStatus: role === 'admin' ? 'active' : 'inactive',
    claimStatus: 'claimed',
    linkedAuthUid: decodedToken.uid,
    pendingLinkedAuthUid: null,
    imported: false,
    importSource: null,
    importBatchId: null,
    plan: '',
    collectionDay: '',
    recordStatus: 'active',
    latestInviteId: null,
    latestInviteSentAt: null,
    latestInviteExpiresAt: null,
    latestInviteResendCount: 0,
  });

  const docRef = await adminDb.collection('users').add(customerPatch);
  return sanitizeCustomer(docRef.id, customerPatch);
}

export async function bootstrapAuthSession(
  decodedToken: DecodedIdToken,
  claimToken?: string | null,
  profileName?: string | null,
) {
  const uid = decodedToken.uid;
  const email = normalizeEmail(decodedToken.email);
  const providerIds = providersFromToken(decodedToken);
  const existingAccountSnap = await adminDb.collection('accounts').doc(uid).get();

  let account: AccountRecord | null = existingAccountSnap.exists ? (existingAccountSnap.data() as AccountRecord) : null;
  let customer: CustomerProfile | null = null;

  if (!account) {
    if (claimToken) {
      const invite = await getPendingInviteByToken(claimToken);
      if (!invite || invite.status !== 'pending') {
        throw new Error('Invalid or expired claim token');
      }
      if (normalizeEmail(invite.email) !== email) {
        throw new Error('This claim link does not match the signed-in email address');
      }

      customer = await getCustomerById(invite.customerId);
      if (!customer || customer.recordStatus === 'archived') {
        throw new Error('Claim target no longer exists');
      }
      if (customer.linkedAuthUid) {
        throw new Error('This customer has already been claimed');
      }

      account = buildAccountRecord(decodedToken, customer, providerIds);
      const nextClaimStatus = requiresEmailVerification(decodedToken, providerIds) ? 'pending_verification' : 'claimed';

      await adminDb.runTransaction(async (transaction) => {
        transaction.set(adminDb.collection('accounts').doc(uid), account!);
        transaction.update(adminDb.collection('users').doc(customer!.id!), buildCustomerLinkPatch(customer!, uid, nextClaimStatus));
        transaction.update(adminDb.collection('claimInvites').doc(invite.id), {
          status: 'claimed',
          claimedAt: nowIso(),
        });
      });

      customer = await getCustomerById(customer.id!);
    } else {
      const matchedImportedCustomer = await findUniqueImportedCustomerByEmail(email);

      if (matchedImportedCustomer) {
        account = buildAccountRecord(decodedToken, matchedImportedCustomer, providerIds);
        const nextClaimStatus = requiresEmailVerification(decodedToken, providerIds) ? 'pending_verification' : 'claimed';

        await adminDb.runTransaction(async (transaction) => {
          transaction.set(adminDb.collection('accounts').doc(uid), account!);
          transaction.update(
            adminDb.collection('users').doc(matchedImportedCustomer.id!),
            buildCustomerLinkPatch(matchedImportedCustomer, uid, nextClaimStatus),
          );
        });

        customer = await getCustomerById(matchedImportedCustomer.id!);
      } else {
        customer = await createCustomerForSignup(decodedToken, profileName);
        account = {
          tenantId: customer.tenantId || DEFAULT_TENANT_ID,
          email: decodedToken.email || '',
          role: customer.role || 'user',
          customerId: customer.id || null,
          providers: providerIds,
          emailVerified: Boolean(decodedToken.email_verified),
          status: 'active',
          createdAt: nowIso(),
          lastLoginAt: nowIso(),
        };
        await upsertAccount(uid, account);
      }
    }
  } else {
    account = {
      ...account,
      email: decodedToken.email || account.email,
      providers: providerIds.length ? providerIds : account.providers,
      emailVerified: Boolean(decodedToken.email_verified),
      lastLoginAt: nowIso(),
      role: isAdminEmail(decodedToken.email) ? 'admin' : account.role,
    };
    await upsertAccount(uid, account);
  }

  if (!customer && account.customerId) {
    customer = await getCustomerById(account.customerId);
  }

  if (customer?.id && profileName?.trim() && !customer.name?.trim()) {
    await adminDb.collection('users').doc(customer.id).update({
      name: profileName.trim(),
    });
    customer = await getCustomerById(customer.id);
  }

  if (
    customer &&
    customer.id &&
    customer.claimStatus === 'pending_verification' &&
    customer.pendingLinkedAuthUid === uid &&
    Boolean(decodedToken.email_verified)
  ) {
    await finalizePendingCustomerClaim(customer, uid);
    customer = await getCustomerById(customer.id);
  }

  if (!customer && account.customerId === null && account.role === 'admin') {
    customer = await createCustomerForSignup(decodedToken);
    account.customerId = customer.id || null;
    await upsertAccount(uid, account);
  }

  return {
    account,
    customer,
  };
}

export async function getClaimPreview(rawToken: string) {
  const invite = await getPendingInviteByToken(rawToken);
  if (!invite) {
    return null;
  }

  const customer = await getCustomerById(invite.customerId);
  return {
    inviteId: invite.id,
    email: invite.email,
    expiresAt: invite.expiresAt,
    status: invite.status,
    customerName: customer?.name || 'Cordova Waste customer',
  };
}

export async function revokeInvite(customerId: string) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }
  if (customer.pendingLinkedAuthUid || customer.claimStatus === 'pending_verification') {
    await resetPendingVerificationState(customer);
    return;
  }
  if (!customer.latestInviteId) {
    throw new Error('Customer has no invite to revoke');
  }

  await revokePendingInvites(customerId);
  await adminDb.collection('users').doc(customerId).update({
    claimStatus: 'revoked',
    pendingLinkedAuthUid: null,
    latestInviteId: null,
    latestInviteSentAt: null,
    latestInviteExpiresAt: null,
  });
}

export async function resolveCustomerConflict(sourceCustomerId: string, mode: 'standalone' | 'link_existing', targetCustomerId?: string) {
  const source = await getCustomerById(sourceCustomerId);
  if (!source) {
    throw new Error('Source customer not found');
  }

  if (mode === 'standalone') {
    if (source.linkedAuthUid) {
      await adminDb.collection('users').doc(sourceCustomerId).update({ claimStatus: 'claimed' });
      return getCustomerById(sourceCustomerId);
    }
    if (source.pendingLinkedAuthUid || source.claimStatus === 'pending_verification') {
      throw new Error('Customer is awaiting email verification');
    }

    if (!source.email) {
      await adminDb.collection('users').doc(sourceCustomerId).update({ claimStatus: 'missing_email' });
      return getCustomerById(sourceCustomerId);
    }

    await createInviteForCustomer(sourceCustomerId, null);
    return getCustomerById(sourceCustomerId);
  }

  if (!targetCustomerId) {
    throw new Error('Target customer is required');
  }

  if (source.linkedAuthUid || source.pendingLinkedAuthUid) {
    throw new Error('Linked or verification-pending customers cannot be merged into another profile');
  }

  const target = await getCustomerById(targetCustomerId);
  if (!target) {
    throw new Error('Target customer not found');
  }
  if (target.recordStatus === 'archived') {
    throw new Error('Archived customers cannot be merge targets');
  }
  if (source.id === target.id) {
    throw new Error('Source and target customer must be different');
  }
  if (source.linkedAuthUid || source.pendingLinkedAuthUid) {
    throw new Error('Linked customers must be resolved without merging into another profile');
  }

  await revokePendingInvites(sourceCustomerId);

  await adminDb.runTransaction(async (transaction) => {
    transaction.update(adminDb.collection('users').doc(targetCustomerId), mergeCustomerIntoCanonicalTarget(source, target));
    transaction.update(adminDb.collection('users').doc(sourceCustomerId), {
      recordStatus: 'archived',
      claimStatus: 'conflict',
      mergedIntoCustomerId: targetCustomerId,
      pendingLinkedAuthUid: null,
      latestInviteId: null,
      latestInviteSentAt: null,
      latestInviteExpiresAt: null,
    });
  });

  return getCustomerById(targetCustomerId);
}

export async function importLegacyCustomers(csvText: string, adminUid: string) {
  const importedRows = parseCsv(csvText)
    .map((row) => normalizeImportedCustomer(row as ImportedCustomerInput))
    .filter((row) => row.name || row.email || row.phone || row.address);

  const allCustomersSnapshot = await adminDb.collection('users').get();
  const allCustomers = allCustomersSnapshot.docs
    .map((doc) => sanitizeCustomer(doc.id, doc.data()))
    .filter((customer): customer is CustomerProfile => Boolean(customer));

  const batchId = crypto.randomUUID();
  const results: Array<{ email: string; action: string; customerId: string; claimStatus: ClaimStatus }> = [];

  for (const row of importedRows) {
    const match = findCustomerMatches(allCustomers, row);
    const basePayload = {
      name: row.name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      tenantId: DEFAULT_TENANT_ID,
      role: 'user' as const,
      createdAt: nowIso(),
      subscriptionStatus: 'active' as const,
      imported: true,
      importSource: 'csv',
      importBatchId: batchId,
      normalizedEmail: row.normalizedEmail,
      normalizedPhone: row.normalizedPhone,
      normalizedAddress: row.normalizedAddress,
      plan: row.plan,
      collectionDay: row.collectionDay,
      recordStatus: 'active' as const,
      pendingLinkedAuthUid: null,
      latestInviteId: null,
      latestInviteSentAt: null,
      latestInviteExpiresAt: null,
      latestInviteResendCount: 0,
    };

    if (match.mode === 'email' || match.mode === 'phone_address') {
      const target = match.matches[0]!;
      await adminDb.collection('users').doc(target.id!).update({
        ...basePayload,
        createdAt: target.createdAt || basePayload.createdAt,
        linkedAuthUid: target.linkedAuthUid || null,
        pendingLinkedAuthUid: target.pendingLinkedAuthUid || null,
        claimStatus: target.linkedAuthUid
          ? 'claimed'
          : target.pendingLinkedAuthUid
            ? 'pending_verification'
            : row.email
              ? 'invited'
              : 'missing_email',
      });

      if (!target.linkedAuthUid && !target.pendingLinkedAuthUid && row.email) {
        await createInviteForCustomer(target.id!, adminUid);
      }

      const refreshed = await getCustomerById(target.id!);
      if (refreshed) {
        const existingIndex = allCustomers.findIndex((customer) => customer.id === refreshed.id);
        if (existingIndex >= 0) {
          allCustomers.splice(existingIndex, 1, refreshed);
        }
      }

      results.push({
        email: row.email,
        action: 'updated_existing',
        customerId: target.id!,
        claimStatus: refreshed?.claimStatus || 'not_invited',
      });
      continue;
    }

    let claimStatus: ClaimStatus = 'not_invited';
    if (match.mode === 'ambiguous') {
      claimStatus = 'needs_review';
    } else if (!row.email) {
      claimStatus = 'missing_email';
    } else {
      claimStatus = 'invited';
    }

    const docRef = adminDb.collection('users').doc();
    await docRef.set({
      ...basePayload,
      linkedAuthUid: null,
      pendingLinkedAuthUid: null,
      claimStatus,
      mergedIntoCustomerId: null,
    });

    let createdCustomer = await getCustomerById(docRef.id);

    if (claimStatus === 'invited') {
      await createInviteForCustomer(docRef.id, adminUid);
      createdCustomer = await getCustomerById(docRef.id);
    }

    if (createdCustomer) {
      allCustomers.push(createdCustomer);
    }

    results.push({
      email: row.email,
      action: match.mode === 'ambiguous' ? 'needs_review' : 'created',
      customerId: docRef.id,
      claimStatus: createdCustomer?.claimStatus || claimStatus,
    });
  }

  const summary = results.reduce(
    (acc, result) => {
      acc.total += 1;
      if (result.action === 'needs_review') acc.needsReview += 1;
      if (result.action === 'created') acc.created += 1;
      if (result.action === 'updated_existing') acc.updated += 1;
      if (result.claimStatus === 'invited') acc.invited += 1;
      if (result.claimStatus === 'missing_email') acc.missingEmail += 1;
      return acc;
    },
    { total: 0, created: 0, updated: 0, needsReview: 0, invited: 0, missingEmail: 0 },
  );

  return { batchId, summary, results };
}

export async function backfillCustomerStatuses() {
  const snapshot = await adminDb.collection('users').get();
  const batch = adminDb.batch();

  snapshot.docs.forEach((doc) => {
    const customer = sanitizeCustomer(doc.id, doc.data());
    const raw = doc.data();
    if (!customer) return;

    batch.set(
      doc.ref,
      {
        normalizedEmail: normalizeEmail(customer.email),
        normalizedPhone: normalizePhone(customer.phone),
        normalizedAddress: normalizeAddress(customer.address),
        tenantId: customer.tenantId || DEFAULT_TENANT_ID,
        claimStatus: customer.claimStatus || inferClaimStatus(customer),
        linkedAuthUid: customer.linkedAuthUid || raw.uid || null,
        pendingLinkedAuthUid: customer.pendingLinkedAuthUid || null,
        imported: Boolean(customer.imported),
        importSource: customer.importSource || null,
        importBatchId: customer.importBatchId || null,
        recordStatus: customer.recordStatus || 'active',
        mergedIntoCustomerId: customer.mergedIntoCustomerId || null,
      },
      { merge: true },
    );
  });

  await batch.commit();
}
