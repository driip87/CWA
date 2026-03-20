import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logOut } from '../../lib/firebase';
import { LogOut, LayoutDashboard, Users, Calendar, Box, BarChart3, Bell } from 'lucide-react';

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
    { path: '/admin/inventory', icon: <Box size={20} />, label: 'Inventory' },
    { path: '/admin/analytics', icon: <BarChart3 size={20} />, label: 'Analytics' },
  ];

  return (
    <div className="min-h-screen bg-[#E4E3E0] font-sans text-[#141414] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#141414] text-[#E4E3E0] flex flex-col shadow-xl">
        <div className="p-6 border-b border-[#E4E3E0]/10">
          <h1 className="text-xl font-bold font-serif italic tracking-wide text-[#6b8e6b]">Cordova Waste</h1>
          <p className="text-xs uppercase tracking-widest text-[#E4E3E0]/50 mt-2 font-mono">Admin Portal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                to={item.path} 
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive 
                    ? 'bg-[#6b8e6b] text-[#141414] font-semibold' 
                    : 'text-[#E4E3E0]/70 hover:bg-[#E4E3E0]/10 hover:text-[#E4E3E0]'
                }`}
              >
                {item.icon}
                <span className="font-medium tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E4E3E0]/10 space-y-2">
          <Link 
            to="/dashboard"
            className="w-full flex items-center gap-3 px-4 py-2 text-[#E4E3E0]/70 hover:bg-[#E4E3E0]/10 hover:text-[#E4E3E0] rounded-lg transition-colors"
          >
            <Users size={20} />
            <span className="font-medium tracking-wide">View User Portal</span>
          </Link>
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#6b8e6b] text-[#141414] flex items-center justify-center font-bold">
              {userData?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#E4E3E0] truncate">{userData?.name}</p>
              <p className="text-xs text-[#E4E3E0]/50 truncate font-mono">{userData?.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium tracking-wide">Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Topbar */}
        <header className="bg-[#E4E3E0] border-b border-[#141414]/10 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-2xl font-serif italic tracking-tight text-[#141414]">
            {navItems.find(item => item.path === location.pathname)?.label || 'Admin'}
          </h2>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full hover:bg-[#141414]/5 text-[#141414]/70 transition-colors relative">
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
