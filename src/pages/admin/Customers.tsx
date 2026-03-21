import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, updateDoc, where, doc } from 'firebase/firestore';
import { Edit, Mail, MapPin, Phone, Search, ShieldAlert, UserRoundCheck, X } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../lib/firebase';
import { apiAuthedPost } from '../../lib/api';
import { normalizeAddress, normalizeEmail, normalizePhone, type ClaimStatus } from '../../shared/customer';
import { useAuth } from '../../contexts/AuthContext';

const statusStyles: Record<ClaimStatus, string> = {
  not_invited: 'bg-slate-100 text-slate-700',
  invited: 'bg-blue-100 text-blue-700',
  pending_verification: 'bg-violet-100 text-violet-700',
  claimed: 'bg-green-100 text-green-700',
  expired: 'bg-amber-100 text-amber-700',
  revoked: 'bg-neutral-200 text-neutral-700',
  needs_review: 'bg-red-100 text-red-700',
  conflict: 'bg-red-100 text-red-700',
  missing_email: 'bg-zinc-100 text-zinc-700',
};

type CustomerRecord = any;

function canSendInvite(customer: CustomerRecord) {
  const status = (customer.claimStatus || 'not_invited') as ClaimStatus;
  return (
    Boolean(customer.email) &&
    !customer.linkedAuthUid &&
    !customer.pendingLinkedAuthUid &&
    ['not_invited', 'invited', 'expired', 'revoked'].includes(status)
  );
}

