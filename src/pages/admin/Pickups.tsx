import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, updateDoc, doc, addDoc } from 'firebase/firestore';
import { Calendar, MapPin, CheckCircle2, XCircle, Clock, MessageSquare, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminPickups() {
  const { user } = useAuth();
  const [pickups, setPickups] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pickups' | 'requests'>('pickups');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const qPickups = query(collection(db, 'pickups'), orderBy('date', 'desc'));
      const pickupsSnap = await getDocs(qPickups);
      setPickups(pickupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const qInteractions = query(collection(db, 'interactions'), orderBy('date', 'desc'));
      const interactionsSnap = await getDocs(qInteractions);
      setInteractions(interactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (pickupId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'pickups', pickupId), { status: newStatus });
      setPickups(pickups.map(p => p.id === pickupId ? { ...p, status: newStatus } : p));
    } catch (error) {
      console.error("Error updating pickup status", error);
    }
  };

  const handleResolveRequest = async (interactionId: string) => {
    try {
      await updateDoc(doc(db, 'interactions', interactionId), { status: 'resolved' });
      setInteractions(interactions.map(i => i.id === interactionId ? { ...i, status: 'resolved' } : i));
    } catch (error) {
      console.error("Error resolving request", error);
    }
  };

  if (loading) return <div className="text-[#141414]/50 font-mono">Loading data...</div>;

  const serviceRequests = interactions.filter(i => i.type === 'service_request' && i.status !== 'resolved');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-serif italic text-[#141414]">Activity & Service Monitoring</h1>
        <button className="px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-lg font-medium hover:bg-[#141414]/80 transition-colors">
          + New Pickup
        </button>
      </div>

      <div className="flex gap-4 border-b border-[#141414]/10">
        <button 
          onClick={() => setActiveTab('pickups')}
          className={`pb-3 px-2 font-medium transition-colors border-b-2 ${activeTab === 'pickups' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/50 hover:text-[#141414]'}`}
        >
          Scheduled Pickups
        </button>
        <button 
          onClick={() => setActiveTab('requests')}
          className={`pb-3 px-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'requests' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/50 hover:text-[#141414]'}`}
        >
          Service Requests
          {serviceRequests.length > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{serviceRequests.length}</span>}
        </button>
      </div>

      {activeTab === 'pickups' ? (
        <div className="bg-white rounded-xl shadow-sm border border-[#141414]/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#E4E3E0]/50 border-b border-[#141414]/10">
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Date & Time</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Customer ID</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Location</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Status</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]/5">
                {pickups.length > 0 ? pickups.map(pickup => (
                  <tr key={pickup.id} className="hover:bg-[#E4E3E0]/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#141414]/5 text-[#141414]/70 flex items-center justify-center">
                          <Calendar size={18} />
                        </div>
                        <div>
                          <p className="font-medium text-[#141414]">
                            {format(new Date(pickup.date), 'MMM d, yyyy')}
                          </p>
                          <p className="text-xs text-[#141414]/50 font-mono">
                            {format(new Date(pickup.date), 'h:mm a')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-[#141414]/70 bg-[#141414]/5 px-2 py-1 rounded">
                        {pickup.userId.substring(0, 8)}...
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-[#141414]/70">
                        <MapPin size={14} className="text-[#141414]/40" />
                        <span className="truncate max-w-[200px]">{pickup.binLocation || 'Curbside'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                        pickup.status === 'completed' ? 'bg-green-100 text-green-700' :
                        pickup.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {pickup.status === 'completed' && <CheckCircle2 size={12} />}
                        {pickup.status === 'scheduled' && <Clock size={12} />}
                        {pickup.status === 'cancelled' && <XCircle size={12} />}
                        {pickup.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {pickup.status === 'scheduled' && (
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleStatusChange(pickup.id, 'completed')}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Mark Completed"
                          >
                            <CheckCircle2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleStatusChange(pickup.id, 'cancelled')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Cancel Pickup"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[#141414]/50 font-mono">
                      No pickups found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#141414]/10 overflow-hidden">
          <div className="divide-y divide-[#141414]/5">
            {serviceRequests.length > 0 ? serviceRequests.map(req => (
              <div key={req.id} className="p-6 flex items-start gap-4 hover:bg-[#E4E3E0]/20 transition-colors">
                <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <p className="font-medium text-[#141414]">Service Request from User: <span className="font-mono text-sm">{req.userId.substring(0,8)}</span></p>
                    <span className="text-xs text-[#141414]/50 font-mono">{format(new Date(req.date), 'MMM d, h:mm a')}</span>
                  </div>
                  <p className="text-sm text-[#141414]/70 mt-2 bg-[#E4E3E0]/30 p-3 rounded-lg border border-[#141414]/5">
                    {req.content}
                  </p>
                  <div className="mt-4 flex gap-3">
                    <button className="text-sm font-medium text-[#6b8e6b] hover:underline flex items-center gap-1">
                      <MessageSquare size={14} /> Reply
                    </button>
                    <button 
                      onClick={() => handleResolveRequest(req.id)}
                      className="text-sm font-medium text-[#141414]/50 hover:text-[#141414] hover:underline flex items-center gap-1"
                    >
                      <CheckCircle2 size={14} /> Mark Resolved
                    </button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-[#141414]/50 font-mono">
                No active service requests.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
