import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import UserDashboard from './pages/user/Dashboard';
import UserPickups from './pages/user/Pickups';
import UserPayments from './pages/user/Payments';
import UserSettings from './pages/user/Settings';
import Subscribe from './pages/user/Subscribe';
import AdminDashboard from './pages/admin/Dashboard';
import AdminCustomers from './pages/admin/Customers';
import AdminPickups from './pages/admin/Pickups';
import AdminInventory from './pages/admin/Inventory';
import AdminAnalytics from './pages/admin/Analytics';
import AdminRoutes from './pages/admin/Routes';
import UserLayout from './components/layout/UserLayout';
import AdminLayout from './components/layout/AdminLayout';

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: 'user' | 'admin' }) => {
  const { user, userData, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!user) return <Navigate to="/" />;

  if (role && userData?.role !== role) {
    // Admins can access user routes
    if (role === 'user' && userData?.role === 'admin') {
      return <>{children}</>;
    }
    return <Navigate to={userData?.role === 'admin' ? '/admin' : '/dashboard'} />;
  }

  // Subscription enforcement for users
  if (role === 'user' && userData?.role !== 'admin') {
    const isSubscribed = userData?.subscriptionStatus === 'active';
    const isSubscribePage = location.pathname === '/subscribe';

    if (!isSubscribed && !isSubscribePage) {
      return <Navigate to="/subscribe" />;
    }

    if (isSubscribed && isSubscribePage) {
      return <Navigate to="/dashboard" />;
    }
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          
          {/* User Routes */}
          <Route path="/subscribe" element={
            <ProtectedRoute role="user">
              <Subscribe />
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserDashboard />
              </UserLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/pickups" element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserPickups />
              </UserLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/payments" element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserPayments />
              </UserLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/settings" element={
            <ProtectedRoute role="user">
              <UserLayout>
                <UserSettings />
              </UserLayout>
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/customers" element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminCustomers />
              </AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/pickups" element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminPickups />
              </AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/inventory" element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminInventory />
              </AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/analytics" element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminAnalytics />
              </AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/routes" element={
            <ProtectedRoute role="admin">
              <AdminLayout>
                <AdminRoutes />
              </AdminLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
