import React, { useEffect, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, CreditCard, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { apiAuthedGet, apiAuthedPost } from '../../lib/api';
import type { UserDashboardResponse } from '../../shared/unified';

export default function UserDashboard() {
  const { user, userData } = useAuth();
  const [dashboard, setDashboard] = useState<UserDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestContent, setRequestContent] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const loadDashboard = async () => {
    if (!user || !userData) return;
    try {
      const paymentSuccess = searchParams.get('payment_success');
      const sessionId = searchParams.get('session_id');

      if (paymentSuccess === 'true' && sessionId) {
        await apiAuthedPost('/api/user/payments/confirm', { sessionId });
        alert('Payment successful! Thank you.');
        setSearchParams({});
      }

      const payload = await apiAuthedGet<UserDashboardResponse>('/api/user/domain/dashboard');
      setDashboard(payload);
    } catch (error) {
      console.error('Error fetching dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [user, userData, searchParams]);

  const balance = dashboard?.outstandingBalance || 0;

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

  const handleServiceRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !userData || !requestContent.trim()) return;

    setSubmittingRequest(true);
    try {
      await addDoc(collection(db, 'interactions'), {
        userId: userData.id,
        type: 'service_request',
        content: requestContent,
        date: new Date().toISOString(),
        authorId: userData.id,
        status: 'open',
      });
      setShowRequestModal(false);
      setRequestContent('');
      alert('Service request submitted successfully. We will get back to you soon.');
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loading || !dashboard) return <div className="cw-empty">Loading dashboard...</div>;

  return (
    <div className="cw-page">
      <header className="cw-page-header">
        <div>
          <p className="cw-kicker">Account Overview</p>
          <h1 className="cw-page-title mt-3">Welcome back, {dashboard.customer?.displayName?.split(' ')[0] || userData?.name?.split(' ')[0]}</h1>
          <p className="cw-page-copy">
            Track service, billing, and account details from one customer workspace.
          </p>
        </div>
        <button onClick={() => setShowRequestModal(true)} className="cw-btn cw-btn-primary">
          Request Service
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="cw-card p-6 flex items-center gap-4">
          <div className="cw-icon-chip">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-[color:var(--cw-ink-soft)]">Next Pickup</p>
            <p className="text-xl font-bold text-[var(--cw-ink)]">
              {dashboard.nextStop ? format(new Date(dashboard.nextStop.scheduledFor), 'EEE, MMM d') : 'Not scheduled'}
            </p>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-2">Live Schedule</p>
          </div>
        </div>
        <div className="cw-card p-6 flex flex-col justify-center relative overflow-hidden">
          <div className="flex items-center gap-4 mb-3">
            <div className="cw-icon-chip cw-icon-chip-accent">
              <CreditCard size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--cw-ink-soft)]">Current Balance</p>
              <p className="text-xl font-bold text-[var(--cw-ink)]">${balance.toFixed(2)}</p>
            </div>
          </div>
          {balance > 0 && (
            <button
              onClick={handlePayBalance}
              className="cw-btn cw-btn-primary w-full"
            >
              Pay Now <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="cw-card p-6 flex items-center gap-4">
          <div className="cw-icon-chip bg-[rgba(236,233,223,0.72)] text-[var(--cw-primary)]">
            <Truck size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-[color:var(--cw-ink-soft)]">Completed Pickups</p>
            <p className="text-xl font-bold text-[var(--cw-ink)]">{dashboard.totalCompletedPickups}</p>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-primary)] font-semibold mt-2">Service History</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="cw-card overflow-hidden">
          <div className="p-6 border-b border-[color:var(--cw-line)] flex justify-between items-center">
            <div>
              <h2 className="cw-section-title not-italic">Recent Service Activity</h2>
              <p className="text-sm text-[color:var(--cw-ink-soft)] mt-1">Your latest scheduled and completed service updates</p>
            </div>
            <Link to="/dashboard/pickups" className="text-sm cw-link">
              View All
            </Link>
          </div>
          <div className="divide-y divide-[rgba(45,45,32,0.06)]">
            {dashboard.recentEvents.length > 0 ? (
              dashboard.recentEvents.map((event) => (
                <div key={event.id} className="p-6 flex items-center justify-between hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        event.status === 'completed' ? 'bg-[rgba(107,142,107,0.16)] text-[#557455]' : event.status === 'scheduled' ? 'bg-[rgba(90,90,64,0.1)] text-[var(--cw-primary)]' : 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]'
                      }`}
                    >
                      {event.status === 'completed' ? <CheckCircle2 size={20} /> : event.status === 'scheduled' ? <Calendar size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div>
                      <p className="font-medium text-[var(--cw-ink)]">{event.eventType.replace(/_/g, ' ')}</p>
                      <p className="text-sm text-[color:var(--cw-ink-soft)]">{format(new Date(event.occurredAt), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[color:var(--cw-ink-soft)]">{event.notes || 'Curbside'}</p>
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-2">{event.sourceLabel}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 cw-empty">No recent pickups found.</div>
            )}
          </div>
        </div>

        <div className="cw-card overflow-hidden">
          <div className="p-6 border-b border-[color:var(--cw-line)] flex justify-between items-center">
            <div>
              <h2 className="cw-section-title not-italic">Recent Payments</h2>
              <p className="text-sm text-[color:var(--cw-ink-soft)] mt-1">Recent billing, invoice, and payment activity</p>
            </div>
            <Link to="/dashboard/payments" className="text-sm cw-link">
              View All
            </Link>
          </div>
          <div className="divide-y divide-[rgba(45,45,32,0.06)]">
            {dashboard.recentPayments.length > 0 ? (
              dashboard.recentPayments.map((payment) => (
                <div key={payment.id} className="p-6 flex items-center justify-between hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${payment.status === 'paid' ? 'bg-[rgba(107,142,107,0.16)] text-[#557455]' : 'bg-[rgba(176,137,77,0.12)] text-[#8f6d38]'}`}>
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-[var(--cw-ink)]">{payment.description}</p>
                      <p className="text-sm text-[color:var(--cw-ink-soft)]">{format(new Date(payment.date), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--cw-ink)]">${payment.amount.toFixed(2)}</p>
                    <p className={`text-xs font-medium uppercase tracking-wider ${payment.status === 'paid' ? 'text-[#557455]' : 'text-[#8f6d38]'}`}>{payment.status}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 cw-empty">No recent payments found.</div>
            )}
          </div>
        </div>
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="cw-card p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Request Service</h2>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-400 hover:text-gray-600">
                <AlertCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleServiceRequest} className="space-y-4">
              <div className="cw-alert cw-alert-info">
                Service requests go straight to your account team and stay visible here while they are being worked.
              </div>
              <textarea
                required
                value={requestContent}
                onChange={(event) => setRequestContent(event.target.value)}
                rows={5}
                className="cw-textarea"
                placeholder="Describe your request"
              />
              <button
                type="submit"
                disabled={submittingRequest}
                className="cw-btn cw-btn-primary w-full"
              >
                {submittingRequest ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
