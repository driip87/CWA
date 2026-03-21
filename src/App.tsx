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
const AdminPickups = lazy(() => import('./pages/admin/Pickups'));
const AdminRoutes = lazy(() => import('./pages/admin/Routes'));
const UserDashboard = lazy(() => import('./pages/user/Dashboard'));
const UserPayments = lazy(() => import('./pages/user/Payments'));
const UserPickups = lazy(() => import('./pages/user/Pickups'));
const UserSettings = lazy(() => import('./pages/user/Settings'));
const Subscribe = lazy(() => import('./pages/user/Subscribe'));

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: 'user' | 'admin' }) => {
  const { user, accountData, userData, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
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

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
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
      </Router>
    </AuthProvider>
  );
}
