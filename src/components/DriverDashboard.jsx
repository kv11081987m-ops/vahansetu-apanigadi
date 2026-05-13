import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  TrendingUp, 
  History, 
  FileText, 
  Award, 
  Map as MapIcon, 
  CheckCircle, 
  AlertCircle,
  IndianRupee,
  Calendar,
  Power,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  User,
  Navigation,
  X,
  Smartphone,
  ChevronRight,
  MapPin,
  Package,
  Scale,
  Star,
  Clock,
  Phone,
  Car,
  ShieldCheck,
  Bell,
  Languages,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from '../services/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, updateDoc, onSnapshot, Timestamp, setDoc, serverTimestamp, runTransaction, addDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { calculateDistance } from '../utils/geoUtils';
import { uploadToCloudinary } from '../utils/cloudinaryUtils';
import { useFCM } from '../hooks/useFCM';
import { useRideHistory } from '../hooks/useRideHistory';

import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
const containerStyle = { width: '100%', height: '100%' };
const center = { lat: 26.502, lng: 83.778 }; 
const LIBRARIES = ['places', 'geometry'];
const TEST_DRIVER_ID = ""; // Put ID here if not logged in

const DriverDashboard = () => {
  const { logout } = useAuth();
  const [stats, setStats] = useState({
    totalEarnings: 0,
    cashEarnings: 0,
    onlineEarnings: 0,
    rides: 0,
    rating: "4.8"
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isOnline, setIsOnline] = useState(false);
  const [profile, setProfile] = useState(null);
  const [newRequest, setNewRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguage] = useState('en'); 
  const [searchParams] = useSearchParams();
  const driverNameParam = searchParams.get('driverName');
  const [notifications, setNotifications] = useState([]);
  const [driverId, setDriverId] = useState(TEST_DRIVER_ID);
  const [routePath, setRoutePath] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [latestBroadcast, setLatestBroadcast] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const { rides: rideHistory, loading: historyLoading, formatDate, statusMeta } = useRideHistory(
    activeTab === 'history' && driverId ? { driverId } : {}
  );
  const [upcomingRides, setUpcomingRides] = useState([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isDriverCardMinimized, setIsDriverCardMinimized] = useState(false);
  const [toast, setToast] = useState(null);
  const prevNewRequestIdRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
    version: 'weekly'
  });

  const [map, setMap] = useState(null);
  const onMapLoad = useCallback((mapInstance) => setMap(mapInstance), []);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Reset card state and detect cancellation when newRequest changes
  useEffect(() => {
    const prevId = prevNewRequestIdRef.current;
    const currId = newRequest?.id || null;

    if (prevId && !currId) {
      // Ride was cleared — check if it was cancelled externally
      showToast('Passenger ne ride cancel kar di.', 'error');
      setIsDriverCardMinimized(false);
    }

    if (currId && currId !== prevId) {
      // New ride arrived — reset minimized state
      setIsDriverCardMinimized(false);
    }

    prevNewRequestIdRef.current = currId;
  }, [newRequest, showToast]);

  // 0. Live Location Tracking + Waiting Time Accumulation
  useEffect(() => {
    if (!driverId || !isOnline) return;

    let lastPositionTime = Date.now();

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed } = pos.coords;
        const now = Date.now();
        const elapsed = (now - lastPositionTime) / 1000; // seconds since last ping
        lastPositionTime = now;

        await updateDoc(doc(db, 'drivers', driverId), {
          location: { lat: latitude, lng: longitude },
          lastLocationUpdate: serverTimestamp()
        });

        // Track waiting time during 'started' ride
        const ride = newRequestRef.current;
        if (ride?.status === 'started') {
          const speedKmh = speed != null ? speed * 3.6 : 999;
          if (speedKmh < 5) {
            waitingSecondsRef.current += elapsed;
          }

          // Flush to Firestore every 30 seconds
          if (now - lastWaitingFlushRef.current >= 30000) {
            lastWaitingFlushRef.current = now;
            try {
              await updateDoc(doc(db, 'ride_requests', ride.id), {
                waitingSeconds: Math.round(waitingSecondsRef.current)
              });
            } catch (e) {
              console.error("Waiting flush error:", e);
            }
          }
        }
      },
      (err) => console.error("Location Error:", err),
      { enableHighAccuracy: true, distanceFilter: 10 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driverId, isOnline]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      let id = user?.uid || TEST_DRIVER_ID;
      if (id) {
        setDriverId(id);
      } else {
        const searchName = driverNameParam || 'Rajesh Kumar';
        const q = query(collection(db, 'drivers'), where('name', '==', searchName));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const foundDriver = { id: snap.docs[0].id, ...snap.docs[0].data() };
          setDriverId(foundDriver.id);
          setProfile(foundDriver);
          setIsOnline(foundDriver.isOnline || false);
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [driverNameParam]);

  useEffect(() => {
    if (!driverId) return;
    const unsub = onSnapshot(doc(db, 'drivers', driverId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        setIsOnline(data.isOnline || false);
        setStats(prev => ({
          ...prev,
          totalEarnings: data.totalEarnings || 0,
          walletBalance: data.walletBalance || 0,
          rides: data.totalRides || 0,
          rating: data.rating || "4.8"
        }));
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return;
    const fetchTransactions = async () => {
      try {
        const txQuery = query(
          collection(db, 'wallet_transactions'),
          where('driverId', '==', driverId),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        const txSnap = await getDocs(txQuery);
        const txData = txSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setWalletTransactions(txData);
      } catch (err) {
        console.error("Error fetching transactions:", err);
      }
    };

    fetchTransactions();
  }, [driverId]);

  // System Broadcast Listener
  useEffect(() => {
    const q = query(collection(db, 'system_broadcasts'), orderBy('timestamp', 'desc'), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        // Only show if it's recent (last 1 hour)
        if (data.timestamp?.toMillis() > Date.now() - 3600000) {
          setLatestBroadcast(data);
          // Auto-clear after 15 seconds
          setTimeout(() => setLatestBroadcast(null), 15000);
        }
      }
    });
    return () => unsub();
  }, []);

  // Upcoming scheduled rides for this driver's vehicle type
  useEffect(() => {
    if (!profile?.vehicleType) return;
    const q = query(collection(db, 'ride_requests'), where('status', '==', 'scheduled'));
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      const rides = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.vehicleType === profile.vehicleType && (r.scheduledAt?.toMillis?.() || 0) > now)
        .sort((a, b) => (a.scheduledAt?.toMillis?.() || 0) - (b.scheduledAt?.toMillis?.() || 0))
        .slice(0, 5);
      setUpcomingRides(rides);
    });
    return () => unsub();
  }, [profile?.vehicleType]);

  const { activeRide } = useRide();
  const [lastRequestId, setLastRequestId] = useState(null);
  const newRequestRef = useRef(null);
  const waitingSecondsRef = useRef(0);
  const lastWaitingFlushRef = useRef(Date.now());

  // Sync with global RideContext
  useEffect(() => {
    if (activeRide) {
      // Reset waiting counter when a new ride starts
      if (activeRide.id !== newRequestRef.current?.id) {
        waitingSecondsRef.current = activeRide.waitingSeconds || 0;
        lastWaitingFlushRef.current = Date.now();
      }
      newRequestRef.current = activeRide;
      setNewRequest(activeRide);

      // Audio Notification for NEW broadcasted requests
      if (activeRide.id !== lastRequestId && activeRide.driverId === 'broadcast') {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log("Audio play blocked"));
        setLastRequestId(activeRide.id);
      }
    } else {
      newRequestRef.current = null;
      setNewRequest(null);
    }
  }, [activeRide]);

  // On-mount recovery: restore active ride if page was refreshed mid-trip
  useEffect(() => {
    if (!driverId) return;
    const recover = async () => {
      if (newRequestRef.current) return; // already populated by RideContext sync
      try {
        const q = query(
          collection(db, 'ride_requests'),
          where('driverId', '==', driverId),
          where('status', 'in', ['accepted', 'started', 'completed', 'payment_done']),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty && !newRequestRef.current) {
          const ride = { id: snap.docs[0].id, ...snap.docs[0].data() };
          newRequestRef.current = ride;
          setNewRequest(ride);
        }
      } catch (err) {
        console.error('Active ride recovery error:', err);
      }
    };
    recover();
  }, [driverId]);

  // FCM: request permission, save token, handle foreground notifications
  useFCM(driverId, (payload) => {
    // App is open — play audio + let RideContext onSnapshot handle the UI
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {});
    // Show a brief browser notification even in foreground for visibility
    if (Notification.permission === 'granted') {
      new Notification(payload.notification?.title || 'VahanSetu', {
        body: payload.notification?.body,
        icon: '/pwa-192x192.png',
        tag: payload.data?.rideId || 'ride-request'
      });
    }
  });

  // Directions Service logic
  useEffect(() => {
    if (!isLoaded || !newRequest || !map) return;
    
    // Determine target based on status
    let targetPos = null;
    if (newRequest.status === 'accepted') {
      targetPos = newRequest.pickup;
    } else if (newRequest.status === 'started') {
      targetPos = newRequest.destination;
    }

    if (targetPos && targetPos.lat && targetPos.lng && profile?.location) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: { lat: profile.location.lat, lng: profile.location.lng },
          destination: { lat: Number(targetPos.lat), lng: Number(targetPos.lng) },
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            const path = result.routes[0].overview_path.map(p => ({
              lat: p.lat(),
              lng: p.lng()
            }));
            setRoutePath(path);
            
            // Auto-fit bounds to show both points
            const bounds = new window.google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            bounds.extend({ lat: profile.location.lat, lng: profile.location.lng });
            map.fitBounds(bounds);
          }
        }
      );
    } else {
      setRoutePath([]);
    }
  }, [isLoaded, newRequest, profile?.location, map]);

  const toggleStatus = async () => {
    if (!driverId) return;
    
    // Block Online status if not verified
    if (!isOnline && profile?.verificationStatus !== 'verified') {
      alert("Please complete your KYC verification in the 'Verify' tab to go online.");
      setActiveTab('verify');
      return;
    }

    const newStatus = !isOnline;
    await updateDoc(doc(db, 'drivers', driverId), { isOnline: newStatus });
    setIsOnline(newStatus);
  };

  const handleAcceptRide = async () => {
    if (!newRequest || !driverId) return;

    try {
      await runTransaction(db, async (transaction) => {
        const rideRef = doc(db, 'ride_requests', newRequest.id);
        const rideSnap = await transaction.get(rideRef);
        
        if (!rideSnap.exists()) throw "Ride does not exist";
        
        const data = rideSnap.data();
        if (data.status !== 'pending') throw "Ride already accepted by someone else";

        transaction.update(rideRef, { 
          status: 'accepted',
          driverId: driverId,
          driverName: profile?.name || 'Partner'
        });
      });
    } catch (e) {
      console.error("Acceptance failed:", e);
      alert(e);
      setNewRequest(null);
    }
  };

  const handleRejectRide = async (reason = '') => {
    if (!newRequest) return;
    const update = { status: 'rejected', cancelledBy: 'driver' };
    if (reason) update.cancelledReason = reason;
    await updateDoc(doc(db, 'ride_requests', newRequest.id), update);
    setShowRejectModal(false);
    setRejectReason('');
    setNewRequest(null);
  };

  const handleVerifyOtp = async () => {
    if (!newRequest || !driverId) return;
    
    // Security Check: Ensure ride is accepted by this driver before starting
    if (newRequest.status !== 'accepted' || newRequest.driverId !== driverId) {
      alert("Invalid operation. Ride must be accepted first.");
      return;
    }

    if (!newRequest.otp) {
      console.error("[CRITICAL] Ride has no OTP in DB!");
      alert("Error: Ride session is invalid (No OTP). Please contact support.");
      return;
    }

    if (enteredOtp === newRequest.otp?.toString()) {
      await updateDoc(doc(db, 'ride_requests', newRequest.id), { 
        status: 'started',
        startedAt: serverTimestamp() 
      });
      setEnteredOtp('');
      setIsDriverCardMinimized(true);
    } else {
      alert("Invalid OTP. Please ask the passenger for the correct code.");
    }
  };

  const handleCompleteRide = async () => {
    await updateDoc(doc(db, 'ride_requests', newRequest.id), { status: 'completed' });
  };

  const handleConfirmPayment = async () => {
    if (!newRequest) return;
    
    try {
      // Only update ride status - wallet already updated by Home.jsx
      await updateDoc(doc(db, 'ride_requests', newRequest.id), { 
        status: 'paid',
        paidAt: serverTimestamp()
      });
      
      setNewRequest(null);
    } catch (err) {
      console.error("Error confirming payment:", err);
    }
  };

  const handleWithdrawRequest = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount < 50) {
      return alert("Minimum withdrawal amount is ₹50.");
    }
    if (amount > (stats.walletBalance || 0)) {
      return alert("Amount exceeds available wallet balance.");
    }
    if (!upiId) return alert("Please enter a valid UPI ID.");
    
    try {
      await addDoc(collection(db, 'withdrawal_requests'), {
        driverId: driverId,
        driverName: profile?.name || 'Driver',
        amount: Number(withdrawAmount),
        upiId: upiId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'wallet_transactions'), {
        driverId,
        amount,
        type: 'withdrawn',
        status: 'pending',
        createdAt: serverTimestamp(),
        note: `Withdrawal to ${upiId}`
      });

      await updateDoc(doc(db, 'drivers', driverId), {
        walletBalance: (stats.walletBalance || 0) - amount
      });

      alert("Request Sent!");
      setIsWithdrawModalOpen(false);
      setWithdrawAmount('');
      setUpiId('');
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    }
  };

  const handleForceClearRide = async () => {
    if (!newRequest) return;
    if (window.confirm("Do you want to clear this stuck ride?")) {
      await updateDoc(doc(db, 'ride_requests', newRequest.id), { 
        status: 'cancelled',
        cancelledReason: 'driver_forced_clear'
      });
      setNewRequest(null);
      setRoutePath([]);
    }
  };

  const t = {
    en: { dashboard: "Dashboard", wallet: "Wallet", history: "History", verify: "Verify", messages: "Messages" },
    hi: { dashboard: "मुख्य", wallet: "वॉलेट", history: "इतिहास", verify: "सत्यापन", messages: "संदेश" }
  };
  const cur = t[language];

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-slate-50">
      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 left-4 right-4 z-[9999] px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${
              toast.type === 'error' ? 'bg-red-600 text-white' :
              toast.type === 'success' ? 'bg-emerald-600 text-white' :
              'bg-slate-900 text-white'
            }`}
          >
            <AlertCircle size={18} className="shrink-0" />
            <p className="text-sm font-bold leading-snug">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Background */}
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={15}
            onLoad={onMapLoad}
            options={{ 
              disableDefaultUI: true,
              styles: [
                { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
              ]
            }}
          >
            {/* Route Polyline */}
            {routePath.length > 0 && (
              <Polyline 
                path={routePath}
                options={{
                  strokeColor: '#3b82f6',
                  strokeOpacity: 0.8,
                  strokeWeight: 6,
                  lineCap: 'round'
                }}
              />
            )}

            {/* Driver Marker */}
            {profile?.location && (
              <Marker 
                position={{ lat: profile.location.lat, lng: profile.location.lng }}
                icon={{
                  url: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png',
                  scaledSize: new window.google.maps.Size(40, 40),
                  anchor: new window.google.maps.Point(20, 20)
                }}
              />
            )}

            {/* Destination/Pickup Marker */}
            {newRequest && (newRequest.status === 'accepted' || newRequest.status === 'started') && (
              <Marker 
                position={newRequest.status === 'accepted' 
                  ? { lat: Number(newRequest.pickup.lat), lng: Number(newRequest.pickup.lng) }
                  : { lat: Number(newRequest.destination.lat), lng: Number(newRequest.destination.lng) }
                }
                icon={newRequest.status === 'accepted' 
                  ? "https://maps.google.com/mapfiles/ms/icons/blue-dot.png" 
                  : "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
                }
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-slate-100 animate-pulse" />
        )}
      </div>

      {/* System Broadcast Overlay */}
      <AnimatePresence>
        {latestBroadcast && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 50, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-20 left-4 right-4 z-[100] max-w-lg mx-auto"
          >
            <div className="bg-red-600 text-white p-5 rounded-[2rem] shadow-2xl flex items-center gap-4 border-2 border-white/20">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
                <AlertCircle size={24} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Admin Update</p>
                <p className="text-sm font-bold leading-tight">{latestBroadcast.message}</p>
              </div>
              <button onClick={() => setLatestBroadcast(null)} className="p-2 hover:bg-white/10 rounded-lg">
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Ride Reason Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[3000] flex items-end justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-slate-800">Reject Karne Ka Karan?</h3>
                <button
                  onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                  className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-6">
                {[
                  'Location bahut door hai',
                  'Route suitable nahi',
                  'Vehicle kharab hai',
                  'Bahut zyada traffic',
                  'Emergency aa gayi',
                  'Koi aur karan',
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setRejectReason(reason)}
                    className={`text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all border-2 ${
                      rejectReason === reason
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-slate-50 border-transparent text-slate-700 hover:border-slate-200'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest"
                >
                  Wapas Jao
                </button>
                <button
                  onClick={() => handleRejectRide(rejectReason)}
                  className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-40"
                  disabled={!rejectReason}
                >
                  Haan, Reject Karo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Header */}
      <div className="fixed top-0 left-0 right-0 z-10 p-4">
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 shadow-lg flex justify-between items-center border border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">{profile?.name || 'Driver'}</h2>
              <span className="text-[10px] uppercase text-slate-400 font-bold">{profile?.vehicleType || 'Vahan'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')} className="p-2 bg-slate-100 rounded-lg text-[10px] font-black uppercase">
              {language === 'en' ? 'हिन्दी' : 'EN'}
            </button>
            <div onClick={toggleStatus} className={`px-4 py-2 rounded-full cursor-pointer transition-all ${isOnline ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-slate-200 text-slate-500'} shadow-lg flex items-center gap-2`}>
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recenter Button */}
      <button 
        onClick={() => map?.panTo({ lat: profile.location.lat, lng: profile.location.lng })}
        className="fixed right-4 bottom-32 z-10 w-12 h-12 bg-white rounded-full shadow-2xl flex items-center justify-center text-blue-600 border border-slate-100 active:scale-90 transition-all"
      >
        <Navigation size={20} />
      </button>

      {/* Active Ride Overlay - Compact Floating Card */}
      <AnimatePresence>
        {newRequest && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-20 max-w-lg mx-auto"
          >
            {isDriverCardMinimized ? (
              /* ── Minimized pill ── */
              <div className="bg-slate-900 rounded-full px-5 py-3 flex items-center justify-between shadow-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-white text-[10px] font-black uppercase tracking-widest">
                    {newRequest.status === 'started' ? 'Trip Live' : 'On Pickup'} • ₹{newRequest.fare}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {newRequest.status === 'started' && newRequest.driverId === driverId && (
                    <button onClick={handleCompleteRide} className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">
                      Complete
                    </button>
                  )}
                  <button onClick={() => setIsDriverCardMinimized(false)} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center">
                    <ChevronRight className="-rotate-90" size={14} className="text-white" />
                  </button>
                </div>
              </div>
            ) : (
              /* ── Full compact card ── */
              <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden border border-slate-100">
                {/* Header */}
                <div className={`${(newRequest.status === 'accepted' || newRequest.status === 'started') ? 'bg-slate-900' : 'bg-blue-600'} px-5 py-3.5 text-white flex justify-between items-center`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                      <Navigation size={13} className="animate-pulse" />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest">
                      {newRequest.status === 'started' ? 'Trip Live' : newRequest.status === 'pending' ? 'New Request' : 'On Pickup'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-xl text-sm font-black">₹{newRequest.fare}</span>
                    {(newRequest.status === 'accepted' || newRequest.status === 'started') && (
                      <button onClick={() => setIsDriverCardMinimized(true)} className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                        <ChevronRight className="rotate-90" size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Compact route */}
                <div className="px-5 pt-4 pb-2">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <div className="w-px h-5 bg-slate-200" />
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-xs font-bold text-slate-600 truncate">{newRequest.pickup?.address || 'Pickup Location'}</p>
                      <p className="text-xs font-bold text-slate-400 truncate">{newRequest.destination?.address || 'Destination'}</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2.5 pb-4">
                    {newRequest.status === 'pending' && (
                      <div className="flex gap-3">
                        <button onClick={() => setShowRejectModal(true)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Reject</button>
                        <button onClick={handleAcceptRide} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/30 active:scale-95 transition-all">Claim Ride →</button>
                      </div>
                    )}
                    {newRequest.status === 'accepted' && newRequest.driverId === driverId && (
                      <div className="flex gap-3">
                        <input
                          type="text" maxLength="4" placeholder="OTP"
                          value={enteredOtp} onChange={(e) => setEnteredOtp(e.target.value)}
                          className="flex-1 bg-slate-50 px-3 py-4 rounded-2xl text-center text-xl font-black tracking-[0.3em] outline-none border-2 border-slate-100 focus:border-blue-500 transition-all"
                        />
                        <button onClick={handleVerifyOtp} className="flex-[1.5] py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Start Trip</button>
                      </div>
                    )}
                    {newRequest.status === 'started' && newRequest.driverId === driverId && (
                      <button onClick={handleCompleteRide} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Complete Journey</button>
                    )}
                    {(newRequest.status === 'completed' || newRequest.status === 'payment_done') && newRequest.driverId === driverId && (
                      <button onClick={handleConfirmPayment} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Confirm Payment</button>
                    )}
                    {newRequest.status === 'paid' && newRequest.driverId === driverId && (
                      <button onClick={() => setNewRequest(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest">Ready for Next</button>
                    )}
                    <button onClick={handleForceClearRide} className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] hover:text-red-400 transition-colors text-center py-1">
                      Ride stuck? Force Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Content Switcher */}
      {activeTab === 'verify' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-24 px-6 overflow-y-auto pb-32">
          <div className="max-w-md mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">KYC Verification</h2>
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Mandatory for all partners</p>
              </div>
            </div>

            {profile?.verificationStatus === 'verified' ? (
              <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-[2.5rem] text-center">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-emerald-500/20">
                  <CheckCircle size={40} />
                </div>
                <h3 className="text-xl font-black text-emerald-900 mb-2">Verified Partner</h3>
                <p className="text-emerald-700/70 text-sm font-medium">Your profile is active and verified. You can now take rides.</p>
              </div>
            ) : profile?.verificationStatus === 'pending' ? (
              <div className="bg-blue-50 border border-blue-100 p-8 rounded-[2.5rem] text-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-blue-600/20">
                  <Clock size={40} />
                </div>
                <h3 className="text-xl font-black text-blue-900 mb-2">Verification Pending</h3>
                <p className="text-blue-700/70 text-sm font-medium">Admin is reviewing your documents. Please wait 12-24 hours.</p>
              </div>
            ) : (
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsUploading(true);
                  try {
                    const formData = new FormData(e.target);
                    
                    // 1. Upload Images to Cloudinary
                    const aadharFile = formData.get('aadharPhoto');
                    const vehicleFile = formData.get('vehiclePhoto');
                    
                    const aadharUrl = await uploadToCloudinary(aadharFile);
                    const vehicleUrl = await uploadToCloudinary(vehicleFile);

                    // 2. Save all data to Firestore
                    const kycData = {
                      aadhar: formData.get('aadhar'),
                      license: formData.get('license'),
                      rc: formData.get('rc'),
                      submittedAt: serverTimestamp()
                    };

                    const kyc_documents = {
                      aadharPhotoUrl: aadharUrl,
                      vehiclePhotoUrl: vehicleUrl
                    };
                    
                    await updateDoc(doc(db, 'drivers', driverId), { 
                      kycData,
                      kyc_documents,
                      verificationStatus: 'pending' 
                    });
                    alert("KYC Submitted Successfully! Your photos have been uploaded.");
                  } catch (err) {
                    console.error(err);
                    alert("Upload failed: " + err.message);
                  } finally {
                    setIsUploading(false);
                  }
                }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Aadhar Card Number</label>
                  <input name="aadhar" type="text" placeholder="XXXX XXXX XXXX" required className="w-full bg-white p-5 rounded-3xl border border-slate-200 outline-none focus:border-blue-600 font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Driving License No.</label>
                  <input name="license" type="text" placeholder="UP-XXXXXXX" required className="w-full bg-white p-5 rounded-3xl border border-slate-200 outline-none focus:border-blue-600 font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Vehicle RC Number</label>
                  <input name="rc" type="text" placeholder="UP 52 X XXXX" required className="w-full bg-white p-5 rounded-3xl border border-slate-200 outline-none focus:border-blue-600 font-bold" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Aadhar Photo</label>
                    <div className="relative h-32 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-4 hover:border-blue-500 transition-colors cursor-pointer group">
                      <input name="aadharPhoto" type="file" accept="image/*" required className="absolute inset-0 opacity-0 cursor-pointer" />
                      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                        <Users size={16} />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-2">Upload Front</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Vehicle Photo</label>
                    <div className="relative h-32 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-4 hover:border-blue-500 transition-colors cursor-pointer group">
                      <input name="vehiclePhoto" type="file" accept="image/*" required className="absolute inset-0 opacity-0 cursor-pointer" />
                      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                        <Truck size={16} />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-2">Upload Photo</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100/50">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <AlertCircle size={14} /> Photo Requirement
                  </p>
                  <p className="text-[11px] text-blue-800/70 leading-relaxed font-medium">
                    Upload Aadhar and Vehicle Photo in high quality to speed up your verification.
                  </p>
                </div>

                <button 
                  type="submit" 
                  disabled={isUploading}
                  className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black tracking-[0.2em] text-xs shadow-2xl shadow-blue-600/30 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isUploading ? "UPLOADING PHOTOS..." : "SUBMIT FOR VERIFICATION"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {activeTab === 'wallet' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-24 px-6 overflow-y-auto pb-32">
          <div className="max-w-md mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <IndianRupee size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">My Wallet</h2>
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Earnings & Payouts</p>
              </div>
            </div>

            {/* Top Card: Wallet Balance */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Available to withdraw</p>
              <h1 className="text-5xl font-black text-white tracking-tighter mb-8">₹{Number(stats.walletBalance || 0).toFixed(2)}</h1>
              <button 
                onClick={() => setIsWithdrawModalOpen(true)}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
              >
                Withdraw Request
              </button>
            </div>

            {/* Sub Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Earned</p>
                <p className="text-2xl font-black text-slate-800">₹{Number(stats.totalEarnings || 0).toFixed(2)}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Commission Paid (7.5%)</p>
                <p className="text-2xl font-black text-red-500">₹{Math.round((stats.totalEarnings || 0) * 0.075 / 0.925) || 0}</p>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="pt-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-2">Recent Transactions</h3>
              <div className="space-y-3">
                {walletTransactions.map(tx => (
                  <div key={tx.id} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      tx.type === 'earned' ? 'bg-emerald-50 text-emerald-500' :
                      tx.type === 'withdrawn' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'
                    }`}>
                      {tx.type === 'earned' ? <TrendingUp size={20} /> :
                       tx.type === 'withdrawn' ? <IndianRupee size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-slate-800 uppercase tracking-wide">{tx.type.replace('_', ' ')}</p>
                      <p className="text-[9px] font-bold text-slate-400">{tx.createdAt?.toDate?.()?.toLocaleString() || 'Just now'} {tx.note && `• ${tx.note}`}</p>
                    </div>
                    <div className={`text-sm font-black ${
                      tx.type === 'earned' ? 'text-emerald-500' : 'text-slate-800'
                    }`}>
                      {tx.type === 'earned' ? '+' : '-'}₹{tx.amount}
                    </div>
                  </div>
                ))}
                {walletTransactions && walletTransactions.length === 0 && (
                  <div className="text-center py-8 bg-white rounded-3xl border border-slate-100 border-dashed">
                    <p className="text-xs font-bold text-slate-400">No transactions yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal Bottom Sheet */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsWithdrawModalOpen(false)}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[110] bg-white rounded-t-[2.5rem] p-8 pb-12 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8" />
              <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">Withdraw Funds</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Transfer to your bank via UPI</p>
              {(stats.walletBalance || 0) <= 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-sm font-bold text-slate-500">No balance available to withdraw</p>
                </div>
              ) : (
                <form onSubmit={handleWithdrawRequest} className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block mb-2">Amount (₹)</label>
                    <input 
                      type="number" 
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Amount to withdraw"
                      max={stats.walletBalance || 0}
                      className="w-full bg-slate-50 border border-slate-100 p-5 rounded-3xl outline-none focus:border-blue-500 font-black text-slate-800 text-lg transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block mb-2">UPI ID</label>
                    <input 
                      type="text" 
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourname@upi"
                      className="w-full bg-slate-50 border border-slate-100 p-5 rounded-3xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-all"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-blue-600/20 active:scale-95 transition-all mt-4"
                  >
                    Submit Request
                  </button>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-16 pb-24 overflow-y-auto">
          <div className="max-w-md mx-auto px-6 py-6 space-y-5">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <History size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Ride History</h2>
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Last 25 completed rides</p>
              </div>
            </div>

            {historyLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-28 bg-slate-200 rounded-3xl animate-pulse" />
                ))}
              </div>
            ) : rideHistory.length === 0 ? (
              <div className="text-center py-20">
                <History size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-base font-black text-slate-400">Abhi tak koi ride complete nahi hui</p>
                <p className="text-[11px] text-slate-300 mt-1">Pehli ride complete karo!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rideHistory.map(ride => {
                  const { label, color } = statusMeta(ride.status);
                  const isLogistics = ride.vehicleType === 'chhota_hathi';
                  const earned = ride.fareAmount ? Math.round(ride.fareAmount * 0.925) : null;
                  return (
                    <div key={ride.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${color}`}>{label}</span>
                          <span className="text-[9px] font-bold text-slate-400">{isLogistics ? '🚛 Logistics' : '🛺 Savaari'}</span>
                        </div>
                        <div className="text-right">
                          {earned !== null && (
                            <p className="text-base font-black text-emerald-600">+₹{earned}</p>
                          )}
                          {ride.fareAmount && (
                            <p className="text-[9px] font-bold text-slate-400">Fare ₹{ride.fareAmount}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                        <p className="text-[11px] font-bold text-slate-600 leading-tight line-clamp-1">
                          {ride.pickup?.address || 'Pickup'}
                        </p>
                      </div>
                      <div className="flex items-start gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
                        <p className="text-[11px] font-bold text-slate-400 leading-tight line-clamp-1">
                          {ride.destination?.address || 'Destination'}
                        </p>
                      </div>
                      {ride.cancelledReason && (
                        <p className="text-[9px] font-bold text-red-400 bg-red-50 rounded-lg px-2 py-1 mb-1">
                          Karan: {ride.cancelledReason}
                        </p>
                      )}
                      <p className="text-[9px] font-black text-slate-300 uppercase">{formatDate(ride.createdAt)}</p>
                    </div>
                  );
                })}
                <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] py-2">— End of History —</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Scheduled Rides — shown on main map view when rides exist */}
      {upcomingRides.length > 0 && activeTab === 'dashboard' && !newRequest && (
        <div className="fixed top-20 left-4 right-4 z-20 max-w-sm mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-100 overflow-hidden">
            <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
              <Clock size={14} className="text-white" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Upcoming Scheduled Rides</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
              {upcomingRides.map(ride => {
                const schedDate = ride.scheduledAt?.toDate?.();
                return (
                  <div key={ride.id} className="px-5 py-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-amber-600 mb-1">
                          {schedDate ? schedDate.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                        </p>
                        <p className="text-[11px] font-bold text-slate-700 truncate">{ride.pickup?.address || 'Pickup'}</p>
                        <p className="text-[10px] font-bold text-slate-400 truncate">→ {ride.destination?.address || 'Destination'}</p>
                      </div>
                      <span className="text-sm font-black text-slate-800 ml-3 shrink-0">
                        {ride.fareAmount ? `₹${ride.fareAmount}` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating Stats */}
      <div className="fixed bottom-24 left-4 z-10">
        <div className="bg-white/90 backdrop-blur-md rounded-3xl p-4 shadow-xl border border-white/20 w-[180px]">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Earnings</span>
          <h3 className="text-xl font-black text-slate-800">₹{stats.totalEarnings}</h3>
          <div className="h-px bg-slate-100 my-2" />
          <div className="flex justify-between">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase">Rides</p>
              <p className="text-xs font-black">{stats.rides}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase">Rating</p>
              <p className="text-xs font-black text-emerald-600 flex items-center gap-1"><Star size={10} fill="currentColor" /> {stats.rating}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-slate-100 z-30 flex justify-around items-center px-4">
        {[
          { id: 'dashboard', icon: TrendingUp, label: cur.dashboard },
          { id: 'wallet', icon: IndianRupee, label: cur.wallet },
          { id: 'verify', icon: ShieldCheck, label: "Verify" },
          { id: 'messages', icon: Bell, label: cur.messages },
          { id: 'history', icon: History, label: cur.history }
        ].map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center gap-1 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
            <item.icon size={22} />
            <span className="text-[8px] font-black uppercase">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default DriverDashboard;
