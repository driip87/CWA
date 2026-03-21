import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, query, where, writeBatch, doc } from 'firebase/firestore';
import { Map, Upload, Download, Users, Truck, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AdminRoutes() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ success: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'user'));
      const snap = await getDocs(q);
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const downloadTemplate = () => {
    const headers = "Name,Email,Phone,Address,Collection Day,Plan\n";
    const sample = "John Doe,john@example.com,555-0100,123 Main St,Monday,Standard Residential\n";
    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'route_import_template.csv';
    a.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportStats(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length < 2) {
        alert("File appears to be empty or missing data rows.");
        setImporting(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      let successCount = 0;
      let failCount = 0;

      // We'll process sequentially to avoid overwhelming the database for this prototype
      for (let i = 1; i < lines.length; i++) {
        try {
          // Basic CSV parsing (doesn't handle commas inside quotes, but good for prototype)
          const values = lines[i].split(',');
          if (values.length < 5) continue;

          const customerData = {
            name: values[0]?.trim() || '',
            email: values[1]?.trim() || '',
            phone: values[2]?.trim() || '',
            address: values[3]?.trim() || '',
            collectionDay: values[4]?.trim() || 'Monday',
            plan: values[5]?.trim() || 'Standard Residential',
            role: 'user',
            subscriptionStatus: 'active', // Assume imported legacy customers are active
            createdAt: new Date().toISOString(),
            imported: true
          };

          if (customerData.email) {
            await addDoc(collection(db, 'users'), customerData);
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error("Row import error:", err);
          failCount++;
        }
      }

      setImportStats({ success: successCount, failed: failCount });
      setImporting(false);
      fetchCustomers();
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const customersByDay = days.reduce((acc, day) => {
    acc[day] = customers.filter(c => c.collectionDay === day || (!c.collectionDay && day === 'Monday'));
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
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 bg-[#6b8e6b] text-white rounded-xl font-medium hover:bg-[#5a7a5a] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {importing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Upload size={18} />
            )}
            {importing ? 'Importing...' : 'Bulk Import Routes'}
          </button>
        </div>
      </header>

      {importStats && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${importStats.failed > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          {importStats.failed > 0 ? <AlertCircle className="text-yellow-600 mt-0.5" size={20} /> : <CheckCircle2 className="text-green-600 mt-0.5" size={20} />}
          <div>
            <h3 className={`font-bold ${importStats.failed > 0 ? 'text-yellow-800' : 'text-green-800'}`}>Import Complete</h3>
            <p className={`text-sm ${importStats.failed > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
              Successfully imported {importStats.success} customers. {importStats.failed > 0 && `${importStats.failed} rows failed to import.`}
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
              Moving from legacy software? Use our bulk import tool to instantly map your existing customers to their collection days.
            </p>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#6b8e6b]" /> Customers are auto-activated</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#6b8e6b]" /> Routes are automatically built</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#6b8e6b]" /> Accounts link when they log in</li>
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
                {days.map(day => {
                  const dayCustomers = customersByDay[day] || [];
                  if (dayCustomers.length === 0) return null;
                  
                  return (
                    <div key={day} className="p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-gray-900">{day} Route</h3>
                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                          {dayCustomers.length} Stops
                        </span>
                      </div>
                      <div className="space-y-3">
                        {dayCustomers.map(customer => (
                          <div key={customer.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-colors">
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
