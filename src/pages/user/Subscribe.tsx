import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Check, ShieldAlert } from 'lucide-react';

export default function Subscribe() {
  const { user, userData } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [processingSuccess, setProcessingSuccess] = useState(false);

  useEffect(() => {
    const handleSuccess = async () => {
      const success = searchParams.get('subscription_success');
      const planName = searchParams.get('plan') || 'Monthly Subscription';
      const amount = Number(searchParams.get('amount')) || 0;

      if (success === 'true' && user && !processingSuccess) {
        setProcessingSuccess(true);
        try {
          // Update user status
          await updateDoc(doc(db, 'users', user.uid), { subscriptionStatus: 'active' });
          
          // Record the payment in the payments collection
          if (amount > 0) {
            await addDoc(collection(db, 'payments'), {
              userId: user.uid,
              amount: amount,
              status: 'paid',
              date: new Date().toISOString(),
              description: `${planName} Subscription`
            });
          }

          // Schedule first pickup
          const nextPickupDate = new Date();
          nextPickupDate.setDate(nextPickupDate.getDate() + 3);
          
          await addDoc(collection(db, 'pickups'), {
            userId: user.uid,
            date: nextPickupDate.toISOString(),
            status: 'scheduled',
            binLocation: 'Curbside',
            type: 'Standard Waste'
          });

          // The AuthContext onSnapshot will pick up the change and redirect to dashboard
        } catch (error) {
          console.error("Error activating subscription:", error);
          alert("There was an issue activating your account. Please contact support.");
        }
      }
    };
    handleSuccess();
  }, [searchParams, user, processingSuccess]);

  const handleSubscribe = async (planName: string, amount: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/create-subscription-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName,
          amount,
          userId: user.uid,
          returnUrl: window.location.origin + `/subscribe?plan=${encodeURIComponent(planName)}&amount=${amount}`
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to initiate subscription. Please try again.');
      setLoading(false);
    }
  };

  const handleRestoreAdmin = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: 'admin',
        subscriptionStatus: 'active'
      });
    } catch (error) {
      console.error('Error restoring admin:', error);
    }
  };

  if (processingSuccess) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#6b8e6b] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-900">Activating your account...</h2>
          <p className="text-gray-500 mt-2">Setting up your collection schedule.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center relative">
      {userData?.email === 'kereeonmiller@gmail.com' && (
        <button 
          onClick={handleRestoreAdmin}
          className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors shadow-lg"
        >
          <ShieldAlert size={18} />
          Restore Admin Access
        </button>
      )}
      
      <div className="max-w-7xl mx-auto w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose Your Collection Plan</h1>
          <p className="text-xl text-gray-600">Select a subscription plan to activate your waste collection service.</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-center">
          {/* Plan 1 */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 flex flex-col h-full">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Standard Residential</h3>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-4xl font-extrabold text-gray-900">$35</span>
              <span className="text-gray-500">/month</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3 text-gray-700"><Check className="text-[#6b8e6b]" size={20}/> Weekly Curbside Pickup</li>
              <li className="flex items-center gap-3 text-gray-700"><Check className="text-[#6b8e6b]" size={20}/> 1x 96-Gallon Trash Bin</li>
              <li className="flex items-center gap-3 text-gray-700"><Check className="text-[#6b8e6b]" size={20}/> 1x 64-Gallon Recycle Bin</li>
            </ul>
            <button 
              onClick={() => handleSubscribe('Standard Residential', 35)} 
              disabled={loading} 
              className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#141414]/80 transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Subscribe Now'}
            </button>
          </div>

          {/* Plan 2 */}
          <div className="bg-[#6b8e6b] rounded-3xl shadow-xl border border-[#5a7a5a] p-8 flex flex-col relative transform md:-translate-y-4 h-[105%]">
            <div className="absolute top-0 right-8 transform -translate-y-1/2">
              <span className="bg-[#141414] text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">Most Popular</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Premium Household</h3>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-4xl font-extrabold text-white">$55</span>
              <span className="text-white/80">/month</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3 text-white"><Check className="text-white" size={20}/> Weekly Curbside Pickup</li>
              <li className="flex items-center gap-3 text-white"><Check className="text-white" size={20}/> 2x 96-Gallon Trash Bins</li>
              <li className="flex items-center gap-3 text-white"><Check className="text-white" size={20}/> 2x 64-Gallon Recycle Bins</li>
              <li className="flex items-center gap-3 text-white"><Check className="text-white" size={20}/> Priority Customer Support</li>
            </ul>
            <button 
              onClick={() => handleSubscribe('Premium Household', 55)} 
              disabled={loading} 
              className="w-full py-4 bg-white text-[#6b8e6b] rounded-xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Subscribe Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
