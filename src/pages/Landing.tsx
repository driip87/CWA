import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Leaf, Lock, Mail, Recycle, Truck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '../lib/firebaseAuthErrors';
import { AUTH_MODE_QUERY_PARAM, GOOGLE_SIGN_IN_QUERY_PARAM, signInWithGoogle } from '../lib/firebase';

export default function Landing() {
  const { user, accountData, userData, loginWithEmail, signupWithEmail, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const resumedGoogleSignIn = useRef(false);

  useEffect(() => {
    const claimToken = searchParams.get('claim');
    if (claimToken) {
      navigate(`/claim?token=${encodeURIComponent(claimToken)}`, { replace: true });
    }
  }, [navigate, searchParams]);

  useEffect(() => {
    const requestedMode = searchParams.get(AUTH_MODE_QUERY_PARAM);
    const shouldResumeGoogleSignIn = searchParams.get(GOOGLE_SIGN_IN_QUERY_PARAM) === '1';

    if (requestedMode === 'login' || requestedMode === 'signup' || requestedMode === 'reset') {
      setAuthMode(requestedMode);
      setShowAuthModal(true);
    }

    if (!shouldResumeGoogleSignIn || resumedGoogleSignIn.current) {
      return;
    }

    resumedGoogleSignIn.current = true;
    setShowAuthModal(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(GOOGLE_SIGN_IN_QUERY_PARAM);
    nextParams.delete(AUTH_MODE_QUERY_PARAM);
    navigate(
      {
        pathname: '/',
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      { replace: true },
    );

    void (async () => {
      try {
        await signInWithGoogle();
      } catch (authError) {
        console.error('Login failed', authError);
        setError(getFirebaseAuthErrorMessage(authError, 'Google sign-in failed'));
      }
    })();
  }, [navigate, searchParams]);

  useEffect(() => {
    if (!user || !accountData || !userData) return;

    if (!user.emailVerified && accountData.providers.includes('password')) {
      navigate('/verify-email');
      return;
    }

    navigate(accountData.role === 'admin' ? '/admin' : '/dashboard');
  }, [accountData, navigate, user, userData]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle({ authMode });
    } catch (authError) {
      console.error('Login failed', authError);
      setError(getFirebaseAuthErrorMessage(authError, 'Google sign-in failed'));
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
      } else if (authMode === 'signup') {
        await signupWithEmail(email, password, name);
        setMessage('Account created. Please verify your email before continuing.');
      } else {
        await resetPassword(email);
        setMessage('Password reset email sent. Check your inbox.');
        setAuthMode('login');
      }
    } catch (authError) {
      setError(getFirebaseAuthErrorMessage(authError, 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-[var(--cw-ink)] flex flex-col bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_32%),linear-gradient(180deg,#f8f7f2_0%,#f0ede3_100%)]">
      <header className="px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 text-[var(--cw-primary)]">
          <Recycle size={32} />
          <h1 className="text-2xl font-serif font-bold italic">CWA</h1>
        </div>
        <button
          onClick={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
          className="cw-btn cw-btn-primary"
        >
          Sign In <ArrowRight size={18} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <p className="cw-kicker mb-5">Unified Waste Operations</p>
        <h2 className="text-5xl md:text-7xl font-serif font-bold italic text-[var(--cw-ink)] mb-6 max-w-4xl leading-tight">
          Sustainable Waste Operations
        </h2>
        <p className="text-xl text-[color:var(--cw-ink-soft)] mb-12 max-w-2xl leading-8">
          Manage your pickups, track your environmental impact, and streamline your payments all in one unified platform.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => {
              setAuthMode('signup');
              setShowAuthModal(true);
            }}
            className="cw-btn cw-btn-primary text-lg px-8 py-4"
          >
            Get Started <ArrowRight size={20} />
          </button>
          <button className="cw-btn cw-btn-secondary text-lg px-8 py-4">
            Learn More
          </button>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto w-full text-left">
          <div className="cw-card p-8">
            <div className="cw-icon-chip mb-6 rounded-2xl">
              <Leaf size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Eco-Friendly</h3>
            <p className="text-[color:var(--cw-ink-soft)]">Track your recycling efforts and see your direct impact on the environment.</p>
          </div>
          <div className="cw-card p-8">
            <div className="cw-icon-chip mb-6 rounded-2xl">
              <Truck size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Reliable Pickups</h3>
            <p className="text-[color:var(--cw-ink-soft)]">Schedule, modify, and track your waste collection services in real-time.</p>
          </div>
          <div className="cw-card p-8">
            <div className="cw-icon-chip mb-6 rounded-2xl">
              <Recycle size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Unified Platform</h3>
            <p className="text-[color:var(--cw-ink-soft)]">Manage billing, customer support, and service requests from a single app.</p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-[color:var(--cw-ink-soft)] text-sm border-t border-[color:var(--cw-line)]">
        &copy; {new Date().getFullYear()} CWA. All rights reserved.
      </footer>

      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="cw-card p-8 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-6 right-6 text-[color:var(--cw-ink-soft)]/60 hover:text-[color:var(--cw-ink-soft)]"
            >
              <X size={24} />
            </button>

            <h2 className="text-2xl font-serif font-bold italic text-[var(--cw-ink)] mb-6">
              {authMode === 'login' ? 'Welcome Back' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}
            </h2>

            {error && <div className="mb-4 cw-alert cw-alert-danger">{error}</div>}
            {message && <div className="mb-4 cw-alert cw-alert-success">{message}</div>}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="cw-input"
                    placeholder="John Doe"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--cw-ink-soft)]/55 pointer-events-none" size={20} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="cw-input cw-input-icon"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {authMode !== 'reset' && (
                <div>
                  <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--cw-ink-soft)]/55 pointer-events-none" size={20} />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="cw-input cw-input-icon"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="cw-btn cw-btn-primary w-full"
              >
                {loading ? 'Please wait...' : authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>

            <div className="mt-6 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[color:var(--cw-line)]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-[color:var(--cw-ink-soft)]">Or continue with</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              type="button"
              className="mt-6 cw-btn cw-btn-secondary w-full"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>

            <div className="mt-6 text-center text-sm text-[color:var(--cw-ink-soft)]">
              {authMode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button onClick={() => setAuthMode('signup')} className="cw-link">
                    Sign up
                  </button>
                  <br />
                  <button onClick={() => setAuthMode('reset')} className="cw-link mt-2">
                    Forgot password?
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button onClick={() => setAuthMode('login')} className="cw-link">
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
