import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { apiAuthedGet } from '../../lib/api';

interface PickupRecord {
  id: string;
  status: string;
  scheduledFor: string;
  binLocation: string;
  address: string;
}

export default function UserPickups() {
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const payload = await apiAuthedGet<{ pickups: PickupRecord[] }>('/api/user/domain/pickups');
        setPickups(payload.pickups);
      } catch (error) {
        console.error('Error fetching pickups', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) return <div className="cw-empty">Loading pickups...</div>;

  return (
    <div className="cw-page">
      <header>
        <p className="cw-kicker">Service Schedule</p>
        <h1 className="cw-page-title mt-3">My Pickups</h1>
        <p className="cw-page-copy">Your schedule stays current from the service calendar connected to your account.</p>
      </header>

      <div className="cw-card overflow-hidden">
        <div className="divide-y divide-[rgba(45,45,32,0.06)]">
          {pickups.length > 0 ? (
            pickups.map((pickup) => (
              <div key={pickup.id} className="p-6 flex items-center justify-between hover:bg-[rgba(236,233,223,0.32)] transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${pickup.status === 'completed' ? 'bg-[rgba(107,142,107,0.16)] text-[#557455]' : pickup.status === 'scheduled' ? 'bg-[rgba(90,90,64,0.1)] text-[var(--cw-primary)]' : 'bg-[rgba(182,73,73,0.12)] text-[var(--cw-danger)]'}`}>
                    {pickup.status === 'completed' ? <CheckCircle2 size={24} /> : pickup.status === 'scheduled' ? <Calendar size={24} /> : <AlertCircle size={24} />}
                  </div>
                  <div>
                    <p className="font-bold text-[var(--cw-ink)] capitalize">{pickup.status} Pickup</p>
                    <p className="text-sm text-[color:var(--cw-ink-soft)]">{format(new Date(pickup.scheduledFor), 'MMMM d, yyyy - h:mm a')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--cw-ink-soft)] bg-[rgba(236,233,223,0.58)] px-3 py-1.5 rounded-full">
                    <MapPin size={16} />
                    {pickup.binLocation || 'Curbside'}
                  </div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--cw-accent)] font-semibold mt-3">Live Schedule</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 cw-empty">No pickups found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
