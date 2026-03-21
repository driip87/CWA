import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { User, Phone, MapPin, Save } from 'lucide-react';

export default function UserSettings() {
  const { user, userData } = useAuth();
  const [name, setName] = useState(userData?.name || '');
  const [phone, setPhone] = useState(userData?.phone || '');
  const [address, setAddress] = useState(userData?.address || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) return;

    setSaving(true);
    setMessage('');
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        name,
        phone,
        address
      });
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-500 mt-2">Update your personal information and contact details.</p>
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <User size={20} />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent transition-all"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <Phone size={20} />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent transition-all"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Service Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <MapPin size={20} />
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent transition-all"
                placeholder="123 Main St, City, State"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <p className={`text-sm font-medium ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </p>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-[#141414] text-white rounded-xl font-medium hover:bg-[#141414]/80 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={20} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
