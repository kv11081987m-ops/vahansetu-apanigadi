import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { messaging, db } from '../services/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Requests notification permission, fetches FCM token, saves it to
 * {collectionName}/{id}.fcmToken, and sets up a foreground message handler.
 *
 * @param {string|null} id                  - Firestore doc ID
 * @param {function}    onForegroundMessage - called with FCM payload when app is open
 * @param {string}      collectionName      - Firestore collection ('drivers' or 'users')
 */
export function useFCM(id, onForegroundMessage, collectionName = 'drivers') {
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!id || !messaging || !VAPID_KEY) return;

    let cancelled = false;

    const init = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted' || cancelled) return;

        // Register FCM SW separately — Vite PWA has its own workbox SW
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg
        });

        if (!token || cancelled) return;

        await updateDoc(doc(db, collectionName, id), { fcmToken: token });

        // Foreground message handler
        unsubRef.current = onMessage(messaging, (payload) => {
          if (onForegroundMessage) onForegroundMessage(payload);
        });
      } catch (err) {
        console.warn('[FCM] init error:', err.message);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
    };
  }, [id, collectionName]);
}
