import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { format, subDays, parseISO } from 'date-fns';

export default function AdminAnalytics() {
  const [pickupData, setPickupData] = useState<any[]>([]);
  const [financialData, setFinancialData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ revenue: 0, expenses: 0, profit: 0 });

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const pickupsSnap = await getDocs(collection(db, 'pickups'));
        const paymentsSnap = await getDocs(collection(db, 'payments'));
        const expensesSnap = await getDocs(collection(db, 'expenses'));

        const pickups = pickupsSnap.docs.map(d => d.data());
        const payments = paymentsSnap.docs.map(d => d.data());
        const expenses = expensesSnap.docs.map(d => d.data());

        // Process pickups by day for the last 7 days
        const last7Days = Array.from({ length: 7 }).map((_, i) => {
          const d = subDays(new Date(), i);
          return format(d, 'MMM dd');
        }).reverse();

        const pData = last7Days.map(day => {
          const count = pickups.filter(p => format(parseISO(p.date), 'MMM dd') === day).length;
          return { name: day, Pickups: count };
        });
        setPickupData(pData);

        // Process financials by day
        let totalRev = 0;
        let totalExp = 0;
        
        const fData = last7Days.map(day => {
          const rev = payments
            .filter(p => p.status === 'paid' && format(parseISO(p.date), 'MMM dd') === day)
            .reduce((sum, p) => sum + p.amount, 0);
          
          const exp = expenses
            .filter(e => format(parseISO(e.date), 'MMM dd') === day)
            .reduce((sum, e) => sum + e.amount, 0);

          totalRev += rev;
          totalExp += exp;

          return { name: day, Revenue: rev, Expenses: exp, Profit: rev - exp };
        });
        
        setFinancialData(fData);
        setTotals({ revenue: totalRev, expenses: totalExp, profit: totalRev - totalExp });

      } catch (error) {
        console.error("Error fetching analytics", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) return <div className="text-[#141414]/50 font-mono">Loading analytics...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-serif italic text-[#141414]">Comprehensive Financial Reporting</h1>
        <select className="bg-white border border-[#141414]/10 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#6b8e6b]">
          <option>Last 7 Days</option>
          <option>Last 30 Days</option>
          <option>This Year</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 flex flex-col justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[#141414]/50">Total Revenue</h3>
          <p className="text-4xl font-serif italic mt-2 text-green-700">${totals.revenue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 flex flex-col justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[#141414]/50">Total Expenses</h3>
          <p className="text-4xl font-serif italic mt-2 text-red-700">${totals.expenses.toLocaleString()}</p>
        </div>
        <div className="bg-[#141414] text-[#E4E3E0] p-6 rounded-xl shadow-xl relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider opacity-70">Net Profit</h3>
          <p className="text-4xl font-serif italic mt-2 text-[#6b8e6b]">${totals.profit.toLocaleString()}</p>
          <div className="absolute -right-4 -top-4 w-24 h-24 border border-[#E4E3E0]/10 rounded-full opacity-50"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
          <h2 className="text-lg font-serif italic text-[#141414] mb-6">Revenue vs Expenses</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b8e6b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6b8e6b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E3E0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#141414', opacity: 0.5, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#141414', opacity: 0.5, fontSize: 12 }} dx={-10} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  formatter={(value: number, name: string) => [`$${value}`, name]}
                />
                <Area type="monotone" dataKey="Revenue" stroke="#6b8e6b" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                <Area type="monotone" dataKey="Expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
          <h2 className="text-lg font-serif italic text-[#141414] mb-6">Service Engagement (Pickups)</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pickupData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E3E0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#141414', opacity: 0.5, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#141414', opacity: 0.5, fontSize: 12 }} dx={-10} />
                <Tooltip 
                  cursor={{ fill: '#E4E3E0', opacity: 0.4 }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="Pickups" fill="#141414" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
