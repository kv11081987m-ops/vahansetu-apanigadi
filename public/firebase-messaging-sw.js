importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Firebase config is public-safe — must be hardcoded in SW (no Vite env here)
firebase.initializeApp({
  apiKey: "AIzaSyC1zTOQ06aO06wNm64UAgFZAJd-nYakGDc",
  authDomain: "vahansetuapnigadi.firebaseapp.com",
  projectId: "vahansetuapnigadi",
  storageBucket: "vahansetuapnigadi.firebasestorage.app",
  messagingSenderId: "1073439434541",
  appId: "1:1073439434541:web:1e5f2c44d1d904f37915a4"
});

const messaging = firebase.messaging();

// Background message handler — fires when app is minimized or closed
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'VahanSetu';
  const body  = payload.notification?.body  || 'Naya ride request hai!';

  self.registration.showNotification(title, {
    body,
    icon:    '/pwa-192x192.png',
    badge:   '/pwa-192x192.png',
    tag:     payload.data?.rideId || 'ride-request',
    data:    payload.data || {},
    vibrate: [500, 200, 500, 200, 500],
    requireInteraction: true,
    silent:  false
  });
});

// Tapping the notification opens the driver dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find(c => c.url.includes('/dashboard') && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow('/dashboard');
    })
  );
});
