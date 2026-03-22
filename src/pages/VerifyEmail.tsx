import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck, RefreshCw } from 'lucide-react';
import { reload } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '../lib/firebaseAuthErrors';
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
    } catch (verificationError) {
      setError(getFirebaseAuthErrorMessage(verificationError, 'Unable to resend verification email'));
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
      await auth.currentUser.getIdToken(true);
      await refreshSession();
      if (auth.currentUser.emailVerified) {
        navigate(accountData?.role === 'admin' ? '/admin' : '/dashboard');
      } else {
        setMessage('Email is still unverified.');
      }
    } catch (refreshError) {
      setError(getFirebaseAuthErrorMessage(refreshError, 'Unable to refresh verification state'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_32%),linear-gradient(180deg,#f8f7f2_0%,#f0ede3_100%)]">
      <div className="cw-card w-full max-w-lg p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--cw-accent-soft)] text-[var(--cw-accent)] flex items-center justify-center mx-auto mb-6">
          <MailCheck size={30} />
        </div>
        <p className="cw-kicker mb-4">Email Verification</p>
        <h1 className="text-3xl font-serif font-bold italic text-[var(--cw-ink)] mb-3">Verify your email</h1>
        <p className="text-[color:var(--cw-ink-soft)] mb-6">
          We sent a verification email to <span className="font-medium">{user?.email}</span>. Verify the address to finish linking your account and unlock access.
        </p>

        {error && <div className="mb-4 cw-alert cw-alert-danger">{error}</div>}
        {message && <div className="mb-4 cw-alert cw-alert-success">{message}</div>}

        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={submitting}
            className="cw-btn cw-btn-primary w-full"
          >
            Resend Verification Email
          </button>
          <button
            onClick={handleRefresh}
            disabled={submitting}
            className="cw-btn cw-btn-secondary w-full disabled:opacity-50"
          >
            <RefreshCw size={16} />
            I Verified My Email
          </button>
        </div>

        <Link to="/" className="inline-block mt-6 text-sm cw-link">
          Back to home
        </Link>
      </div>
    </div>
  );
}
