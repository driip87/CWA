import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Download, Map, Upload, Users, Truck } from 'lucide-react';
import { db } from '../../lib/firebase';
import { apiAuthedPost } from '../../lib/api';

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

export default function AdminRoutes() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'user')));
      setCustomers(
        snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((customer: any) => customer.recordStatus !== 'archived'),
      );
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
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
      await fetchCustomers();
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

  const customersByDay = days.reduce((acc, day) => {
    acc[day] = customers.filter((customer) => customer.collectionDay === day || (!customer.collectionDay && day === 'Monday'));
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Route Management</h1>
          <p className="text-gray-500 mt-2">Manage collection routes and import existing customer lists.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={downloadTemplate}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Download size={18} />
            CSV Template
          </button>
          <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 bg-[#6b8e6b] text-white rounded-xl font-medium hover:bg-[#5a7a5a] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {importing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Upload size={18} />}
            {importing ? 'Importing...' : 'Bulk Import Routes'}
          </button>
        </div>
      </header>

      {importResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
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
          <div className="bg-[#141414] text-white rounded-2xl p-6 shadow-xl">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4">
              <Map className="text-white" size={24} />
            </div>
            <h2 className="text-xl font-bold mb-2">Transitioning Made Easy</h2>
            <p className="text-white/70 text-sm mb-6">
              Imports now normalize customer data, generate claim invites, and route ambiguous matches into review instead of creating blind duplicates.
            </p>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#6b8e6b]" /> Unique matches are updated in place
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#6b8e6b]" /> New imports get invite or missing-email status
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#6b8e6b]" /> Ambiguous records are routed for support review
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Truck size={20} className="text-[#6b8e6b]" />
                Route Overview
              </h2>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading routes...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {days.map((day) => {
                  const dayCustomers = customersByDay[day] || [];
                  if (dayCustomers.length === 0) return null;

                  return (
                    <div key={day} className="p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-gray-900">{day} Route</h3>
                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">{dayCustomers.length} Stops</span>
                      </div>
                      <div className="space-y-3">
                        {dayCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                <Users size={14} />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{customer.name || customer.email}</p>
                                <p className="text-xs text-gray-500">{customer.address || 'No address provided'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-medium text-gray-500">{customer.plan || 'Standard'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {customers.length === 0 && (
                  <div className="p-12 text-center">
                    <Map className="mx-auto text-gray-300 mb-3" size={48} />
                    <p className="text-gray-500 font-medium">No routes configured yet.</p>
                    <p className="text-sm text-gray-400 mt-1">Import your existing customer list to generate routes.</p>
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
