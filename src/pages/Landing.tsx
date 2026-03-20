import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle } from '../lib/firebase';
import { ArrowRight, Recycle, Leaf, Truck } from 'lucide-react';

export default function Landing() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  React.useEffect(() => {
    if (user && userData) {
      if (userData.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, userData, navigate]);

  return (
    <div className="min-h-screen bg-[#f5f5f0] font-sans text-gray-900 flex flex-col">
      <header className="px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 text-[#5A5A40]">
          <Recycle size={32} />
          <h1 className="text-2xl font-serif font-bold italic">Cordova Waste</h1>
        </div>
        <button 
          onClick={handleLogin}
          className="px-6 py-2.5 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4a4a35] transition-colors flex items-center gap-2"
        >
          Sign In <ArrowRight size={18} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <h2 className="text-5xl md:text-7xl font-serif font-bold text-[#2d2d20] mb-6 max-w-4xl leading-tight">
          Sustainable Waste Management for Cordova
        </h2>
        <p className="text-xl text-gray-600 mb-12 max-w-2xl">
          Manage your pickups, track your environmental impact, and streamline your payments all in one unified platform.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={handleLogin}
            className="px-8 py-4 bg-[#5A5A40] text-white rounded-full font-medium text-lg hover:bg-[#4a4a35] transition-colors shadow-lg shadow-[#5A5A40]/20 flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={20} />
          </button>
          <button className="px-8 py-4 bg-white text-[#5A5A40] border border-[#5A5A40]/20 rounded-full font-medium text-lg hover:bg-gray-50 transition-colors">
            Learn More
          </button>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto w-full text-left">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-6">
              <Leaf size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Eco-Friendly</h3>
            <p className="text-gray-600">Track your recycling efforts and see your direct impact on the environment.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-6">
              <Truck size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Reliable Pickups</h3>
            <p className="text-gray-600">Schedule, modify, and track your waste collection services in real-time.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-6">
              <Recycle size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Unified Platform</h3>
            <p className="text-gray-600">Manage billing, customer support, and service requests from a single app.</p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-gray-500 text-sm border-t border-gray-200">
        &copy; {new Date().getFullYear()} Cordova Waste. All rights reserved.
      </footer>
    </div>
  );
}
