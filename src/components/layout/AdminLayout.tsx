import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logOut } from '../../lib/firebase';
import { LogOut, LayoutDashboard, Users, Calendar, Box, BarChart3, Bell, Map, Cable } from 'lucide-react';
import UserAvatar from '../ui/UserAvatar';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  const navItems = [
    { path: '/admin', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/admin/customers', icon: <Users size={20} />, label: 'Customers' },
    { path: '/admin/pickups', icon: <Calendar size={20} />, label: 'Pickups' },
    { path: '/admin/routes', icon: <Map size={20} />, label: 'Routes' },
    { path: '/admin/integrations', icon: <Cable size={20} />, label: 'Integrations' },
    { path: '/admin/inventory', icon: <Box size={20} />, label: 'Inventory' },
    { path: '/admin/analytics', icon: <BarChart3 size={20} />, label: 'Analytics' },
  ];

  return (
    <div className="cw-shell font-sans">
      <aside className="cw-sidebar w-72 flex flex-col shadow-2xl">
        <div className="p-7 border-b border-white/10">
          <h1 className="text-xl font-bold font-serif italic tracking-wide text-[#6b8e6b]">CWA</h1>
          <p className="text-xs uppercase tracking-[0.28em] text-white/45 mt-2">Admin Portal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                to={item.path} 
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                  isActive 
                    ? 'bg-[#6b8e6b] text-[#141414] font-semibold shadow-lg shadow-[#6b8e6b]/20' 
                    : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="font-medium tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <Link 
            to="/dashboard"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-white/70 hover:bg-white/8 hover:text-white rounded-2xl transition-colors"
          >
            <Users size={20} />
            <span className="font-medium tracking-wide">View User Portal</span>
          </Link>
          <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-2xl bg-white/5 border border-white/8">
            <UserAvatar
              name={userData?.name}
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
            <span className="font-medium tracking-wide">Log out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="cw-topbar px-8 py-5 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-2xl font-serif italic tracking-tight text-[var(--cw-ink)]">
            {navItems.find(item => item.path === location.pathname)?.label || 'Admin'}
          </h2>
          <div className="flex items-center gap-4">
            <button className="p-2.5 rounded-full hover:bg-[rgba(45,45,32,0.06)] text-[rgba(45,45,32,0.62)] transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
