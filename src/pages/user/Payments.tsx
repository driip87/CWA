import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import { CreditCard, ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';

export default function UserPayments() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const fetchPayments = async () => {
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

        const paymentsRef = collection(db, 'payments');
        const qPayments = query(paymentsRef, where('userId', '==', user.uid), orderBy('date', 'desc'));
        const paymentsSnap = await getDocs(qPayments);
        const allPayments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        setPayments(allPayments);
        
        const pendingBalance = allPayments
          .filter(p => p.status === 'pending')
          .reduce((sum, p) => sum + p.amount, 0);
        
        setBalance(pendingBalance);
      } catch (error) {
        console.error("Error fetching payments", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [user]);

  const handlePayBalance = async () => {
    if (!user || balance <= 0) return;
    try {
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
          paymentId: paymentRef.id,
          returnUrl: window.location.origin + '/dashboard/payments'
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

  if (loading) return <div className="text-gray-500">Loading payments...</div>;

  return (
    <div className="space-y-8">
      <header className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payments & Invoices</h1>
          <p className="text-gray-500 mt-2">Manage your billing, view invoices, and make payments.</p>
        </div>
        {balance > 0 && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-6">
            <div>
              <p className="text-sm font-medium text-red-600">Outstanding Balance</p>
              <p className="text-2xl font-bold text-red-700">${balance.toFixed(2)}</p>
            </div>
            <button 
              onClick={handlePayBalance}
              className="px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              Pay Now <ArrowRight size={18} />
            </button>
          </div>
        )}
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {payments.length > 0 ? payments.map(payment => (
            <div key={payment.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  payment.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                }`}>
                  {payment.status === 'paid' ? <CreditCard size={24} /> : <FileText size={24} />}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{payment.description}</p>
                  <p className="text-sm text-gray-500">{format(new Date(payment.date), 'MMMM d, yyyy')}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-gray-900">${payment.amount.toFixed(2)}</p>
                <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${
                  payment.status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                }`}>{payment.status}</p>
              </div>
            </div>
          )) : (
            <div className="p-12 text-center text-gray-500">No payment history found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
