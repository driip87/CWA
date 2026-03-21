import { adminAuth, adminDb } from '../src/server/firebaseAdmin';
import { backfillCustomerStatuses } from '../src/server/phase1';
import { normalizeEmail } from '../src/shared/customer';

const ADMIN_EMAIL = 'kereeonmiller@gmail.com';

async function main() {
  console.log('Backfilling customer claim metadata...');
  await backfillCustomerStatuses();

  console.log('Creating account records for existing auth users...');

  let nextPageToken: string | undefined;
  let processed = 0;
  let created = 0;

  do {
    const page = await adminAuth.listUsers(1000, nextPageToken);
    nextPageToken = page.pageToken;

    for (const authUser of page.users) {
      processed += 1;
      const accountRef = adminDb.collection('accounts').doc(authUser.uid);
      const existingAccount = await accountRef.get();
      if (existingAccount.exists) {
        continue;
      }

      const normalized = normalizeEmail(authUser.email);
      let customerDoc = await adminDb.collection('users').where('linkedAuthUid', '==', authUser.uid).limit(1).get();

      if (customerDoc.empty) {
        customerDoc = await adminDb.collection('users').where('uid', '==', authUser.uid).limit(1).get();
      }

      if (customerDoc.empty && normalized) {
        const emailMatches = await adminDb.collection('users').where('normalizedEmail', '==', normalized).limit(2).get();
        if (emailMatches.size === 1) {
          customerDoc = emailMatches;
        }
      }

      const customer = customerDoc.empty ? null : customerDoc.docs[0]!;
      const role = normalizeEmail(authUser.email) === ADMIN_EMAIL ? 'admin' : ((customer?.data().role as 'user' | 'admin' | undefined) || 'user');

      await accountRef.set({
        email: authUser.email || '',
        role,
        customerId: customer?.id || null,
        providers: (authUser.providerData || []).map((provider) => provider.providerId).filter(Boolean),
        emailVerified: Boolean(authUser.emailVerified),
        status: authUser.disabled ? 'disabled' : 'active',
        createdAt: authUser.metadata.creationTime || new Date().toISOString(),
        lastLoginAt: authUser.metadata.lastSignInTime || authUser.metadata.creationTime || new Date().toISOString(),
      });

      if (customer) {
        await customer.ref.set(
          {
            linkedAuthUid: authUser.uid,
            claimStatus: 'claimed',
          },
          { merge: true },
        );
      }

      created += 1;
    }
  } while (nextPageToken);

  console.log(`Processed ${processed} auth users and created ${created} account records.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
