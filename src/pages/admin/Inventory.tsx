import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Box, Truck, Wrench, Search, Plus, AlertTriangle, MapPin, UserCheck, X } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminInventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newItem, setNewItem] = useState({ type: 'bin', status: 'active', location: '', coordinates: '', assignedTo: '' });
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetchInventory();
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching users", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const q = query(collection(db, 'inventory'), orderBy('lastUpdated', 'desc'));
      const querySnapshot = await getDocs(q);
      setInventory(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching inventory", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'inventory'), {
        ...newItem,
        lastUpdated: new Date().toISOString()
      });
      setShowModal(false);
      fetchInventory();
    } catch (error) {
      console.error("Error adding asset", error);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'inventory', id), { status: newStatus, lastUpdated: new Date().toISOString() });
      fetchInventory();
    } catch (error) {
      console.error("Error updating status", error);
    }
  };

  const filteredInventory = inventory.filter(item => 
    item.type?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="text-[#141414]/50 font-mono">Loading inventory...</div>;

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-serif italic text-[#141414]">Asset Tracking & Allocation</h1>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/40" size={18} />
            <input 
              type="text" 
              placeholder="Search assets..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-[#141414]/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b8e6b] w-64"
            />
          </div>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-[#6b8e6b] text-[#141414] rounded-lg font-semibold hover:bg-[#5a7a5a] transition-colors flex items-center gap-2">
            <Plus size={18} /> Add Asset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#141414]/50 uppercase tracking-wider">Total Bins</p>
            <p className="text-2xl font-serif italic mt-1">{inventory.filter(i => i.type === 'bin').length}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
            <Box size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#141414]/50 uppercase tracking-wider">Active Vehicles</p>
            <p className="text-2xl font-serif italic mt-1">{inventory.filter(i => i.type === 'vehicle' && i.status === 'active').length}</p>
          </div>
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
            <Truck size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#141414]/50 uppercase tracking-wider">In Maintenance</p>
            <p className="text-2xl font-serif italic mt-1">{inventory.filter(i => i.status === 'maintenance').length}</p>
          </div>
          <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center">
            <Wrench size={24} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#141414]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E4E3E0]/50 border-b border-[#141414]/10">
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Asset ID</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Type</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Status</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Location & Coordinates</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Assignment</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {filteredInventory.length > 0 ? filteredInventory.map(item => (
                <tr key={item.id} className="hover:bg-[#E4E3E0]/20 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono text-[#141414] bg-[#141414]/5 px-2 py-1 rounded">
                      {item.id.substring(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[#141414]">
                      {item.type === 'bin' && <Box size={16} className="text-blue-600" />}
                      {item.type === 'vehicle' && <Truck size={16} className="text-green-600" />}
                      {item.type === 'equipment' && <Wrench size={16} className="text-purple-600" />}
                      <span className="capitalize font-medium">{item.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      className={`text-xs font-medium uppercase tracking-wider rounded-full px-2.5 py-1 border-none focus:ring-2 focus:ring-[#6b8e6b] ${
                        item.status === 'active' ? 'bg-green-100 text-green-700' :
                        item.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="retired">Retired</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-[#141414]/70 flex flex-col gap-1">
                      <div className="flex items-center gap-1"><MapPin size={14} className="text-[#141414]/40" /> <span className="font-medium text-[#141414]">{item.location || 'Warehouse A'}</span></div>
                      {item.coordinates && <div className="text-xs font-mono text-[#141414]/50 ml-5">{item.coordinates}</div>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {item.assignedTo ? (
                      <div className="flex items-center gap-1.5 text-sm text-[#141414]/70">
                        <UserCheck size={14} className="text-green-600" />
                        <span className="font-medium">{users.find(u => u.id === item.assignedTo)?.name || item.assignedTo}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#141414]/40 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-[#141414]/70 font-mono">
                    {format(new Date(item.lastUpdated), 'MMM d, h:mm a')}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#141414]/50 font-mono">
                    No inventory items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-serif italic text-[#141414]">Add New Asset</h2>
              <button onClick={() => setShowModal(false)} className="text-[#141414]/50 hover:text-[#141414]"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddAsset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#141414]/70 mb-1">Asset Type</label>
                <select 
                  value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})}
                  className="w-full border border-[#141414]/20 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#6b8e6b] outline-none"
                >
                  <option value="bin">Bin</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="equipment">Equipment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#141414]/70 mb-1">Location Name</label>
                <input 
                  type="text" required value={newItem.location} onChange={e => setNewItem({...newItem, location: e.target.value})}
                  className="w-full border border-[#141414]/20 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#6b8e6b] outline-none"
                  placeholder="e.g. North Route, Warehouse B"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#141414]/70 mb-1">GPS Coordinates (Optional)</label>
                <input 
                  type="text" value={newItem.coordinates} onChange={e => setNewItem({...newItem, coordinates: e.target.value})}
                  className="w-full border border-[#141414]/20 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#6b8e6b] outline-none font-mono text-sm"
                  placeholder="e.g. 34.0522, -118.2437"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#141414]/70 mb-1">Assign To (Optional)</label>
                <select 
                  value={newItem.assignedTo} 
                  onChange={e => setNewItem({...newItem, assignedTo: e.target.value})}
                  className="w-full border border-[#141414]/20 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#6b8e6b] outline-none text-sm"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-[#141414]/20 rounded-lg font-medium text-[#141414]/70 hover:bg-[#141414]/5">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-[#6b8e6b] rounded-lg font-medium text-[#141414] hover:bg-[#5a7a5a]">Save Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
