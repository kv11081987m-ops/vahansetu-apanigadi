import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';

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

    if (userProfile.role === 'driver') {
      // Firestore only allows one `in` clause per query, so split into two simple listeners.
      let rideDataFromOwn = null;
      let rideDataFromBroadcast = null;
      let nullClearTimeout = null;

      const mergeAndSet = () => {
        const rideData = rideDataFromOwn || rideDataFromBroadcast;
        const isTerminal = !rideData || !rideData.status ||
          ['paid', 'cancelled', 'rejected', 'finished'].includes(rideData.status);

        if (isTerminal) {
          // Debounce the null clear by 400ms to absorb the Q1/Q2 race condition that
          // occurs when a driver accepts a ride: Q2 loses the doc first (driverId changes
          // from 'broadcast' → driver uid) and briefly makes rideData null before Q1
          // fires with the newly-accepted ride under driverId == user.uid.
          clearTimeout(nullClearTimeout);
          nullClearTimeout = setTimeout(() => {
            setActiveRide(null);
            localStorage.removeItem('activeRideId');
          }, 400);
          return;
        }

        // We have a live ride — cancel any pending null clear and surface it immediately
        clearTimeout(nullClearTimeout);
        setActiveRide(rideData);
      };

      // Q1: Driver's own accepted/active rides (no composite index needed)
      const q1 = query(
        collection(db, 'ride_requests'),
        where('driverId', '==', user.uid),
        limit(20)
      );
      const unsub1 = onSnapshot(q1, (snapshot) => {
        const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const activeStatuses = ['accepted', 'started', 'completed', 'payment_done', 'paid'];
        const rides = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => {
            if (!activeStatuses.includes(d.status)) return false;
            const createdAt = d.createdAt?.toMillis() || 0;
            if (['payment_done', 'paid', 'completed'].includes(d.status)) return createdAt >= twoHoursAgo;
            return createdAt >= twelveHoursAgo;
          })
          .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        rideDataFromOwn = rides[0] || null;
        mergeAndSet();
        setLoading(false);
      }, (err) => console.error('[RideContext] driver own-ride listener error:', err));

      // Q2: Single equality filter — guaranteed no composite index needed.
      // limit(50) caps query size; client-side time filter discards stale docs.
      const q2 = query(
        collection(db, 'ride_requests'),
        where('driverId', '==', 'broadcast'),
        limit(50)
      );
      // includeMetadataChanges: true lets us detect and skip stale offline-cache snapshots.
      // Without this, Firestore fires first with cached data (showing old cancelled rides as
      // still-pending), then fires again with server data (correcting to 0 pending). This
      // causes the brief "pending: 1 → 0" false positive that stops the driver card from showing.
      const unsub2 = onSnapshot(q2, { includeMetadataChanges: true }, (snapshot) => {
        setLoading(false);
        if (snapshot.metadata.fromCache) return; // skip stale cache — only trust server data

        const allDocs = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data({ serverTimestamps: 'estimate' }) // estimate pending server timestamps
        }));
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const broadcasts = allDocs
          .filter(d => d.status === 'pending'
            && (d.createdAt?.toMillis?.() || 0) >= twoHoursAgo
            && !d.rejectedBy?.[user.uid]  // hide rides this driver already rejected
          )
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        rideDataFromBroadcast = broadcasts[0] || null;
        mergeAndSet();
      }, (err) => console.error('[RideContext] driver broadcast listener error:', err));

      return () => { unsub1(); unsub2(); clearTimeout(nullClearTimeout); };
    }

    // Passenger query — single equality clause, client-side filtering avoids composite index.
    // limit(100) reduces the chance of missing an active ride for heavy users.
    const q = query(
      collection(db, 'ride_requests'),
      where('userId', '==', user.uid),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
        const docs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => {
            const validStatuses = ['pending', 'accepted', 'started', 'completed', 'payment_done', 'emergency'];
            if (!d.status || !validStatuses.includes(d.status)) return false;
            const createdAt = d.createdAt?.toMillis() || 0;
            if (d.status === 'pending' && createdAt < thirtyMinAgo) return false;
            if (['completed', 'payment_done'].includes(d.status) && createdAt < twoHoursAgo) return false;
            if (['accepted', 'started'].includes(d.status) && createdAt < fourHoursAgo) return false;
            return true;
          });

        docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        const rideData = docs[0] || null;

        // payment_done is NOT terminal for passenger — rating screen still needs activeRide
        const isTerminal = ['paid', 'cancelled', 'rejected', 'finished'].includes(rideData?.status);
        if (!rideData || !rideData.status || isTerminal) {
          setActiveRide(null);
          localStorage.removeItem('activeRideId');
        } else {
          setActiveRide(rideData);
        }
      } else {
        setActiveRide(null);
      }
      setLoading(false);
    }, (err) => console.error('[RideContext] passenger listener error:', err));

    return () => unsub();
  }, [user, userProfile]);

  return (
    <RideContext.Provider value={{ activeRide, loading, setActiveRide }}>
      {children}
    </RideContext.Provider>
  );
};
