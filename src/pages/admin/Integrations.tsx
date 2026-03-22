import React, { useEffect, useState } from 'react';
import { Activity, Cable, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiAuthedGet, apiAuthedPost } from '../../lib/api';

interface CatalogVendor {
  vendor: string;
  name: string;
  status: string;
  adapterMode: string;
  capabilities: Array<{ domain: string; read: boolean; write: boolean }>;
}

interface Connection {
  id: string;
  name: string;
  vendor: string;
  adapterMode: string;
  health: string;
  status: string;
  syncScheduleMinutes: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  capabilities: Array<{ domain: string; read: boolean; write: boolean }>;
}

interface SyncJob {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  counts?: Record<string, number>;
}

export default function AdminIntegrations() {
  const [vendors, setVendors] = useState<CatalogVendor[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: 'Primary Operations Sync',
    vendor: 'routeware',
    syncScheduleMinutes: '15',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [catalog, connectionPayload] = await Promise.all([
        apiAuthedGet<{ vendors: CatalogVendor[] }>('/api/admin/integrations/catalog'),
        apiAuthedGet<{ connections: Connection[]; syncJobs: SyncJob[] }>('/api/admin/integrations/connections'),
      ]);
      setVendors(catalog.vendors);
      setConnections(connectionPayload.connections);
      setSyncJobs(connectionPayload.syncJobs);
    } catch (error) {
      console.error('Failed to load integrations', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiAuthedPost('/api/admin/integrations/connections', {
        name: form.name,
        vendor: form.vendor,
        syncScheduleMinutes: Number(form.syncScheduleMinutes),
      });
      await load();
    } catch (error) {
      console.error('Failed to save connection', error);
      alert(error instanceof Error ? error.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncingId(connectionId);
    try {
      await apiAuthedPost(`/api/admin/integrations/connections/${connectionId}/sync`);
      await load();
    } catch (error) {
      console.error('Failed to sync connection', error);
      alert(error instanceof Error ? error.message : 'Failed to sync connection');
    } finally {
      setSyncingId(null);
    }
  };

  if (loading) {
    return <div className="text-[#141414]/50 font-mono">Loading integrations...</div>;
  }

  return (
    <div className="cw-page">
      <header className="cw-page-header">
        <div>
          <p className="cw-kicker">Integrations</p>
          <h1 className="cw-page-title mt-3">Integration Command Center</h1>
          <p className="cw-page-copy">
            Connect external routing and operations systems, monitor sync health, and keep your workspace current.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="cw-btn cw-btn-secondary"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,1.6fr] gap-6">
        <section className="cw-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-[#141414] text-white flex items-center justify-center">
              <Cable size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Connector Setup</h2>
              <p className="text-sm text-gray-500">Configure how external systems feed your service, customer, and billing views.</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="cw-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select
                value={form.vendor}
                onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))}
                className="cw-select"
              >
                {vendors.map((vendor) => (
                  <option key={vendor.vendor} value={vendor.vendor} disabled={vendor.status !== 'available'}>
                    {vendor.name} {vendor.status !== 'available' ? '(Coming soon)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Polling Interval (minutes)</label>
              <input
                type="number"
                min="5"
                value={form.syncScheduleMinutes}
                onChange={(event) => setForm((current) => ({ ...current, syncScheduleMinutes: event.target.value }))}
                className="cw-input"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="cw-btn cw-btn-primary w-full"
            >
              {saving ? 'Saving...' : 'Save Connector'}
            </button>
          </form>

          <div className="mt-8 space-y-3">
            {vendors.map((vendor) => (
              <div key={vendor.vendor} className="rounded-xl border border-gray-100 p-4 bg-gray-50/70">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">{vendor.name}</p>
                    <p className="text-sm text-gray-500 capitalize">{vendor.status === 'available' ? 'available' : 'coming soon'}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${vendor.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {vendor.status === 'available' ? 'Available' : 'Coming Soon'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {vendor.capabilities.map((capability) => (
                    <span key={capability.domain} className="text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600">
                      {capability.domain.replace(/_/g, ' ')}: {capability.read ? 'read' : 'off'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="cw-card overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Active Connections</h2>
                <p className="text-sm text-gray-500">Each connection keeps customers, routes, service events, and balances aligned.</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {connections.map((connection) => (
                <div key={connection.id} className="px-6 py-5 flex items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-900">{connection.name}</p>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          connection.health === 'healthy'
                            ? 'bg-green-100 text-green-700'
                            : connection.health === 'syncing'
                              ? 'bg-blue-100 text-blue-700'
                              : connection.health === 'error'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {connection.health}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {connection.vendor} via {connection.adapterMode} • Poll every {connection.syncScheduleMinutes} minutes
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {connection.capabilities.map((capability) => (
                        <span key={capability.domain} className="text-xs px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600">
                          {capability.domain.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never synced'}</p>
                    <button
                      onClick={() => void handleSync(connection.id)}
                      disabled={syncingId === connection.id}
                      className="cw-btn cw-btn-primary mt-3"
                    >
                      {syncingId === connection.id ? <RefreshCw size={16} className="animate-spin" /> : <Activity size={16} />}
                      {syncingId === connection.id ? 'Syncing...' : 'Run Sync'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cw-card overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Recent Sync Jobs</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {syncJobs.length > 0 ? (
                syncJobs.map((job) => (
                  <div key={job.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {job.status === 'completed' ? (
                        <CheckCircle2 size={18} className="text-green-600" />
                      ) : job.status === 'failed' ? (
                        <ShieldAlert size={18} className="text-red-600" />
                      ) : (
                        <Clock3 size={18} className="text-blue-600" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{job.status}</p>
                        <p className="text-sm text-gray-500">{job.message || 'Background sync job'}</p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <p>{new Date(job.startedAt).toLocaleString()}</p>
                      {job.finishedAt && <p>Finished {new Date(job.finishedAt).toLocaleTimeString()}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center text-gray-500">No sync jobs recorded yet.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
