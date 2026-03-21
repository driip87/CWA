import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Calendar, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export default function UserPickups() {
  const { user, userData } = useAuth();
  const [pickups, setPickups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPickups = async () => {
      if (!user || !userData) return;
      try {
        const pickupsRef = collection(db, 'pickups');
        const qPickups = query(pickupsRef, where('userId', '==', userData.id), orderBy('date', 'desc'));
        const pickupsSnap = await getDocs(qPickups);
        setPickups(pickupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching pickups", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPickups();
  }, [user, userData]);

  if (loading) return <div className="text-gray-500">Loading pickups...</div>;

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Pickups</h1>
        <p className="text-gray-500 mt-2">View your scheduled and past waste collection services.</p>
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {pickups.length > 0 ? pickups.map(pickup => (
            <div key={pickup.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  pickup.status === 'completed' ? 'bg-green-100 text-green-600' : 
                  pickup.status === 'scheduled' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                }`}>
                  {pickup.status === 'completed' ? <CheckCircle2 size={24} /> : 
                   pickup.status === 'scheduled' ? <Calendar size={24} /> : <AlertCircle size={24} />}
                </div>
                <div>
                  <p className="font-bold text-gray-900 capitalize">{pickup.status} Pickup</p>
                  <p className="text-sm text-gray-500">{format(new Date(pickup.date), 'MMMM d, yyyy - h:mm a')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <MapPin size={16} />
                {pickup.binLocation || 'Curbside'}
              </div>
            </div>
          )) : (
            <div className="p-12 text-center text-gray-500">No pickups found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
