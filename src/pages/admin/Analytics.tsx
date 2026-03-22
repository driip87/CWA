import React, { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiAuthedGet } from '../../lib/api';
import type { AdminAnalyticsResponse } from '../../shared/unified';

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const payload = await apiAuthedGet<AdminAnalyticsResponse>('/api/admin/domain/analytics');
        setAnalytics(payload);
      } catch (error) {
        console.error('Error fetching analytics', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading || !analytics) {
    return <div className="cw-empty font-mono">Loading analytics...</div>;
  }

  return (
    <div className="cw-page">
      <div className="cw-page-header">
        <div>
          <p className="cw-kicker">Analytics</p>
          <h1 className="cw-page-title mt-3">Cross-System Reporting</h1>
          <p className="cw-page-copy">
            Track service volume, revenue, and expense trends across your operation from one reporting workspace.
          </p>
        </div>
        <span className="cw-badge cw-badge-muted">Last 7 Days</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="cw-card p-6">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Total Revenue</h3>
          <p className="text-4xl font-serif italic mt-2 text-[var(--cw-accent)]">${analytics.totals.revenue.toLocaleString()}</p>
        </div>
        <div className="cw-card p-6">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Total Expenses</h3>
          <p className="text-4xl font-serif italic mt-2 text-[var(--cw-danger)]">${analytics.totals.expenses.toLocaleString()}</p>
        </div>
        <div className="cw-card-dark p-6 relative overflow-hidden">
          <h3 className="text-sm font-medium uppercase tracking-wider opacity-70">Net Profit</h3>
          <p className="text-4xl font-serif italic mt-2 text-[#8eb48e]">${analytics.totals.profit.toLocaleString()}</p>
          <div className="absolute -right-4 -top-4 w-24 h-24 border border-[#E4E3E0]/10 rounded-full opacity-50"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="cw-card p-6">
          <h2 className="cw-section-title mb-6">Revenue vs Expenses</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.financialByDay}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b8e6b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6b8e6b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#b64949" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#b64949" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8d2c4" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#5e604d', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#5e604d', fontSize: 12 }} dx={-10} tickFormatter={(value) => `$${value}`} />
                <Tooltip formatter={(value: number, name: string) => [`$${value}`, name]} />
                <Area type="monotone" dataKey="Revenue" stroke="#6b8e6b" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                <Area type="monotone" dataKey="Expenses" stroke="#b64949" fillOpacity={1} fill="url(#colorExpense)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cw-card p-6">
          <h2 className="cw-section-title mb-6">Unified Service Engagement</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.serviceByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8d2c4" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#5e604d', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#5e604d', fontSize: 12 }} dx={-10} />
                <Tooltip cursor={{ fill: '#ece9df', opacity: 0.7 }} />
                <Bar dataKey="Pickups" fill="#5a5a40" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
