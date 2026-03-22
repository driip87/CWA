import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { Mail, MapPin, Phone, Search, ShieldAlert, UserRoundCheck } from 'lucide-react';
import { db } from '../../lib/firebase';
import { apiAuthedGet, apiAuthedPost } from '../../lib/api';
import { normalizeAddress, normalizeEmail, normalizePhone, type ClaimStatus } from '../../shared/customer';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '../../shared/unified';

const statusStyles: Record<string, string> = {
  not_invited: 'bg-[rgba(45,45,32,0.06)] text-[color:var(--cw-ink-soft)]',
  invited: 'bg-[rgba(90,90,64,0.1)] text-[var(--cw-primary)]',
  pending_verification: 'bg-[rgba(90,90,64,0.14)] text-[var(--cw-primary)]',
  claimed: 'bg-[rgba(107,142,107,0.16)] text-[#557455]',
  expired: 'bg-[rgba(176,137,77,0.12)] text-[#8f6d38]',
  revoked: 'bg-[rgba(45,45,32,0.1)] text-[color:var(--cw-ink-soft)]',
  needs_review: 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]',
  conflict: 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]',
  missing_email: 'bg-[rgba(45,45,32,0.06)] text-[color:var(--cw-ink-soft)]',
};

interface CustomerRecord {
  id: string;
  legacyCustomerId: string | null;
  displayName: string;
  email: string;
  phone: string;
  address: string;
  claimStatus: ClaimStatus | null;
  plan: string;
  collectionDay: string;
  linkedAuthUid: string | null;
  pendingLinkedAuthUid: string | null;
  sourceLabel: string;
  outstandingBalance: number;
  paymentStatus: string;
}

function canSendInvite(customer: CustomerRecord) {
  const status = (customer.claimStatus || 'not_invited') as ClaimStatus;
  return Boolean(customer.email) && !customer.linkedAuthUid && ['not_invited', 'invited', 'expired', 'revoked', 'pending_verification'].includes(status);
}

