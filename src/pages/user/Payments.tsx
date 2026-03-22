import React, { useEffect, useState } from 'react';
import { ArrowRight, CreditCard, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthedGet, apiAuthedPost } from '../../lib/api';

interface PaymentRecord {
  id: string;
  amount: number;
  description: string;
  status: string;
  date: string;
  sourceLabel: string;
}

export default function UserPayments() {
  const { user, userData } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    if (!user || !userData) return;
    try {
      const paymentSuccess = searchParams.get('payment_success');
      const sessionId = searchParams.get('session_id');

      if (paymentSuccess === 'true' && sessionId) {
        await apiAuthedPost('/api/user/payments/confirm', { sessionId });
        alert('Payment successful! Thank you.');
        setSearchParams({});
      }

      const payload = await apiAuthedGet<{ payments: PaymentRecord[]; outstandingBalance: number }>('/api/user/domain/payments');
      setPayments(payload.payments);
      setBalance(payload.outstandingBalance);
    } catch (error) {
      console.error('Error fetching payments', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user, userData, searchParams]);

  const handlePayBalance = async () => {
    if (!user || !userData || balance <= 0) return;
    try {
      const data = await apiAuthedPost<{ url: string }>('/api/create-checkout-session');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to initiate payment. Please try again later.');
    }
  };

  if (loading) return <div className="cw-empty">Loading payments...</div>;

  return (
    <div className="cw-page">
      <header className="cw-page-header">
        <div>
          <p className="cw-kicker">Billing</p>
          <h1 className="cw-page-title mt-3">Payments & Invoices</h1>
          <p className="cw-page-copy">Review recent payments, invoices, and any balance due for your account.</p>
        </div>
        {balance > 0 && (
          <div className="cw-card-soft p-4 flex items-center gap-6">
            <div>
              <p className="text-sm font-medium text-[var(--cw-danger)]">Outstanding Balance</p>
              <p className="text-2xl font-bold text-[var(--cw-danger)]">${balance.toFixed(2)}</p>
            </div>
            <button onClick={handlePayBalance} className="cw-btn cw-btn-primary">
              Pay Now <ArrowRight size={18} />
            </button>
          </div>
        )}
      </header>

      <div className="cw-card overflow-hidden">
        <div className="divide-y divide-[rgba(45,45,32,0.06)]">
          {payments.length > 0 ? (
            payments.map((payment) => (
              <div key={payment.id} className="p-6 flex items-center justify-between hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${payment.status === 'paid' ? 'bg-[rgba(107,142,107,0.16)] text-[#557455]' : 'bg-[rgba(176,137,77,0.12)] text-[#8f6d38]'}`}>
                    {payment.status === 'paid' ? <CreditCard size={24} /> : <FileText size={24} />}
                  </div>
                  <div>
                    <p className="font-bold text-[var(--cw-ink)]">{payment.description}</p>
                    <p className="text-sm text-[color:var(--cw-ink-soft)]">{format(new Date(payment.date), 'MMMM d, yyyy')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-[var(--cw-ink)]">${payment.amount.toFixed(2)}</p>
                  <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${payment.status === 'paid' ? 'text-[#557455]' : 'text-[#8f6d38]'}`}>{payment.status}</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-2">{payment.sourceLabel}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 cw-empty">No payment history found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
