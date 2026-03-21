import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiGet } from '../lib/api';

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
    } catch (claimError: any) {
      setError(claimError.message || 'Unable to claim account');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading claim invite...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <p className="text-sm uppercase tracking-[0.24em] text-[#6b8e6b] font-semibold mb-4">Claim Account</p>
        <h1 className="text-3xl font-serif font-bold text-[#2d2d20] mb-2">
          {preview?.customerName ? `Finish setting up ${preview.customerName}` : 'Claim your account'}
        </h1>
        <p className="text-gray-600 mb-6">
          This claim link connects you to your existing Cordova Waste customer profile without creating a duplicate account.
        </p>

        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>}
        {message && <div className="mb-4 p-3 rounded-xl bg-green-50 text-green-700 text-sm">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invited Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                required
                readOnly
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 bg-gray-50 text-gray-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Set Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                placeholder="Choose a strong password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!preview || preview.status !== 'pending' || submitting}
            className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium hover:bg-[#4a4a35] transition-colors disabled:opacity-50"
          >
            {submitting ? 'Claiming...' : 'Claim Account'}
          </button>
        </form>

        {preview && (
          <p className="mt-4 text-sm text-gray-500">
            Invite status: <span className="font-medium">{preview.status}</span>. Expires{' '}
            {new Date(preview.expiresAt).toLocaleString()}.
          </p>
        )}

        <Link to="/" className="block mt-6 text-sm text-[#5A5A40] font-medium hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
