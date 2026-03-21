import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle } from '../lib/firebase';
import { ArrowRight, Recycle, Leaf, Truck, Mail, Lock, X } from 'lucide-react';

export default function Landing() {
  const { user, userData, loginWithEmail, signupWithEmail, resetPassword, claimAccount } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset' | 'claim'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const claimToken = searchParams.get('claim');
    const claimEmail = searchParams.get('email');
    if (claimToken && claimEmail) {
      setEmail(claimEmail);
      setAuthMode('claim');
      setShowAuthModal(true);
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
      } else if (authMode === 'signup') {
        await signupWithEmail(email, password, name);
      } else if (authMode === 'reset') {
        await resetPassword(email);
        setMessage('Password reset email sent. Check your inbox.');
        setAuthMode('login');
      } else if (authMode === 'claim') {
        const claimToken = searchParams.get('claim');
        if (!claimToken) throw new Error('Invalid claim token');
        await claimAccount(email, password, claimToken);
        setMessage('Account claimed successfully! Logging you in...');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (user && userData) {
      if (userData.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, userData, navigate]);

  return (
    <div className="min-h-screen bg-[#f5f5f0] font-sans text-gray-900 flex flex-col">
      <header className="px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 text-[#5A5A40]">
          <Recycle size={32} />
          <h1 className="text-2xl font-serif font-bold italic">Cordova Waste</h1>
        </div>
        <button 
          onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
          className="px-6 py-2.5 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4a4a35] transition-colors flex items-center gap-2"
        >
          Sign In <ArrowRight size={18} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <h2 className="text-5xl md:text-7xl font-serif font-bold text-[#2d2d20] mb-6 max-w-4xl leading-tight">
          Sustainable Waste Management for Cordova
        </h2>
        <p className="text-xl text-gray-600 mb-12 max-w-2xl">
          Manage your pickups, track your environmental impact, and streamline your payments all in one unified platform.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
            className="px-8 py-4 bg-[#5A5A40] text-white rounded-full font-medium text-lg hover:bg-[#4a4a35] transition-colors shadow-lg shadow-[#5A5A40]/20 flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={20} />
          </button>
          <button className="px-8 py-4 bg-white text-[#5A5A40] border border-[#5A5A40]/20 rounded-full font-medium text-lg hover:bg-gray-50 transition-colors">
            Learn More
          </button>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto w-full text-left">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-6">
              <Leaf size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Eco-Friendly</h3>
            <p className="text-gray-600">Track your recycling efforts and see your direct impact on the environment.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-6">
              <Truck size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Reliable Pickups</h3>
            <p className="text-gray-600">Schedule, modify, and track your waste collection services in real-time.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-6">
              <Recycle size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Unified Platform</h3>
            <p className="text-gray-600">Manage billing, customer support, and service requests from a single app.</p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-gray-500 text-sm border-t border-gray-200">
        &copy; {new Date().getFullYear()} Cordova Waste. All rights reserved.
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowAuthModal(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
            
            <h2 className="text-2xl font-serif font-bold text-[#2d2d20] mb-6">
              {authMode === 'login' ? 'Welcome Back' : 
               authMode === 'signup' ? 'Create Account' : 
               authMode === 'claim' ? 'Claim Your Account' : 'Reset Password'}
            </h2>

            {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
            {message && <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-xl text-sm">{message}</div>}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    placeholder="John Doe"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input 
                    type="email" 
                    required 
                    readOnly={authMode === 'claim'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-[#5A5A40] outline-none ${authMode === 'claim' ? 'bg-gray-50' : ''}`}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {authMode !== 'reset' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {authMode === 'claim' ? 'Set New Password' : 'Password'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="password" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium hover:bg-[#4a4a35] transition-colors disabled:opacity-50"
              >
                {loading ? 'Please wait...' : 
                 authMode === 'login' ? 'Sign In' : 
                 authMode === 'signup' ? 'Create Account' : 
                 authMode === 'claim' ? 'Claim Account' : 'Send Reset Link'}
              </button>
            </form>

            {authMode !== 'claim' && (
              <>
                <div className="mt-6 relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or continue with</span>
                  </div>
                </div>

                <button 
                  onClick={handleGoogleLogin}
                  type="button"
                  className="mt-6 w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </button>
              </>
            )}

            <div className="mt-6 text-center text-sm text-gray-600">
              {authMode === 'login' ? (
                <>
                  Don't have an account? <button onClick={() => setAuthMode('signup')} className="text-[#5A5A40] font-medium hover:underline">Sign up</button>
                  <br />
                  <button onClick={() => setAuthMode('reset')} className="text-[#5A5A40] font-medium hover:underline mt-2">Forgot password?</button>
                </>
              ) : authMode === 'signup' || authMode === 'reset' ? (
                <>
                  Already have an account? <button onClick={() => setAuthMode('login')} className="text-[#5A5A40] font-medium hover:underline">Sign in</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
