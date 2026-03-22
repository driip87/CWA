import React, { useEffect, useState } from 'react';
import { Activity, Cable, DollarSign, ShieldAlert, Truck, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { apiAuthedGet } from '../../lib/api';
import type { AdminOverviewResponse } from '../../shared/unified';

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const payload = await apiAuthedGet<AdminOverviewResponse>('/api/admin/domain/overview');
        setOverview(payload);
      } catch (error) {
        console.error('Error fetching admin overview', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading || !overview) {
    return <div className="cw-empty font-mono">Loading dashboard data...</div>;
  }

  const cards = [
    {
      label: 'Unified Customers',
      value: overview.stats.totalCustomers,
      tone: 'bg-[rgba(107,142,107,0.16)] text-[#557455]',
      icon: <Users size={20} />,
    },
    {
      label: 'Active Routes',
      value: overview.stats.activeRoutes,
      tone: 'bg-[rgba(90,90,64,0.1)] text-[var(--cw-primary)]',
      icon: <Truck size={20} />,
    },
    {
      label: 'Open Exceptions',
      value: overview.stats.openExceptions,
      tone: 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]',
      icon: <ShieldAlert size={20} />,
    },
    {
      label: 'Outstanding Balance',
      value: `$${overview.stats.outstandingBalance.toLocaleString()}`,
      tone: 'bg-[rgba(236,233,223,0.72)] text-[var(--cw-primary)]',
      icon: <DollarSign size={20} />,
    },
  ];

  return (
    <div className="cw-page">
      <div className="cw-page-header">
        <div>
          <p className="cw-kicker">Operations</p>
          <h1 className="cw-page-title mt-3">Operations Overview</h1>
          <p className="cw-page-copy">
            {overview.tenant.name} is running on synchronized customer, service, and billing data. Use this workspace to monitor the operation without leaving the platform.
          </p>
        </div>
        <Link
          to="/admin/integrations"
          className="cw-btn cw-btn-primary"
        >
          <Cable size={16} />
          Manage Integrations
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="cw-card p-6">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.tone}`}>{card.icon}</div>
              <span className="text-xs font-mono text-[color:var(--cw-ink-soft)] uppercase tracking-wider">Live View</span>
            </div>
            <h3 className="text-[color:var(--cw-ink-soft)] text-sm font-medium uppercase tracking-wider">{card.label}</h3>
            <p className="text-3xl font-serif italic mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-8">
        <div className="cw-card overflow-hidden">
          <div className="p-6 border-b border-[color:var(--cw-line)] flex items-center justify-between">
            <div>
              <h2 className="cw-section-title">Recent Activity</h2>
              <p className="text-sm text-[color:var(--cw-ink-soft)] mt-1">Service, billing, and customer updates from connected operations appear here.</p>
            </div>
            <span className="cw-badge cw-badge-muted">Synced</span>
          </div>
          <div className="divide-y divide-[rgba(45,45,32,0.06)]">
            {overview.recentActivity.length > 0 ? (
              overview.recentActivity.map((activity) => (
                <div key={activity.id} className="p-6 flex items-start gap-4 hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                  <div className="cw-icon-chip">
                    <Activity size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[var(--cw-ink)]">{activity.title}</p>
                    <p className="text-sm text-[color:var(--cw-ink-soft)] mt-1">{activity.subtitle}</p>
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-3">{activity.sourceLabel}</p>
                  </div>
                  <div className="text-xs font-mono text-[color:var(--cw-ink-soft)] whitespace-nowrap">
                    {format(new Date(activity.occurredAt), 'MMM d, h:mm a')}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 cw-empty font-mono">No recent activity.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="cw-card-dark overflow-hidden relative">
            <div className="p-6 border-b border-[#E4E3E0]/10">
              <h2 className="cw-section-title text-white">Connected Sources</h2>
            </div>
            <div className="p-6 space-y-4">
              {overview.sources.map((source) => (
                <div key={source.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">{source.name}</p>
                      <p className="text-sm text-white/60">{source.vendor}</p>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#8eb48e]">{source.health}</span>
                  </div>
                  <p className="text-xs text-white/50 mt-3">
                    {source.lastSyncAt ? `Last sync ${format(new Date(source.lastSyncAt), 'MMM d, h:mm a')}` : 'Awaiting first sync'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="cw-card p-6">
            <h2 className="cw-section-title mb-4">Operational Notes</h2>
            <ul className="space-y-3 text-sm text-[color:var(--cw-ink-soft)]">
              <li>Route completion and stop updates currently sync in from connected systems.</li>
              <li>Customer support and billing actions remain available directly in CWA.</li>
              <li>Customers, routes, stops, proofs, and exceptions stay aligned in one operational workspace.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
