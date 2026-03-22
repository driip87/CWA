import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { apiAuthedPost } from '../../lib/api';
import { SUBSCRIPTION_PLANS } from '../../shared/billing';

export default function Subscribe() {
  const { user, userData, refreshSession } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [processingSuccess, setProcessingSuccess] = useState(false);

  useEffect(() => {
    const handleSuccess = async () => {
      const success = searchParams.get('subscription_success');
      const sessionId = searchParams.get('session_id');

      if (success === 'true' && sessionId && user && userData && !processingSuccess) {
        setProcessingSuccess(true);
        try {
          await apiAuthedPost('/api/user/subscription/confirm', { sessionId });
          await refreshSession();

          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('subscription_success');
          nextParams.delete('session_id');
          setSearchParams(nextParams, { replace: true });
        } catch (error) {
          console.error('Error activating subscription:', error);
          alert('There was an issue activating your subscription. Please contact support.');
          setProcessingSuccess(false);
        }
      }
    };
    handleSuccess();
  }, [processingSuccess, refreshSession, searchParams, setSearchParams, user, userData]);

  const handleSubscribe = async (planId: string) => {
    if (!user || !userData) return;
    setLoading(true);
    try {
      const data = await apiAuthedPost<{ url: string }>('/api/create-subscription-session', { planId });
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create subscription checkout session');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to initiate subscription. Please try again.');
      setLoading(false);
    }
  };

  if (processingSuccess) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_32%),linear-gradient(180deg,#f8f7f2_0%,#f0ede3_100%)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--cw-accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-[var(--cw-ink)]">Activating your account...</h2>
          <p className="text-[color:var(--cw-ink-soft)] mt-2">Setting up your collection schedule.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_32%),linear-gradient(180deg,#f8f7f2_0%,#f0ede3_100%)] py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center relative">
      <div className="max-w-7xl mx-auto w-full">
        <div className="text-center mb-12">
          <p className="cw-kicker mb-4">Plans</p>
          <h1 className="text-4xl font-serif font-bold italic text-[var(--cw-ink)] mb-4">Choose Your Collection Plan</h1>
          <p className="text-xl text-[color:var(--cw-ink-soft)]">Select a subscription plan to activate your waste collection service.</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-center">
          {SUBSCRIPTION_PLANS.map((plan, index) => {
            const featured = index === 1;
            return (
              <div
                key={plan.id}
                className={
                  featured
                    ? 'cw-card-dark p-8 flex flex-col relative transform md:-translate-y-4 h-[105%]'
                    : 'cw-card p-8 flex flex-col h-full'
                }
              >
                {featured && (
                  <div className="absolute top-0 right-8 transform -translate-y-1/2">
                    <span className="cw-badge bg-[var(--cw-bg)] text-[var(--cw-primary)]">Most Popular</span>
                  </div>
                )}
                <h3 className={`text-2xl font-serif font-bold italic mb-2 ${featured ? 'text-white' : 'text-[var(--cw-ink)]'}`}>{plan.name}</h3>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className={`text-4xl font-extrabold ${featured ? 'text-white' : 'text-[var(--cw-ink)]'}`}>${plan.amount}</span>
                  <span className={featured ? 'text-white/80' : 'text-[color:var(--cw-ink-soft)]'}>/month</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className={`flex items-center gap-3 ${featured ? 'text-white' : 'text-[color:var(--cw-ink-soft)]'}`}>
                      <Check className={featured ? 'text-white' : 'text-[var(--cw-accent)]'} size={20} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading}
                  className={
                    featured
                      ? 'cw-btn cw-btn-secondary w-full'
                      : 'cw-btn cw-btn-primary w-full'
                  }
                >
                  {loading ? 'Processing...' : 'Subscribe Now'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
