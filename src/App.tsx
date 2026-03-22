import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const UserLayout = lazy(() => import('./components/layout/UserLayout'));
const Claim = lazy(() => import('./pages/Claim'));
const Landing = lazy(() => import('./pages/Landing'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminCustomers = lazy(() => import('./pages/admin/Customers'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminInventory = lazy(() => import('./pages/admin/Inventory'));
const AdminIntegrations = lazy(() => import('./pages/admin/Integrations'));
const AdminPickups = lazy(() => import('./pages/admin/Pickups'));
const AdminRoutes = lazy(() => import('./pages/admin/Routes'));
const UserDashboard = lazy(() => import('./pages/user/Dashboard'));
const UserPayments = lazy(() => import('./pages/user/Payments'));
const UserPickups = lazy(() => import('./pages/user/Pickups'));
const UserSettings = lazy(() => import('./pages/user/Settings'));
const Subscribe = lazy(() => import('./pages/user/Subscribe'));

const FullScreenMessage = ({ title, body }: { title: string; body: string }) => (
  <div className="min-h-screen bg-[#f5f5f0] px-4 py-12 flex items-center justify-center">
    <div className="cw-card w-full max-w-lg p-8 text-center">
      <h1 className="cw-page-title text-3xl !not-italic mb-3">{title}</h1>
      <p className="cw-page-copy !mt-0 max-w-none">{body}</p>
    </div>
  </div>
);

const BootstrapRecoveryScreen = () => {
  const { bootstrapError, bootstrapRecovering, retryBootstrap, signOutForRecovery } = useAuth();

  return (
    <div className="min-h-screen bg-[#f5f5f0] px-4 py-12 flex items-center justify-center">
      <div className="cw-card w-full max-w-lg p-8">
        <p className="cw-kicker mb-4">Session Recovery</p>
        <h1 className="cw-page-title text-3xl !not-italic mb-3">We could not finish restoring your account</h1>
        <p className="cw-page-copy !mt-0 mb-6 max-w-none">
          The sign-in succeeded, but the app could not safely rebuild your account session. Retry to restore the session, or sign out and start again.
        </p>
        {bootstrapError && <div className="mb-4 cw-alert cw-alert-danger">{bootstrapError}</div>}
        <div className="space-y-3">
          <button
            onClick={() => void retryBootstrap()}
            disabled={bootstrapRecovering}
            className="cw-btn cw-btn-primary w-full"
          >
            {bootstrapRecovering ? 'Retrying...' : 'Retry Session Recovery'}
          </button>
          <button
            onClick={() => void signOutForRecovery()}
            disabled={bootstrapRecovering}
            className="cw-btn cw-btn-secondary w-full"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: 'user' | 'admin' }) => {
  const { user, accountData, userData, loading, bootstrapped } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenMessage title="Loading..." body="Restoring your account session." />;
  }

  if (user && !bootstrapped) {
    return <FullScreenMessage title="Restoring session" body="Please wait while we finish rebuilding your account access." />;
  }

  if (!user || !accountData || !userData) {
    return <Navigate to="/" replace />;
  }

  if (!user.emailVerified && accountData.providers.includes('password') && location.pathname !== '/verify-email') {
    return <Navigate to="/verify-email" replace />;
  }

  if (role && accountData.role !== role) {
    if (role === 'user' && accountData.role === 'admin') {
      return <>{children}</>;
    }
    return <Navigate to={accountData.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  if (role === 'user' && accountData.role !== 'admin') {
    const isSubscribed = userData.subscriptionStatus === 'active';
    const isSubscribePage = location.pathname === '/subscribe';

    if (!isSubscribed && !isSubscribePage) {
      return <Navigate to="/subscribe" replace />;
    }

    if (isSubscribed && isSubscribePage) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, loading, bootstrapped, bootstrapError } = useAuth();

  if (loading) {
    return <FullScreenMessage title="Loading..." body="Checking your sign-in state." />;
  }

  if (user && !bootstrapped && bootstrapError) {
    return <BootstrapRecoveryScreen />;
  }

  return (
    <Suspense fallback={<FullScreenMessage title="Loading..." body="Fetching the next screen." />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/claim" element={<Claim />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route
          path="/subscribe"
          element={
            <ProtectedRoute role="user">
              <Subscribe />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserDashboard />
              </UserLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/pickups"
          element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserPickups />
              </UserLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/payments"
          element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserPayments />
              </UserLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/settings"
          element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserSettings />
              </UserLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/customers"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminCustomers />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pickups"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminPickups />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/integrations"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminIntegrations />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/inventory"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminInventory />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminAnalytics />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/routes"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminRoutes />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
