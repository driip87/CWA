import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logOut } from '../../lib/firebase';
import { LogOut, LayoutDashboard, Calendar, CreditCard, Settings } from 'lucide-react';
import UserAvatar from '../ui/UserAvatar';

const UserLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profileImageUrl, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  const navItems = [
    { path: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/dashboard/pickups', icon: <Calendar size={20} />, label: 'My Pickups' },
    { path: '/dashboard/payments', icon: <CreditCard size={20} />, label: 'Payments' },
    { path: '/dashboard/settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <div className="cw-shell font-sans">
      <aside className="cw-sidebar w-72 flex flex-col shadow-2xl">
        <div className="p-7 border-b border-white/10">
          <h1 className="text-xl font-bold font-serif italic tracking-wide text-[#6b8e6b]">CWA</h1>
          <p className="text-xs uppercase tracking-[0.28em] text-white/45 mt-2">Customer Portal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                to={item.path} 
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${
                  isActive 
                    ? 'bg-[#6b8e6b] text-[#141414] font-semibold shadow-lg shadow-[#6b8e6b]/20' 
                    : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          {userData?.role === 'admin' && (
            <Link 
              to="/admin"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-white/70 hover:bg-white/8 hover:text-white rounded-2xl transition-colors"
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">Back to Admin</span>
            </Link>
          )}
          <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-2xl bg-white/5 border border-white/8">
            <UserAvatar
              name={userData?.name}
              imageUrl={profileImageUrl}
              sizeClassName="w-9 h-9"
              textClassName="text-xs"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userData?.name}</p>
              <p className="text-xs text-white/50 truncate">{userData?.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-300 hover:bg-red-300/10 rounded-2xl transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Log out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="cw-topbar px-8 py-5 sticky top-0 z-10">
          <h2 className="text-2xl font-serif italic tracking-tight text-[var(--cw-ink)]">
            {navItems.find((item) => item.path === location.pathname)?.label || 'Portal'}
          </h2>
        </header>
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default UserLayout;
