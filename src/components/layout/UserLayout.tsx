import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logOut, db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { LogOut, LayoutDashboard, Calendar, CreditCard, Settings, ShieldAlert } from 'lucide-react';

const UserLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  const handleRestoreAdmin = async () => {
    if (!userData) return;
    try {
      await updateDoc(doc(db, 'users', userData.uid), {
        role: 'admin',
        subscriptionStatus: 'active'
      });
    } catch (error) {
      console.error('Error restoring admin:', error);
    }
  };

  const navItems = [
    { path: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/dashboard/pickups', icon: <Calendar size={20} />, label: 'My Pickups' },
    { path: '/dashboard/payments', icon: <CreditCard size={20} />, label: 'Payments' },
    { path: '/dashboard/settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-gray-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-[#6b8e6b]">Cordova Waste</h1>
          <p className="text-sm text-gray-500 mt-1">User Portal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                to={item.path} 
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive 
                    ? 'bg-[#6b8e6b]/10 text-[#6b8e6b] font-semibold' 
                    : 'text-gray-700 hover:bg-[#6b8e6b]/10 hover:text-[#6b8e6b]'
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          {userData?.email === 'kereeonmiller@gmail.com' && userData?.role !== 'admin' && (
            <button 
              onClick={handleRestoreAdmin}
              className="w-full flex items-center gap-3 px-4 py-2 text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors mb-2"
            >
              <ShieldAlert size={20} />
              <span className="font-medium">Restore Admin</span>
            </button>
          )}
          {userData?.role === 'admin' && (
            <Link 
              to="/admin"
              className="w-full flex items-center gap-3 px-4 py-2 text-[#6b8e6b] hover:bg-[#6b8e6b]/10 rounded-xl transition-colors"
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">Back to Admin</span>
            </Link>
          )}
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#6b8e6b] text-white flex items-center justify-center font-bold">
              {userData?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userData?.name}</p>
              <p className="text-xs text-gray-500 truncate">{userData?.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default UserLayout;
