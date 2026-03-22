import { adminDb } from './firebaseAdmin';
import { recordMatchesTenant } from './unified/tenantScope';

function nowIso() {
  return new Date().toISOString();
}

function isReceiptPayment(payment: FirebaseFirestore.DocumentData) {
  return payment.recordType === 'receipt';
}

function isInvoicePayment(payment: FirebaseFirestore.DocumentData) {
  return !isReceiptPayment(payment);
}

export async function settleBalancePaymentForCustomer(
  paymentId: string,
  customerId: string,
  tenantId: string,
  paymentPatch: Record<string, unknown> = {},
) {
  const paymentRef = adminDb.collection('payments').doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    throw new Error('Payment record not found');
  }

  const payment = paymentSnap.data() || {};
  if (payment.userId !== customerId) {
    throw new Error('Payment does not belong to the signed-in customer');
  }
  if (!recordMatchesTenant(payment.tenantId, tenantId)) {
    throw new Error('Payment does not belong to the active tenant');
  }

  if (payment.status === 'paid') {
    if (Object.keys(paymentPatch).length > 0) {
      await paymentRef.set(paymentPatch, { merge: true });
    }
    return {
      paymentId,
      settledInvoiceIds: Array.isArray(payment.settledInvoiceIds) ? payment.settledInvoiceIds : [],
      settledInvoiceCount: Number(payment.settledInvoiceCount || 0),
    };
  }

  const paymentsSnap = await adminDb.collection('payments').where('userId', '==', customerId).get();
  const tenantPayments = paymentsSnap.docs.filter((doc) => recordMatchesTenant(doc.data().tenantId, tenantId));
  const invoiceDocs = tenantPayments.filter((doc) => {
    if (doc.id === paymentId) return false;
    const data = doc.data();
    return isInvoicePayment(data) && data.status !== 'paid';
  });

  const batch = adminDb.batch();
  const settledAt = nowIso();

  invoiceDocs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'paid',
      paidAt: settledAt,
      settledByPaymentId: paymentId,
    });
  });

  batch.set(
    paymentRef,
    {
      ...paymentPatch,
      status: 'paid',
      paidAt: settledAt,
      recordType: isReceiptPayment(payment) ? 'receipt' : payment.recordType || 'invoice',
      settledInvoiceIds: invoiceDocs.map((doc) => doc.id),
      settledInvoiceCount: invoiceDocs.length,
      settledAmount: invoiceDocs.reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0),
    },
    { merge: true },
  );

  await batch.commit();

  return {
    paymentId,
    settledInvoiceIds: invoiceDocs.map((doc) => doc.id),
    settledInvoiceCount: invoiceDocs.length,
  };
}
