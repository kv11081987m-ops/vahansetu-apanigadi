import { useState, useCallback, useRef, useEffect, useMemo, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import {
  Car,
  Truck,
  MapPin,
  Navigation,
  Menu,
  User,
  ChevronRight,
  Search,
  LocateFixed,
  AlertCircle,
  X,
  Clock,
  ShieldCheck,
  Phone,
  Star,
  ArrowUpDown,
  IndianRupee,
  CheckCircle,
  Smartphone,
  CreditCard,
  Package,
  Scale,
  LogOut,
  History,
  Bell,
  Gift,
  Copy,
  Users,
  Share2
} from 'lucide-react';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, getDocs, limit, getDoc, serverTimestamp, Timestamp, increment, runTransaction, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLiveDrivers } from '../hooks/useLiveDrivers';
import { useRide } from '../context/RideContext';
import { calculateDistance } from '../utils/geoUtils';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { computeFare } from '../utils/fareEngine';
import { useRideHistory } from '../hooks/useRideHistory';
import { useFCM } from '../hooks/useFCM';
import { useLanguage } from '../hooks/useLanguage';
import LanguageToggle from '../components/LanguageToggle';

const containerStyle = { width: '100%', height: '100%' };
const center = { lat: 26.502, lng: 83.778 }; // Deoria Focus

const mapOptions = {
  mapId: 'vahan-setu-map-v1',
  disableDefaultUI: true,
  zoomControl: false,
};

const LIBRARIES = ['places', 'geometry'];

// Computed once at module load — used as constraints for datetime-local inputs
const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
const nowPlus30Min = () => new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16);
const nowPlus7Days = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

