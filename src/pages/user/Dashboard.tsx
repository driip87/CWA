import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Calendar, CreditCard, Truck, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';

export default function UserDashboard() {
  const { user, userData } = useAuth();
  const [recentPickups, setRecentPickups] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestContent, setRequestContent] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;
      try {
        // Handle Stripe success callback
        const paymentSuccess = searchParams.get('payment_success');
        const paymentId = searchParams.get('payment_id');
        
        if (paymentSuccess === 'true' && paymentId) {
          await updateDoc(doc(db, 'payments', paymentId), { status: 'paid' });
          alert('Payment successful! Thank you.');
          setSearchParams({}); // clear params
        }

        const pickupsRef = collection(db, 'pickups');
        const qPickups = query(pickupsRef, where('userId', '==', user.uid), orderBy('date', 'desc'), limit(3));
        const pickupsSnap = await getDocs(qPickups);
        setRecentPickups(pickupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const paymentsRef = collection(db, 'payments');
        const qPayments = query(paymentsRef, where('userId', '==', user.uid), orderBy('date', 'desc'));
        const paymentsSnap = await getDocs(qPayments);
        const allPayments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        setRecentPayments(allPayments.slice(0, 3));
        
        const pendingBalance = allPayments
          .filter(p => p.status === 'pending')
          .reduce((sum, p) => sum + p.amount, 0);
        
        setBalance(pendingBalance);

      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, searchParams]);

  const handlePayBalance = async () => {
    if (!user || balance <= 0) return;
    try {
      // Create a pending payment record if one doesn't exist, or just use the balance
      // For simplicity, we'll create a new consolidated payment record to pass to Stripe
      const paymentRef = await addDoc(collection(db, 'payments'), {
        userId: user.uid,
        amount: balance,
        status: 'pending',
        date: new Date().toISOString(),
        description: 'Balance Payment'
      });

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: balance,
          description: 'Cordova Waste Balance Payment',
          userId: user.uid,
          paymentId: paymentRef.id
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to initiate payment. Please try again later.');
    }
  };

  const handleServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !requestContent.trim()) return;
    
    setSubmittingRequest(true);
    try {
      await addDoc(collection(db, 'interactions'), {
        userId: user.uid,
        type: 'service_request',
        content: requestContent,
        date: new Date().toISOString(),
        authorId: user.uid,
        status: 'open'
      });
      setShowRequestModal(false);
      setRequestContent('');
      alert('Service request submitted successfully. We will get back to you soon.');
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loading) return <div className="text-gray-500">Loading dashboard...</div>;

  return (
    <div className="space-y-8">
      <header className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome back, {userData?.name?.split(' ')[0]}</h1>
          <p className="text-gray-500 mt-2">Here is a summary of your account and upcoming services.</p>
        </div>
        <button 
          onClick={() => setShowRequestModal(true)}
          className="px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-xl font-medium hover:bg-[#141414]/80 transition-colors"
        >
          Request Service
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Next Pickup</p>
            <p className="text-xl font-bold text-gray-900">Tomorrow, 8 AM</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600">
              <CreditCard size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Current Balance</p>
              <p className="text-xl font-bold text-gray-900">${balance.toFixed(2)}</p>
            </div>
          </div>
          {balance > 0 && (
            <button 
              onClick={handlePayBalance}
              className="w-full py-2 bg-[#6b8e6b] text-white rounded-xl font-medium hover:bg-[#5a7a5a] transition-colors flex items-center justify-center gap-2"
            >
              Pay Now <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-600">
            <Truck size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Pickups</p>
            <p className="text-xl font-bold text-gray-900">24 this year</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900">Recent Pickups</h2>
            <Link to="/dashboard/pickups" className="text-sm font-medium text-[#6b8e6b] hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentPickups.length > 0 ? recentPickups.map(pickup => (
              <div key={pickup.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    pickup.status === 'completed' ? 'bg-green-100 text-green-600' : 
                    pickup.status === 'scheduled' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {pickup.status === 'completed' ? <CheckCircle2 size={20} /> : 
                     pickup.status === 'scheduled' ? <Calendar size={20} /> : <AlertCircle size={20} />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 capitalize">{pickup.status} Pickup</p>
                    <p className="text-sm text-gray-500">{format(new Date(pickup.date), 'MMM d, yyyy')}</p>
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-500">
                  {pickup.binLocation || 'Curbside'}
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-gray-500">No recent pickups found.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900">Recent Payments</h2>
            <Link to="/dashboard/payments" className="text-sm font-medium text-[#6b8e6b] hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentPayments.length > 0 ? recentPayments.map(payment => (
              <div key={payment.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    payment.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{payment.description}</p>
                    <p className="text-sm text-gray-500">{format(new Date(payment.date), 'MMM d, yyyy')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">${payment.amount.toFixed(2)}</p>
                  <p className={`text-xs font-medium uppercase tracking-wider ${
                    payment.status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                  }`}>{payment.status}</p>
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-gray-500">No recent payments found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Service Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Request Service</h2>
              <button 
                onClick={() => setShowRequestModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <AlertCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleServiceRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">How can we help you?</label>
                <textarea 
                  required
                  value={requestContent}
                  onChange={(e) => setRequestContent(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#6b8e6b] focus:border-transparent min-h-[120px]"
                  placeholder="Describe your request (e.g., missed pickup, extra bin needed, special disposal)..."
                />
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submittingRequest}
                  className="px-4 py-2 bg-[#6b8e6b] text-white rounded-lg font-medium hover:bg-[#5a7a5a] transition-colors disabled:opacity-50"
                >
                  {submittingRequest ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
