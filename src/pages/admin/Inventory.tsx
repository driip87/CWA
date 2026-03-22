import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Box, Truck, Wrench, Search, Plus, MapPin, UserCheck, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '../../shared/unified';

export default function AdminInventory() {
  const { userData } = useAuth();
  const currentTenantId = userData?.tenantId || DEFAULT_TENANT_ID;
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newItem, setNewItem] = useState({ type: 'bin', status: 'active', location: '', coordinates: '', assignedTo: '' });
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetchInventory();
    fetchUsers();
  }, [currentTenantId]);

  const fetchUsers = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      setUsers(
        usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((user: any) => (user.tenantId || DEFAULT_TENANT_ID) === currentTenantId),
      );
    } catch (error) {
      console.error("Error fetching users", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const q = query(collection(db, 'inventory'), orderBy('lastUpdated', 'desc'));
      const querySnapshot = await getDocs(q);
      setInventory(
        querySnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((item: any) => (item.tenantId || DEFAULT_TENANT_ID) === currentTenantId),
      );
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
        tenantId: userData?.tenantId || DEFAULT_TENANT_ID,
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

  if (loading) return <div className="cw-empty font-mono">Loading inventory...</div>;

  return (
    <div className="cw-page relative">
      <div className="cw-page-header">
        <div>
          <p className="cw-kicker">Assets</p>
          <h1 className="cw-page-title mt-3">Asset Tracking & Allocation</h1>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--cw-ink-soft)]/55" size={18} />
            <input 
              type="text" 
              placeholder="Search assets..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="cw-input cw-input-icon w-64"
            />
          </div>
          <button onClick={() => setShowModal(true)} className="cw-btn cw-btn-primary">
            <Plus size={18} /> Add Asset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="cw-card p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[color:var(--cw-ink-soft)] uppercase tracking-wider">Total Bins</p>
            <p className="text-2xl font-serif italic mt-1">{inventory.filter(i => i.type === 'bin').length}</p>
          </div>
          <div className="cw-icon-chip">
            <Box size={24} />
          </div>
        </div>
        <div className="cw-card p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[color:var(--cw-ink-soft)] uppercase tracking-wider">Active Vehicles</p>
            <p className="text-2xl font-serif italic mt-1">{inventory.filter(i => i.type === 'vehicle' && i.status === 'active').length}</p>
          </div>
          <div className="cw-icon-chip cw-icon-chip-accent">
            <Truck size={24} />
          </div>
        </div>
        <div className="cw-card p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[color:var(--cw-ink-soft)] uppercase tracking-wider">In Maintenance</p>
            <p className="text-2xl font-serif italic mt-1">{inventory.filter(i => i.status === 'maintenance').length}</p>
          </div>
          <div className="cw-icon-chip text-[#8f6d38] bg-[rgba(176,137,77,0.12)]">
            <Wrench size={24} />
          </div>
        </div>
      </div>

      <div className="cw-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[rgba(236,233,223,0.58)] border-b border-[color:var(--cw-line)]">
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Asset ID</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Type</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Status</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Location & Coordinates</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Assignment</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(45,45,32,0.06)]">
              {filteredInventory.length > 0 ? filteredInventory.map(item => (
                <tr key={item.id} className="hover:bg-[rgba(236,233,223,0.32)] transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono text-[var(--cw-ink)] bg-[rgba(45,45,32,0.05)] px-2 py-1 rounded">
                      {item.id.substring(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[var(--cw-ink)]">
                      {item.type === 'bin' && <Box size={16} className="text-[var(--cw-primary)]" />}
                      {item.type === 'vehicle' && <Truck size={16} className="text-[var(--cw-accent)]" />}
                      {item.type === 'equipment' && <Wrench size={16} className="text-[#8f6d38]" />}
                      <span className="capitalize font-medium">{item.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      className={`text-xs font-medium uppercase tracking-wider rounded-full px-2.5 py-1 border-none focus:ring-2 focus:ring-[rgba(107,142,107,0.25)] ${
                        item.status === 'active' ? 'bg-[rgba(107,142,107,0.16)] text-[#557455]' :
                        item.status === 'maintenance' ? 'bg-[rgba(176,137,77,0.12)] text-[#8f6d38]' : 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]'
                      }`}
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="retired">Retired</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-[color:var(--cw-ink-soft)] flex flex-col gap-1">
                      <div className="flex items-center gap-1"><MapPin size={14} className="text-[color:var(--cw-ink-soft)]/55" /> <span className="font-medium text-[var(--cw-ink)]">{item.location || 'Warehouse A'}</span></div>
                      {item.coordinates && <div className="text-xs font-mono text-[color:var(--cw-ink-soft)] ml-5">{item.coordinates}</div>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {item.assignedTo ? (
                      <div className="flex items-center gap-1.5 text-sm text-[color:var(--cw-ink-soft)]">
                        <UserCheck size={14} className="text-[var(--cw-accent)]" />
                        <span className="font-medium">{users.find(u => u.id === item.assignedTo)?.name || item.assignedTo}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-[color:var(--cw-ink-soft)] italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-[color:var(--cw-ink-soft)] font-mono">
                    {format(new Date(item.lastUpdated), 'MMM d, h:mm a')}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 cw-empty font-mono">
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
          <div className="cw-card p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-serif italic text-[var(--cw-ink)]">Add New Asset</h2>
              <button onClick={() => setShowModal(false)} className="text-[color:var(--cw-ink-soft)] hover:text-[var(--cw-ink)]"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddAsset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Asset Type</label>
                <select 
                  value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})}
                  className="cw-select"
                >
                  <option value="bin">Bin</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="equipment">Equipment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Location Name</label>
                <input 
                  type="text" required value={newItem.location} onChange={e => setNewItem({...newItem, location: e.target.value})}
                  className="cw-input"
                  placeholder="e.g. North Route, Warehouse B"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">GPS Coordinates (Optional)</label>
                <input 
                  type="text" value={newItem.coordinates} onChange={e => setNewItem({...newItem, coordinates: e.target.value})}
                  className="cw-input font-mono text-sm"
                  placeholder="e.g. 34.0522, -118.2437"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--cw-ink-soft)] mb-1">Assign To (Optional)</label>
                <select 
                  value={newItem.assignedTo} 
                  onChange={e => setNewItem({...newItem, assignedTo: e.target.value})}
                  className="cw-select text-sm"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="cw-btn cw-btn-secondary flex-1">Cancel</button>
                <button type="submit" className="cw-btn cw-btn-primary flex-1">Save Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
