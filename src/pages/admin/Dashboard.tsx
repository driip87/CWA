import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, orderBy, limit, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Users, Truck, DollarSign, Activity, X, UserCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
  const { user, userData } = useAuth();
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activePickups: 0,
    monthlyRevenue: 0,
    completionRate: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showTestFlowModal, setShowTestFlowModal] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [invoiceData, setInvoiceData] = useState({ userId: '', amount: '', description: '' });
  const [submittingInvoice, setSubmittingInvoice] = useState(false);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const pickupsSnap = await getDocs(collection(db, 'pickups'));
        const paymentsSnap = await getDocs(collection(db, 'payments'));

        const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const pickups = pickupsSnap.docs.map(d => d.data());
        const payments = paymentsSnap.docs.map(d => d.data());

        setUsers(usersData.filter(u => u.role === 'user'));

        const activePickups = pickups.filter(p => p.status === 'scheduled').length;
        const completedPickups = pickups.filter(p => p.status === 'completed').length;
        const completionRate = pickups.length > 0 ? (completedPickups / pickups.length) * 100 : 0;
        
        const monthlyRevenue = payments
          .filter(p => p.status === 'paid')
          .reduce((sum, p) => sum + p.amount, 0);

        setStats({
          totalCustomers: usersData.filter(u => u.role === 'user').length,
          activePickups,
          monthlyRevenue,
          completionRate
        });

        // Mock recent activity for dashboard
        const activities = [
          ...usersData.map(u => ({ type: 'user', date: u.createdAt, data: u })),
          ...pickups.map(p => ({ type: 'pickup', date: p.createdAt, data: p })),
          ...payments.map(p => ({ type: 'payment', date: p.date, data: p }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

        setRecentActivity(activities);
      } catch (error) {
        console.error("Error fetching admin data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, []);

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceData.userId || !invoiceData.amount || !invoiceData.description) return;
    
    setSubmittingInvoice(true);
    try {
      await addDoc(collection(db, 'payments'), {
        userId: invoiceData.userId,
        amount: parseFloat(invoiceData.amount),
        description: invoiceData.description,
        status: 'pending',
        date: new Date().toISOString()
      });
      setShowInvoiceModal(false);
      setInvoiceData({ userId: '', amount: '', description: '' });
      alert('Invoice generated successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('Failed to generate invoice.');
    } finally {
      setSubmittingInvoice(false);
    }
  };

  const handleTestUserFlow = async () => {
    if (!user || !userData) return;
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        role: 'user',
        subscriptionStatus: 'inactive'
      });
      setShowTestFlowModal(false);
    } catch (error) {
      console.error('Error demoting user:', error);
    }
  };

  if (loading) return <div className="text-[#141414]/50 font-mono">Loading dashboard data...</div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-[#6b8e6b]/10 rounded-lg flex items-center justify-center text-[#6b8e6b]">
              <Users size={20} />
            </div>
            <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-1 rounded">+12%</span>
          </div>
          <h3 className="text-[#141414]/50 text-sm font-medium uppercase tracking-wider">Total Customers</h3>
          <p className="text-3xl font-serif italic mt-1">{stats.totalCustomers}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <Truck size={20} />
            </div>
            <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">Today</span>
          </div>
          <h3 className="text-[#141414]/50 text-sm font-medium uppercase tracking-wider">Active Pickups</h3>
          <p className="text-3xl font-serif italic mt-1">{stats.activePickups}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <DollarSign size={20} />
            </div>
            <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded">+8%</span>
          </div>
          <h3 className="text-[#141414]/50 text-sm font-medium uppercase tracking-wider">Monthly Revenue</h3>
          <p className="text-3xl font-serif italic mt-1">${stats.monthlyRevenue.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
              <Activity size={20} />
            </div>
            <span className="text-xs font-mono text-purple-600 bg-purple-50 px-2 py-1 rounded">Avg</span>
          </div>
          <h3 className="text-[#141414]/50 text-sm font-medium uppercase tracking-wider">Completion Rate</h3>
          <p className="text-3xl font-serif italic mt-1">{stats.completionRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-[#141414]/10 overflow-hidden">
          <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center">
            <h2 className="text-lg font-serif italic text-[#141414]">Recent Activity Feed</h2>
            <button className="text-sm font-medium text-[#6b8e6b] hover:underline">View All</button>
          </div>
          <div className="divide-y divide-[#141414]/5">
            {recentActivity.length > 0 ? recentActivity.map((activity, idx) => (
              <div key={idx} className="p-6 flex items-start gap-4 hover:bg-[#E4E3E0]/20 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mt-1 ${
                  activity.type === 'user' ? 'bg-blue-100 text-blue-600' :
                  activity.type === 'pickup' ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'
                }`}>
                  {activity.type === 'user' ? <Users size={16} /> :
                   activity.type === 'pickup' ? <Truck size={16} /> : <DollarSign size={16} />}
                </div>
                <div className="flex-1">
                  <p className="text-[#141414] font-medium">
                    {activity.type === 'user' ? 'New customer registered' :
                     activity.type === 'pickup' ? `Pickup ${activity.data.status}` : `Payment received`}
                  </p>
                  <p className="text-sm text-[#141414]/60 mt-1">
                    {activity.type === 'user' ? activity.data.email :
                     activity.type === 'pickup' ? `Location: ${activity.data.binLocation || 'Curbside'}` : `$${activity.data.amount}`}
                  </p>
                </div>
                <div className="text-xs font-mono text-[#141414]/40">
                  {format(new Date(activity.date), 'MMM d, h:mm a')}
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-[#141414]/50 font-mono">No recent activity.</div>
            )}
          </div>
        </div>

        <div className="bg-[#141414] text-[#E4E3E0] rounded-xl shadow-xl overflow-hidden relative">
          <div className="p-6 border-b border-[#E4E3E0]/10">
            <h2 className="text-lg font-serif italic">Quick Actions</h2>
          </div>
          <div className="p-6 space-y-4">
            <button className="w-full bg-[#6b8e6b] text-[#141414] font-semibold py-3 px-4 rounded-lg hover:bg-[#5a7a5a] transition-colors flex items-center justify-center gap-2">
              <Truck size={18} /> Schedule Pickup
            </button>
            <button className="w-full bg-[#E4E3E0]/10 text-[#E4E3E0] font-semibold py-3 px-4 rounded-lg hover:bg-[#E4E3E0]/20 transition-colors flex items-center justify-center gap-2">
              <Users size={18} /> Add Customer
            </button>
            <button 
              onClick={() => setShowInvoiceModal(true)}
              className="w-full bg-[#E4E3E0]/10 text-[#E4E3E0] font-semibold py-3 px-4 rounded-lg hover:bg-[#E4E3E0]/20 transition-colors flex items-center justify-center gap-2"
            >
              <DollarSign size={18} /> Generate Invoice
            </button>
            <button 
              onClick={() => setShowTestFlowModal(true)}
              className="w-full bg-blue-600/20 text-blue-400 font-semibold py-3 px-4 rounded-lg hover:bg-blue-600/30 transition-colors flex items-center justify-center gap-2 mt-4 border border-blue-500/30"
            >
              <UserCircle size={18} /> Test User Flow
            </button>
          </div>
          
          {/* Decorative element */}
          <div className="absolute -bottom-16 -right-16 w-48 h-48 border border-[#E4E3E0]/10 rounded-full opacity-50 pointer-events-none"></div>
          <div className="absolute -bottom-8 -right-8 w-32 h-32 border border-[#E4E3E0]/10 rounded-full opacity-50 pointer-events-none"></div>
        </div>
      </div>

      {/* Generate Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Generate Invoice</h2>
              <button 
                onClick={() => setShowInvoiceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleGenerateInvoice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <select 
                  required
                  value={invoiceData.userId}
                  onChange={(e) => setInvoiceData({...invoiceData, userId: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent"
                >
                  <option value="">Select a customer</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0.01"
                  required
                  value={invoiceData.amount}
                  onChange={(e) => setInvoiceData({...invoiceData, amount: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent"
                  placeholder="e.g. 50.00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input 
                  type="text" 
                  required
                  value={invoiceData.description}
                  onChange={(e) => setInvoiceData({...invoiceData, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent"
                  placeholder="e.g. Monthly Waste Collection"
                />
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submittingInvoice}
                  className="px-4 py-2 bg-[#6b8e6b] text-white rounded-lg font-medium hover:bg-[#5a7a5a] transition-colors disabled:opacity-50"
                >
                  {submittingInvoice ? 'Generating...' : 'Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Test Flow Modal */}
      {showTestFlowModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Test User Flow</h2>
              <button 
                onClick={() => setShowTestFlowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              This will demote your account to a new user so you can test the subscription flow. You can restore admin access later from the subscribe page or user dashboard. Continue?
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowTestFlowModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleTestUserFlow}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Yes, Demote Me
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