function canMergeCustomer(customer: CustomerRecord) {
  return !customer.linkedAuthUid && !customer.pendingLinkedAuthUid;
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
      const payload = await apiAuthedGet<{ customers: CustomerRecord[] }>('/api/admin/domain/customers');
      setCustomers(payload.customers);

      if (selectedCustomer) {
        const refreshed = payload.customers.find((customer) => customer.id === selectedCustomer.id) || null;
        setSelectedCustomer(refreshed);
      }
    } catch (error) {
      console.error('Error fetching customers', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomers();
  }, []);

  const handleAddNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer?.legacyCustomerId || !noteContent.trim() || !userData) return;

    try {
      await addDoc(collection(db, 'interactions'), {
        tenantId: userData.tenantId || DEFAULT_TENANT_ID,
        userId: selectedCustomer.legacyCustomerId,
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
    if (!selectedCustomer?.legacyCustomerId) return;
    try {
      await updateDoc(doc(db, 'users', selectedCustomer.legacyCustomerId), {
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
    if (!customer?.legacyCustomerId) return;
    try {
      const invite = await apiAuthedPost<{ claimLink: string }>(`/api/admin/customers/${customer.legacyCustomerId}/resend-invite`);
      await navigator.clipboard.writeText(invite.claimLink);
      setActionMessage('Invite resent and fresh claim link copied to clipboard.');
      await fetchCustomers();
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to resend invite.');
    }
  };

  const handleRevokeInvite = async (customer = selectedCustomer) => {
    if (!customer?.legacyCustomerId) return;
    try {
      await apiAuthedPost(`/api/admin/customers/${customer.legacyCustomerId}/revoke-invite`);
      setActionMessage('Invite revoked.');
      await fetchCustomers();
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to revoke invite.');
    }
  };

  const handleResolveStandalone = async () => {
    if (!selectedCustomer?.legacyCustomerId) return;
    try {
      await apiAuthedPost(`/api/admin/customers/${selectedCustomer.legacyCustomerId}/resolve`, { mode: 'standalone' });
      setActionMessage('Customer moved back into standalone invite flow.');
      await fetchCustomers();
    } catch (error: any) {
      setActionMessage(error.message || 'Unable to resolve customer.');
    }
  };

  const handleMergeIntoTarget = async () => {
    if (!selectedCustomer?.legacyCustomerId || !targetCustomerId) return;
    try {
      const target = customers.find((customer) => customer.id === targetCustomerId);
      await apiAuthedPost(`/api/admin/customers/${selectedCustomer.legacyCustomerId}/resolve`, {
        mode: 'link_existing',
        targetCustomerId: target?.legacyCustomerId || targetCustomerId,
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
      customer.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : customer.claimStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const candidateCustomers = useMemo(() => {
    if (!selectedCustomer) return [];

    const selectedEmail = normalizeEmail(selectedCustomer.email);
    const selectedPhone = normalizePhone(selectedCustomer.phone);
    const selectedAddress = normalizeAddress(selectedCustomer.address);

    return customers.filter((customer) => {
      if (customer.id === selectedCustomer.id) return false;

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
      name: customer.displayName || '',
      phone: customer.phone || '',
      address: customer.address || '',
    });
  };

  if (loading) return <div className="cw-empty font-mono">Loading customers...</div>;

  return (
    <div className="cw-page relative">
      <div className="cw-page-header">
        <div>
          <p className="cw-kicker">Customers</p>
          <h1 className="cw-page-title mt-3">Customer Directory</h1>
          <p className="cw-page-copy">Manage customer profiles, service details, claims, and billing visibility from one workspace.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | ClaimStatus)}
            className="cw-select"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--cw-ink-soft)]/55" size={18} />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="cw-input cw-input-icon w-72"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.9fr] gap-6">
        <div className="cw-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[rgba(236,233,223,0.58)] border-b border-[color:var(--cw-line)]">
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Customer</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Contact</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Service</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Claim Status</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(45,45,32,0.06)]">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-[rgba(236,233,223,0.32)] transition-colors cursor-pointer" onClick={() => openProfile(customer)}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-[var(--cw-ink)]">{customer.displayName}</p>
                          <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-2">{customer.sourceLabel}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-[color:var(--cw-ink-soft)]">{customer.email || 'No email'}</p>
                        <p className="text-xs text-[color:var(--cw-ink-soft)] mt-1">{customer.phone || 'No phone'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-[color:var(--cw-ink-soft)]">{customer.address || 'No address'}</p>
                        <p className="text-xs text-[color:var(--cw-ink-soft)] mt-1">
                          {customer.collectionDay || 'Unscheduled'} • {customer.plan || 'No plan'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[customer.claimStatus || 'not_invited'] || 'bg-slate-100 text-slate-700'}`}>
                          {customer.claimStatus || 'not_invited'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-[var(--cw-ink)]">${customer.outstandingBalance.toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 cw-empty font-mono">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cw-card p-6">
          {selectedCustomer ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-serif italic text-[var(--cw-ink)]">{selectedCustomer.displayName}</h2>
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-2">{selectedCustomer.sourceLabel}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[selectedCustomer.claimStatus || 'not_invited'] || 'bg-slate-100 text-slate-700'}`}>
                    {selectedCustomer.claimStatus || 'not_invited'}
                  </span>
                </div>
                {actionMessage && <div className="mt-4 cw-alert cw-alert-info">{actionMessage}</div>}
              </div>

              <div className="space-y-3 text-sm text-[color:var(--cw-ink-soft)]">
                <div className="flex items-start gap-2">
                  <Mail size={16} className="mt-0.5 text-[color:var(--cw-ink-soft)]" />
                  <span>{selectedCustomer.email || 'No email on file'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Phone size={16} className="mt-0.5 text-[color:var(--cw-ink-soft)]" />
                  <span>{selectedCustomer.phone || 'No phone on file'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="mt-0.5 text-[color:var(--cw-ink-soft)]" />
                  <span>{selectedCustomer.address || 'No service address on file'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldAlert size={16} className="mt-0.5 text-[color:var(--cw-ink-soft)]" />
                  <span>
                    {selectedCustomer.collectionDay || 'Unscheduled'} collection • {selectedCustomer.plan || 'No plan'} • $
                    {selectedCustomer.outstandingBalance.toFixed(2)} outstanding
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {canSendInvite(selectedCustomer) && (
                  <button
                    onClick={() => void handleResendInvite()}
                    className="cw-btn cw-btn-primary"
                  >
                    Send Invite
                  </button>
                )}
                {selectedCustomer.claimStatus === 'invited' && (
                  <button
                    onClick={() => void handleRevokeInvite()}
                    className="cw-btn cw-btn-secondary"
                  >
                    Revoke Invite
                  </button>
                )}
                {selectedCustomer.claimStatus === 'needs_review' && (
                  <button
                    onClick={() => void handleResolveStandalone()}
                    className="cw-btn cw-btn-secondary"
                  >
                    Return to Standalone
                  </button>
                )}
                <button
                  onClick={() => setIsEditing((current) => !current)}
                  className="cw-btn cw-btn-secondary"
                >
                  {isEditing ? 'Close Editor' : 'Edit Legacy Profile'}
                </button>
              </div>

              {isEditing && (
                <div className="space-y-3 border-t border-[color:var(--cw-line)] pt-5">
                  <input
                    value={editData.name}
                    onChange={(event) => setEditData((current) => ({ ...current, name: event.target.value }))}
                    className="cw-input"
                    placeholder="Customer name"
                  />
                  <input
                    value={editData.phone}
                    onChange={(event) => setEditData((current) => ({ ...current, phone: event.target.value }))}
                    className="cw-input"
                    placeholder="Phone number"
                  />
                  <textarea
                    value={editData.address}
                    onChange={(event) => setEditData((current) => ({ ...current, address: event.target.value }))}
                    className="cw-textarea"
                    rows={3}
                    placeholder="Service address"
                  />
                  <button
                    onClick={() => void handleSaveProfile()}
                    className="cw-btn cw-btn-primary w-full"
                  >
                    Save Profile
                  </button>
                </div>
              )}

              {canMergeCustomer(selectedCustomer) && candidateCustomers.length > 0 && (
                <div className="space-y-3 border-t border-[color:var(--cw-line)] pt-5">
                  <div className="flex items-center gap-2">
                    <UserRoundCheck size={16} className="text-[var(--cw-accent)]" />
                    <p className="text-sm font-medium text-[var(--cw-ink)]">Resolve possible duplicates</p>
                  </div>
                  <select
                    value={targetCustomerId}
                    onChange={(event) => setTargetCustomerId(event.target.value)}
                    className="cw-select"
                  >
                    <option value="">Select merge target</option>
                    {candidateCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.displayName} • {customer.email || customer.address}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void handleMergeIntoTarget()}
                    disabled={!targetCustomerId}
                    className="cw-btn cw-btn-secondary w-full disabled:opacity-50"
                  >
                    Merge Into Selected Profile
                  </button>
                </div>
              )}

              <form onSubmit={handleAddNote} className="space-y-3 border-t border-[color:var(--cw-line)] pt-5">
                <p className="text-sm font-medium text-[var(--cw-ink)]">Internal note</p>
                <textarea
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  className="cw-textarea"
                  rows={4}
                  placeholder="Add a support note..."
                />
                <button className="cw-btn cw-btn-primary w-full">Save Note</button>
              </form>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center cw-empty font-mono">
              Select a customer to view unified profile details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
