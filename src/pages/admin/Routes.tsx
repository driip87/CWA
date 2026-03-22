import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Map,
  RefreshCw,
  Route,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { apiAuthedPost } from '../../lib/api';
import {
  CANONICAL_FIELDS,
  type AdapterExportPayload,
  type CanonicalField,
  type ColumnMapping,
  type MigrationAuditRecord,
  type MigrationDashboard,
  type MigrationJobRecord,
  type MigrationJobRowRecord,
  type MigrationSourceSystem,
} from '../../shared/migration';

interface MigrationJobDetailsResponse {
  job: MigrationJobRecord;
  rows: MigrationJobRowRecord[];
  auditLog: MigrationAuditRecord[];
  reports: {
    issueCounts: Record<string, number>;
    errorRows: Array<{
      rowIndex: number;
      issues: string;
    }>;
    duplicateRows: MigrationJobRowRecord[];
  };
}

const fieldLabels: Record<CanonicalField, string> = {
  externalAccountId: 'External Account ID',
  name: 'Customer Name',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  routeId: 'Route ID',
  stopSequence: 'Stop Sequence',
  serviceDays: 'Service Days',
  serviceType: 'Service Type',
  plan: 'Plan',
};

const rowStatusStyles: Record<MigrationJobRowRecord['validationStatus'], string> = {
  ready: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-700',
  duplicate_review: 'bg-yellow-100 text-yellow-800',
};

