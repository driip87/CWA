import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiGet } from '../lib/api';
import { getFirebaseAuthErrorMessage } from '../lib/firebaseAuthErrors';

interface ClaimPreview {
  inviteId: string;
  email: string;
  expiresAt: string;
  status: 'pending' | 'claimed' | 'expired' | 'revoked';
  customerName: string;
}

export default function Claim() {
  const { user, accountData, claimAccount } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Missing claim token');
      setLoading(false);
      return;
    }

    apiGet<ClaimPreview>(`/api/claim/${encodeURIComponent(token)}`)
      .then((data) => {
        setPreview(data);
        setEmail(data.email);
      })
      .catch((claimError: Error) => {
        setError(claimError.message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!user || !accountData) return;
    if (!user.emailVerified && accountData.providers.includes('password')) {
      navigate('/verify-email');
      return;
    }
    navigate(accountData.role === 'admin' ? '/admin' : '/dashboard');
  }, [accountData, navigate, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await claimAccount(email, password, token);
      setMessage('Account reserved. Check your inbox to verify your email and finish linking the customer profile.');
    } catch (claimError) {
      setError(getFirebaseAuthErrorMessage(claimError, 'Unable to claim account'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center cw-empty">Loading claim invite...</div>;
  }

  return (
    <div className="min-h-screen px-4 py-12 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_32%),linear-gradient(180deg,#f8f7f2_0%,#f0ede3_100%)]">
      <div className="cw-card w-full max-w-lg p-8">
        <p className="cw-kicker mb-4">Claim Account</p>
        <h1 className="text-3xl font-serif font-bold italic text-[var(--cw-ink)] mb-2">
          {preview?.customerName ? `Finish setting up ${preview.customerName}` : 'Claim your account'}
        </h1>
        <p className="text-[color:var(--cw-ink-soft)] mb-6">
          This claim link connects you to your existing Cordova Waste customer profile without creating a duplicate account.
        </p>

        {error && <div className="mb-4 cw-alert cw-alert-danger">{error}</div>}
        {message && <div className="mb-4 cw-alert cw-alert-success">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Invited Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--cw-ink-soft)]/55 pointer-events-none" size={18} />
              <input
                type="email"
                required
                readOnly
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="cw-input cw-input-icon-sm bg-[rgba(236,233,223,0.45)] text-[color:var(--cw-ink-soft)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Set Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--cw-ink-soft)]/55 pointer-events-none" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="cw-input cw-input-icon-sm"
                placeholder="Choose a strong password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!preview || preview.status !== 'pending' || submitting}
            className="cw-btn cw-btn-primary w-full"
          >
            {submitting ? 'Claiming...' : 'Claim Account'}
          </button>
        </form>

        {preview && (
          <p className="mt-4 text-sm text-[color:var(--cw-ink-soft)]">
            Invite status: <span className="font-medium">{preview.status}</span>. Expires{' '}
            {new Date(preview.expiresAt).toLocaleString()}.
          </p>
        )}

        <Link to="/" className="block mt-6 text-sm cw-link">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