export default function AdminCustomers() {
  const { userData } = useAuth();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClaimStatus>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '', address: '' });
  const [noteContent, setNoteContent] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [targetCustomerId, setTargetCustomerId] = useState('');

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'user')));
      const records = snapshot.docs
        .map((customerDoc) => ({ id: customerDoc.id, ...customerDoc.data() }))
        .filter((customer: CustomerRecord) => customer.recordStatus !== 'archived');
      setCustomers(records);

      if (selectedCustomer) {
        const refreshed = records.find((customer: CustomerRecord) => customer.id === selectedCustomer.id) || null;
        setSelectedCustomer(refreshed);
      }
    } catch (error) {
      console.error('Error fetching customers', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer || !noteContent.trim() || !userData) return;

    try {
      await addDoc(collection(db, 'interactions'), {
        userId: selectedCustomer.id,
        type: 'note',
        content: noteContent,
        date: new Date().toISOString(),
        authorId: userData.id,
      });
      setNoteContent('');
      setActionMessage('Note added successfully.');
    } catch (error) {
      console.error('Error adding note', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!selectedCustomer) return;
    try {
      await updateDoc(doc(db, 'users', selectedCustomer.id), {
        name: editData.name,
        phone: editData.phone,
        address: editData.address,
        normalizedPhone: normalizePhone(editData.phone),
        normalizedAddress: normalizeAddress(editData.address),
      });
      setIsEditing(false);
      setActionMessage('Profile updated successfully.');
      await fetchCustomers();
    } catch (error) {
      console.error('Error updating profile', error);
      setActionMessage('Failed to update profile.');
    }
  };

  const handleResendInvite = async (customer = selectedCustomer) => {
    if (!customer) return;
    try {
      const invite = await apiAuthedPost<{ claimLink: string }>('/api/admin/customers/' + customer.id + '/resend-invite');
      await navigator.clipboard.writeText(invite.claimLink);
      setActionMessage('Invite resent and fresh claim link copied to clipboard.');
      await fetchCustomers();
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to resend invite.');
    }
  };

  const handleRevokeInvite = async (customer = selectedCustomer) => {
    if (!customer) return;
    try {
      await apiAuthedPost('/api/admin/customers/' + customer.id + '/revoke-invite');
      setActionMessage('Invite revoked.');
      await fetchCustomers();
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to revoke invite.');
    }
  };

  const handleResolveStandalone = async () => {
    if (!selectedCustomer) return;
    try {
      await apiAuthedPost('/api/admin/customers/' + selectedCustomer.id + '/resolve', { mode: 'standalone' });
      setActionMessage('Customer moved back into standalone invite flow.');
      await fetchCustomers();
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to resolve customer.');
    }
  };

  const handleMergeIntoTarget = async () => {
    if (!selectedCustomer || !targetCustomerId) return;
    try {
      await apiAuthedPost('/api/admin/customers/' + selectedCustomer.id + '/resolve', {
        mode: 'link_existing',
        targetCustomerId,
      });
      setTargetCustomerId('');
      setActionMessage('Customer merged into the selected operational profile.');
      await fetchCustomers();
      setSelectedCustomer(null);
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to merge customer.');
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.address?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : customer.claimStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const candidateCustomers = useMemo(() => {
    if (!selectedCustomer) return [];

    const selectedEmail = normalizeEmail(selectedCustomer.email);
    const selectedPhone = normalizePhone(selectedCustomer.phone);
    const selectedAddress = normalizeAddress(selectedCustomer.address);

    return customers.filter((customer) => {
      if (customer.id === selectedCustomer.id || customer.recordStatus === 'archived') return false;

      const sameEmail = selectedEmail && normalizeEmail(customer.email) === selectedEmail;
      const samePhoneAndAddress =
        selectedPhone &&
        selectedAddress &&
        normalizePhone(customer.phone) === selectedPhone &&
        normalizeAddress(customer.address) === selectedAddress;

      return sameEmail || samePhoneAndAddress;
    });
  }, [customers, selectedCustomer]);

  const openProfile = (customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setIsEditing(false);
    setActionMessage('');
    setEditData({
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
    });
  };

  if (loading) return <div className="text-[#141414]/50 font-mono">Loading customers...</div>;

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif italic text-[#141414]">Customer Directory</h1>
          <p className="text-sm text-[#141414]/60 mt-1">Support can now track invite and claim state directly on imported customer records.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | ClaimStatus)}
            className="px-3 py-2 bg-white border border-[#141414]/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b8e6b]"
          >
            <option value="all">All statuses</option>
            <option value="invited">Invited</option>
            <option value="pending_verification">Pending verification</option>
            <option value="claimed">Claimed</option>
            <option value="needs_review">Needs review</option>
            <option value="missing_email">Missing email</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="conflict">Conflict</option>
            <option value="not_invited">Not invited</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/40" size={18} />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-[#141414]/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b8e6b] w-72"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#141414]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E4E3E0]/50 border-b border-[#141414]/10">
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Customer</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Contact</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Imported</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Claim Status</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50">Invite</th>
                <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[#141414]/50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-[#E4E3E0]/20 transition-colors group cursor-pointer" onClick={() => openProfile(customer)}>
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
                      <div className="space-y-1 text-sm text-[#141414]/70">
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-[#141414]/40" />
                          {customer.email || 'No email'}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-[#141414]/40" />
                          {customer.phone || 'No phone'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#141414]/70">
                      <p>{customer.imported ? 'Legacy import' : 'App-created'}</p>
                      <p className="text-xs text-[#141414]/50">{customer.importSource || 'direct'} {customer.importBatchId ? `• ${customer.importBatchId.slice(0, 8)}` : ''}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[customer.claimStatus || 'not_invited']}`}>
                        {customer.claimStatus || 'not_invited'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#141414]/70">
                      {customer.latestInviteSentAt ? (
                        <>
                          <p>{format(new Date(customer.latestInviteSentAt), 'MMM d, yyyy')}</p>
                          <p className="text-xs text-[#141414]/50">Expires {customer.latestInviteExpiresAt ? format(new Date(customer.latestInviteExpiresAt), 'MMM d') : 'n/a'}</p>
                        </>
                      ) : (
                        <span className="text-[#141414]/40">No invite</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {canSendInvite(customer) && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCustomer(customer);
                              void handleResendInvite(customer);
                            }}
                            className="text-[#6b8e6b] hover:text-[#5a7a5a] font-medium text-xs px-2 py-1 rounded border border-[#6b8e6b]/30 hover:bg-[#6b8e6b]/10 transition-colors"
                          >
                            Invite
                          </button>
                        )}
                        <button className="p-2 text-[#141414]/40 hover:text-[#141414] hover:bg-[#141414]/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          <Edit size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#141414]/50 font-mono">
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
          <div className="bg-[#E4E3E0] w-full max-w-xl h-full shadow-2xl flex flex-col">
            <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-white">
              <div>
                <h2 className="text-xl font-serif italic text-[#141414]">Customer Profile</h2>
                <p className="text-xs text-[#141414]/50 mt-1">Claim status: {selectedCustomer.claimStatus || 'not_invited'}</p>
              </div>
              <button onClick={() => { setSelectedCustomer(null); setIsEditing(false); }} className="p-2 hover:bg-[#141414]/5 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {actionMessage && <div className="p-3 rounded-xl bg-white border border-[#141414]/10 text-sm text-[#141414]/70">{actionMessage}</div>}

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-[#6b8e6b]/10 text-[#6b8e6b] flex items-center justify-center font-bold text-2xl mb-4">
                  {selectedCustomer.name?.charAt(0) || 'U'}
                </div>

                {isEditing ? (
                  <div className="space-y-3 text-left mt-4">
                    <input value={editData.name} onChange={(event) => setEditData({ ...editData, name: event.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <input value={editData.phone} onChange={(event) => setEditData({ ...editData, phone: event.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <textarea value={editData.address} onChange={(event) => setEditData({ ...editData, address: event.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} />
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                        Cancel
                      </button>
                      <button onClick={handleSaveProfile} className="flex-1 py-2 bg-[#6b8e6b] text-white rounded-lg text-sm font-medium">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-[#141414]">{selectedCustomer.name || 'Unnamed User'}</h3>
                    <p className="text-sm text-[#141414]/50 font-mono mt-1">{selectedCustomer.email || 'No email address'}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-[#141414]/5 hover:bg-[#141414]/10 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                        <Edit size={14} /> Edit Profile
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 space-y-4">
                <h4 className="font-medium text-[#141414] border-b border-[#141414]/10 pb-2">Claim & Import State</h4>
                <div className="grid grid-cols-2 gap-3 text-sm text-[#141414]/70">
                  <p><span className="font-medium text-[#141414]">Imported:</span> {selectedCustomer.imported ? 'Yes' : 'No'}</p>
                  <p><span className="font-medium text-[#141414]">Linked Auth UID:</span> {selectedCustomer.linkedAuthUid ? selectedCustomer.linkedAuthUid.slice(0, 8) : 'None'}</p>
                  <p><span className="font-medium text-[#141414]">Pending Auth UID:</span> {selectedCustomer.pendingLinkedAuthUid ? selectedCustomer.pendingLinkedAuthUid.slice(0, 8) : 'None'}</p>
                  <p><span className="font-medium text-[#141414]">Plan:</span> {selectedCustomer.plan || 'None'}</p>
                  <p><span className="font-medium text-[#141414]">Collection Day:</span> {selectedCustomer.collectionDay || 'None'}</p>
                  <p><span className="font-medium text-[#141414]">Invite Count:</span> {selectedCustomer.latestInviteResendCount || 0}</p>
                  <p><span className="font-medium text-[#141414]">Last Invite:</span> {selectedCustomer.latestInviteSentAt ? format(new Date(selectedCustomer.latestInviteSentAt), 'MMM d, yyyy h:mm a') : 'Never'}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {canSendInvite(selectedCustomer) && (
                    <button onClick={handleResendInvite} className="px-3 py-2 bg-[#6b8e6b] text-white rounded-lg text-sm font-medium">
                      Resend Invite
                    </button>
                  )}
                  {selectedCustomer.latestInviteId && !selectedCustomer.linkedAuthUid && !selectedCustomer.pendingLinkedAuthUid && (
                    <button onClick={handleRevokeInvite} className="px-3 py-2 bg-white border border-[#141414]/10 rounded-lg text-sm font-medium">
                      Revoke Invite
                    </button>
                  )}
                  {(selectedCustomer.claimStatus === 'needs_review' || selectedCustomer.claimStatus === 'conflict' || selectedCustomer.claimStatus === 'missing_email') && (
                    <button onClick={handleResolveStandalone} className="px-3 py-2 bg-white border border-[#141414]/10 rounded-lg text-sm font-medium flex items-center gap-2">
                      <ShieldAlert size={14} /> Use as Standalone Customer
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 space-y-3">
                <h4 className="font-medium text-[#141414] border-b border-[#141414]/10 pb-2">Contact Details</h4>
                <div className="flex items-center gap-3 text-sm text-[#141414]/70">
                  <Phone size={16} className="text-[#141414]/40" /> {selectedCustomer.phone || 'N/A'}
                </div>
                <div className="flex items-center gap-3 text-sm text-[#141414]/70">
                  <MapPin size={16} className="text-[#141414]/40" /> {selectedCustomer.address || 'N/A'}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10 space-y-4">
                <h4 className="font-medium text-[#141414] border-b border-[#141414]/10 pb-2 flex items-center gap-2">
                  <UserRoundCheck size={16} /> Resolve Matching / Conflict
                </h4>
                <p className="text-sm text-[#141414]/60">
                  Use this when the import pipeline flagged a duplicate or needs-review record and support wants to merge it into an existing operational profile.
                </p>
                {selectedCustomer.claimStatus === 'pending_verification' && (
                  <p className="text-sm text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                    This customer already has an account reserved and is waiting on email verification. Invite and merge actions stay disabled until that completes.
                  </p>
                )}
                <select
                  value={targetCustomerId}
                  onChange={(event) => setTargetCustomerId(event.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  disabled={selectedCustomer.claimStatus === 'pending_verification'}
                >
                  <option value="">Select an existing customer</option>
                  {candidateCustomers.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name || candidate.email} • {candidate.email || 'No email'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleMergeIntoTarget}
                  disabled={!targetCustomerId || selectedCustomer.claimStatus === 'pending_verification'}
                  className="w-full py-2 bg-[#141414] text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Merge Into Selected Customer
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-[#141414]/10">
                <h4 className="font-medium text-[#141414] border-b border-[#141414]/10 pb-2 mb-4">Add Interaction Note</h4>
                <form onSubmit={handleAddNote} className="space-y-3">
                  <textarea
                    value={noteContent}
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="Log a call, email, or internal note..."
                    className="w-full border border-[#141414]/20 rounded-lg p-3 text-sm min-h-[100px]"
                    required
                  />
                  <button type="submit" className="w-full py-2 bg-[#6b8e6b] text-[#141414] rounded-lg font-medium">
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