const SidebarLink = ({ icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-all group active:scale-95"
  >
    <div className="text-slate-400 group-hover:text-blue-600 transition-colors">
      {icon}
    </div>
    <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">
      {label}
    </span>
  </button>
);

const Home = () => {
  const navigate = useNavigate();
  const { user, userProfile, logout } = useAuth();
  
  useEffect(() => {
    if (userProfile?.role === 'driver' && userProfile?.role !== 'admin') {
      navigate('/dashboard');
    }
  }, [userProfile, navigate]);
  const [service, setService] = useState('savaari');
  const [map, setMap] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSidebarModal, setActiveSidebarModal] = useState(null); // 'history', 'wallet', 'support', 'grievance'
  const [walletTxns, setWalletTxns] = useState(null); // null = not loaded yet
  const [myReferrals, setMyReferrals] = useState(null); // null = not loaded yet
  const [referralCopied, setReferralCopied] = useState(false);
  const [notifications, setNotifications] = useState(null); // null = not loaded yet
  const [savedPlaces, setSavedPlaces] = useState(null); // null = not loaded
  const [savingPlace, setSavingPlace] = useState(false);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
    version: 'weekly'
  });



  useEffect(() => {
    if (activeSidebarModal !== 'wallet' || !user) return;
    if (walletTxns !== null) return; // already loaded
    getDocs(
      query(collection(db, 'transactions'), where('userId', '==', user.uid), limit(10))
    ).then(snap => {
      setWalletTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => setWalletTxns([]));
  }, [activeSidebarModal, user, walletTxns]);

  useEffect(() => {
    if (activeSidebarModal !== 'refer' || !user) return;
    if (myReferrals !== null) return;
    getDocs(
      query(collection(db, 'referrals'), where('referrerId', '==', user.uid), limit(20))
    ).then(snap => {
      setMyReferrals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => setMyReferrals([]));
  }, [activeSidebarModal, user, myReferrals]);

  useEffect(() => {
    if (activeSidebarModal !== 'notifications' || !user) return;
    if (notifications !== null) return;
    getDocs(
      query(collection(db, 'notifications'), where('userId', '==', user.uid), limit(20))
    ).then(snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => setNotifications([]));
  }, [activeSidebarModal, user, notifications]);

  useEffect(() => {
    if (activeSidebarModal !== 'places' || !user) return;
    if (savedPlaces !== null) return;
    setSavedPlaces(userProfile?.savedPlaces || []);
  }, [activeSidebarModal, user, savedPlaces, userProfile?.savedPlaces]);

  const handleSavePlace = async (name) => {
    if (!pickup || !user) return;
    setSavingPlace(true);
    const newPlace = { name, address: pickup.address || pickupInput, lat: pickup.lat, lng: pickup.lng };
    const updated = [...(savedPlaces || []).filter(p => p.name !== name), newPlace];
    try {
      await updateDoc(doc(db, 'users', user.uid), { savedPlaces: updated });
      setSavedPlaces(updated);
      showToast(`"${name}" save ho gaya!`, 'success');
    } catch { showToast('Save nahi ho saka.', 'error'); }
    finally { setSavingPlace(false); }
  };

  const handleDeletePlace = async (name) => {
    if (!user) return;
    const updated = (savedPlaces || []).filter(p => p.name !== name);
    try {
      await updateDoc(doc(db, 'users', user.uid), { savedPlaces: updated });
      setSavedPlaces(updated);
    } catch { showToast('Delete nahi ho saka.', 'error'); }
  };

  const { drivers } = useLiveDrivers(service, isLoaded);
  // Drivers count for badge
  const liveDriversCount = drivers.length;

  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pickupInput, setPickupInput] = useState('');
  const [destInput, setDestInput] = useState('');

  const [routePath, setRoutePath] = useState([]);
  const [altRoutePaths, setAltRoutePaths] = useState([]);
  const [routeEta, setRouteEta] = useState(null);
  const [distance, setDistance] = useState(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [fare, setFare] = useState({ savaari: 0, logistics: 0 });

  const [bookingStatus, setBookingStatus] = useState('idle');
  const [bookingId, setBookingId] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [matchedDriver, setMatchedDriver] = useState(null);
  const [otp, setOtp] = useState(null);
  const activeRequestUnsubRef = useRef(null);
  const cancelTimeoutRef = useRef(null);
  const [showRating, setShowRating] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [completedDriverName, setCompletedDriverName] = useState(null);
  const [goodsType, setGoodsType] = useState('');
  const [goodsWeight, setGoodsWeight] = useState('');
  const [isLowData, setIsLowData] = useState(false);
  const [driverLiveLocation, setDriverLiveLocation] = useState(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const [driverToPickupPath, setDriverToPickupPath] = useState([]);
  const [driverToPickupEta, setDriverToPickupEta] = useState(null);
  const driverRouteLastCalcRef = useRef(0);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [scheduledRides, setScheduledRides] = useState([]);
  const [scheduledRidesLoading, setScheduledRidesLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [rideMode, setRideMode] = useState('private');
  const [sharedRoutes, setSharedRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedBoardingStop, setSelectedBoardingStop] = useState(null);
  const [selectedDropStop, setSelectedDropStop] = useState(null);
  const [sharedFare, setSharedFare] = useState(0);
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [sharedBookingId, setSharedBookingId] = useState(null);
  const [sharedBookingStatus, setSharedBookingStatus] = useState('idle');
  const [boardingSearchStop, setBoardingSearchStop] = useState('');
  const [dropSearchStop, setDropSearchStop] = useState('');
  const [filteredRoutes, setFilteredRoutes] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharedDriverLocation, setSharedDriverLocation] = useState(null);
  const [sharedDriverHeading, setSharedDriverHeading] = useState(0);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Route search filter
  useEffect(() => {
    if (!boardingSearchStop && !dropSearchStop) {
      setFilteredRoutes(sharedRoutes);
      return;
    }
    const filtered = sharedRoutes.filter(route => {
      const stops = (route.stops || []).map(s => s.toLowerCase());
      const boardingMatch = !boardingSearchStop || stops.some(s => s.includes(boardingSearchStop.toLowerCase()));
      const dropMatch = !dropSearchStop || stops.some(s => s.includes(dropSearchStop.toLowerCase()));
      return boardingMatch && dropMatch;
    });
    setFilteredRoutes(filtered);
  }, [boardingSearchStop, dropSearchStop, sharedRoutes]);

  // handleShareRide
  const handleShareRide = () => {
    const isSharedActive = sharedBookingStatus === 'booked' || sharedBookingStatus === 'onboard' || sharedBookingStatus === 'driver_assigned';
    const isPrivateActive = bookingStatus === 'accepted' || bookingStatus === 'started';
    if (!isSharedActive && !isPrivateActive) return;
    let message = '';
    if (isSharedActive) {
      message =
        `🛺 Main ApniGadi mein hoon!\n` +
        `📍 Route: ${selectedRoute?.name || ''}\n` +
        `🚏 Chadha: ${selectedBoardingStop}\n` +
        `🏁 Utrunga: ${selectedDropStop}\n` +
        `💰 Kiraya: ₹${sharedFare * selectedSeats}\n` +
        `\n🔗 Track karo: https://vahansetuapnigadi.web.app\n` +
        `\nVahanSetu ApniGadi - Apni Gadi, Apni Marzi 🚗`;
    } else {
      const driverName = activeRide?.driverName || 'Driver';
      const vehicleNo = activeRide?.vehicleNumber || '';
      message =
        `🚗 Main ApniGadi mein hoon!\n` +
        `👨‍✈️ Driver: ${driverName}\n` +
        `🚗 Gaadi: ${vehicleNo}\n` +
        `📍 From: ${activeRide?.pickupAddress || pickup?.address || ''}\n` +
        `🏁 To: ${activeRide?.destinationAddress || destination?.address || ''}\n` +
        `\n🔗 Track karo: https://vahansetuapnigadi.web.app\n` +
        `\nVahanSetu ApniGadi - Apni Gadi, Apni Marzi 🚗`;
    }
    if (navigator.share) {
      navigator.share({ title: 'Meri ApniGadi Trip', text: message });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const pickupInputRef = useRef(null);
  const destInputRef = useRef(null);
  const isProcessingPayment = useRef(false);
  const searchAbortRef = useRef(false);
  const retryParamsRef = useRef(null);
  const [searchRadiusMsg, setSearchRadiusMsg] = useState(null);
  const [noDriverFound, setNoDriverFound] = useState(false);

  useEffect(() => {
    if (isLoaded && window.google && pickupInputRef.current && destInputRef.current) {
      const initAutocomplete = async () => {
        const { Autocomplete } = await window.google.maps.importLibrary("places");
        
        const options = {
          componentRestrictions: { country: "in" },
          fields: ["geometry", "formatted_address", "name"],
          types: ['establishment', 'geocode'], // Supports both landmarks and addresses
          strictBounds: false
        };

        const pA = new Autocomplete(pickupInputRef.current, options);
        const dA = new Autocomplete(destInputRef.current, options);
        
        pA.addListener("place_changed", () => {
          const place = pA.getPlace();
          if (place.geometry) {
            setPickup({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), address: place.formatted_address });
            setPickupInput(place.formatted_address);
          }
        });

        dA.addListener("place_changed", () => {
          const place = dA.getPlace();
          if (place.geometry) {
            setDestination({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), address: place.formatted_address });
            setDestInput(place.formatted_address);
          }
        });
      };
      initAutocomplete();
    }
  }, [isLoaded]);

  const { activeRide, setActiveRide } = useRide();
  const { t } = useLanguage();
  const { config } = usePlatformConfig();
  const { rides: rideHistory, loading: historyLoading, formatDate, statusMeta } = useRideHistory(
    activeSidebarModal === 'history' && user ? { userId: user.uid } : {}
  );

  // Customer FCM — saves token to users/{uid} so Cloud Function can notify on ride accept
  useFCM(user?.uid || null, (payload) => {
    const title = payload.notification?.title || '';
    const body = payload.notification?.body || '';
    showToast(body || title || 'Driver ne aapki ride accept kar li!', 'success');
  }, 'users');

  const handleReset = useCallback(() => {
    setBookingStatus('idle');
    setPickup(null);
    setDestination(null);
    setPickupInput('');
    setDestInput('');
    setRoutePath([]);
    setAltRoutePaths([]);
    setRouteEta(null);
    setDistance(null);
    setDistanceKm(0);
    setBookingId(null);
    setRequestId(null);
    setMatchedDriver(null);
    setCompletedDriverName(null);
    setOtp(null);
    setGoodsType('');
    setGoodsWeight('');
    setIsMinimized(false);
    setDriverLiveLocation(null);
    setIsScheduled(false);
    setScheduledDateTime('');
    setSearchRadiusMsg(null);
    setNoDriverFound(false);
    searchAbortRef.current = true;
    retryParamsRef.current = null;
    if (cancelTimeoutRef.current) { clearTimeout(cancelTimeoutRef.current); cancelTimeoutRef.current = null; }
    if (activeRequestUnsubRef.current) { activeRequestUnsubRef.current(); activeRequestUnsubRef.current = null; }
  }, []);

  const calculateRoute = useCallback(async () => {
    if (!pickup || !destination || !window.google) return;
    const { DirectionsService } = await window.google.maps.importLibrary('routes');
    const directionsService = new DirectionsService();
    directionsService.route(
      {
        origin: new window.google.maps.LatLng(pickup.lat, pickup.lng),
        destination: new window.google.maps.LatLng(destination.lat, destination.lng),
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status === 'OK') {
          const path = window.google.maps.geometry.encoding.decodePath(result.routes[0].overview_polyline);
          setRoutePath(path);
          const alts = result.routes.slice(1).map(r =>
            window.google.maps.geometry.encoding.decodePath(r.overview_polyline)
          );
          setAltRoutePaths(alts);
          const route = result.routes[0].legs[0];
          const distKm = route.distance.value / 1000;
          setDistance(distKm.toFixed(1));
          setDistanceKm(distKm);
          setRouteEta({ duration: route.duration.text, distance: route.distance.text });
          setFare({
            savaari: computeFare(distKm, 0, 'savaari', config).total,
            logistics: computeFare(distKm, 0, 'logistics', config).total
          });
          const bounds = new window.google.maps.LatLngBounds();
          path.forEach(point => bounds.extend(point));
          map?.fitBounds(bounds, { top: 170, bottom: 220, left: 40, right: 40 });
        } else {
          setAltRoutePaths([]);
        }
      }
    );
  }, [pickup, destination, map, config]);

  // Unified Ride Restoration
  useEffect(() => {
    if (activeRide) {
      startTransition(() => {
        setRequestId(activeRide.id);
        setOtp(activeRide.otp);
        setPickup(activeRide.pickup);
        setDestination(activeRide.destination);
        setPickupInput(activeRide.pickup?.address || 'Saved Location');
        setDestInput(activeRide.destination?.address || 'Saved Location');

        if (activeRide.driverId && activeRide.driverId !== 'broadcast') {
          setMatchedDriver(prev => {
            if (prev?.id === activeRide.driverId && prev.phone) return prev;
            getDoc(doc(db, 'drivers', activeRide.driverId)).then(dSnap => {
              setMatchedDriver(cur => cur ? { ...cur, phone: dSnap.exists() ? dSnap.data().phone : null } : null);
            });
            return prev || { id: activeRide.driverId, name: activeRide.driverName || 'Partner', rating: 4.8 };
          });
          setBookingStatus(activeRide.status);
        } else {
          setBookingStatus(activeRide.status === 'pending' ? 'searching' : activeRide.status);
        }
      });

      if (activeRide.pickup && activeRide.destination && isLoaded && !routePath.length) {
        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route(
          {
            origin: activeRide.pickup,
            destination: activeRide.destination,
            travelMode: window.google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === 'OK') {
              setRoutePath(result.routes[0].overview_path);
              setDistance(result.routes[0].legs[0].distance.text);
            }
          }
        );
      }
    } else {
      // Don't reset during payment_done — rating timer is still running
      if (bookingStatus !== 'idle' && bookingStatus !== 'searching' && bookingStatus !== 'payment_done') {
        startTransition(() => { handleReset(); });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRide, isLoaded]);

  // Live driver location subscription — active during accepted/started only
  useEffect(() => {
    const tracking = ['accepted', 'started'].includes(bookingStatus);
    if (!matchedDriver?.id || !tracking) {
      startTransition(() => { setDriverLiveLocation(null); });
      return;
    }
    const unsub = onSnapshot(doc(db, 'drivers', matchedDriver.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.location) setDriverLiveLocation(data.location);
        if (data.heading != null && !isNaN(data.heading)) setDriverHeading(data.heading);
      }
    });
    return () => unsub();
  }, [matchedDriver?.id, bookingStatus]);

  // Live driver route: accepted → driver→pickup, started → driver→destination.
  // Recalculated at most once per 30s. Debounce resets on bookingStatus change
  // so the first calc fires immediately when transitioning accepted→started.
  const prevBookingStatusRef = useRef(null);
  useEffect(() => {
    const isTracking = bookingStatus === 'accepted' || bookingStatus === 'started';
    const waypoint = bookingStatus === 'accepted' ? pickup : destination;
    if (!isTracking || !driverLiveLocation || !waypoint || !isLoaded || !window.google) {
      setDriverToPickupPath([]);
      setDriverToPickupEta(null);
      driverRouteLastCalcRef.current = 0;
      prevBookingStatusRef.current = null;
      return;
    }
    // Reset debounce when status changes so accepted→started transition draws immediately
    if (prevBookingStatusRef.current !== bookingStatus) {
      driverRouteLastCalcRef.current = 0;
      prevBookingStatusRef.current = bookingStatus;
    }
    const now = Date.now();
    if (now - driverRouteLastCalcRef.current < 30000) return;
    driverRouteLastCalcRef.current = now;
    const ds = new window.google.maps.DirectionsService();
    ds.route({
      origin: { lat: Number(driverLiveLocation.lat), lng: Number(driverLiveLocation.lng) },
      destination: { lat: Number(waypoint.lat), lng: Number(waypoint.lng) },
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK') {
        const leg = result.routes[0].legs[0];
        const path = result.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
        setDriverToPickupPath(path);
        const arrivalTime = new Date(Date.now() + leg.duration.value * 1000)
          .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        setDriverToPickupEta({ duration: leg.duration.text, distance: leg.distance.text, arrivalTime });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingStatus, driverLiveLocation, pickup, destination, isLoaded]);

  // Auto-pan map to keep driver + relevant waypoint in view
  useEffect(() => {
    if (!map || !driverLiveLocation || !window.google) return;
    const waypoint = bookingStatus === 'accepted' ? pickup : destination;
    if (!waypoint) { map.panTo(driverLiveLocation); return; }
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(driverLiveLocation);
    bounds.extend(waypoint);
    map.fitBounds(bounds, { top: 120, bottom: 420, left: 60, right: 60 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLiveLocation]);

  // Re-calculate route when maps load and we have pickup/dest
  useEffect(() => {
    if (isLoaded && pickup && destination && (bookingStatus === 'accepted' || bookingStatus === 'started')) {
      calculateRoute();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, pickup?.lat, destination?.lat, bookingStatus]);

  useEffect(() => {
    if (pickup && destination) calculateRoute();
  }, [pickup, destination, calculateRoute]);

  const isBookingRef = useRef(false);

  const handleConfirmBooking = async () => {
    if (!user?.uid) { showToast('Pehle login karein.', 'error'); return; }
    if (!pickup) { showToast('Kripya pickup location select karein.', 'error'); return; }
    if (!destination) { showToast('Kripya destination select karein.', 'error'); return; }
    if (isBookingRef.current) return;

    const dist = calculateDistance(pickup.lat, pickup.lng, destination.lat, destination.lng);
    if (dist < 0.1) {
      showToast('Pickup aur destination same jagah nahi ho sakta.', 'error');
      return;
    }

    isBookingRef.current = true;

    // ── Scheduled booking path ──────────────────────────────────────────
    if (isScheduled) {
      if (!scheduledDateTime) {
        showToast('Kripya date aur time select karein.', 'error');
        isBookingRef.current = false;
        return;
      }
      const schedDate = new Date(scheduledDateTime);
      // eslint-disable-next-line react-hooks/purity
      if (schedDate < new Date(Date.now() + 29 * 60 * 1000)) {
        showToast('Scheduled time kam se kam 30 minute baad hona chahiye.', 'error');
        isBookingRef.current = false;
        return;
      }
      const rideOtp = generateOtp();
      setOtp(rideOtp);
      const vType = service === 'savaari' ? 'battery_rickshaw' : 'chhota_hathi';
      try {
        const bRef = await addDoc(collection(db, 'bookings'), {
          userId: user.uid, pickup, drop: destination,
          fare: service === 'savaari' ? fare.savaari : fare.logistics,
          distance, vehicleType: vType, status: 'scheduled',
          scheduledAt: Timestamp.fromDate(schedDate),
          otp: rideOtp, createdAt: serverTimestamp(),
          goodsType: service === 'logistics' ? goodsType : null,
          goodsWeight: service === 'logistics' ? goodsWeight : null
        });
        setBookingId(bRef.id);
        await addDoc(collection(db, 'ride_requests'), {
          bookingId: bRef.id, driverId: 'broadcast', vehicleType: vType,
          userId: user.uid, pickup, destination,
          fare: service === 'savaari' ? fare.savaari : fare.logistics,
          fareAmount: service === 'savaari' ? fare.savaari : fare.logistics,
          status: 'scheduled',
          scheduledAt: Timestamp.fromDate(schedDate),
          otp: rideOtp, createdAt: serverTimestamp(),
          ...(service === 'logistics' ? { goodsType, goodsWeight } : {})
        });
        setBookingStatus('scheduled');
      } catch (err) {
        console.error('Scheduled booking error:', err);
        showToast('Scheduling fail ho gayi. Dobara try karein.', 'error');
        setBookingStatus('idle');
      } finally {
        isBookingRef.current = false;
      }
      return;
    }

    // ── Immediate booking path (existing) ──────────────────────────────
    setBookingStatus('searching');
    // eslint-disable-next-line react-hooks/purity
    const rideOtp = String(Math.floor(1000 + Math.random() * 9000));
    setOtp(rideOtp);
    const vType = service === 'savaari' ? 'battery_rickshaw' : 'chhota_hathi';
    try {
      const docRef = await addDoc(collection(db, 'bookings'), {
        userId: user.uid,
        pickup,
        drop: destination,
        fare: service === 'savaari' ? fare.savaari : fare.logistics,
        distance,
        vehicleType: vType,
        status: 'searching',
        otp: rideOtp,
        createdAt: serverTimestamp(),
        goodsType: service === 'logistics' ? goodsType : null,
        goodsWeight: service === 'logistics' ? goodsWeight : null
      });
      setBookingId(docRef.id);
      searchAbortRef.current = false;
      retryParamsRef.current = { bookingId: docRef.id, vType, rideOtp, logisticsData: { goodsType, goodsWeight } };
      findAndAssignDriver(docRef.id, vType, rideOtp, { goodsType, goodsWeight });
    } catch (err) {
      console.error('[BOOKING] FAILED:', err);
      showToast('Booking fail ho gayi. Dobara try karein.', 'error');
      setBookingStatus('idle');
    } finally {
      isBookingRef.current = false;
    }
  };

  // ── Shared Ride ───────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubRoutes = onSnapshot(
      query(collection(db, 'shared_routes'), where('isActive', '==', true)),
      (snap) => setSharedRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsubRoutes();
  }, []);

  useEffect(() => {
    if (!sharedBookingId) return;
    const unsub = onSnapshot(doc(db, 'shared_bookings', sharedBookingId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === 'searching') {
        setSharedBookingStatus('searching');
      } else if (data.status === 'driver_assigned' || data.status === 'booked') {
        setSharedBookingStatus('booked');
      } else {
        setSharedBookingStatus(data.status);
      }
    });
    return () => unsub();
  }, [sharedBookingId]);

  useEffect(() => {
    if (!sharedBookingId) return;
    if (sharedBookingStatus !== 'booked' && sharedBookingStatus !== 'onboard') return;

    let unsubFn = null;
    const getSharedDriverLocation = async () => {
      const bookingSnap = await getDoc(doc(db, 'shared_bookings', sharedBookingId));
      if (!bookingSnap.exists()) return;
      const rideId = bookingSnap.data().rideId;
      if (!rideId) return;
      return onSnapshot(doc(db, 'shared_rides', rideId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.driverLocation) {
          setSharedDriverLocation(data.driverLocation);
          setSharedDriverHeading(data.driverHeading || 0);
        }
      });
    };

    getSharedDriverLocation().then(u => { unsubFn = u; });
    return () => unsubFn?.();
  }, [sharedBookingId, sharedBookingStatus]);

  const calculateSharedFare = (route, boardingStop, dropStop) => {
    const boardingIdx = route.stops.indexOf(boardingStop);
    const dropIdx = route.stops.indexOf(dropStop);
    if (boardingIdx === -1 || dropIdx === -1 || dropIdx <= boardingIdx) return 0;
    // Gap-based tier: 1 stop=fares[0], 2 stops=fares[1], 3+ stops=fares[last]
    const gap = dropIdx - boardingIdx;
    const fares = route.fares || [];
    return fares[Math.min(gap - 1, fares.length - 1)] || 0;
  };

  const handleSharedBooking = async () => {
    if (!selectedRoute || !selectedBoardingStop || !selectedDropStop) return;
    setSharedBookingStatus('searching');
    try {
      const ridesSnap = await getDocs(
        query(
          collection(db, 'shared_rides'),
          where('routeId', '==', selectedRoute.id),
          where('status', '==', 'waiting'),
          where('availableSeats', '>', 0)
        )
      );
      let rideId = null;
      if (!ridesSnap.empty) {
        const existingRide = ridesSnap.docs[0];
        const availableSeats = existingRide.data().availableSeats || 0;
        if (selectedSeats > availableSeats) {
          alert('Itni seats available nahi hain! Sirf ' + availableSeats + ' seat bachi hai.');
          setSharedBookingStatus('selecting_stops');
          return;
        }
        rideId = existingRide.id;
        await updateDoc(doc(db, 'shared_rides', rideId), {
          availableSeats: increment(-selectedSeats),
          passengers: arrayUnion(user.uid)
        });
      } else {
        const newRide = await addDoc(collection(db, 'shared_rides'), {
          routeId: selectedRoute.id,
          routeName: selectedRoute.name,
          status: 'waiting',
          availableSeats: 4 - selectedSeats,
          passengers: [user.uid],
          driverId: null,
          createdAt: new Date().toISOString()
        });
        rideId = newRide.id;
      }
      const booking = await addDoc(collection(db, 'shared_bookings'), {
        passengerId: user.uid,
        passengerName: userProfile?.name || 'Passenger',
        rideId,
        routeId: selectedRoute.id,
        routeName: selectedRoute.name,
        boardingStop: selectedBoardingStop,
        dropStop: selectedDropStop,
        seats: selectedSeats,
        fare: sharedFare * selectedSeats,
        status: 'searching',
        createdAt: new Date().toISOString()
      });
      setSharedBookingId(booking.id);
    } catch (err) {
      console.error('Shared booking error:', err);
      setSharedBookingStatus('idle');
      showToast('Booking nahi ho saki. Dobara try karein.', 'error');
    }
  };

  const handleSharedReset = () => {
    setSharedBookingStatus('idle');
    setSharedBookingId(null);
    setSelectedRoute(null);
    setSelectedBoardingStop(null);
    setSelectedDropStop(null);
    setSharedFare(0);
    setSelectedSeats(1);
    setSharedDriverLocation(null);
    setSharedDriverHeading(0);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const findAndAssignDriver = async (bookingId, vType, rideOtp, logisticsData = {}) => {
    const RADII = [3, 5, 7];
    const EXPAND_MSGS = [
      '3km mein driver nahi mila, 5km mein dhundh rahe hain...',
      '5km mein bhi nahi mila, 7km tak dhundh rahe hain...',
    ];

    let allDrivers = [];
    try {
      // Fetch all online drivers of this type once — filter client-side per radius
      const q = query(
        collection(db, 'drivers'),
        where('isOnline', '==', true),
        where('vehicleType', '==', vType),
        limit(30)
      );
      const snapshot = await getDocs(q);
      allDrivers = snapshot.docs
        .map(d => ({ id: d.id, name: d.data().name, location: d.data().location }))
        .filter(d => !d.id.includes('_TEST'));
    } catch (err) {
      console.error('[findDriver] driver fetch failed:', err);
      // Continue with empty list — will hit noDriverFound path
    }

    let driversInRadius = [];

    for (let i = 0; i < RADII.length; i++) {
      if (searchAbortRef.current) return;

      // Show expansion message and pause before each new radius (skip first)
      if (i > 0) {
        setSearchRadiusMsg(EXPAND_MSGS[i - 1]);
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (searchAbortRef.current) return;
      }

      const radius = RADII[i];
      driversInRadius = allDrivers.filter(d => {
        if (!pickup || !d.location) return true;
        const dist = calculateDistance(pickup.lat, pickup.lng, d.location.lat, d.location.lng);
        return dist <= radius;
      });

      if (driversInRadius.length > 0) break;
    }

    if (searchAbortRef.current) return;

    // All radii exhausted — show retry UI
    if (driversInRadius.length === 0) {
      setSearchRadiusMsg(null);
      setNoDriverFound(true);
      return;
    }

    setSearchRadiusMsg(null);

    const requestRef = await addDoc(collection(db, 'ride_requests'), {
      bookingId,
      driverId: 'broadcast',
      vehicleType: vType,
      userId: user.uid,
      userPhone: userProfile?.phoneNumber || null,
      pickup,
      destination,
      fare: vType === 'battery_rickshaw' ? fare.savaari : fare.logistics,
      fareAmount: vType === 'battery_rickshaw' ? fare.savaari : fare.logistics,
      distanceKm: distanceKm || 0,
      status: 'pending',
      otp: rideOtp,
      createdAt: serverTimestamp(),
      ...logisticsData
    });

    setRequestId(requestRef.id);

    // Auto-cancel if no driver accepts within 5 minutes
    cancelTimeoutRef.current = setTimeout(async () => {
      if (searchAbortRef.current) return;
      try {
        await updateDoc(doc(db, 'ride_requests', requestRef.id), {
          status: 'cancelled', cancelledBy: 'system', cancellationReason: 'no_driver_accepted'
        });
      } catch { /* best-effort cancel */ }
      showToast('Koi driver available nahi hai. Thodi der baad try karein.', 'error');
      handleReset();
    }, 300000);

    const unsub = onSnapshot(doc(db, 'ride_requests', requestRef.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const status = data.status;

      if (status === 'accepted') {
        clearTimeout(cancelTimeoutRef.current); cancelTimeoutRef.current = null;
        if (data.driverId !== 'broadcast') {
          // Fetch driver phone so Call Driver button works
          getDoc(doc(db, 'drivers', data.driverId)).then(dSnap => {
            setMatchedDriver({
              id: data.driverId,
              name: data.driverName || 'Partner',
              rating: 4.8,
              phone: dSnap.exists() ? dSnap.data().phone : null
            });
          });
          setBookingStatus('accepted');
        }
      } else if (status === 'started') {
        if (data.driverId && data.driverId !== 'broadcast') {
          setBookingStatus('started');
        }
      } else if (status === 'completed') {
        setBookingStatus('completed');
      } else if (status === 'paid' || status === 'payment_done') {
        clearTimeout(cancelTimeoutRef.current); cancelTimeoutRef.current = null;
        setBookingStatus('payment_done');
        unsub();
      } else if (status === 'rejected') {
        clearTimeout(cancelTimeoutRef.current); cancelTimeoutRef.current = null;
        showToast('Driver abhi busy hai. Kripya dobara try karein.', 'error');
        setBookingStatus('idle');
        unsub();
      } else if (status === 'cancelled') {
        clearTimeout(cancelTimeoutRef.current); cancelTimeoutRef.current = null;
        showToast('Aapki ride cancel ho gayi.', 'error');
        handleReset();
        unsub();
      }
    });
    activeRequestUnsubRef.current = unsub;
  };

  const handleRetrySearch = () => {
    if (!retryParamsRef.current) return;
    setNoDriverFound(false);
    setSearchRadiusMsg(null);
    searchAbortRef.current = false;
    const { bookingId, vType, rideOtp, logisticsData } = retryParamsRef.current;
    findAndAssignDriver(bookingId, vType, rideOtp, logisticsData);
  };


  // Fix 6: Backup listener — auto-advance passenger when driver marks payment_done
  useEffect(() => {
    if (bookingStatus !== 'completed' || !requestId) return;
    const unsub = onSnapshot(doc(db, 'ride_requests', requestId), (snap) => {
      if (!snap.exists()) return;
      const s = snap.data().status;
      if (s === 'payment_done' || s === 'paid') {
        setBookingStatus('payment_done');
      }
    });
    return () => unsub();
  }, [bookingStatus, requestId]);

  // Show rating modal after payment
  useEffect(() => {
    if (bookingStatus === 'payment_done' || bookingStatus === 'paid') {
      const timer = setTimeout(() => {
        setShowRating(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [bookingStatus]);

  const scheduleMin = nowPlus30Min();
  const scheduleMax = nowPlus7Days();

  // Fetch upcoming scheduled rides when sidebar modal opens
  useEffect(() => {
    if (activeSidebarModal !== 'scheduled' || !user) return;
    startTransition(() => { setScheduledRidesLoading(true); });
    getDocs(query(collection(db, 'ride_requests'), where('userId', '==', user.uid), where('status', '==', 'scheduled'), limit(20)))
      .then(snap => {
        const now = Date.now();
        const rides = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => (r.scheduledAt?.toMillis?.() || 0) > now)
          .sort((a, b) => (a.scheduledAt?.toMillis?.() || 0) - (b.scheduledAt?.toMillis?.() || 0));
        setScheduledRides(rides);
      })
      .finally(() => setScheduledRidesLoading(false));
  }, [activeSidebarModal, user]);

  const handleCancelScheduled = async (rideId) => {
    try {
      await updateDoc(doc(db, 'ride_requests', rideId), { status: 'cancelled' });
      setScheduledRides(prev => prev.filter(r => r.id !== rideId));
    } catch (err) {
      console.error('Cancel scheduled ride error:', err);
      showToast('Cancel nahi ho saka. Dobara try karein.', 'error');
    }
  };

  const driverDistanceToWaypoint = useMemo(() => {
    if (!driverLiveLocation) return null;
    const waypoint = bookingStatus === 'accepted' ? pickup : destination;
    if (!waypoint) return null;
    const dist = calculateDistance(driverLiveLocation.lat, driverLiveLocation.lng, waypoint.lat, waypoint.lng);
    return dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
  }, [driverLiveLocation, bookingStatus, pickup, destination]);

  const currentFareBreakup = useMemo(() => {
    const distNum = parseFloat(distance) || 0;
    const waitingSeconds = activeRide?.waitingSeconds || 0;
    return computeFare(distNum, waitingSeconds, service, config);
  }, [distance, activeRide?.waitingSeconds, service, config]);

  const calculateFare = () => currentFareBreakup.total;



  const handlePaymentSuccess = async (method, response = {}) => {
    if (!requestId || !matchedDriver) return;
    if (isProcessingPayment.current) return;
    isProcessingPayment.current = true;

    setCompletedDriverName(matchedDriver?.name || activeRide?.driverName || null);
    // Must be set BEFORE updateDoc — RideContext sees payment_done as terminal and
    // calls setActiveRide(null), which triggers handleReset() unless bookingStatus is already payment_done
    setBookingStatus('payment_done');

    try {
      const amount = calculateFare();
      await updateDoc(doc(db, 'ride_requests', requestId), {
        status: 'payment_done',
        paymentStatus: 'completed',
        paymentMethod: method,
        fareAmount: amount,
        razorpayPaymentId: response.razorpay_payment_id || null
      });

      await addDoc(collection(db, 'transactions'), {
        rideId: requestId,
        userId: user.uid,
        driverId: matchedDriver.id,
        amount: amount,
        status: 'success',
        method: method,
        timestamp: new Date()
      });

      const driverEarning = Math.round(amount * (1 - (config.commissionPercent || 8) / 100));

      if (method === 'cash') {
        // Cash: driver physically collected full amount.
        // Commission deduction is handled exclusively by driver's handleCashCollected
        // (runTransaction with already_paid guard) to prevent double-deduction.
        // Passenger side only marks ride status + records the transaction log.
      } else {
        // Online: platform has money — credit 92.5% after commission
        await updateDoc(doc(db, 'drivers', matchedDriver.id), {
          walletBalance: increment(driverEarning),
          totalEarnings: increment(amount),
          onlineEarnings: increment(amount),
          totalRides: increment(1)
        });
        await addDoc(collection(db, 'wallet_transactions'), {
          driverId: matchedDriver.id,
          amount: driverEarning,
          fareCollected: amount,
          type: 'online_earned',
          status: 'completed',
          note: `Online ride - Fare ₹${amount}, Credited ₹${driverEarning}`,
          createdAt: serverTimestamp()
        });
      }

      setTimeout(() => setActiveRide(null), 2000);
    } catch (err) {
      console.error("Payment recording error:", err);
      setBookingStatus('completed'); // Revert so user can retry
      showToast('Payment mein error aaya. Dobara try karein.', 'error');
    } finally {
      isProcessingPayment.current = false;
    }
  };


  const handleSOS = async () => {
    if (!requestId) return;
    try {
      await updateDoc(doc(db, 'ride_requests', requestId), {
        status: 'emergency',
        emergencyTriggeredBy: 'passenger',
        emergencyTime: serverTimestamp()
      });
    } catch (err) {
      console.error("SOS Firestore error:", err);
      // Don't block 112 dial even if Firestore write fails
    }
  };

  const handlePayViaCash = async () => {
    if (!requestId || isPaymentLoading) return;
    setIsPaymentLoading(true);
    try {
      const rideSnap = await getDoc(doc(db, 'ride_requests', requestId));
      if (!rideSnap.exists()) return;
      const rideData = rideSnap.data();
      if (rideData.status === 'payment_done' || rideData.status === 'paid') {
        setActiveRide(null);
        return;
      }
      await handlePaymentSuccess('cash');
    } catch (err) {
      console.error('Cash payment error:', err);
      showToast('Payment mein error aaya. Dobara try karein.', 'error');
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const handleSubmitRating = async (rating) => {
    if (!matchedDriver || !requestId) return;
    try {
      await addDoc(collection(db, 'ratings'), {
        driverId: matchedDriver.id,
        userId: user.uid,
        rideId: requestId,
        rating: rating,
        timestamp: new Date()
      });

      const driverRef = doc(db, 'drivers', matchedDriver.id);
      const rideRef = doc(db, 'ride_requests', requestId);

      await runTransaction(db, async (tx) => {
        const driverSnap = await tx.get(driverRef);
        if (driverSnap.exists()) {
          const data = driverSnap.data();
          const currentRating = data.rating || 0;
          const currentCount = data.ratingCount || 0;
          const newCount = currentCount + 1;
          const newRating = ((currentRating * currentCount) + rating) / newCount;
          tx.update(driverRef, {
            rating: Number(newRating.toFixed(1)),
            ratingCount: newCount
          });
        }
        tx.update(rideRef, { status: 'finished', userRating: rating });
      });

      setShowRating(false);
      setActiveRide(null);
      setUserRating(0);
      handleReset();
    } catch (err) {
      console.error("Rating error:", err);
      setShowRating(false);
      setActiveRide(null);
      handleReset();
    }
  };

  const handleSkipRating = async () => {
    if (requestId) {
      try {
        await updateDoc(doc(db, 'ride_requests', requestId), { status: 'finished' });
      } catch (err) {
        console.error("Error updating status on skip:", err);
      }
    }
    setShowRating(false);
    setActiveRide(null);
    setUserRating(0);
    handleReset();
  };

  const handleCancelBooking = async (reason = '') => {
    try {
      const update = { status: 'cancelled', cancelledBy: 'customer' };
      if (reason) update.cancellationReason = reason;
      if (requestId) {
        await updateDoc(doc(db, 'ride_requests', requestId), update);
      }
      if (bookingId) {
        await updateDoc(doc(db, 'bookings', bookingId), { status: 'cancelled' });
      }
    } catch (err) {
      console.error("Cancellation error:", err);
    } finally {
      setShowCancelModal(false);
      setCancelReason('');
      handleReset();
    }
  };

  const handleCallDriver = () => {
    if (matchedDriver?.phone) {
      window.location.href = `tel:${matchedDriver.phone}`;
    } else {
      showToast('Driver ka phone number available nahi hai.', 'error');
    }
  };

  const handleShareTrip = () => {
    const text = `Main VahanSetu ride par hoon!\nDriver: ${matchedDriver?.name || 'Partner'}\nPickup: ${pickupInput}\nDestination: ${destInput}\nSurakshit rahein — VahanSetu`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleSwap = () => {
    const tempP = pickup; const tempPI = pickupInput;
    setPickup(destination); setPickupInput(destInput);
    setDestination(tempP); setDestInput(tempPI);
  };

  const handleMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPickup(pos); map?.panTo(pos); map?.setZoom(15);
        if (window.google) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: pos }, (results, status) => {
            if (status === "OK" && results[0]) {
              setPickupInput(results[0].formatted_address);
              setPickup({ ...pos, address: results[0].formatted_address });
            }
          });
        }
      }, () => showToast('Location access denied. Settings mein allow karein.', 'error'));
    }
  };

  const onMapLoad = useCallback((map) => setMap(map), []);

  return (
    <div className="relative h-screen w-full bg-slate-50 overflow-hidden font-sans">
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap mapContainerStyle={containerStyle} center={pickup || center} zoom={14} options={mapOptions} onLoad={onMapLoad}>
            {/* Fix 4: Alternate routes — clickable gray, tap to select */}
            {altRoutePaths.map((path, i) => (
              <Polyline
                key={`alt-route-${i}`}
                path={path}
                onClick={() => {
                  const newAlt = [routePath, ...altRoutePaths.filter((_, j) => j !== i)];
                  setRoutePath(path);
                  setAltRoutePaths(newAlt);
                }}
                options={{
                  strokeColor: '#94a3b8',
                  strokeOpacity: 0.6,
                  strokeWeight: 6,
                  zIndex: 0,
                  lineCap: 'round',
                  clickable: true,
                }}
              />
            ))}
            {/* pickup→destination route — shown during idle/started, faded during accepted */}
            {routePath.length > 0 && (
              <Polyline
                path={routePath}
                options={{
                  strokeColor: '#2563eb',
                  strokeOpacity: bookingStatus === 'accepted' ? 0.25 : 0.9,
                  strokeWeight: 8,
                  zIndex: 1,
                  lineCap: 'round',
                  geodesic: true
                }}
              />
            )}

            {/* live driver route — orange during accepted (→pickup), green during started (→dest) */}
            {driverToPickupPath.length > 0 && (bookingStatus === 'accepted' || bookingStatus === 'started') && (
              <Polyline
                path={driverToPickupPath}
                options={{
                  strokeColor: bookingStatus === 'started' ? '#16a34a' : '#f97316',
                  strokeOpacity: 0.9,
                  strokeWeight: 6,
                  zIndex: 2,
                  lineCap: 'round',
                  geodesic: true
                }}
              />
            )}

            {/* Static nearby drivers — hidden during active ride tracking */}
            {!driverLiveLocation && drivers
              .filter(d => {
                if (!pickup || !d.location) return true;
                const dist = calculateDistance(pickup.lat, pickup.lng, d.location.lat, d.location.lng);
                return dist <= 3;
              })
              .map((d, index) => {
                const basePos = d.location || center;
                const jitter = 0.00005;
                const pos = {
                  lat: basePos.lat + (index * jitter * (index % 2 === 0 ? 1 : -1)),
                  lng: basePos.lng + (index * jitter * (index % 3 === 0 ? 1 : -1))
                };
                return (
                  <Marker
                    key={d.id}
                    position={pos}
                    zIndex={1000}
                    options={{ optimized: false }}
                    icon={isLowData ? {
                      path: window.google.maps.SymbolPath.CIRCLE,
                      scale: 6,
                      fillColor: '#3b82f6',
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: '#ffffff'
                    } : {
                      url: service === 'savaari'
                        ? 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png'
                        : 'https://cdn-icons-png.flaticon.com/512/2555/2555013.png',
                      scaledSize: new window.google.maps.Size(40, 40),
                      anchor: new window.google.maps.Point(20, 20)
                    }}
                  />
                );
              })}

            {/* Live driver tracking marker — arrow with heading rotation */}
            {driverLiveLocation && (
              <Marker
                position={driverLiveLocation}
                zIndex={2000}
                options={{ optimized: false }}
                icon={{
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 7,
                  fillColor: service === 'savaari' ? '#2563eb' : '#16a34a',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                  rotation: driverHeading,
                }}
              />
            )}

            {pickup && <Marker position={pickup} zIndex={100} icon="https://maps.google.com/mapfiles/ms/icons/blue-dot.png" />}
            {destination && <Marker position={destination} zIndex={100} icon="https://maps.google.com/mapfiles/ms/icons/red-dot.png" />}
          </GoogleMap>
        ) : <div className="w-full h-full bg-slate-100" />}
      </div>

      {/* ETA pill — idle: pickup→dest, accepted: driver→pickup, started: pickup→dest */}
      {bookingStatus === 'idle' && routeEta && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[30] flex items-center gap-3 bg-slate-900/90 backdrop-blur-sm text-white px-5 py-2 rounded-full text-sm shadow-lg pointer-events-none" style={{ bottom: '46vh' }}>
          <span className="font-bold">{routeEta.duration}</span>
          <span className="text-slate-500">·</span>
          <span className="font-bold">{routeEta.distance}</span>
        </div>
      )}
      {bookingStatus === 'accepted' && driverToPickupEta && (
        <div className="absolute left-0 right-0 z-[30] flex items-center justify-between bg-slate-900/95 backdrop-blur-sm text-white px-5 py-3 shadow-lg pointer-events-none" style={{ bottom: '48vh' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-300">Driver Aa Raha Hai</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-black text-sm">{driverToPickupEta.duration}</span>
            <span className="text-slate-400 text-xs">·</span>
            <span className="text-slate-300 text-sm">{driverToPickupEta.distance}</span>
            <span className="text-slate-400 text-xs">ETA {driverToPickupEta.arrivalTime}</span>
          </div>
        </div>
      )}
      {bookingStatus === 'started' && (driverToPickupEta || routeEta) && (
        <div className="absolute left-0 right-0 z-[30] flex items-center justify-between bg-slate-900/95 backdrop-blur-sm text-white px-5 py-3 shadow-lg pointer-events-none" style={{ bottom: '48vh' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Ride Chal Rahi Hai</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-black text-sm">{(driverToPickupEta || routeEta).duration}</span>
            <span className="text-slate-400 text-xs">·</span>
            <span className="text-slate-300 text-sm">{(driverToPickupEta || routeEta).distance}</span>
            {driverToPickupEta?.arrivalTime && (
              <span className="text-slate-400 text-xs">ETA {driverToPickupEta.arrivalTime}</span>
            )}
          </div>
        </div>
      )}

      {/* SOS Emergency Button — logs to Firestore then dials 112 */}
      {(bookingStatus === 'accepted' || bookingStatus === 'started') && (
        <>
          <button
            onClick={async () => {
              await handleSOS();
              window.open('tel:112');
            }}
            className="fixed bottom-32 right-4 z-[500] bg-red-600 text-white font-black text-[11px] rounded-full shadow-2xl shadow-red-600/50 active:scale-90 transition-all border-2 border-red-400 flex items-center justify-center"
            style={{ width: 56, height: 56 }}
          >
            SOS 🆘
          </button>
          <button
            onClick={handleShareRide}
            title="Parivaar ko bhejo"
            className="fixed bottom-32 left-4 z-[500] bg-white text-emerald-600 rounded-full shadow-2xl active:scale-90 transition-all border-2 border-emerald-200 flex items-center justify-center"
            style={{ width: 56, height: 56 }}
          >
            <Share2 size={22} />
          </button>
        </>
      )}

      <div className="absolute top-8 left-6 right-6 z-10 flex justify-between items-center">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="w-11 h-11 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-600 border border-slate-100 hover:bg-slate-50 transition-all active:scale-95"
        >
          <Menu size={20} />
        </button>
        <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-white/50 flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black tracking-widest text-slate-700 uppercase">
            {liveDriversCount > 0 ? `${liveDriversCount} Drivers Live` : 'Live Network'}
          </span>
          <button 
            onClick={() => setIsLowData(!isLowData)}
            className={`ml-2 p-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${isLowData ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            {isLowData ? 'LOW DATA: ON' : 'HQ MODE'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!map || !window.google) return;
              if ((bookingStatus === 'accepted' || bookingStatus === 'started') && driverLiveLocation) {
                const bounds = new window.google.maps.LatLngBounds();
                bounds.extend(driverLiveLocation);
                const waypoint = bookingStatus === 'accepted' ? pickup : destination;
                if (waypoint) bounds.extend(waypoint);
                map.fitBounds(bounds, { top: 120, bottom: 420, left: 60, right: 60 });
              } else {
                map.panTo(pickup || center);
                map.setZoom(15);
              }
            }}
            className="w-11 h-11 bg-white rounded-2xl shadow-xl flex items-center justify-center text-blue-600 border border-slate-100 hover:bg-slate-50 transition-all active:scale-95"
          >
            <Navigation size={20} />
          </button>
          <button
            onClick={() => { setActiveSidebarModal('notifications'); setIsSidebarOpen(false); }}
            className="w-11 h-11 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-600 border border-slate-100 hover:bg-slate-50 transition-all relative"
          >
            <Bell size={20} />
            {notifications && notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black text-white flex items-center justify-center">{notifications.length > 9 ? '9+' : notifications.length}</span>
            )}
          </button>
          <button
            onClick={logout}
            className="w-11 h-11 bg-white rounded-2xl shadow-xl flex items-center justify-center text-red-500 border border-slate-100 hover:bg-red-50 transition-all"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
          <LanguageToggle />
        </div>
      </div>


      {/* Ride tracking card — minimize/maximize, shown above bottom panel */}
      <AnimatePresence>
        {(bookingStatus === 'accepted' || bookingStatus === 'started') && matchedDriver && (
          <motion.div
            key="ride-card"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="absolute left-4 right-4 z-[25]"
            style={{ bottom: '5.5rem' }}
          >
            <AnimatePresence mode="wait">
              {isMinimized ? (
                /* Compact pill — minimized */
                <motion.div
                  key="mini"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex items-center justify-between bg-slate-900/90 backdrop-blur-md rounded-full px-5 py-3 shadow-2xl border border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${bookingStatus === 'started' ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                    <span className="text-white text-[10px] font-black uppercase tracking-widest">
                      {bookingStatus === 'started' ? 'Trip Live' : matchedDriver.name}
                    </span>
                    {driverDistanceToWaypoint && bookingStatus === 'accepted' && (
                      <span className="text-[9px] text-white/50">• {driverDistanceToWaypoint}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {bookingStatus === 'accepted' && (
                      <span className="text-white text-sm font-black bg-white/20 px-3 py-0.5 rounded-xl tracking-widest">{otp}</span>
                    )}
                    {bookingStatus === 'started' && (
                      <span className="text-emerald-400 text-[10px] font-black bg-white/10 px-3 py-0.5 rounded-xl uppercase">Live</span>
                    )}
                    <button
                      onClick={() => setIsMinimized(false)}
                      className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center"
                    >
                      <ChevronRight size={13} className="text-white -rotate-90" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Full expanded card */
                <motion.div
                  key="full"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-slate-900 rounded-[2rem] p-5 shadow-2xl border border-white/10"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bookingStatus === 'started' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                        {bookingStatus === 'started'
                          ? <Navigation size={16} className="text-emerald-400 animate-pulse" />
                          : <User size={16} className="text-blue-400" />}
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                          {bookingStatus === 'started' ? 'Ongoing Trip' : 'Driver Assigned'}
                        </p>
                        <h3 className="text-sm font-black text-white leading-tight">{matchedDriver.name}</h3>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsMinimized(true)}
                      className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center"
                    >
                      <ChevronRight size={14} className="text-white rotate-90" />
                    </button>
                  </div>

                  {/* OTP — prominently visible during accepted */}
                  {bookingStatus === 'accepted' && (
                    <div className="bg-white/10 rounded-2xl p-4 mb-4 text-center border border-white/10">
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Share OTP with Driver</p>
                      <p className="text-4xl font-black text-white tracking-[0.3em]">{otp}</p>
                    </div>
                  )}

                  {/* Vehicle Number */}
                  {(bookingStatus === 'accepted' || bookingStatus === 'started') && (activeRide?.vehicleNumber || activeRide?.driverVehicle) && (
                    <div className="bg-white/10 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 border border-white/10">
                      <Car size={14} className="text-white/50 shrink-0" />
                      <div>
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">गाड़ी नंबर</p>
                        <p className="text-sm font-black text-white tracking-widest">{activeRide?.vehicleNumber || activeRide?.driverVehicle}</p>
                      </div>
                    </div>
                  )}

                  {/* Distance info */}
                  {driverDistanceToWaypoint && bookingStatus === 'accepted' && (
                    <div className="flex items-center gap-2 mb-4">
                      <Navigation size={11} className="text-white/40" />
                      <span className="text-[10px] text-white/60 font-bold">Driver is {driverDistanceToWaypoint} away</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  {bookingStatus === 'accepted' ? (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <button onClick={handleCallDriver} className="flex flex-col items-center gap-1.5 py-3 bg-white/10 rounded-2xl font-black text-[9px] text-white active:scale-95 transition-all">
                        <Phone size={15} /> CALL
                      </button>
                      <button onClick={() => setIsSafetyModalOpen(true)} className="flex flex-col items-center gap-1.5 py-3 bg-white/10 rounded-2xl font-black text-[9px] text-white active:scale-95 transition-all">
                        <ShieldCheck size={15} /> SAFETY
                      </button>
                      <button onClick={() => setShowCancelModal(true)} className="flex flex-col items-center gap-1.5 py-3 bg-red-500/20 rounded-2xl font-black text-[9px] text-red-400 active:scale-95 transition-all border border-red-500/20">
                        <X size={15} /> CANCEL
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Safety First: Stay in vehicle</p>
                      <button onClick={async () => { await handleSOS(); window.open('tel:112'); }} className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                        <AlertCircle size={15} className="text-white" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (requestId) {
                        try { await updateDoc(doc(db, 'ride_requests', requestId), { status: 'cancelled', cancelledBy: 'customer', cancellationReason: 'force_clear' }); } catch { /* best-effort */ }
                      }
                      setActiveRide(null);
                      handleReset();
                    }}
                    className="w-full text-[8px] font-black text-white/20 uppercase tracking-[0.4em] text-center hover:text-red-400 transition-colors py-1"
                  >
                    Ride stuck? Force Clear
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-[400] bg-slate-900/40 backdrop-blur-sm"
            />
            
            {/* Sidebar Content */}
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[85%] max-w-[320px] z-[500] bg-white shadow-2xl flex flex-col"
            >
              {/* Sidebar Header */}
              <div className="p-8 pb-10 bg-slate-900 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 border border-white/20 overflow-hidden">
                    <img src="/VahanSetu_Final_Logo.png" alt="VahanSetu" className="w-14 h-14 object-contain" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight">{userProfile?.name || 'VahanSetu User'}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 bg-blue-400/10 px-2 py-1 rounded-md">
                      ID: {userProfile?.displayId || 'VS-GUEST'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sidebar Links */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {requestId && (
                  <div 
                    onClick={() => { setIsSidebarOpen(false); setIsMinimized(false); }}
                    className="mb-4 bg-blue-600 p-4 rounded-2xl text-white cursor-pointer shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Navigation size={18} className="animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Active Ride</span>
                    </div>
                    <p className="text-sm font-bold">Track Your Trip Live</p>
                  </div>
                )}

                <SidebarLink icon={<History size={18} />} label="Ride History" onClick={() => { setActiveSidebarModal('history'); setIsSidebarOpen(false); }} />
                <SidebarLink icon={<CreditCard size={18} />} label="Ride Credit Balance" onClick={() => { setActiveSidebarModal('wallet'); setIsSidebarOpen(false); }} />
                <SidebarLink icon={<Gift size={18} />} label="Refer & Earn" onClick={() => { setActiveSidebarModal('refer'); setIsSidebarOpen(false); }} />
                <SidebarLink icon={<ShieldCheck size={18} />} label="Safety Settings" onClick={() => { setIsSafetyModalOpen(true); setIsSidebarOpen(false); }} />
                <SidebarLink icon={<Clock size={18} />} label="Scheduled Rides" onClick={() => { setActiveSidebarModal('scheduled'); setIsSidebarOpen(false); }} />
                <div className="h-px bg-slate-100 my-4" />
                <SidebarLink icon={<Smartphone size={18} />} label="Support & Help" onClick={() => { setActiveSidebarModal('support'); setIsSidebarOpen(false); }} />
                <SidebarLink icon={<AlertCircle size={18} />} label="Help & Grievance" onClick={() => { setActiveSidebarModal('grievance'); setIsSidebarOpen(false); }} />
                <SidebarLink icon={<MapPin size={18} />} label="Saved Places" onClick={() => { setActiveSidebarModal('places'); setIsSidebarOpen(false); }} />
                <div className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50/60 opacity-60 cursor-not-allowed">
                  <Smartphone size={18} className="text-slate-300" />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Offline Booking</span>
                    <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-widest">Coming Soon</span>
                  </div>
                </div>
              </div>

              {/* Sidebar Footer */}
              <div className="p-6 border-t border-slate-50">
                <div className="mb-4">
                  <p className="text-xs text-slate-400 font-bold mb-2">Language / भाषा</p>
                  <LanguageToggle className="w-full justify-center" />
                </div>
                <button
                  onClick={logout}
                  className="w-full p-4 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                >
                  <LogOut size={16} /> Sign Out
                </button>
                <p className="text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.3em] mt-6">VahanSetu v2.0.4</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar Modals (History, Wallet, Support) */}
      <AnimatePresence>
        {activeSidebarModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[3rem] p-8 w-full max-w-md shadow-2xl relative max-h-[80vh] overflow-y-auto"
            >
              <button 
                onClick={() => setActiveSidebarModal(null)}
                className="absolute right-6 top-6 w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"
              >
                <X size={20} />
              </button>

              {activeSidebarModal === 'history' && (
                <div className="space-y-5">
                  <div className="text-center">
                    <History className="mx-auto text-blue-600 mb-2" size={32} />
                    <h3 className="text-xl font-black text-slate-800">Ride History</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Last 25 rides</p>
                  </div>

                  {historyLoading ? (
                    <div className="flex flex-col gap-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : rideHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <History size={40} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-sm font-black text-slate-400">Koi ride history nahi mili</p>
                      <p className="text-[10px] text-slate-300 mt-1">Pehli ride book karo!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rideHistory.map(ride => {
                        const { label, color } = statusMeta(ride.status);
                        const isLogistics = ride.vehicleType === 'chhota_hathi';
                        return (
                          <div key={ride.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${color}`}>{label}</span>
                                <span className="text-[9px] font-bold text-slate-400">{isLogistics ? '🚛 Logistics' : '🛺 Savaari'}</span>
                              </div>
                              <span className="text-sm font-black text-slate-800">
                                {ride.fareAmount ? `₹${ride.fareAmount}` : ride.fare ? `₹${ride.fare}` : '—'}
                              </span>
                            </div>
                            <div className="flex items-start gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                              <p className="text-[11px] font-bold text-slate-600 leading-tight line-clamp-1">
                                {ride.pickup?.address || 'Pickup location'}
                              </p>
                            </div>
                            <div className="flex items-start gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
                              <p className="text-[11px] font-bold text-slate-400 leading-tight line-clamp-1">
                                {ride.destination?.address || 'Destination'}
                              </p>
                            </div>
                            {ride.cancellationReason && (
                              <p className="text-[9px] font-bold text-red-400 bg-red-50 rounded-lg px-2 py-1 mb-2">
                                Karan: {ride.cancellationReason}
                              </p>
                            )}
                            <div className="flex justify-between items-center">
                              <p className="text-[9px] font-black text-slate-300 uppercase">{formatDate(ride.createdAt)}</p>
                              {ride.driverName && (
                                <p className="text-[9px] font-bold text-slate-400">{ride.driverName}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] py-2">— End of History —</p>
                    </div>
                  )}
                </div>
              )}

              {activeSidebarModal === 'wallet' && (
                <div className="space-y-8 py-4">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                      <IndianRupee size={32} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ride Credit Balance</p>
                    <h2 className="text-4xl font-black text-slate-800 mt-1">₹{Number(userProfile?.balance || 0).toFixed(2)}</h2>
                  </div>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-[12px] font-bold text-amber-800 text-center leading-relaxed">
                      Ride Credit aapke referral bonus aur promotions se milta hai.<br />
                      Direct UPI/QR se payment karein.
                    </p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Recent Transactions</p>
                    {walletTxns === null ? (
                      <div className="space-y-2">
                        {[1,2].map(i => <div key={i} className="h-8 bg-slate-200 rounded-xl animate-pulse" />)}
                      </div>
                    ) : walletTxns.length === 0 ? (
                      <p className="text-[11px] text-slate-400 font-bold text-center py-3">Abhi tak koi transaction nahi</p>
                    ) : (
                      <div className="space-y-3">
                        {walletTxns.map(tx => (
                          <div key={tx.id} className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-slate-700">
                              {tx.method === 'cash' ? 'Cash Ride' : tx.method === 'online' ? 'Online Ride' : 'Ride Payment'}
                            </span>
                            <span className="text-xs font-black text-red-500">-₹{tx.amount}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeSidebarModal === 'refer' && (
                <div className="space-y-6 py-4">
                  {/* Header */}
                  <div className="text-center">
                    <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                      <Gift size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">Refer & Earn</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Dono ko milega reward!</p>
                  </div>

                  {/* How it works */}
                  <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 space-y-3">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Kaise kaam karta hai</p>
                    {[
                      { step: '1', text: `Apna VS-ID share karo` },
                      { step: '2', text: `Friend register kare aur pehli ride le` },
                      { step: '3', text: `Aapko ₹${config.referralReferrerReward} + Friend ko ₹${config.referralRefereeReward} milega` },
                    ].map(({ step, text }) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{step}</div>
                        <p className="text-xs font-bold text-amber-800">{text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Your VS-ID share card */}
                  <div className="bg-slate-900 rounded-3xl p-5">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Aapka Referral Code</p>
                    <div className="flex items-center justify-between bg-white/10 rounded-2xl px-4 py-3 mb-4">
                      <span className="text-2xl font-black text-white tracking-widest">{userProfile?.displayId || 'VS-...'}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(userProfile?.displayId || '').catch(() => {});
                          setReferralCopied(true);
                          setTimeout(() => setReferralCopied(false), 2000);
                        }}
                        className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-xl text-white text-[10px] font-black active:scale-95 transition-all"
                      >
                        <Copy size={12} /> {referralCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        const text = `VahanSetu pe ride book karo! Mera referral code use karo: ${userProfile?.displayId}\n\nRegister karo: https://vahansetuapnigadi.web.app\n\nPehli ride pe tumhe ₹${config.referralRefereeReward} milenge, mujhe ₹${config.referralReferrerReward}!`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                      }}
                      className="w-full py-3 bg-emerald-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Users size={14} /> WhatsApp pe Share Karo
                    </button>
                  </div>

                  {/* Balance with 50% rule */}
                  <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Meri Ride Credit</p>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-600">Total Balance</span>
                      <span className="text-xl font-black text-slate-800">₹{Number(userProfile?.balance || 0).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-slate-600">Usable (50% rule)</span>
                      <span className="text-xl font-black text-emerald-600">₹{Math.floor((userProfile?.balance || 0) * 0.5)}</span>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                      <p className="text-[10px] font-bold text-blue-700 text-center leading-relaxed">
                        Ek ride mein max 50% balance use kar sakte hain.<br />
                        Online payment launch hone ke baad automatically deduct hoga.
                      </p>
                    </div>
                  </div>

                  {/* Referral history */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mere Referrals</p>
                    {myReferrals === null ? (
                      <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
                    ) : myReferrals.length === 0 ? (
                      <div className="text-center py-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <Gift size={28} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-400">Abhi tak koi referral nahi</p>
                        <p className="text-[10px] font-bold text-slate-300 mt-1">VS-ID share karo aur earn karo!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {myReferrals.map(ref => (
                          <div key={ref.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div>
                              <p className="text-xs font-black text-slate-700">{ref.refereeName}</p>
                              <p className="text-[9px] font-bold text-slate-400">{ref.refereeDisplayId}</p>
                            </div>
                            {ref.status === 'rewarded' ? (
                              <div className="text-right">
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">+₹{ref.referrerReward || config.referralReferrerReward} Credited</span>
                              </div>
                            ) : (
                              <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pehli ride baki</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeSidebarModal === 'notifications' && (
                <div className="space-y-5 py-4">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                      <Bell size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">Notifications</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Latest updates</p>
                  </div>

                  {notifications === null ? (
                    <div className="space-y-3">
                      {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />)}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-3xl border border-slate-100">
                      <Bell size={36} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-sm font-black text-slate-400">Koi notification nahi</p>
                      <p className="text-[10px] font-bold text-slate-300 mt-1">Ride complete karne ke baad yahan updates aayenge</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {notifications.map(n => {
                        const date = n.createdAt?.toDate?.()?.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
                        return (
                          <div key={n.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                            <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                              <Bell size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800 leading-snug">{n.title || 'Notification'}</p>
                              {n.body && <p className="text-[10px] font-bold text-slate-500 mt-0.5 leading-snug">{n.body}</p>}
                              {date && <p className="text-[9px] font-black text-slate-300 uppercase mt-1">{date}</p>}
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] py-2">— End —</p>
                    </div>
                  )}
                </div>
              )}

              {activeSidebarModal === 'places' && (
                <div className="space-y-5 py-4">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                      <MapPin size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">Saved Places</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Jaldi select karo — Home, Work</p>
                  </div>

                  {/* Saved places list */}
                  <div className="space-y-3">
                    {['Home', 'Work', 'Other'].map(name => {
                      const place = (savedPlaces || []).find(p => p.name === name);
                      return (
                        <div key={name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-black ${name === 'Home' ? 'bg-blue-100 text-blue-600' : name === 'Work' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                            {name === 'Home' ? '🏠' : name === 'Work' ? '💼' : '📍'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-700">{name}</p>
                            {place ? (
                              <p className="text-[10px] font-bold text-slate-400 truncate">{place.address}</p>
                            ) : (
                              <p className="text-[10px] font-bold text-slate-300">Abhi save nahi hai</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {place && (
                              <button
                                onClick={() => { setPickup({ lat: place.lat, lng: place.lng, address: place.address }); setPickupInput(place.address); setActiveSidebarModal(null); showToast(`${name} pickup set!`, 'success'); }}
                                className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg active:scale-95 transition-all"
                              >Use</button>
                            )}
                            {pickup && (
                              <button
                                onClick={() => handleSavePlace(name)}
                                disabled={savingPlace}
                                className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg active:scale-95 transition-all disabled:opacity-50"
                              >{savingPlace ? '...' : 'Save'}</button>
                            )}
                            {place && (
                              <button
                                onClick={() => handleDeletePlace(name)}
                                className="text-[9px] font-black text-red-400 bg-red-50 px-2 py-1 rounded-lg active:scale-95 transition-all"
                              >Del</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Instructions */}
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-blue-700 leading-relaxed text-center">
                      Pehle map pe pickup set karo,<br />
                      phir yahan "Save" karein.<br />
                      Baad mein "Use" tap karo — seedha fill ho jaayega.
                    </p>
                  </div>
                </div>
              )}

              {activeSidebarModal === 'support' && (
                <div className="space-y-8 py-4">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                      <Smartphone size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">VahanSetu Support</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">We are here to help you 24/7</p>
                  </div>
                  <div className="space-y-4">
                    <button onClick={() => window.open(`https://wa.me/91${config.grievancePhone}`, '_blank')} className="w-full p-5 bg-emerald-600 text-white rounded-3xl flex items-center justify-center gap-4 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
                      CHAT ON WHATSAPP
                    </button>
                    <button onClick={() => window.location.href = `tel:+91${config.grievancePhone}`} className="w-full p-5 bg-slate-900 text-white rounded-3xl flex items-center justify-center gap-4 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
                      CALL SUPPORT
                    </button>
                  </div>
                </div>
              )}

              {activeSidebarModal === 'grievance' && (
                <div className="space-y-6 py-4">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                      <AlertCircle size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">Help & Grievance</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">VahanSetu ApniGadi</p>
                  </div>
                  <div className="space-y-3">
                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Email</p>
                      <p className="text-sm font-black text-slate-800">apnigadivahansetu@gmail.com</p>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone / WhatsApp</p>
                      <p className="text-sm font-black text-slate-800">+91 {config.grievancePhone}</p>
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                      <p className="text-[11px] font-bold text-amber-800 text-center">Response time: 24-48 hours</p>
                    </div>
                    <button
                      onClick={() => window.open(`tel:+91${config.grievancePhone}`)}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                    >
                      Call Now
                    </button>
                  </div>
                </div>
              )}

              {activeSidebarModal === 'scheduled' && (
                <div className="space-y-5">
                  <div className="text-center">
                    <Clock className="mx-auto text-amber-500 mb-2" size={32} />
                    <h3 className="text-xl font-black text-slate-800">Scheduled Rides</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Upcoming bookings</p>
                  </div>

                  {scheduledRidesLoading ? (
                    <div className="space-y-3">
                      {[1,2].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />)}
                    </div>
                  ) : scheduledRides.length === 0 ? (
                    <div className="text-center py-10">
                      <Clock size={40} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-sm font-black text-slate-400">Koi scheduled ride nahi hai</p>
                      <p className="text-[10px] text-slate-300 mt-1">Booking form mein "Schedule for Later" toggle karein</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scheduledRides.map(ride => {
                        const schedDate = ride.scheduledAt?.toDate?.();
                        return (
                          <div key={ride.id} className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[9px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-lg uppercase tracking-widest">⏰ Scheduled</span>
                              <span className="text-sm font-black text-slate-800">
                                {ride.fareAmount ? `₹${ride.fareAmount}` : ride.fare ? `₹${ride.fare}` : '—'}
                              </span>
                            </div>
                            {schedDate && (
                              <p className="text-xs font-black text-slate-700 mb-2">
                                {schedDate.toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              <p className="text-[10px] font-bold text-slate-600 truncate">{ride.pickup?.address || 'Pickup'}</p>
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                              <p className="text-[10px] font-bold text-slate-400 truncate">{ride.destination?.address || 'Destination'}</p>
                            </div>
                            <button
                              onClick={() => handleCancelScheduled(ride.id)}
                              className="w-full py-2 bg-red-50 text-red-500 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all"
                            >
                              Cancel Ride
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Safety Tools Modal */}
      <AnimatePresence>
        {isSafetyModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-end md:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl relative"
            >
              <button 
                onClick={() => setIsSafetyModalOpen(false)}
                className="absolute right-6 top-6 w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mb-4">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-800">Safety Toolkit</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Your security is our priority</p>
              </div>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleShareTrip}
                  className="w-full p-5 bg-slate-50 rounded-3xl flex items-center justify-between group hover:bg-emerald-50 transition-all border border-slate-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm"><Smartphone size={20} /></div>
                    <div className="text-left">
                      <p className="text-sm font-black text-slate-800">Share Trip Details</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Send via WhatsApp</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-500" />
                </button>

                <button
                  onClick={async () => { await handleSOS(); window.open('tel:112'); }}
                  className="w-full p-5 bg-red-50 rounded-3xl flex items-center justify-between group hover:bg-red-100 transition-all border border-red-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-red-600 shadow-sm"><AlertCircle size={20} /></div>
                    <div className="text-left">
                      <p className="text-sm font-black text-red-600">Trigger SOS Alert</p>
                      <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest">Emergency services</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-red-300 group-hover:text-red-600" />
                </button>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <button onClick={() => window.location.href = 'tel:100'} className="py-4 bg-slate-50 rounded-2xl text-[10px] font-black text-slate-600 flex items-center justify-center gap-2 border border-slate-100">
                    POLICE (100)
                  </button>
                  <button onClick={() => window.location.href = 'tel:108'} className="py-4 bg-slate-50 rounded-2xl text-[10px] font-black text-slate-600 flex items-center justify-center gap-2 border border-slate-100">
                    AMBULANCE
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancellation Reason Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-end justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-slate-800">Cancel Karne Ka Karan?</h3>
                <button
                  onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                  className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-6">
                {[
                  'Driver bahut der se aa raha hai',
                  'Plan badal gaya',
                  'Galat location select ki',
                  'Doosra transport mil gaya',
                  'Emergency aa gayi',
                  'Koi aur karan',
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setCancelReason(reason)}
                    className={`text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all border-2 ${
                      cancelReason === reason
                        ? 'bg-red-50 border-red-400 text-red-700'
                        : 'bg-slate-50 border-transparent text-slate-700 hover:border-slate-200'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest"
                >
                  Wapas Jao
                </button>
                <button
                  onClick={() => handleCancelBooking(cancelReason)}
                  className="flex-[2] py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-500/30 disabled:opacity-40"
                  disabled={!cancelReason}
                >
                  Haan, Cancel Karo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Compact search card — idle + private mode only */}
      {bookingStatus === 'idle' && rideMode === 'private' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-4 right-4 z-[15]"
          style={{ top: '5.5rem' }}
        >
          {/* Saved place quick-chips */}
          {userProfile?.savedPlaces?.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-hide pb-1">
              {userProfile.savedPlaces.map(place => (
                <button
                  key={place.name}
                  onClick={() => { setPickup({ lat: place.lat, lng: place.lng, address: place.address }); setPickupInput(place.address); }}
                  className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[10px] font-black text-slate-700 shadow border border-slate-100 whitespace-nowrap active:scale-95 transition-all shrink-0"
                >
                  <span>{place.name === 'Home' ? '🏠' : place.name === 'Work' ? '💼' : '📍'}</span>
                  {place.name}
                </button>
              ))}
            </div>
          )}
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="flex items-center px-4 py-3.5 gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <input
                ref={pickupInputRef}
                type="text"
                placeholder="Pickup location..."
                className="flex-1 text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                value={pickupInput}
                onChange={(e) => setPickupInput(e.target.value)}
              />
              <button onClick={handleMyLocation} className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors shrink-0">
                <LocateFixed size={16} />
              </button>
              <button onClick={handleSwap} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors shrink-0">
                <ArrowUpDown size={16} />
              </button>
            </div>
            <div className="h-px bg-slate-100 mx-4" />
            <div className="flex items-center px-4 py-3.5 gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
              <input
                ref={destInputRef}
                type="text"
                placeholder="Where to?"
                className="flex-1 text-sm font-bold text-slate-400 outline-none placeholder:text-slate-300"
                value={destInput}
                onChange={(e) => setDestInput(e.target.value)}
              />
              {destInput && (
                <button onClick={() => { setDestination(null); setDestInput(''); }} className="p-1 text-slate-300 shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Bottom action bar — idle only */}
      {bookingStatus === 'idle' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-[2.5rem] shadow-[0_-20px_50px_rgba(0,0,0,0.12)] px-5 pt-5 pb-8">
          <div className="w-10 h-1 bg-slate-100 rounded-full mx-auto mb-4" />

          {/* Ride Mode Toggle */}
          <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-2xl">
            <button onClick={() => setRideMode('private')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${rideMode === 'private' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'text-slate-500'}`}>
              {t('nijiYatra')}
            </button>
            <button onClick={() => { setRideMode('shared'); handleSharedReset(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${rideMode === 'shared' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'text-slate-500'}`}>
              {t('saanjhiYatra')}
            </button>
          </div>

          {/* Private Ride Content */}
          {rideMode === 'private' && (<>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setService('savaari')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  service === 'savaari' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'bg-slate-50 text-slate-500 border border-slate-100'
                }`}
              >
                <Car size={16} /> Savaari{fare.savaari ? ` ₹${fare.savaari}` : ''}
              </button>
              <button
                onClick={() => setService('logistics')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  service === 'logistics' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-slate-50 text-slate-500 border border-slate-100'
                }`}
              >
                <Truck size={16} /> Logistics{fare.logistics ? ` ₹${fare.logistics}` : ''}
              </button>
            </div>

            {service === 'logistics' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex gap-3 mb-4 overflow-hidden">
                <div className="flex-1 bg-slate-50 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-slate-100">
                  <Package size={14} className="text-emerald-500 shrink-0" />
                  <input type="text" placeholder="Goods type" className="bg-transparent text-xs font-bold outline-none w-full" value={goodsType} onChange={(e) => setGoodsType(e.target.value)} />
                </div>
                <div className="flex-1 bg-slate-50 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-slate-100">
                  <Scale size={14} className="text-emerald-500 shrink-0" />
                  <input type="text" placeholder="Weight (kg)" className="bg-transparent text-xs font-bold outline-none w-full" value={goodsWeight} onChange={(e) => setGoodsWeight(e.target.value)} />
                </div>
              </motion.div>
            )}

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className={isScheduled ? 'text-amber-500' : 'text-slate-300'} />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Schedule for Later</span>
              </div>
              <button onClick={() => setIsScheduled(s => !s)} className={`w-10 h-5 rounded-full transition-all relative ${isScheduled ? 'bg-amber-500' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${isScheduled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {isScheduled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4 overflow-hidden">
                <input type="datetime-local" min={scheduleMin} max={scheduleMax} value={scheduledDateTime} onChange={e => setScheduledDateTime(e.target.value)} className="w-full bg-amber-50 border-2 border-amber-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-amber-400 transition-all" />
              </motion.div>
            )}

            {pickup && destination && distance && (
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-slate-400">{distance} km</span>
                <span className="text-lg font-black text-slate-800">₹{service === 'savaari' ? fare.savaari : fare.logistics}</span>
              </div>
            )}

            <button
              onClick={handleConfirmBooking}
              disabled={!pickup || !destination || (isScheduled && !scheduledDateTime)}
              className={`w-full py-4 text-white rounded-[2rem] font-black tracking-[0.2em] text-[10px] shadow-2xl disabled:opacity-20 transition-all ${isScheduled ? 'bg-amber-500 shadow-amber-500/30' : 'bg-slate-900'}`}
            >
              {isScheduled ? `📅 SCHEDULE ${service.toUpperCase()}` : `CONFIRM ${service.toUpperCase()}`}
            </button>
          </>)}

          {/* Shared Ride Content */}
          {rideMode === 'shared' && (<>
            {sharedBookingStatus === 'idle' && (<>
              <div className="mb-3">
                <p className="text-base font-black text-slate-800">{t('bookSharedRide')}</p>
                <p className="text-[11px] text-violet-500 font-black">{t('tagline')} 🚗</p>
              </div>

              {/* Route Search */}
              <div className="bg-slate-50 rounded-2xl p-3 mb-3 border border-slate-100">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('searchStop')}</p>
                <div className="flex flex-col gap-2 mb-2">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('whereFrom')}</p>
                    <input
                      type="text"
                      placeholder="Jaise: Railway Station"
                      value={boardingSearchStop}
                      onChange={e => setBoardingSearchStop(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                    />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('whereTo')}</p>
                    <input
                      type="text"
                      placeholder="Jaise: Medical College"
                      value={dropSearchStop}
                      onChange={e => setDropSearchStop(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 transition-all"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400">
                    {!boardingSearchStop && !dropSearchStop
                      ? `सभी ${sharedRoutes.length} मार्ग दिख रहे हैं`
                      : `${filteredRoutes.length} मार्ग मिले`}
                  </p>
                  {(boardingSearchStop || dropSearchStop) && (
                    <button onClick={() => { setBoardingSearchStop(''); setDropSearchStop(''); }}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-200 rounded-lg text-[9px] font-black text-slate-600">
                      <X size={10} /> Clear
                    </button>
                  )}
                </div>
              </div>

              {sharedRoutes.length === 0 ? (
                <p className="text-center text-slate-400 text-sm font-bold py-4">अभी कोई सक्रिय मार्ग नहीं है।</p>
              ) : filteredRoutes.length === 0 ? (
                <p className="text-center text-slate-400 text-sm font-bold py-4">कोई मार्ग नहीं मिला। दूसरा पड़ाव आज़माएं।</p>
              ) : (
                <div className="flex flex-col gap-3 max-h-52 overflow-y-auto scrollbar-hide">
                  {filteredRoutes.map(route => (
                    <div key={route.id} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-black text-slate-800 leading-snug">{route.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold truncate">{(route.stops || []).join(' → ')}</p>
                        <p className="text-[10px] font-black text-blue-500 mt-0.5">₹{Math.min(...(route.fares || [10]))} – ₹{Math.max(...(route.fares || [20]))}</p>
                      </div>
                      <button onClick={() => { setSelectedRoute(route); setSharedBookingStatus('selecting_stops'); }}
                        className="px-3 py-2 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0">
                        चुनें
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>)}

            {sharedBookingStatus === 'selecting_stops' && selectedRoute && (<>
              <p className="text-sm font-black text-slate-800 mb-3">{selectedRoute.name}</p>
              <div className="flex flex-col gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('boardingStop')}</p>
                  <select value={selectedBoardingStop || ''}
                    onChange={e => { setSelectedBoardingStop(e.target.value); setSelectedDropStop(null); setSharedFare(0); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 outline-none">
                    <option value="">-- चुनें --</option>
                    {(selectedRoute.stops || []).slice(0, -1).map(stop => (
                      <option key={stop} value={stop}>{stop}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('dropStop')}</p>
                  <select value={selectedDropStop || ''}
                    onChange={e => {
                      const drop = e.target.value;
                      setSelectedDropStop(drop);
                      setSharedFare(drop && selectedBoardingStop ? calculateSharedFare(selectedRoute, selectedBoardingStop, drop) : 0);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 outline-none"
                    disabled={!selectedBoardingStop}>
                    <option value="">-- चुनें --</option>
                    {selectedBoardingStop && (selectedRoute.stops || [])
                      .slice((selectedRoute.stops || []).indexOf(selectedBoardingStop) + 1)
                      .map(stop => (
                        <option key={stop} value={stop}>{stop}</option>
                      ))}
                  </select>
                </div>
              </div>
              {sharedFare > 0 && (<>
                <div className="mb-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Kitni Seats Chahiye?</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(n => (
                      <button key={n} onClick={() => setSelectedSeats(n)}
                        className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${selectedSeats === n ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'bg-slate-100 text-slate-500'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl px-4 py-2.5 mb-3 text-center">
                  <p className="text-xs font-bold text-blue-500">{t('totalFare')} ({selectedSeats} seat{selectedSeats > 1 ? 's' : ''})</p>
                  <p className="text-2xl font-black text-blue-700">₹{sharedFare * selectedSeats}</p>
                  {selectedSeats > 1 && <p className="text-[10px] text-blue-400 font-bold">₹{sharedFare} × {selectedSeats}</p>}
                </div>
              </>)}
              <div className="flex gap-2">
                <button onClick={() => { setSharedBookingStatus('idle'); setSelectedRoute(null); setSelectedBoardingStop(null); setSelectedDropStop(null); setSharedFare(0); setSelectedSeats(1); }}
                  className="px-5 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest">
                  {t('back')}
                </button>
                <button onClick={handleSharedBooking}
                  disabled={!selectedBoardingStop || !selectedDropStop || sharedFare === 0}
                  className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30">
                  {selectedSeats} सीट बुक करें
                </button>
              </div>
            </>)}

            {sharedBookingStatus === 'searching' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="font-black text-slate-700 text-sm">चालक की तलाश हो रही है...</p>
                <p className="text-xs text-emerald-600 font-bold">आपकी सीट सुरक्षित है!</p>
              </div>
            )}
          </>)}
        </div>
      )}

      {/* Shared Ride Status Panel */}
      {rideMode === 'shared' && ['booked', 'driver_assigned', 'onboard', 'done'].includes(sharedBookingStatus) && (
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }}
          className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-[3.5rem] shadow-[0_-30px_60px_rgba(0,0,0,0.1)] p-8 pt-6">
          <div className="w-14 h-1.5 bg-slate-100 rounded-full mx-auto mb-5" />

          {(sharedBookingStatus === 'booked' || sharedBookingStatus === 'driver_assigned') && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-3xl">✅</div>
              <div>
                <h3 className="text-xl font-black text-slate-800">{t('seatConfirmed')}</h3>
                <p className="text-sm text-slate-500 font-bold mt-1">{selectedRoute?.name}</p>
              </div>
              <div className="w-full bg-slate-50 rounded-2xl p-4 flex flex-col gap-2 text-left">
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">चढ़ना</span><span className="text-sm font-black text-slate-700">{selectedBoardingStop}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">उतरना</span><span className="text-sm font-black text-slate-700">{selectedDropStop}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Seats</span><span className="text-sm font-black text-slate-700">{selectedSeats}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">{t('totalFare')}</span><span className="text-sm font-black text-blue-600">₹{sharedFare * selectedSeats}</span></div>
              </div>

              {isLoaded && sharedDriverLocation && (
                <div className="w-full" style={{ height: '200px', borderRadius: '16px', overflow: 'hidden' }}>
                  <GoogleMap
                    center={sharedDriverLocation}
                    zoom={15}
                    mapContainerStyle={{ width: '100%', height: '200px' }}
                    options={{ disableDefaultUI: true, gestureHandling: 'none' }}
                  >
                    <Marker
                      position={sharedDriverLocation}
                      icon={{
                        path: window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW,
                        scale: 6,
                        fillColor: '#4A90D9',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        rotation: sharedDriverHeading,
                      }}
                    />
                  </GoogleMap>
                </div>
              )}

              <p className="text-xs text-slate-400 font-bold">ApniGadi आपको लेने आएगी</p>
              <p className="text-[10px] text-slate-300 font-bold">💵 {t('payDriver')}</p>
              <button onClick={handleShareRide}
                className="w-full py-3 border-2 border-emerald-400 text-emerald-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                <Share2 size={14} /> {t('shareFamily')}
              </button>
            </div>
          )}

          {sharedBookingStatus === 'onboard' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">🛺</div>
              <h3 className="text-xl font-black text-slate-800">{t('onboard')} 🛺</h3>
              <p className="text-sm text-slate-500 font-bold">ApniGadi आपको छोड़ेगी</p>
              {isLoaded && sharedDriverLocation && (
                <div className="w-full" style={{ height: '180px', borderRadius: '16px', overflow: 'hidden' }}>
                  <GoogleMap
                    center={sharedDriverLocation}
                    zoom={15}
                    mapContainerStyle={{ width: '100%', height: '180px' }}
                    options={{ disableDefaultUI: true, gestureHandling: 'none' }}
                  >
                    <Marker
                      position={sharedDriverLocation}
                      icon={{
                        path: window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW,
                        scale: 6,
                        fillColor: '#4A90D9',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        rotation: sharedDriverHeading,
                      }}
                    />
                  </GoogleMap>
                </div>
              )}
              <div className="bg-blue-50 rounded-2xl px-6 py-3">
                <p className="text-xs font-bold text-blue-400">कुल किराया ({selectedSeats} seat{selectedSeats > 1 ? 's' : ''})</p>
                <p className="text-2xl font-black text-blue-700">₹{sharedFare * selectedSeats}</p>
              </div>
              <button onClick={handleShareRide}
                className="w-full py-3 border-2 border-emerald-400 text-emerald-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                <Share2 size={14} /> {t('shareFamily')}
              </button>
            </div>
          )}

          {sharedBookingStatus === 'done' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-3xl">✅</div>
              <h3 className="text-xl font-black text-slate-800">{t('arrived')} ✅</h3>
              <p className="text-sm text-slate-500 font-bold">{t('totalFare')}: ₹{sharedFare * selectedSeats} — {t('payDriver')}</p>
              <button onClick={handleSharedReset}
                className="w-full py-4 bg-slate-900 text-white rounded-[2rem] font-black tracking-widest text-[10px] uppercase">
                {t('newBooking')}
              </button>
            </div>
          )}
        </motion.div>
      )}

      {bookingStatus !== 'idle' && (
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-[3.5rem] shadow-[0_-30px_60px_rgba(0,0,0,0.1)] p-8 pt-6 flex flex-col gap-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="w-14 h-1.5 bg-slate-100 rounded-full mx-auto mb-2" />
        {bookingStatus === 'scheduled' && (
          <div className="flex flex-col gap-6 text-center py-4">
            <div className="w-20 h-20 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Clock size={40} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800">Ride Scheduled!</h3>
              <p className="text-slate-500 text-sm font-bold mt-1">
                {scheduledDateTime
                  ? new Date(scheduledDateTime).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
                  : ''}
              </p>
            </div>
            <div className="bg-slate-50 rounded-3xl p-6 text-left space-y-3 border border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <p className="text-xs font-bold text-slate-600 leading-tight">{pickupInput}</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                <p className="text-xs font-bold text-slate-400 leading-tight">{destInput}</p>
              </div>
              <div className="h-px bg-slate-100" />
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Fare</span>
                <span className="text-lg font-black text-slate-800">₹{service === 'savaari' ? fare.savaari : fare.logistics}</span>
              </div>
            </div>
            <p className="text-[10px] text-amber-600 font-bold bg-amber-50 rounded-2xl px-4 py-3 leading-relaxed">
              ⏰ Driver ko 15-20 minute pehle automatically notify kiya jaayega
            </p>
            <button onClick={handleReset} className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black tracking-widest text-[10px] shadow-2xl">
              BACK TO HOME
            </button>
          </div>
        )}

        {bookingStatus === 'searching' && (
          <div className="flex flex-col gap-6 text-center py-4">
            <div className="flex flex-col items-center gap-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center relative ${noDriverFound ? 'bg-slate-100' : 'bg-blue-50'}`}>
                {!noDriverFound && <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-ping opacity-40" />}
                <Search size={32} className={noDriverFound ? 'text-slate-400' : 'text-blue-600'} />
              </div>
              <div>
                {noDriverFound ? (
                  <>
                    <h3 className="text-xl font-black text-slate-800">Koi Driver Nahi Mila</h3>
                    <p className="text-slate-400 text-xs font-bold mt-1">7km radius mein koi driver online nahi hai</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-black text-slate-800">Driver Dhundh Rahe Hain...</h3>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={searchRadiusMsg || 'default'}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-slate-400 text-xs font-bold mt-1"
                      >
                        {searchRadiusMsg || 'Aapke 3km mein driver dhundh rahe hain...'}
                      </motion.p>
                    </AnimatePresence>
                  </>
                )}
              </div>
            </div>
            <div className="bg-slate-50 rounded-3xl p-6 space-y-3 border border-slate-100 text-left">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <p className="text-xs font-bold text-slate-600 leading-tight">{pickupInput}</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                <p className="text-xs font-bold text-slate-400 leading-tight">{destInput}</p>
              </div>
            </div>
            {noDriverFound ? (
              <>
                <button
                  onClick={handleRetrySearch}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black tracking-widest text-[10px] shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                >
                  DOBARA DHUNDHO
                </button>
                <button
                  onClick={() => {
                    setNoDriverFound(false);
                    setSearchRadiusMsg(null);
                    searchAbortRef.current = true;
                    setBookingStatus('idle');
                  }}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black tracking-widest text-[10px]"
                >
                  WAPAS JAO
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black tracking-widest text-[10px] transition-all hover:bg-red-100"
                >
                  CANCEL BOOKING
                </button>
                <button
                  onClick={async () => {
                    if (requestId) {
                      try {
                        await updateDoc(doc(db, 'ride_requests', requestId), { status: 'cancelled', cancelledBy: 'customer', cancellationReason: 'force_clear' });
                      } catch { /* best-effort */ }
                    }
                    setActiveRide(null);
                    handleReset();
                  }}
                  className="py-1 text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] hover:text-red-400 transition-colors"
                >
                  Ride stuck? Force Clear
                </button>
              </>
            )}
          </div>
        )}


        {bookingStatus === 'completed' && (
          <div className="flex flex-col gap-6 text-center py-4">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner">
              <CheckCircle size={40} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800">Safar Poora Hua!</h3>
              <p className="text-slate-400 text-sm">{matchedDriver?.name} ke saath safar karne ke liye dhanyavad.</p>
            </div>

            <div className="bg-slate-50 rounded-3xl p-6 flex flex-col gap-5 border border-slate-100 items-center">
              {/* Fare breakdown */}
              <div className="w-full flex flex-col gap-1">
                <div className="flex justify-between items-center w-full mb-1">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Bhugtan Karein</span>
                  <span className="text-3xl font-black text-slate-800">₹{currentFareBreakup.total}</span>
                </div>
                <div className="w-full bg-white rounded-2xl p-3 border border-slate-100 text-[10px] font-bold text-slate-500 space-y-1">
                  <div className="flex justify-between"><span>Base Fare</span><span>₹{currentFareBreakup.base}</span></div>
                  <div className="flex justify-between"><span>Distance</span><span>₹{currentFareBreakup.distance}</span></div>
                  {currentFareBreakup.waiting > 0 && (
                    <div className="flex justify-between text-amber-600"><span>Waiting ({currentFareBreakup.waitingMins} min)</span><span>₹{currentFareBreakup.waiting}</span></div>
                  )}
                  {currentFareBreakup.isNight && (
                    <div className="flex justify-between text-purple-600"><span>Night Surcharge</span><span>₹{currentFareBreakup.nightSurcharge}</span></div>
                  )}
                  <div className="border-t border-slate-100 pt-1 flex justify-between font-black text-slate-700"><span>Total</span><span>₹{currentFareBreakup.total}</span></div>
                </div>
              </div>

              {/* Online Payment — Coming Soon */}
              <div className="w-full flex flex-col items-center gap-1.5 bg-slate-100 rounded-2xl px-5 py-6 border border-slate-200">
                <Clock size={26} className="text-slate-400 mb-1" />
                <p className="text-sm font-black text-slate-500">Online Payment</p>
                <p className="text-base font-black text-slate-700">Jaldi Aa Raha Hai!</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Coming Soon</p>
              </div>

              {/* Cash Payment */}
              <button
                onClick={handlePayViaCash}
                disabled={isPaymentLoading}
                className="w-full py-3.5 bg-emerald-600 active:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-600/25 active:scale-95 transition-all disabled:opacity-50"
              >
                {isPaymentLoading ? 'Processing...' : 'Maine Cash De Diya ✓'}
              </button>
            </div>
          </div>
        )}

        {bookingStatus === 'payment_done' && (
          <div className="flex flex-col gap-6 text-center py-8">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle size={40} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800">Payment Successful!</h3>
              <p className="text-slate-400 text-sm">Thank you for your payment.</p>
            </div>
            <button 
              onClick={handleReset}
              className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black tracking-widest text-[10px] shadow-2xl"
            >
              BACK TO HOME
            </button>
          </div>
        )}
        {showRating && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[3000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[3rem] p-10 w-full max-w-sm text-center shadow-2xl border-2 border-slate-100"
            >
              <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Star size={40} fill="currentColor" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">Rate your Ride</h3>
              <p className="text-slate-500 font-medium mb-8">How was your journey with {completedDriverName || matchedDriver?.name || activeRide?.driverName || 'your driver'}?</p>
              
              <div className="flex justify-center gap-3 mb-10">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoveredRating || userRating) >= star;
                  return (
                    <button
                      key={star}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onClick={() => { setUserRating(star); handleSubmitRating(star); }}
                      className={`transition-all duration-300 transform hover:scale-125 active:scale-110 ${active ? 'text-amber-500' : 'text-slate-200'}`}
                    >
                      <Star size={40} fill={active ? 'currentColor' : 'none'} strokeWidth={2} />
                    </button>
                  );
                })}
              </div>

              <button 
                onClick={handleSkipRating}
                className="text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          </div>
        )}
      </motion.div>
      )}
    </div>
  );
};

export default Home;
