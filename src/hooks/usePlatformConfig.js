import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { FARE_DEFAULTS } from '../utils/fareEngine';

const PLATFORM_DEFAULTS = {
  ...FARE_DEFAULTS,
  commissionPercent: 8,
  seatPreReleaseMins: 2,
  driverSearchRadiusKm: 3,
  minRideDistanceKm: 0.1,
  appStatus: 'active',
  maintenanceMessage: '',
  upiId: '',
  grievancePhone: '7529938896',
  grievanceEmail: 'apnigadivahansetu@gmail.com',
  referralReferrerReward: 20,   // referrer ko milega (first ride pe)
  referralRefereeReward: 25,    // naye user ko milega (first ride pe)
  referralCreditUsagePercent: 50, // ek ride mein max 50% balance use
  cancelPenaltyThreshold: 3,   // kitni free cancellations per day
  cancelPenaltyAmount: 10,     // penalty per cancel uske baad (₹)
  rideAcceptTimeoutSecs: 30,   // driver ke paas kitne seconds hain ride accept karne ke liye
  bannerEnabled: false,
  bannerText: '',
  bannerColor: 'orange',
};

export function usePlatformConfig() {
  const [config, setConfig] = useState(PLATFORM_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'platform'), (snap) => {
      if (snap.exists()) {
        setConfig({ ...PLATFORM_DEFAULTS, ...snap.data() });
      }
      setLoading(false);
    }, (err) => {
      console.error('[usePlatformConfig] config read failed:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { config, loading };
}
