import React, { useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { MapPin, Phone, Save, Trash2, Upload, User } from 'lucide-react';
import UserAvatar from '../../components/ui/UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { deleteUserProfileImage, getUserProfileImagePath, uploadUserProfileImage } from '../../lib/storage';
import { normalizeAddress, normalizePhone } from '../../shared/customer';

export default function UserSettings() {
  const { profileImageUrl, refreshProfileImage, user, userData } = useAuth();
  const [name, setName] = useState(userData?.name || '');
  const [phone, setPhone] = useState(userData?.phone || '');
  const [address, setAddress] = useState(userData?.address || '');
  const [currentProfileImageUrl, setCurrentProfileImageUrl] = useState(profileImageUrl || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(userData?.name || '');
    setPhone(userData?.phone || '');
    setAddress(userData?.address || '');
  }, [userData]);

  useEffect(() => {
    setCurrentProfileImageUrl(profileImageUrl || '');
  }, [profileImageUrl]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !userData) return;

    setSaving(true);
    setMessage('');
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        name,
        phone,
        address,
        normalizedPhone: normalizePhone(phone),
        normalizedAddress: normalizeAddress(address),
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

  const handleUploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user || !userData) return;

    setUploadingPhoto(true);
    setMessage('');
    try {
      const uploaded = await uploadUserProfileImage(user.uid, file);
      const latestUrl = await refreshProfileImage();
      setCurrentProfileImageUrl(latestUrl || uploaded.url);
      setMessage('Profile photo updated successfully!');
    } catch (error: any) {
      console.error('Error uploading profile photo:', error);
      setMessage(error?.message || 'Failed to upload profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user || !userData) return;

    setUploadingPhoto(true);
    setMessage('');
    try {
      const currentPath = getUserProfileImagePath(user.uid);
      try {
        await deleteUserProfileImage(currentPath);
      } catch (error: any) {
        if (error?.code !== 'storage/object-not-found') {
          throw error;
        }
      }

      await refreshProfileImage();
      setCurrentProfileImageUrl('');
      setMessage('Profile photo removed.');
    } catch (error) {
      console.error('Error removing profile photo:', error);
      setMessage('Failed to remove profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="cw-page max-w-2xl">
      <header>
        <p className="cw-kicker">Profile</p>
        <h1 className="cw-page-title mt-3">Account Settings</h1>
        <p className="cw-page-copy">Update your personal information and contact details.</p>
      </header>

      <div className="cw-card p-8">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-[#f7f7f3] p-5 flex flex-col sm:flex-row sm:items-center gap-5">
            <UserAvatar
              name={userData?.name || name}
              imageUrl={currentProfileImageUrl}
              sizeClassName="w-20 h-20"
              textClassName="text-xl"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Profile photo</h2>
              <p className="text-sm text-gray-500 mt-1">Upload a square image up to 5 MB. JPG, PNG, GIF, and WebP all work.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadPhoto}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="cw-btn cw-btn-primary"
              >
                <Upload size={18} />
                {uploadingPhoto ? 'Uploading...' : currentProfileImageUrl ? 'Replace Photo' : 'Upload Photo'}
              </button>
              {currentProfileImageUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={uploadingPhoto}
                  className="cw-btn cw-btn-secondary"
                >
                  <Trash2 size={18} />
                  Remove
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <User size={20} />
              </div>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="cw-input cw-input-icon"
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
                onChange={(event) => setPhone(event.target.value)}
                className="cw-input cw-input-icon"
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
                onChange={(event) => setAddress(event.target.value)}
                className="cw-input cw-input-icon"
                placeholder="123 Main St, City, State"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <p className={`text-sm font-medium ${message.includes('success') || message.includes('removed') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </p>
            <button
              type="submit"
              disabled={saving}
              className="cw-btn cw-btn-primary"
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