const jobStatusStyles: Record<MigrationJobRecord['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  mapped: 'bg-blue-100 text-blue-700',
  validated: 'bg-amber-100 text-amber-800',
  imported: 'bg-green-100 text-green-700',
};

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function formatAuditEvent(eventType: MigrationAuditRecord['eventType']) {
  return eventType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AdminRoutes() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dashboard, setDashboard] = useState<MigrationDashboard | null>(null);
  const [jobs, setJobs] = useState<MigrationJobRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<MigrationJobDetailsResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [sourceSystem, setSourceSystem] = useState<MigrationSourceSystem>('routesmart_api');
  const [autoSendInvites, setAutoSendInvites] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');

  const selectedJob = jobDetails?.job || jobs.find((job) => job.id === selectedJobId) || null;

  const rowsByStatus = useMemo(() => {
    const rows = jobDetails?.rows || [];
    return {
      ready: rows.filter((row) => row.validationStatus === 'ready').length,
      warning: rows.filter((row) => row.validationStatus === 'warning').length,
      error: rows.filter((row) => row.validationStatus === 'error').length,
      duplicate_review: rows.filter((row) => row.validationStatus === 'duplicate_review').length,
    };
  }, [jobDetails]);

  const loadDashboard = async () => {
    const response = await apiAuthedPost<{ dashboard: MigrationDashboard }>('/api/admin/migration-dashboard');
    setDashboard(response.dashboard);
  };

  const loadJobs = async (preferredJobId?: string | null) => {
    const response = await apiAuthedPost<{ jobs: MigrationJobRecord[] }>('/api/admin/migration-jobs/list');
    setJobs(response.jobs);

    const nextJobId = preferredJobId || selectedJobId || response.jobs[0]?.id || null;
    setSelectedJobId(nextJobId);
    return nextJobId;
  };

  const loadJobDetails = async (jobId: string) => {
    const response = await apiAuthedPost<MigrationJobDetailsResponse>(`/api/admin/migration-jobs/${jobId}/details`);
    setJobDetails(response);
    setColumnMapping(response.job.columnMapping || {});
    setAutoSendInvites(response.job.autoSendInvites);
  };

  const refresh = async (preferredJobId?: string | null) => {
    setLoading(true);
    try {
      await loadDashboard();
      const jobId = await loadJobs(preferredJobId);
      if (jobId) {
        await loadJobDetails(jobId);
      } else {
        setJobDetails(null);
      }
    } catch (error) {
      console.error('Failed to load migration workspace', error);
      setMessage(error instanceof Error ? error.message : 'Failed to load migration workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const downloadTemplate = () => {
    const headers = 'Account ID,Customer Name,Email,Phone,Service Address,Route ID,Stop Sequence,Service Days,Service Type,Plan\n';
    const sample = 'A-1001,Jane Doe,jane@example.com,901-555-0100,123 Main St,Route-7,10,"Monday,Thursday",residential,Standard Residential\n';
    downloadTextFile('migration-template.csv', headers + sample, 'text/csv');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const csvText = await file.text();
      const response = await apiAuthedPost<MigrationJobDetailsResponse>('/api/admin/migration-jobs', {
        csvText,
        fileName: file.name,
        sourceSystem,
        adapterType: sourceSystem,
      });

      setJobDetails(response);
      setColumnMapping(response.job.columnMapping || {});
      setAutoSendInvites(response.job.autoSendInvites);
      setSelectedJobId(response.job.id);
      setMessage(`Created migration job ${response.job.fileName} with ${response.job.sourceRowCount} staged rows.`);
      await refresh(response.job.id);
    } catch (error) {
      console.error('Migration upload failed', error);
      setMessage(error instanceof Error ? error.message : 'Migration upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setActing(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      console.error('Migration action failed', error);
      setMessage(error instanceof Error ? error.message : 'Migration action failed.');
    } finally {
      setActing(false);
    }
  };

  const handleMappingChange = (field: CanonicalField, value: string) => {
    setColumnMapping((current) => ({
      ...current,
      [field]: value || null,
    }));
  };

  const handleSaveMapping = async () => {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await apiAuthedPost<MigrationJobDetailsResponse>(`/api/admin/migration-jobs/${selectedJobId}/mapping`, {
        columnMapping,
        autoSendInvites,
      });
      setJobDetails(response);
      setMessage('Column mapping saved.');
      await refresh(selectedJobId);
    });
  };

  const handleValidate = async () => {
    if (!selectedJobId) return;

    await runAction(async () => {
      await apiAuthedPost<MigrationJobDetailsResponse>(`/api/admin/migration-jobs/${selectedJobId}/mapping`, {
        columnMapping,
        autoSendInvites,
      });
      const response = await apiAuthedPost<MigrationJobDetailsResponse>(`/api/admin/migration-jobs/${selectedJobId}/validate`);
      setJobDetails(response);
      setMessage('Validation complete. Review issues before confirming the import.');
      await refresh(selectedJobId);
    });
  };

  const handleConfirm = async () => {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await apiAuthedPost<MigrationJobDetailsResponse>(`/api/admin/migration-jobs/${selectedJobId}/confirm`, {
        autoSendInvites,
      });
      setJobDetails(response);
      setMessage('Migration import applied successfully.');
      await refresh(selectedJobId);
    });
  };

  const handleRerun = async () => {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await apiAuthedPost<MigrationJobDetailsResponse>(`/api/admin/migration-jobs/${selectedJobId}/rerun`);
      setJobDetails(response);
      setMessage('Migration job re-ran idempotently.');
      await refresh(selectedJobId);
    });
  };

  const handleExportErrors = async () => {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await apiAuthedPost<{ fileName: string; csvText: string }>(
        `/api/admin/migration-jobs/${selectedJobId}/error-export`,
      );
      downloadTextFile(response.fileName, response.csvText, 'text/csv');
      setMessage('Error export downloaded.');
      await refresh(selectedJobId);
    });
  };

  const handleExportAdapter = async () => {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await apiAuthedPost<{ payload: AdapterExportPayload }>(
        `/api/admin/migration-jobs/${selectedJobId}/adapter-export`,
      );
      downloadTextFile(
        `adapter-export-${selectedJobId}.json`,
        JSON.stringify(response.payload, null, 2),
        'application/json',
      );
      setMessage('Adapter export downloaded.');
      await refresh(selectedJobId);
    });
  };

  if (loading) {
    return <div className="text-[#141414]/50 font-mono">Loading migration workspace...</div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Migration Workspace</h1>
          <p className="text-gray-500 mt-2 max-w-3xl">
            Upload source extracts, map fields into the canonical schema, validate duplicates and bad records, then run deterministic imports
            that preserve route IDs and stop sequences.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={downloadTemplate}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Download size={18} />
            Template
          </button>
          <button
            onClick={() => void refresh(selectedJobId)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
          <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-[#6b8e6b] text-white rounded-xl font-medium hover:bg-[#5a7a5a] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {uploading ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
            {uploading ? 'Uploading...' : 'Upload Extract'}
          </button>
        </div>
      </header>

      {message && (
        <div className="rounded-xl border border-[#141414]/10 bg-white px-4 py-3 text-sm text-[#141414]/70">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-[#141414]/10 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-[#141414]/40 font-mono">Active Jobs</p>
          <p className="text-3xl font-serif italic mt-3 text-[#141414]">{dashboard?.activeJobCount || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#141414]/10 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-[#141414]/40 font-mono">Awaiting Review</p>
          <p className="text-3xl font-serif italic mt-3 text-amber-700">{dashboard?.jobsAwaitingReview || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#141414]/10 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-[#141414]/40 font-mono">Rows Processed</p>
          <p className="text-3xl font-serif italic mt-3 text-[#141414]">{dashboard?.totalRowsProcessed || 0}</p>
        </div>
        <div className="bg-[#141414] text-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-white/50 font-mono">Rows Imported</p>
          <p className="text-3xl font-serif italic mt-3 text-[#6b8e6b]">{dashboard?.totalRowsImported || 0}</p>
          <p className="text-xs text-white/60 mt-3">Latest run: {dashboard?.lastImportedAt || 'No import confirmed yet'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="text-[#6b8e6b]" size={20} />
              <h2 className="text-lg font-bold text-[#141414]">Implementation Queue</h2>
            </div>
            <div className="space-y-3">
              <label className="block text-sm text-[#141414]/70">
                Source system
                <select
                  value={sourceSystem}
                  onChange={(event) => setSourceSystem(event.target.value as MigrationSourceSystem)}
                  className="mt-2 w-full rounded-xl border border-[#141414]/10 px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8e6b]"
                >
                  <option value="routesmart_api">RouteSmart-style API payload</option>
                  <option value="generic_csv">Generic CSV adapter</option>
                </select>
              </label>
              <label className="flex items-center justify-between rounded-xl border border-[#141414]/10 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#141414]">Auto-send claim invites</p>
                  <p className="text-xs text-[#141414]/50 mt-1">Enabled by default after a successful confirmed import.</p>
                </div>
                <input
                  type="checkbox"
                  checked={autoSendInvites}
                  onChange={(event) => setAutoSendInvites(event.target.checked)}
                  className="h-4 w-4 accent-[#6b8e6b]"
                />
              </label>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <History className="text-[#6b8e6b]" size={20} />
              <h2 className="text-lg font-bold text-[#141414]">Job History</h2>
            </div>
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {jobs.length > 0 ? (
                jobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => {
                      setSelectedJobId(job.id);
                      void loadJobDetails(job.id);
                    }}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                      selectedJobId === job.id ? 'border-[#6b8e6b] bg-[#6b8e6b]/5' : 'border-[#141414]/10 hover:bg-[#E4E3E0]/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-[#141414] truncate">{job.fileName}</p>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${jobStatusStyles[job.status]}`}>{job.status}</span>
                    </div>
                    <p className="text-xs text-[#141414]/50 mt-2">{job.sourceRowCount} staged rows</p>
                    <p className="text-xs text-[#141414]/50 mt-1">
                      Imported {job.summary.importedRows} / {job.summary.totalRows} rows
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[#141414]/50">No migration jobs yet. Upload a source extract to begin.</p>
              )}
            </div>
          </section>
        </div>

        <div className="xl:col-span-8 space-y-6">
          {selectedJob && jobDetails ? (
            <>
              <section className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <Map className="text-[#6b8e6b]" size={20} />
                      <h2 className="text-lg font-bold text-[#141414]">{selectedJob.fileName}</h2>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${jobStatusStyles[selectedJob.status]}`}>{selectedJob.status}</span>
                    </div>
                    <p className="text-sm text-[#141414]/50 mt-2">
                      Adapter: {selectedJob.adapterType} • Source rows: {selectedJob.sourceRowCount} • Import runs: {selectedJob.importRunCount}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => void handleSaveMapping()}
                      disabled={acting}
                      className="px-4 py-2 rounded-xl border border-[#141414]/10 bg-white text-[#141414] font-medium hover:bg-[#E4E3E0]/30 disabled:opacity-50"
                    >
                      Save Mapping
                    </button>
                    <button
                      onClick={() => void handleValidate()}
                      disabled={acting}
                      className="px-4 py-2 rounded-xl bg-[#141414] text-white font-medium hover:bg-[#2b2b2b] disabled:opacity-50"
                    >
                      Validate Job
                    </button>
                    <button
                      onClick={() => void handleConfirm()}
                      disabled={acting || selectedJob.status !== 'validated'}
                      className="px-4 py-2 rounded-xl bg-[#6b8e6b] text-white font-medium hover:bg-[#5a7a5a] disabled:opacity-50"
                    >
                      Confirm Import
                    </button>
                    <button
                      onClick={() => void handleRerun()}
                      disabled={acting || selectedJob.status !== 'imported'}
                      className="px-4 py-2 rounded-xl border border-[#141414]/10 bg-white text-[#141414] font-medium hover:bg-[#E4E3E0]/30 disabled:opacity-50"
                    >
                      Re-run
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                  <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-green-700/70 font-mono">Ready</p>
                    <p className="text-2xl font-serif italic mt-3 text-green-700">{rowsByStatus.ready}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-800/70 font-mono">Warnings</p>
                    <p className="text-2xl font-serif italic mt-3 text-amber-800">{rowsByStatus.warning}</p>
                  </div>
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-red-700/70 font-mono">Errors</p>
                    <p className="text-2xl font-serif italic mt-3 text-red-700">{rowsByStatus.error}</p>
                  </div>
                  <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-yellow-800/70 font-mono">Duplicate Review</p>
                    <p className="text-2xl font-serif italic mt-3 text-yellow-800">{rowsByStatus.duplicate_review}</p>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Route className="text-[#6b8e6b]" size={20} />
                  <h2 className="text-lg font-bold text-[#141414]">Column Mapping</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CANONICAL_FIELDS.map((field) => (
                    <label key={field} className="block text-sm text-[#141414]/70">
                      {fieldLabels[field]}
                      <select
                        value={columnMapping[field] || ''}
                        onChange={(event) => handleMappingChange(field, event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[#141414]/10 px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8e6b]"
                      >
                        <option value="">Not mapped</option>
                        {selectedJob.sourceHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="text-[#6b8e6b]" size={20} />
                    <h2 className="text-lg font-bold text-[#141414]">Validation Report</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#141414]/10 text-xs font-mono uppercase tracking-wider text-[#141414]/50">
                          <th className="py-3 pr-4">Row</th>
                          <th className="py-3 pr-4">Customer</th>
                          <th className="py-3 pr-4">Route</th>
                          <th className="py-3 pr-4">Stop</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3">Issues</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]/5">
                        {jobDetails.rows.slice(0, 20).map((row) => (
                          <tr key={row.id}>
                            <td className="py-3 pr-4 text-sm text-[#141414]/60">{row.rowIndex}</td>
                            <td className="py-3 pr-4">
                              <p className="font-medium text-[#141414]">{row.name || row.email || 'Unlabeled row'}</p>
                              <p className="text-xs text-[#141414]/50">{row.externalAccountId || 'No external ID'}</p>
                            </td>
                            <td className="py-3 pr-4 text-sm text-[#141414]/60">{row.routeId || 'Missing'}</td>
                            <td className="py-3 pr-4 text-sm text-[#141414]/60">{row.stopSequence ?? 'Missing'}</td>
                            <td className="py-3 pr-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${rowStatusStyles[row.validationStatus]}`}>
                                {row.validationStatus}
                              </span>
                            </td>
                            <td className="py-3">
                              <p className="text-sm text-[#141414]/60">
                                {row.validationIssues.length > 0
                                  ? row.validationIssues.map((issue) => issue.message).join(' | ')
                                  : 'No issues'}
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {jobDetails.rows.length > 20 && (
                    <p className="text-xs text-[#141414]/40 mt-3">Showing the first 20 rows in the workspace. Exports include the full job.</p>
                  )}
                </div>

                <div className="bg-[#141414] text-white rounded-2xl shadow-sm p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-bold">Implementation Handoff</h2>
                    <p className="text-sm text-white/70 mt-2">
                      Use this panel to generate deterministic onboarding artifacts for implementation teams after validation or import.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => void handleExportErrors()}
                      disabled={acting}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-left hover:bg-white/15 disabled:opacity-50"
                    >
                      <p className="font-medium">Download Error Export</p>
                      <p className="text-xs text-white/60 mt-1">Bad addresses, invalid service days, duplicates, and stop-sequence issues.</p>
                    </button>
                    <button
                      onClick={() => void handleExportAdapter()}
                      disabled={acting || selectedJob.summary.importedRows === 0}
                      className="w-full rounded-xl bg-[#6b8e6b] px-4 py-3 text-left text-white hover:bg-[#5a7a5a] disabled:opacity-50"
                    >
                      <p className="font-medium">Download Adapter Export</p>
                      <p className="text-xs text-white/80 mt-1">Grouped RouteSmart-style route payload preserving route IDs and stop sequences.</p>
                    </button>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/50 font-mono">Issue Counts</p>
                    <div className="space-y-2 mt-3 text-sm text-white/75">
                      {Object.keys(jobDetails.reports.issueCounts).length > 0 ? (
                        Object.entries(jobDetails.reports.issueCounts).map(([code, count]) => (
                          <div key={code} className="flex items-center justify-between gap-3">
                            <span>{code}</span>
                            <span>{count}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-white/60">No validation issues recorded.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <History className="text-[#6b8e6b]" size={20} />
                  <h2 className="text-lg font-bold text-[#141414]">Audit Log</h2>
                </div>
                <div className="space-y-3">
                  {jobDetails.auditLog.length > 0 ? (
                    jobDetails.auditLog.slice().reverse().map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-[#141414]/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="font-medium text-[#141414]">{formatAuditEvent(entry.eventType)}</p>
                          <p className="text-xs text-[#141414]/40">{entry.createdAt}</p>
                        </div>
                        <p className="text-xs text-[#141414]/50 mt-2">{JSON.stringify(entry.details)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#141414]/50">No audit events recorded yet.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm p-12 text-center">
              <AlertCircle className="mx-auto text-[#141414]/30 mb-4" size={40} />
              <h2 className="text-xl font-bold text-[#141414]">No migration job selected</h2>
              <p className="text-sm text-[#141414]/50 mt-2">Upload a source extract to start a RouteSmart-compatible migration workflow.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
