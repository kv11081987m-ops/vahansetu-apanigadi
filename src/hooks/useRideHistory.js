import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

const TERMINAL_STATUSES = ['paid', 'payment_done', 'finished', 'cancelled', 'rejected', 'completed'];

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' • '
    + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function statusMeta(status) {
  switch (status) {
    case 'paid':
    case 'payment_done':
    case 'finished':    return { label: 'Completed', color: 'text-emerald-600 bg-emerald-50' };
    case 'cancelled':   return { label: 'Cancelled',  color: 'text-red-500 bg-red-50' };
    case 'rejected':    return { label: 'Rejected',   color: 'text-orange-500 bg-orange-50' };
    case 'completed':   return { label: 'Awaiting Payment', color: 'text-amber-600 bg-amber-50' };
    default:            return { label: status,        color: 'text-slate-500 bg-slate-100' };
  }
}

/**
 * Fetches past rides for a customer or driver.
 * Avoids composite Firestore indexes by sorting client-side.
 *
 * @param {{ userId?: string, driverId?: string, pageSize?: number }}
 */
export function useRideHistory({ userId, driverId, pageSize = 25 }) {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = userId || driverId;
    if (!id) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    const fetchRides = async () => {
      try {
        const field = userId ? 'userId' : 'driverId';
        const q = query(collection(db, 'ride_requests'), where(field, '==', id), limit(50));
        const snap = await getDocs(q);

        if (cancelled) return;

        const all = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => TERMINAL_STATUSES.includes(r.status))
          // For driver: exclude rides they only saw as broadcast (never accepted)
          .filter(r => !(driverId && r.driverId === 'broadcast'))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          })
          .slice(0, pageSize);

        setRides(all);
      } catch (err) {
        console.error('[useRideHistory]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRides();
    return () => { cancelled = true; };
  }, [userId, driverId]);

  return { rides, loading, formatDate, statusMeta };
}
