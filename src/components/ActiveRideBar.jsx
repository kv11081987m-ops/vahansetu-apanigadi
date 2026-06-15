
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, ChevronRight, Clock } from 'lucide-react';

const ActiveRideBar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeRide, setActiveRide] = useState(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'ride_requests'),
      where('userId', '==', user.uid),
      limit(20)
    );

    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    const activeStatuses = new Set(['pending', 'accepted', 'started', 'completed', 'payment_done', 'awaiting_confirmation']);

    const unsub = onSnapshot(q, (snapshot) => {
      const ride = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => activeStatuses.has(d.status) && (d.createdAt?.toMillis() || 0) >= twelveHoursAgo)
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))[0] || null;
      setActiveRide(ride);
    });

    return () => unsub();
  }, [user]);

  // Don't show if on the Home/Map page already (to avoid duplication)
  if (location.pathname === '/home' || !activeRide) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        onClick={() => navigate('/home')}
        className="fixed bottom-20 left-4 right-4 z-[1000] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between cursor-pointer border border-white/10 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center animate-pulse">
            <Navigation size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black opacity-50 uppercase tracking-widest">
              {activeRide.status === 'pending' ? 'Driver Dhoondh Rahe Hain' :
               activeRide.status === 'accepted' ? 'Driver Assigned' :
               activeRide.status === 'started' ? 'Ride in Progress' :
               activeRide.status === 'completed' ? 'Payment Pending' : 'Active Ride'}
            </p>
            <h3 className="text-sm font-black">Track Live Trip</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl">
          <Clock size={14} className="text-blue-400" />
          <span className="text-xs font-black">Active</span>
          <ChevronRight size={16} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ActiveRideBar;
