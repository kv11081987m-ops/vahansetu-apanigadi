import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, getDoc, orderBy, limit } from 'firebase/firestore';

const RideContext = createContext();

export const useRide = () => useContext(RideContext);

export const RideProvider = ({ children }) => {
  const { user, userProfile } = useAuth();
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !userProfile) {
      setActiveRide(null);
      setLoading(false);
      return;
    }

    // Driver uses 6-hour limit so page refresh recovers accepted/started/completed rides; Passenger uses 24-hour limit
    const driverTimeLimit = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const passengerTimeLimit = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Query based on role
    const q = userProfile.role === 'driver' 
      ? query(
          collection(db, 'ride_requests'),
          where('driverId', 'in', [user.uid, 'broadcast']),
          where('status', 'in', ['pending', 'accepted', 'started', 'completed', 'payment_done', 'paid']),
          where('createdAt', '>=', Timestamp.fromDate(driverTimeLimit)),
          orderBy('createdAt', 'desc'),
          limit(10)
        )
      : query(
          collection(db, 'ride_requests'),
          where('userId', '==', user.uid)
        );

    const unsub = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        let rideData = null;
        if (userProfile.role === 'driver') {
          const ownRide = snapshot.docs.find(d =>
            d.data().driverId === user.uid &&
            ['pending', 'accepted', 'started', 'completed', 'payment_done', 'paid'].includes(d.data().status)
          );
          const broadcastRide = snapshot.docs.find(d =>
            d.data().driverId === 'broadcast' &&
            d.data().status === 'pending'
          );
          const rideDoc = ownRide || broadcastRide;
          if (rideDoc) rideData = { id: rideDoc.id, ...rideDoc.data() };
        } else {
          // Passenger: client-side filter to avoid composite index requirements
          const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
          const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
          const docs = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => {
              const validStatuses = ['pending', 'accepted', 'started', 'completed', 'payment_done', 'emergency'];
              if (!d.status || !validStatuses.includes(d.status)) return false;
              const createdAt = d.createdAt?.toMillis() || 0;
              // Ghost ride guards
              if (d.status === 'pending' && createdAt < thirtyMinAgo) return false;
              if (['completed', 'payment_done'].includes(d.status) && createdAt < twoHoursAgo) return false;
              if (['accepted', 'started'].includes(d.status) && createdAt < fourHoursAgo) return false;
              return true;
            });

          docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
          if (docs[0]) rideData = docs[0];
        }

        // For drivers, keep completed/payment_done visible so they can confirm payment after refresh
        const isTerminal = userProfile.role === 'driver'
          ? ['paid', 'cancelled', 'rejected', 'finished'].includes(rideData?.status)
          : ['paid', 'payment_done', 'cancelled', 'rejected', 'finished'].includes(rideData?.status);

        if (!rideData || !rideData.status || isTerminal) {
          setActiveRide(null);
          localStorage.removeItem('activeRideId');
          return;
        }

        setActiveRide(rideData);
      } else {
        setActiveRide(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user, userProfile]);

  return (
    <RideContext.Provider value={{ activeRide, loading, setActiveRide }}>
      {children}
    </RideContext.Provider>
  );
};
