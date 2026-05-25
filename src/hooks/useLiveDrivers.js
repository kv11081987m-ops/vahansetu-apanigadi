import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

export const useLiveDrivers = (category, enabled = true) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    // Map internal UI categories to Firestore vehicle types as per user request
    const vehicleType = category === 'savaari' ? 'battery_rickshaw' : 'chhota_hathi';
    
    const q = query(
      collection(db, 'drivers'),
      where('vehicleType', '==', vehicleType),
      where('isOnline', '==', true),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {

      const driversList = snapshot.docs.map(doc => {
        const data = doc.data();
        const loc = data.location || data.Location; // Support both cases
        return {
          id: doc.id,
          ...data,
          location: loc ? {
            lat: loc.latitude || loc.lat,
            lng: loc.longitude || loc.lng
          } : null
        };
      });
      
      setDrivers(driversList);
      setLoading(false);
    }, (err) => {
      console.error('Firestore Error:', err.code);
      setLoading(false);
    });

    return () => unsub();
  }, [category, enabled]);

  return { drivers, loading };
};
