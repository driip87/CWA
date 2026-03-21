import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck, RefreshCw } from 'lucide-react';
import { reload } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';

export default function VerifyEmail() {
  const { user, accountData, resendVerification, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !accountData) {
      navigate('/');
      return;
    }

    if (user.emailVerified || !accountData.providers.includes('password')) {
      navigate(accountData.role === 'admin' ? '/admin' : '/dashboard');
    }
  }, [accountData, navigate, user]);

  const handleResend = async () => {
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await resendVerification();
      setMessage('Verification email sent.');
    } catch (verificationError: any) {
      setError(verificationError.message || 'Unable to resend verification email');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    if (!auth.currentUser) return;

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await reload(auth.currentUser);
      await refreshSession();
      if (auth.currentUser.emailVerified) {
        navigate(accountData?.role === 'admin' ? '/admin' : '/dashboard');
      } else {
        setMessage('Email is still unverified.');
      }
    } catch (refreshError: any) {
      setError(refreshError.message || 'Unable to refresh verification state');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#6b8e6b]/10 text-[#6b8e6b] flex items-center justify-center mx-auto mb-6">
          <MailCheck size={30} />
        </div>
        <h1 className="text-3xl font-serif font-bold text-[#2d2d20] mb-3">Verify your email</h1>
        <p className="text-gray-600 mb-6">
          We sent a verification email to <span className="font-medium">{user?.email}</span>. Verify the address to finish linking your account and unlock access.
        </p>

        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>}
        {message && <div className="mb-4 p-3 rounded-xl bg-green-50 text-green-700 text-sm">{message}</div>}

        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={submitting}
            className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium hover:bg-[#4a4a35] transition-colors disabled:opacity-50"
          >
            Resend Verification Email
          </button>
          <button
            onClick={handleRefresh}
            disabled={submitting}
            className="w-full py-3 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            I Verified My Email
          </button>
        </div>

        <Link to="/" className="inline-block mt-6 text-sm text-[#5A5A40] font-medium hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}
