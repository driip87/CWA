import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where, addDoc, doc, updateDoc } from 'firebase/firestore';
import { Search, MoreVertical, Mail, Phone, MapPin, Edit, MessageSquare, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminCustomers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '', address: '' });
  const [noteContent, setNoteContent] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'user'));
      const querySnapshot = await getDocs(q);
      setCustomers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching customers", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !noteContent.trim() || !user) return;
    
    try {
      await addDoc(collection(db, 'interactions'), {
        userId: selectedCustomer.id,
        type: 'note',
        content: noteContent,
        date: new Date().toISOString(),
        authorId: user.uid
      });
      setNoteContent('');
      alert('Note added successfully');
    } catch (error) {
      console.error("Error adding note", error);
    }
  };

  const handleEditClick = () => {
    setEditData({
      name: selectedCustomer.name || '',
      phone: selectedCustomer.phone || '',
      address: selectedCustomer.address || ''
    });
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!selectedCustomer) return;
    try {
      await updateDoc(doc(db, 'users', selectedCustomer.id), {
        name: editData.name,
        phone: editData.phone,
        address: editData.address
      });
      
      // Update local state
      const updatedCustomer = { ...selectedCustomer, ...editData };
      setSelectedCustomer(updatedCustomer);
      setCustomers(customers.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
      setIsEditing(false);
      alert('Profile updated successfully');
    } catch (error) {
      console.error("Error updating profile", error);
      alert('Failed to update profile');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="text-[#141414]/50 font-mono">Loading customers...</div>;

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-serif italic text-[#141414]">Customer Directory</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/40" size={18} />
          <input 
            type="text" 
            placeholder="Search customers..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 bg-white border border-[#141414]/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b8e6b] w-64"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#141414]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E4E3E0]/50 border-b border-[#141414]/10">
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Customer</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Contact</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Address</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Joined</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {filteredCustomers.length > 0 ? filteredCustomers.map(customer => (
                <tr key={customer.id} className="hover:bg-[#E4E3E0]/20 transition-colors group cursor-pointer" onClick={() => setSelectedCustomer(customer)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#6b8e6b]/10 text-[#6b8e6b] flex items-center justify-center font-bold">
                        {customer.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <p className="font-medium text-[#141414]">{customer.name || 'Unnamed User'}</p>
                        <p className="text-xs text-[#141414]/50 font-mono">{customer.id.substring(0, 8)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-[#141414]/70">
                        <Mail size={14} className="text-[#141414]/40" />
                        {customer.email}
                      </div>
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-[#141414]/70">
                          <Phone size={14} className="text-[#141414]/40" />
                          {customer.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-[#141414]/70">
                      <MapPin size={14} className="text-[#141414]/40" />
                      <span className="truncate max-w-[200px]">{customer.address || 'No address provided'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#141414]/70 font-mono">
                    {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-[#141414]/40 hover:text-[#141414] hover:bg-[#141414]/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <Edit size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#141414]/50 font-mono">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
          <div className="bg-[#E4E3E0] w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-white">
              <h2 className="text-xl font-serif italic text-[#141414]">Customer Profile</h2>
              <button onClick={() => { setSelectedCustomer(null); setIsEditing(false); }} className="p-2 hover:bg-[#141414]/5 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-[#6b8e6b]/10 text-[#6b8e6b] flex items-center justify-center font-bold text-2xl mb-4">
                  {selectedCustomer.name?.charAt(0) || 'U'}
                </div>
                
                {isEditing ? (
                  <div className="space-y-3 text-left mt-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                      <input 
                        type="text" 
                        value={editData.name}
                        onChange={(e) => setEditData({...editData, name: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6b8e6b] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                      <input 
                        type="text" 
                        value={editData.phone}
                        onChange={(e) => setEditData({...editData, phone: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6b8e6b] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                      <textarea 
                        value={editData.address}
                        onChange={(e) => setEditData({...editData, address: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6b8e6b] outline-none"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={() => setIsEditing(false)}
                        className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSaveProfile}
                        className="flex-1 py-2 bg-[#6b8e6b] text-white rounded-lg text-sm font-medium hover:bg-[#5a7a5a] transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-[#141414]">{selectedCustomer.name}</h3>
                    <p className="text-sm text-[#141414]/50 font-mono mt-1">{selectedCustomer.email}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button 
                        onClick={handleEditClick}
                        className="px-4 py-2 bg-[#141414]/5 hover:bg-[#141414]/10 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Edit size={14} /> Edit Profile
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 space-y-4">
                <h4 className="font-medium text-[#141414] border-b border-[#141414]/10 pb-2">Contact Details</h4>
                <div className="flex items-center gap-3 text-sm text-[#141414]/70">
                  <Phone size={16} className="text-[#141414]/40" /> {selectedCustomer.phone || 'N/A'}
                </div>
                <div className="flex items-center gap-3 text-sm text-[#141414]/70">
                  <MapPin size={16} className="text-[#141414]/40" /> {selectedCustomer.address || 'N/A'}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
                <h4 className="font-medium text-[#141414] border-b border-[#141414]/10 pb-2 mb-4 flex items-center gap-2">
                  <MessageSquare size={16} /> Add Interaction Note
                </h4>
                <form onSubmit={handleAddNote} className="space-y-3">
                  <textarea 
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Log a call, email, or internal note..."
                    className="w-full border border-[#141414]/20 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#6b8e6b] outline-none min-h-[100px]"
                    required
                  />
                  <button type="submit" className="w-full py-2 bg-[#6b8e6b] text-[#141414] rounded-lg font-medium hover:bg-[#5a7a5a] transition-colors">
                    Save Note
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
