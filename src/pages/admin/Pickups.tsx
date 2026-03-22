import React, { useEffect, useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { AlertCircle, Calendar, CheckCircle2, Clock, MapPin, MessageSquare, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../lib/firebase';
import { apiAuthedGet } from '../../lib/api';

interface PickupView {
  id: string;
  customerName: string;
  occurredAt: string;
  notes: string;
  status: string;
  sourceLabel: string;
}

interface ExceptionView {
  id: string;
  customerName: string;
  occurredAt: string;
  description: string;
  status: string;
  exceptionType: string;
}

interface ServiceRequest {
  id: string;
  userId: string;
  content: string;
  date: string;
  status: string;
}

export default function AdminPickups() {
  const [events, setEvents] = useState<PickupView[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionView[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pickups' | 'requests'>('pickups');

  const load = async () => {
    setLoading(true);
    try {
      const payload = await apiAuthedGet<{ events: PickupView[]; exceptions: ExceptionView[]; serviceRequests: ServiceRequest[] }>(
        '/api/admin/domain/pickups',
      );
      setEvents(payload.events);
      setExceptions(payload.exceptions);
      setServiceRequests(payload.serviceRequests);
    } catch (error) {
      console.error('Error fetching service monitoring data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleResolveRequest = async (interactionId: string) => {
    try {
      await updateDoc(doc(db, 'interactions', interactionId), { status: 'resolved' });
      await load();
    } catch (error) {
      console.error('Error resolving request', error);
    }
  };

  if (loading) {
    return <div className="cw-empty font-mono">Loading data...</div>;
  }

  const openRequests = serviceRequests.filter((request) => request.status !== 'resolved');

  return (
    <div className="cw-page">
      <div className="cw-page-header">
        <div>
          <p className="cw-kicker">Service</p>
          <h1 className="cw-page-title mt-3">Activity & Service Monitoring</h1>
          <p className="cw-page-copy">
            Track recent service activity, open exceptions, and customer requests from one operations view.
          </p>
        </div>
        <span className="cw-badge cw-badge-muted">Service Desk</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="cw-card p-5">
          <p className="text-sm uppercase tracking-wider text-[color:var(--cw-ink-soft)] font-medium">Completed Services</p>
          <p className="text-3xl font-serif italic mt-2">{events.filter((event) => event.status === 'completed').length}</p>
        </div>
        <div className="cw-card p-5">
          <p className="text-sm uppercase tracking-wider text-[color:var(--cw-ink-soft)] font-medium">Open Exceptions</p>
          <p className="text-3xl font-serif italic mt-2">{exceptions.filter((exception) => exception.status === 'open').length}</p>
        </div>
        <div className="cw-card p-5">
          <p className="text-sm uppercase tracking-wider text-[color:var(--cw-ink-soft)] font-medium">Open Service Requests</p>
          <p className="text-3xl font-serif italic mt-2">{openRequests.length}</p>
        </div>
      </div>

      <div className="flex gap-4 border-b border-[color:var(--cw-line)]">
        <button
          onClick={() => setActiveTab('pickups')}
          className={`cw-tab ${activeTab === 'pickups' ? 'cw-tab-active' : ''}`}
        >
          Service Events
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`cw-tab flex items-center gap-2 ${activeTab === 'requests' ? 'cw-tab-active' : ''}`}
        >
          Service Requests
          {openRequests.length > 0 && <span className="cw-badge cw-badge-danger !px-2.5 !py-0.5 !text-[10px]">{openRequests.length}</span>}
        </button>
      </div>

      {activeTab === 'pickups' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr,0.9fr] gap-6">
          <div className="cw-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[rgba(236,233,223,0.58)] border-b border-[color:var(--cw-line)]">
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Date & Time</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Customer</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Location</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Status</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-[color:var(--cw-ink-soft)]">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(45,45,32,0.06)]">
                  {events.length > 0 ? (
                    events.map((event) => (
                      <tr key={event.id} className="hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="cw-icon-chip">
                              <Calendar size={18} />
                            </div>
                            <div>
                              <p className="font-medium text-[var(--cw-ink)]">{format(new Date(event.occurredAt), 'MMM d, yyyy')}</p>
                              <p className="text-xs text-[color:var(--cw-ink-soft)] font-mono">{format(new Date(event.occurredAt), 'h:mm a')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-[var(--cw-ink)]">{event.customerName}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-[color:var(--cw-ink-soft)]">
                            <MapPin size={14} className="text-[color:var(--cw-ink-soft)]/55" />
                            <span>{event.notes || 'Curbside'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                              event.status === 'completed'
                                ? 'bg-[rgba(107,142,107,0.16)] text-[#557455]'
                                : event.status === 'scheduled'
                                  ? 'bg-[rgba(90,90,64,0.1)] text-[var(--cw-primary)]'
                                  : 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]'
                            }`}
                          >
                            {event.status === 'completed' && <CheckCircle2 size={12} />}
                            {event.status === 'scheduled' && <Clock size={12} />}
                            {event.status === 'cancelled' && <AlertCircle size={12} />}
                            {event.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[var(--cw-accent)]">{event.sourceLabel}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 cw-empty font-mono">
                        No service events found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cw-card overflow-hidden">
            <div className="p-5 border-b border-[color:var(--cw-line)]">
              <h2 className="cw-section-title">Open Exceptions</h2>
            </div>
            <div className="divide-y divide-[rgba(45,45,32,0.06)]">
              {exceptions.length > 0 ? (
                exceptions.map((exception) => (
                  <div key={exception.id} className="p-5 flex items-start gap-3">
                    <div className="cw-icon-chip cw-icon-chip-danger shrink-0">
                      <ShieldAlert size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-[var(--cw-ink)]">{exception.customerName}</p>
                          <p className="text-sm text-[color:var(--cw-ink-soft)] mt-1">{exception.description}</p>
                        </div>
                        <span className="text-xs font-mono text-[color:var(--cw-ink-soft)] whitespace-nowrap">{format(new Date(exception.occurredAt), 'MMM d')}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <span className="cw-badge cw-badge-danger">{exception.exceptionType}</span>
                        <span className="cw-badge cw-badge-muted">{exception.status}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 cw-empty font-mono">No active exceptions.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="cw-card overflow-hidden">
          <div className="divide-y divide-[rgba(45,45,32,0.06)]">
            {openRequests.length > 0 ? (
              openRequests.map((request) => (
                <div key={request.id} className="p-6 flex items-start gap-4 hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                  <div className="cw-icon-chip shrink-0 text-[#8f6d38] bg-[rgba(176,137,77,0.12)]">
                    <AlertCircle size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="font-medium text-[var(--cw-ink)]">
                        Service Request from User <span className="font-mono text-sm">{request.userId.substring(0, 8)}</span>
                      </p>
                      <span className="text-xs text-[color:var(--cw-ink-soft)] font-mono">{format(new Date(request.date), 'MMM d, h:mm a')}</span>
                    </div>
                    <p className="text-sm text-[color:var(--cw-ink-soft)] mt-2 bg-[rgba(236,233,223,0.45)] p-3 rounded-2xl border border-[rgba(45,45,32,0.06)]">{request.content}</p>
                    <div className="mt-4 flex gap-3">
                      <button className="text-sm font-medium text-[var(--cw-accent)] hover:underline flex items-center gap-1">
                        <MessageSquare size={14} /> Reply
                      </button>
                      <button
                        onClick={() => void handleResolveRequest(request.id)}
                        className="text-sm font-medium text-[color:var(--cw-ink-soft)] hover:text-[var(--cw-ink)] hover:underline flex items-center gap-1"
                      >
                        <CheckCircle2 size={14} /> Mark Resolved
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 cw-empty font-mono">No active service requests.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
