import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Map, RefreshCw, Upload, Users, Truck } from 'lucide-react';
import { apiAuthedGet, apiAuthedPost } from '../../lib/api';

interface ImportResult {
  batchId: string;
  summary: {
    total: number;
    created: number;
    updated: number;
    needsReview: number;
    invited: number;
    missingEmail: number;
  };
}

interface RouteView {
  id: string;
  name: string;
  serviceDay: string;
  stopCount: number;
  sourceLabel: string;
  run: { serviceDate: string; status: string } | null;
  vehicle: { name: string | null; status: string | null } | null;
  stops: Array<{
    id: string;
    sequence: number;
    customerName: string;
    address: string;
    status: string;
    binLocation: string;
  }>;
}

export default function AdminRoutes() {
  const [routes, setRoutes] = useState<RouteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const payload = await apiAuthedGet<{ routes: RouteView[] }>('/api/admin/domain/routes');
      setRoutes(payload.routes);
    } catch (error) {
      console.error('Error fetching routes', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoutes();
  }, []);

  const downloadTemplate = () => {
    const headers = 'Name,Email,Phone,Address,Collection Day,Plan\n';
    const sample = 'John Doe,john@example.com,555-0100,123 Main St,Monday,Standard Residential\n';
    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'route_import_template.csv';
    anchor.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const csvText = await file.text();
      const result = await apiAuthedPost<ImportResult>('/api/admin/import-customers', { csvText });
      setImportResult(result);
      await fetchRoutes();
    } catch (error) {
      console.error('Import failed:', error);
      alert(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="cw-page">
      <header className="cw-page-header">
        <div>
          <p className="cw-kicker">Routes</p>
          <h1 className="cw-page-title mt-3">Route Management</h1>
          <p className="cw-page-copy">
            Review synced routes, onboard customers with imports, and keep service planning aligned across your operation.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void fetchRoutes()}
            className="cw-btn cw-btn-secondary"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
          <button
            onClick={downloadTemplate}
            className="cw-btn cw-btn-secondary"
          >
            <Download size={18} />
            CSV Template
          </button>
          <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="cw-btn cw-btn-primary"
          >
            {importing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Upload size={18} />}
            {importing ? 'Importing...' : 'Import Customers'}
          </button>
        </div>
      </header>

      {importResult && (
        <div
          className={`p-4 rounded-3xl border flex items-start gap-3 ${
            importResult.summary.needsReview > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
          }`}
        >
          {importResult.summary.needsReview > 0 ? (
            <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
          ) : (
            <CheckCircle2 className="text-green-600 mt-0.5" size={20} />
          )}
          <div>
            <h3 className={`font-bold ${importResult.summary.needsReview > 0 ? 'text-yellow-800' : 'text-green-800'}`}>Import Complete</h3>
            <p className={`text-sm ${importResult.summary.needsReview > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
              Processed {importResult.summary.total} customers. {importResult.summary.created} created, {importResult.summary.updated} updated,{' '}
              {importResult.summary.invited} invited, {importResult.summary.needsReview} need review.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="cw-card-dark p-6">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4">
              <Map className="text-white" size={24} />
            </div>
            <h2 className="text-xl font-bold mb-2">Routing Snapshot</h2>
            <p className="text-white/70 text-sm mb-6">
              Stops, service dates, vehicle assignments, and status updates are organized into one view before they reach the operations team.
            </p>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#6b8e6b]" /> Imported and connected route data rolls into one shared schedule
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#6b8e6b]" /> Stop sequencing, run dates, and vehicle context stay visible in one place
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#6b8e6b]" /> Customer imports can seed routes before a routing system is connected
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="cw-card overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="cw-section-title flex items-center gap-2">
                  <Truck size={20} className="text-[#6b8e6b]" />
                  Route Overview
                </h2>
                <p className="text-sm text-gray-500 mt-1">Synced route schedules with stop sequencing and vehicle context.</p>
              </div>
              <span className="cw-badge cw-badge-muted">Synced Routes</span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading routes...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {routes.map((route) => (
                  <div key={route.id} className="p-6">
                    <div className="flex justify-between items-center mb-4 gap-4">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{route.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {route.serviceDay} • {route.run ? new Date(route.run.serviceDate).toLocaleDateString() : 'No scheduled run'}
                          {route.vehicle?.name ? ` • ${route.vehicle.name}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">{route.stopCount} Stops</span>
                        <span className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full">{route.sourceLabel}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {route.stops.map((stop) => (
                        <div
                          key={stop.id}
                          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                              <Users size={14} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                #{stop.sequence} {stop.customerName}
                              </p>
                              <p className="text-xs text-gray-500">{stop.address || stop.binLocation}</p>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-bold px-3 py-1 rounded-full ${
                              stop.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : stop.status === 'missed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {stop.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {routes.length === 0 && (
                  <div className="p-12 text-center">
                    <Map className="mx-auto text-gray-300 mb-3" size={48} />
                    <p className="text-gray-500 font-medium">No routes found.</p>
                    <p className="text-sm text-gray-400 mt-1">Connect a routing system or import customers to start building your schedule.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
