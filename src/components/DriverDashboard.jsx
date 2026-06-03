import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  History,
  Map as MapIcon,
  CheckCircle,
  AlertCircle,
  IndianRupee,
  User,
  Navigation,
  X,
  ChevronRight,
  MapPin,
  Package,
  Star,
  Clock,
  Phone,
  Car,
  ShieldCheck,
  Bell,
  Languages,
  LogOut,
  Menu,
  Users,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from '../services/firebase';
import { collection, query, where, getDocs, getDoc, orderBy, limit, doc, updateDoc, onSnapshot, Timestamp, setDoc, serverTimestamp, runTransaction, addDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { calculateDistance } from '../utils/geoUtils';
import { uploadToCloudinary } from '../utils/cloudinaryUtils';
import { computeFare } from '../utils/fareEngine';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { useFCM } from '../hooks/useFCM';
import { useRideHistory } from '../hooks/useRideHistory';
import { useLanguage } from '../hooks/useLanguage';
import LanguageToggle from './LanguageToggle';

import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
const containerStyle = { width: '100%', height: '100%' };
const center = { lat: 26.502, lng: 83.778 };
const LIBRARIES = ['places', 'geometry'];
const TEST_DRIVER_ID = "";

// Separate component so useJsApiLoader only fires when the map is actually needed
const MapView = React.memo(({ driverGpsLocation, newRequest, profileLocation, mapRef, driverHeading = 0 }) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
    version: 'weekly'
  });
  const [map, setMap] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [altRoutePaths, setAltRoutePaths] = useState([]);
  const [routeColor, setRouteColor] = useState('#4A90D9');
  const [routeInfo, setRouteInfo] = useState(null); // { duration, distance, arrivalTime }
  const [routeTick, setRouteTick] = useState(0);
  const gpsInitialRef = useRef(null);

  const driverLocation = driverGpsLocation || profileLocation;

  const onMapLoad = useCallback((m) => {
    setMap(m);
    if (mapRef) mapRef.current = m;
  }, [mapRef]);

  const handleRecenter = useCallback(() => {
    if (!map || !driverLocation) return;
    map.panTo(driverLocation);
    map.setHeading(0);
    map.setZoom(16);
  }, [map, driverLocation]);

  // Trigger initial route draw when GPS first becomes available after accepting/starting.
  // Without this, the route effect fires at t=0 with driverLocation=null and draws nothing;
  // the 15s tick would eventually fix it but leaves a blank map for too long.
  // Key: gpsInitialRef uses "id+status" so switching accepted→started re-triggers.
  useEffect(() => {
    if (!isLoaded || !map || !driverGpsLocation) return;
    const activeStatuses = ['accepted', 'started'];
    if (!activeStatuses.includes(newRequest?.status)) { gpsInitialRef.current = null; return; }
    const key = `${newRequest?.id}-${newRequest?.status}`;
    if (gpsInitialRef.current === key) return;
    gpsInitialRef.current = key;
    setRouteTick(t => t + 1);
  }, [isLoaded, map, driverGpsLocation, newRequest?.id, newRequest?.status]);

  // 15-second route refresh tick
  useEffect(() => {
    if (!isLoaded || !newRequest || !map) return;
    const id = setInterval(() => setRouteTick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, [isLoaded, newRequest, map]);

  useEffect(() => {
    if (!isLoaded || !newRequest || !map) return;

    let origin = null;
    let dest = null;
    let color = '#4A90D9';

    if (newRequest.status === 'accepted' && driverLocation) {
      // Driver current location → Pickup
      origin = driverLocation;
      dest = newRequest.pickup;
      color = '#4A90D9';
    } else if (newRequest.status === 'started' && driverLocation) {
      // Driver current location → Destination (live, updates every 15s)
      origin = driverLocation;
      dest = newRequest.destination;
      color = '#00AA44';
    }

    if (origin?.lat && origin?.lng && dest?.lat && dest?.lng) {
      const ds = new window.google.maps.DirectionsService();
      ds.route(
        {
          origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
          destination: { lat: Number(dest.lat), lng: Number(dest.lng) },
          travelMode: window.google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            const leg = result.routes[0].legs[0];
            const path = result.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
            const arrivalTime = new Date(Date.now() + leg.duration.value * 1000)
              .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            setRoutePath(path);
            setAltRoutePaths(
              result.routes.slice(1).map(r => r.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() })))
            );
            setRouteColor(color);
            setRouteInfo({ duration: leg.duration.text, distance: leg.distance.text, arrivalTime });

            const bounds = new window.google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            map.fitBounds(bounds);
          }
        }
      );
    } else {
      setRoutePath([]);
      setAltRoutePaths([]);
      setRouteInfo(null);
    }
  // driverGpsLocation/profileLocation intentionally excluded — routeTick (15s) reads
  // the latest position at fire time; including GPS deps caused a DirectionsService
  // call on every watchPosition update (~6-12x/min), which is expensive and unnecessary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, newRequest, map, routeTick]);

  if (!isLoaded) return <div className="w-full h-full bg-slate-100 animate-pulse" />;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={15}
        onLoad={onMapLoad}
        options={{
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          minZoom: 10,
          maxZoom: 20,
          styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }]
        }}
      >
        {altRoutePaths.map((path, i) => (
          <Polyline
            key={`alt-${i}`}
            path={path}
            options={{ strokeColor: '#94a3b8', strokeOpacity: 0.5, strokeWeight: 5, lineCap: 'round', zIndex: 0 }}
          />
        ))}
        {routePath.length > 0 && (
          <Polyline
            path={routePath}
            options={{ strokeColor: routeColor, strokeOpacity: 0.9, strokeWeight: 6, lineCap: 'round', zIndex: 1 }}
          />
        )}
        {(driverGpsLocation || profileLocation) && (
          <Marker
            position={driverGpsLocation || profileLocation}
            icon={{
              path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              rotation: driverHeading,
            }}
            title="Meri Location"
          />
        )}
        {newRequest && (newRequest.status === 'accepted' || newRequest.status === 'started') && (
          <Marker
            position={
              newRequest.status === 'accepted'
                ? { lat: Number(newRequest.pickup.lat), lng: Number(newRequest.pickup.lng) }
                : { lat: Number(newRequest.destination.lat), lng: Number(newRequest.destination.lng) }
            }
            icon={
              newRequest.status === 'accepted'
                ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
            }
          />
        )}
      </GoogleMap>

      {/* Fix 3: Compass / Recenter button */}
      <button
        onClick={handleRecenter}
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
        className="bg-white rounded-full p-2 shadow-lg border border-slate-200 active:scale-95 transition-transform"
        title="Apni location par wapas jao"
      >
        <Navigation size={18} className="text-slate-700" />
      </button>

      {/* Fix 2: ETA + Distance bottom bar */}
      {routeInfo && (
        <div
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}
          className="bg-slate-900/95 text-white flex items-center justify-between px-4 py-2.5 text-sm"
        >
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-blue-400" />
            <span className="font-semibold">{routeInfo.duration}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-green-400" />
            <span className="font-semibold">{routeInfo.distance}</span>
          </div>
          <span className="text-slate-300 text-xs">ETA {routeInfo.arrivalTime}</span>
        </div>
      )}
    </div>
  );
});

// ── Profile Edit Component ──────────────────────────────────────────────────
const ProfileEditTab = ({ profile, driverId, onBack }) => {
  const [name, setName] = useState(profile?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !driverId) return;
    setSaving(true);
    try {
      await Promise.all([
        updateDoc(doc(db, 'users', driverId), { name: name.trim() }),
        updateDoc(doc(db, 'drivers', driverId), { name: name.trim() }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Profile update error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-50 pt-24 px-6 overflow-y-auto pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 active:scale-95 transition-all">
            <span className="text-slate-500 font-black text-lg">←</span>
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Profile Update</h2>
            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Apni jankaari badlein</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-5">
          {/* Avatar */}
          <div className="flex justify-center mb-2">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
              {name ? name.charAt(0).toUpperCase() : 'D'}
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Naam</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apna poora naam daalen"
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-100 bg-slate-50 font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white transition-all"
              maxLength={40}
            />
          </div>

          {/* Phone (read-only) */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
            <div className="w-full px-4 py-3.5 rounded-2xl border border-slate-100 bg-slate-100 font-bold text-slate-400 text-sm">
              {profile?.phone || '—'}
            </div>
            <p className="text-[9px] text-slate-400 ml-1">Phone number change nahi ho sakta</p>
          </div>

          {/* ID */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Driver ID</label>
            <div className="w-full px-4 py-3.5 rounded-2xl border border-slate-100 bg-slate-100 font-black text-slate-500 tracking-widest">
              {profile?.displayId || '—'}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className={`w-full py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white disabled:opacity-50'}`}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Badlav Sahejaein'}
          </button>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-6">
          Account security: Phone OTP se login hota hai — koi password zaroori nahi
        </p>
      </div>
    </div>
  );
};

// ── KYC Form Component ─────────────────────────────────────────────────────
const PhotoUploadBox = ({ name, label, required, icon: Icon }) => {
  const [fileName, setFileName] = useState('');
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative h-28 bg-white rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-3 hover:border-blue-500 transition-colors cursor-pointer group">
        <input
          name={name}
          type="file"
          accept="image/*"
          required={required}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={e => setFileName(e.target.files?.[0]?.name || '')}
        />
        {fileName ? (
          <>
            <CheckCircle size={18} className="text-emerald-500 mb-1" />
            <span className="text-[9px] font-bold text-emerald-600 text-center truncate max-w-full px-2">{fileName}</span>
          </>
        ) : (
          <>
            <Icon size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors mb-1" />
            <span className="text-[9px] font-bold text-slate-400">Photo Upload</span>
          </>
        )}
      </div>
    </div>
  );
};

const KycForm = ({ driverId, isUploading, setIsUploading, showToast }) => {
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      const formData = new FormData(e.target);

      // Mandatory uploads
      const dlPhotoUrl      = await uploadToCloudinary(formData.get('dlPhoto'));
      const rcPhotoUrl      = await uploadToCloudinary(formData.get('rcPhoto'));
      const passbookPhotoUrl = await uploadToCloudinary(formData.get('passbookPhoto'));

      // Optional uploads
      const aadharFile = formData.get('aadharPhoto');
      const aadharPhotoUrl = aadharFile?.size ? await uploadToCloudinary(aadharFile) : null;

      const policeVerificationDeadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const kycData = {
        license: formData.get('license'),
        rcNumber: formData.get('rcNumber'),
        ...(formData.get('aadhar') && { aadhar: formData.get('aadhar') }),
        submittedAt: serverTimestamp(),
      };

      const kyc_documents = {
        dlPhotoUrl,
        rcPhotoUrl,
        passbookPhotoUrl,
        ...(aadharPhotoUrl && { aadharPhotoUrl }),
      };

      // Public doc — only non-sensitive fields
      await updateDoc(doc(db, 'drivers', driverId), {
        verificationStatus: 'pending',
        rcNumber: formData.get('rcNumber'),
        insuranceExpiry: formData.get('insuranceExpiry'),
        pucExpiry: formData.get('pucExpiry'),
      });

      // Private subcollection — KYC docs, UPI ID, Aadhar (passengers cannot read)
      await setDoc(doc(db, 'drivers', driverId, 'private', 'data'), {
        kycData,
        kyc_documents,
        upiId: formData.get('upiId'),
        policeVerificationDeadline,
      }, { merge: true });

      showToast('KYC Submit ho gaya! Admin 12-24 ghante mein verify karega.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Upload fail hua: ' + err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
          Sabhi original documents office mein physically jama karein. Yahan sirf photos upload karein.
        </p>
      </div>

      {/* DL */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
          Driving License No. <span className="text-red-400">*</span>
        </label>
        <input name="license" type="text" placeholder="UP-XXXXXXX" required
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PhotoUploadBox name="dlPhoto" label="DL Photo" required icon={Users} />
        <PhotoUploadBox name="rcPhoto" label="RC Photo" required icon={Truck} />
      </div>

      {/* RC Number */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
          Vehicle RC Number <span className="text-red-400">*</span>
        </label>
        <input name="rcNumber" type="text" placeholder="UP 52 X XXXX" required
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" />
      </div>

      {/* Insurance & PUC Expiry */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
            Insurance Expiry <span className="text-red-400">*</span>
          </label>
          <input name="insuranceExpiry" type="date" required
            className="w-full bg-white p-4 rounded-2xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
            PUC Expiry <span className="text-red-400">*</span>
          </label>
          <input name="pucExpiry" type="date" required
            className="w-full bg-white p-4 rounded-2xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" />
        </div>
      </div>

      {/* Bank passbook */}
      <PhotoUploadBox name="passbookPhoto" label="Bank Passbook Photo" required icon={IndianRupee} />

      {/* UPI ID */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
          UPI ID <span className="text-red-400">*</span>
        </label>
        <input name="upiId" type="text" placeholder="yourname@upi" required
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" />
        <p className="text-[9px] text-slate-400 ml-1">UPI ID sirf admin ke madhyam se badla ja sakta hai</p>
      </div>

      {/* Aadhar optional */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Aadhar (Optional — Office mein Jama Karein)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Aadhar Number</label>
            <input name="aadhar" type="text" placeholder="XXXX XXXX XXXX"
              className="w-full bg-white p-4 rounded-2xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" />
          </div>
          <PhotoUploadBox name="aadharPhoto" label="Aadhar Photo" required={false} icon={Users} />
        </div>
      </div>

      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
        <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
          KYC submit hone ke baad <strong>15 din</strong> ke andar police verification zaroori hai.
          Countdown aapke dashboard par dikhega.
        </p>
      </div>

      <button
        type="submit"
        disabled={isUploading}
        className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black tracking-[0.2em] text-xs shadow-2xl shadow-blue-600/30 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {isUploading ? 'PHOTOS UPLOAD HO RAHI HAIN...' : 'KYC SUBMIT KAREIN'}
      </button>
    </form>
  );
};

const DriverReferSection = ({ config, driverId, profile }) => {
  const [myReferrals, setMyReferrals] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!driverId) return;
    getDocs(query(collection(db, 'referrals'), where('referrerId', '==', driverId), limit(20)))
      .then(snap => setMyReferrals(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setMyReferrals([]));
  }, [driverId]);

  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Refer &amp; Earn</h3>
      <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-6 space-y-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-amber-500 text-white rounded-2xl flex items-center justify-center"><Star size={18} /></div>
          <div>
            <p className="text-sm font-black text-slate-800">Dosto ko refer karo</p>
            <p className="text-[10px] font-bold text-slate-500">Unki pehli ride pe ₹{config.referralReferrerReward} tumhe milega</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-amber-200">
          <span className="text-lg font-black text-slate-800 tracking-widest">{profile?.displayId || 'VS-...'}</span>
          <button
            onClick={() => { navigator.clipboard?.writeText(profile?.displayId || '').catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black active:scale-95 transition-all"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <button
          onClick={() => {
            const text = `VahanSetu pe chalao ya ride lo! Mera referral code: ${profile?.displayId}\n\nhttps://vahansetuapnigadi.web.app\n\nPehli ride pe ₹${config.referralRefereeReward} milenge!`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
          }}
          className="w-full py-3 bg-emerald-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
        >
          WhatsApp pe Share Karo
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Mere Referrals</p>
        {myReferrals === null ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : myReferrals.length === 0 ? (
          <div className="text-center py-5 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
            <p className="text-xs font-bold text-slate-400">Abhi tak koi referral nahi</p>
          </div>
        ) : (
          myReferrals.map(ref => (
            <div key={ref.id} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100">
              <div>
                <p className="text-xs font-black text-slate-700">{ref.refereeName}</p>
                <p className="text-[9px] font-bold text-slate-400">{ref.refereeDisplayId}</p>
              </div>
              {ref.status === 'rewarded'
                ? <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">+₹{ref.referrerReward || config.referralReferrerReward} Credited</span>
                : <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pehli ride baki</span>
              }
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const DriverDashboard = () => {
  const { logout } = useAuth();
  const { config } = usePlatformConfig();
  const [stats, setStats] = useState({
    totalEarnings: 0,
    cashEarnings: 0,
    onlineEarnings: 0,
    rides: 0,
    rating: "4.8"
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isOnline, setIsOnline] = useState(false);
  const [driverMode, setDriverMode] = useState('private');
  const [sharedRideRequests, setSharedRideRequests] = useState([]);
  const [activeSharedRide, setActiveSharedRide] = useState(null);
  const [sharedPassengers, setSharedPassengers] = useState([]);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [routeStops, setRouteStops] = useState([]);
  const [preReleaseTimer, setPreReleaseTimer] = useState(null);
  const [profile, setProfile] = useState(null);
  const [driverGpsLocation, setDriverGpsLocation] = useState(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const [newRequest, setNewRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { lang, t } = useLanguage();
  const [searchParams] = useSearchParams();
  const driverNameParam = searchParams.get('driverName');
  const [notifications, setNotifications] = useState([]);
  const [driverId, setDriverId] = useState(TEST_DRIVER_ID);
  const [isMinimized, setIsMinimized] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [latestBroadcast, setLatestBroadcast] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [pendingPaymentRide, setPendingPaymentRide] = useState(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [systemBroadcasts, setSystemBroadcasts] = useState([]);
  const { rides: rideHistory, loading: historyLoading, formatDate, statusMeta } = useRideHistory(
    activeTab === 'history' && driverId ? { driverId } : {}
  );
  const [upcomingRides, setUpcomingRides] = useState([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isDriverCardMinimized, setIsDriverCardMinimized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGrievanceOpen, setIsGrievanceOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [privateProfile, setPrivateProfile] = useState(null);
  const [earningsFilter, setEarningsFilter] = useState('all'); // 'today' | 'week' | 'month' | 'all'
  const [locationError, setLocationError] = useState(null);
  const prevNewRequestIdRef = useRef(null);
  const profileLoadedRef = useRef(false);
  const mapRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);


  const prevNewRequestStatusRef = useRef(null);

  // Reset card state and detect cancellation when newRequest changes
  useEffect(() => {
    const prevId = prevNewRequestIdRef.current;
    const prevStatus = prevNewRequestStatusRef.current;
    const currId = newRequest?.id || null;

    if (prevId && !currId) {
      // Only show "cancelled" toast when the ride that disappeared was still pending
      // (not when it transitions to accepted — that causes a brief null from Q1/Q2 race)
      if (prevStatus === 'pending') {
        showToast('Passenger ne ride cancel kar di.', 'error');
      }
      setIsDriverCardMinimized(false);
    }

    if (currId && currId !== prevId) {
      // New ride arrived — reset minimized state
      setIsDriverCardMinimized(false);
    }

    // Fix 5: toast when passenger pays online (driver-side)
    if (currId && newRequest?.status === 'payment_done' && prevStatus && prevStatus !== 'payment_done') {
      showToast('Payment aa gaya! ✅ Passenger ne pay kar diya.', 'success');
    }

    prevNewRequestIdRef.current = currId;
    prevNewRequestStatusRef.current = newRequest?.status || null;
  }, [newRequest, showToast]);

  // 0. Live Location Tracking + Waiting Time Accumulation
  useEffect(() => {
    if (!driverId || !isOnline) return;

    let lastPositionTime = Date.now();
    let lastFirestoreTime = 0;
    let lastFirestoreLat = null;
    let lastFirestoreLng = null;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed, heading } = pos.coords;
        const now = Date.now();
        const elapsed = (now - lastPositionTime) / 1000;
        lastPositionTime = now;

        setDriverGpsLocation({ lat: latitude, lng: longitude });
        if (heading != null && !isNaN(heading)) setDriverHeading(heading);

        const timeDiff = (now - lastFirestoreTime) / 1000;
        const distDiff = lastFirestoreLat != null
          ? calculateDistance(lastFirestoreLat, lastFirestoreLng, latitude, longitude) * 1000
          : Infinity;

        if (timeDiff >= 3 || distDiff >= 5) {
          lastFirestoreTime = now;
          lastFirestoreLat = latitude;
          lastFirestoreLng = longitude;

          await updateDoc(doc(db, 'drivers', driverId), {
            location: { lat: latitude, lng: longitude },
            heading: heading != null && !isNaN(heading) ? heading : 0,
            lastLocationUpdate: serverTimestamp()
          });

          if (activeSharedRide?.id) {
            try {
              await updateDoc(doc(db, 'shared_rides', activeSharedRide.id), {
                driverLocation: { lat: latitude, lng: longitude },
                driverHeading: heading || 0
              });
            } catch (e) {
              console.error('Shared ride location update error:', e);
            }
          }
        }

        const ride = newRequestRef.current;
        if (ride?.status === 'started') {
          const speedKmh = speed != null ? speed * 3.6 : 999;
          if (speedKmh < 5) {
            waitingSecondsRef.current += elapsed;
          }

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
      (err) => {
        console.error("Location Error:", err);
        setLocationError('GPS error: Location update band ho gayi. Dobara try karein.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000, distanceFilter: 5 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, isOnline, activeSharedRide?.id]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const id = user?.uid || TEST_DRIVER_ID;
      if (id) {
        setDriverId(id);
        // isLoading stays true — profile onSnapshot will clear it
      } else {
        // No user and no test ID — stop loading
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!driverId) return;
    profileLoadedRef.current = false; // reset when driverId changes
    const unsub = onSnapshot(doc(db, 'drivers', driverId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // All four setStates are batched by React 18 into one render
        // Reference equality check — if only location/timestamp changed, skip profile re-render
        // This prevents 25-50 blinks caused by watchPosition updating Firestore every 10s
        setProfile(prev => {
          if (
            prev &&
            prev.isOnline === data.isOnline &&
            prev.name === data.name &&
            prev.totalEarnings === data.totalEarnings &&
            prev.walletBalance === data.walletBalance &&
            prev.totalRides === data.totalRides &&
            prev.verificationStatus === data.verificationStatus &&
            prev.rating === data.rating &&
            prev.ratingCount === data.ratingCount
          ) {
            return prev; // Same reference → React skips re-render
          }
          return data;
        });

        // Primitive comparison — React bails out if value unchanged
        setIsOnline(data.isOnline || false);

        setStats(prev => {
          const te = data.totalEarnings || 0;
          const wb = data.walletBalance || 0;
          const r  = data.totalRides || 0;
          const rt = data.rating || "4.8";
          if (prev.totalEarnings === te && prev.walletBalance === wb &&
              prev.rides === r && prev.rating === rt) return prev;
          return { ...prev, totalEarnings: te, walletBalance: wb, rides: r, rating: rt };
        });

        if (!profileLoadedRef.current) {
          profileLoadedRef.current = true;
          setIsLoading(false);
        }
      } else if (!profileLoadedRef.current) {
        profileLoadedRef.current = true;
        setIsLoading(false);
      }
    });
    return () => unsub();
  }, [driverId]);

  // Listen to private subcollection — KYC data, UPI ID, policeVerificationDeadline
  useEffect(() => {
    if (!driverId) return;
    const unsub = onSnapshot(doc(db, 'drivers', driverId, 'private', 'data'), (snap) => {
      if (snap.exists()) setPrivateProfile(snap.data());
    });
    return () => unsub();
  }, [driverId]);

  // Pre-fill UPI ID from private profile when available
  useEffect(() => {
    if (privateProfile?.upiId) setUpiId(privateProfile.upiId);
  }, [privateProfile?.upiId]);

  useEffect(() => {
    if (!driverId) return;
    const txQuery = query(
      collection(db, 'wallet_transactions'),
      where('driverId', '==', driverId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(txQuery, (snap) => {
      setWalletTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error fetching transactions:", err));
    return () => unsub();
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

  // Fetch recent system broadcasts for messages tab
  useEffect(() => {
    if (activeTab !== 'messages') return;
    const q = query(collection(db, 'system_broadcasts'), orderBy('timestamp', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setSystemBroadcasts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [activeTab]);

  // Upcoming scheduled rides for this driver's vehicle type
  useEffect(() => {
    if (!profile?.vehicleType) return;
    const q = query(collection(db, 'ride_requests'), where('driverId', '==', 'broadcast'), where('status', '==', 'scheduled'));
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

  const { activeRide, loading: rideContextLoading } = useRide();
  const [lastRequestId, setLastRequestId] = useState(null);
  const newRequestRef = useRef(null);
  const waitingSecondsRef = useRef(0);
  const lastWaitingFlushRef = useRef(Date.now());
  const dismissedRideIdRef = useRef(null);

  // Sync activeRide from RideContext → newRequest for UI
  useEffect(() => {
    if (activeRide) {
      // Skip rides the driver explicitly dismissed — prevents RideContext from
      // restoring a payment_done ride after the driver clicked "अगली सवारी के लिए तैयार".
      if (activeRide.id === dismissedRideIdRef.current) return;

      if (activeRide.id !== newRequestRef.current?.id) {
        waitingSecondsRef.current = activeRide.waitingSeconds || 0;
        lastWaitingFlushRef.current = Date.now();
      }
      newRequestRef.current = activeRide;
      setNewRequest(activeRide);

      // Audio + vibrate for new broadcast
      if (activeRide.id !== lastRequestId && activeRide.driverId === 'broadcast') {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
        setLastRequestId(activeRide.id);
      }
    } else if (!rideContextLoading) {
      // Don't wipe a completed/payment_done ride that recovery found but RideContext
      // filtered out due to its time window — driver still needs to collect payment.
      const cur = newRequestRef.current;
      const isAwaitingPayment = cur && ['completed', 'payment_done'].includes(cur.status);
      if (!isAwaitingPayment) {
        newRequestRef.current = null;
        setNewRequest(null);
      }
    }
  }, [activeRide, driverId, rideContextLoading, lastRequestId]);

  // Restore pending payment ride from localStorage — real-time listener auto-clears if paid
  useEffect(() => {
    if (!driverId) return;
    const pendingId = localStorage.getItem('pendingPaymentRideId');
    if (!pendingId) return;
    const unsub = onSnapshot(doc(db, 'ride_requests', pendingId), (snap) => {
      if (!snap.exists()) { localStorage.removeItem('pendingPaymentRideId'); setPendingPaymentRide(null); return; }
      const data = { id: snap.id, ...snap.data() };
      if (data.status === 'completed' && data.driverId === driverId) {
        setPendingPaymentRide(data);
      } else {
        // Already paid or belongs to different driver — clear card
        localStorage.removeItem('pendingPaymentRideId');
        setPendingPaymentRide(null);
      }
    }, (err) => console.error('Pending payment restore error:', err));
    return () => unsub();
  }, [driverId]);

  // On-mount recovery: restore active ride after page refresh.
  // Single equality filter only — avoids composite index requirement.
  // Status filter done client-side to prevent Firestore index error.
  useEffect(() => {
    if (!driverId) return;
    const recover = async () => {
      if (newRequestRef.current) return;
      try {
        const q = query(
          collection(db, 'ride_requests'),
          where('driverId', '==', driverId)
        );
        const snap = await getDocs(q);
        if (!snap.empty && !newRequestRef.current) {
          const activeStatuses = ['accepted', 'started', 'completed', 'payment_done'];
          const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
          const rides = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => activeStatuses.includes(d.status) && (d.createdAt?.toMillis?.() || 0) >= twelveHoursAgo);
          rides.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          const ride = rides[0];
          if (ride) {
            newRequestRef.current = ride;
            setNewRequest(ride);
          }
        }
      } catch (err) {
        console.error('Active ride recovery error:', err);
      }
    };
    recover();
  }, [driverId]);

  // FCM: request permission, save token, handle foreground notifications
  useFCM(driverId, (payload) => {
    // App is open — play audio + vibrate + let RideContext onSnapshot handle the UI
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    // Show a brief browser notification even in foreground for visibility
    if (Notification.permission === 'granted') {
      new Notification(payload.notification?.title || 'VahanSetu', {
        body: payload.notification?.body,
        icon: '/pwa-192x192.png',
        tag: payload.data?.rideId || 'ride-request'
      });
    }
  });

  const toggleStatus = async () => {
    if (!driverId) return;
    
    // Block Online status if not verified
    if (!isOnline && profile?.verificationStatus !== 'verified') {
      showToast("KYC verify karein — 'Verify' tab mein jaayein.", 'error');
      setActiveTab('verify');
      return;
    }

    const newStatus = !isOnline;
    await updateDoc(doc(db, 'drivers', driverId), { isOnline: newStatus });
    setIsOnline(newStatus);
  };

  // ── Shared Ride ───────────────────────────────────────────────────────────

  const handleToggleDriverMode = async (mode) => {
    setDriverMode(mode);
    if (driverId) await updateDoc(doc(db, 'drivers', driverId), { rideMode: mode });
  };

  useEffect(() => {
    if (driverMode !== 'shared' || !isOnline || !driverId) return;
    const unsub = onSnapshot(
      query(collection(db, 'shared_rides'), where('status', '==', 'waiting'), where('driverId', '==', null)),
      (snap) => setSharedRideRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [driverMode, isOnline, driverId]);

  useEffect(() => {
    if (!activeSharedRide?.id) return;
    const unsub = onSnapshot(
      query(collection(db, 'shared_bookings'), where('rideId', '==', activeSharedRide.id)),
      (snap) => setSharedPassengers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [activeSharedRide?.id]);

  const handleAcceptSharedRide = async (ride) => {
    const vehicleNo = profile?.vehicleNumber || profile?.rcNumber || '';
    await updateDoc(doc(db, 'shared_rides', ride.id), {
      driverId: driverId,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      vehicleNumber: vehicleNo
    });
    const bookingsSnap = await getDocs(
      query(collection(db, 'shared_bookings'), where('rideId', '==', ride.id), where('status', 'in', ['searching', 'booked']))
    );
    await Promise.all(bookingsSnap.docs.map(b =>
      updateDoc(doc(db, 'shared_bookings', b.id), { status: 'driver_assigned', driverId, vehicleNumber: vehicleNo })
    ));
    if (ride.routeId) {
      const routeDoc = await getDoc(doc(db, 'shared_routes', ride.routeId));
      if (routeDoc.exists()) setRouteStops(routeDoc.data().stops || []);
    }
    setCurrentStopIndex(0);
    setActiveSharedRide(ride);
    setSharedRideRequests([]);
  };

  const handlePickupPassenger = async (bookingId) => {
    await updateDoc(doc(db, 'shared_bookings', bookingId), { status: 'onboard' });
  };

  const handleDropPassenger = async (bookingId, fare) => {
    await updateDoc(doc(db, 'shared_bookings', bookingId), { status: 'done' });
    const commission = fare * 0.10;
    const driverEarning = fare - commission;
    await updateDoc(doc(db, 'drivers', driverId), {
      walletBalance: increment(-commission),
      totalEarnings: increment(fare)
    });
    await addDoc(collection(db, 'wallet_transactions'), {
      driverId,
      type: 'shared_ride_earning',
      amount: driverEarning,
      fare,
      commission,
      createdAt: new Date().toISOString()
    });
  };

  const handleCompleteSharedTrip = async () => {
    if (!activeSharedRide?.id) return;
    await updateDoc(doc(db, 'shared_rides', activeSharedRide.id), { status: 'completed' });
    setActiveSharedRide(null);
    setSharedPassengers([]);
    setRouteStops([]);
    setCurrentStopIndex(0);
  };

  const handleStopReached = async (stopIndex) => {
    const newIndex = stopIndex + 1;
    setCurrentStopIndex(newIndex);
    await updateDoc(doc(db, 'shared_rides', activeSharedRide.id), {
      currentStopIndex: newIndex,
      currentStop: routeStops[newIndex]
    });
    const nextStop = routeStops[newIndex + 1];
    if (!nextStop) return;
    const configDoc = await getDoc(doc(db, 'config', 'platform'));
    const preReleaseMins = configDoc.data()?.seatPreReleaseMins || 2;
    const bookingsSnap = await getDocs(
      query(
        collection(db, 'shared_bookings'),
        where('rideId', '==', activeSharedRide.id),
        where('dropStop', '==', nextStop),
        where('status', '==', 'onboard')
      )
    );
    if (bookingsSnap.empty) return;
    if (preReleaseTimer) clearTimeout(preReleaseTimer);
    const rideIdForTimer = activeSharedRide.id;
    const timer = setTimeout(async () => {
      if (!rideIdForTimer) return;
      try {
        const freshSnap = await getDocs(
          query(
            collection(db, 'shared_bookings'),
            where('rideId', '==', rideIdForTimer),
            where('dropStop', '==', nextStop),
            where('status', '==', 'onboard')
          )
        );
        if (freshSnap.empty) return;
        const seatsToRelease = freshSnap.docs.reduce((sum, d) => sum + (d.data().seats || 1), 0);
        if (seatsToRelease <= 0) return;
        await updateDoc(doc(db, 'shared_rides', rideIdForTimer), {
          availableSeats: increment(seatsToRelease),
          preReleasedStop: nextStop
        });
      } catch (e) {
        console.error('Pre-release error:', e);
      }
    }, preReleaseMins * 60 * 1000);
    setPreReleaseTimer(timer);
  };

  useEffect(() => {
    return () => { if (preReleaseTimer) clearTimeout(preReleaseTimer); };
  }, [preReleaseTimer]);

  // ─────────────────────────────────────────────────────────────────────────

  // Wallet zone: normal >= -50, restricted -50 to -100, blocked < -100
  const walletBalance = profile?.walletBalance ?? 0;
  const walletZone = walletBalance >= -50 ? 'normal'
    : walletBalance >= -100 ? 'restricted'
    : 'blocked';
  const canAcceptRide = walletZone === 'normal' || (walletZone === 'restricted' && privateProfile?.adminTempAccess === true);

  const handleAcceptRide = async () => {
    if (!newRequest || !driverId) return;

    if (!canAcceptRide) {
      if (walletZone === 'blocked') {
        showToast('Account blocked: Earnings Balance ₹' + walletBalance.toFixed(0) + ' (limit -₹100). Admin se contact karein.', 'error');
      } else {
        showToast('Earnings Balance restricted (₹' + walletBalance.toFixed(0) + '). Admin se contact karein.', 'error');
      }
      return;
    }

    try {
      const vehicleNo = profile?.vehicleNumber || profile?.rcNumber || '';
      await runTransaction(db, async (transaction) => {
        const rideRef = doc(db, 'ride_requests', newRequest.id);
        const rideSnap = await transaction.get(rideRef);

        if (!rideSnap.exists()) throw "Ride does not exist";

        const data = rideSnap.data();
        if (data.status !== 'pending') throw "Ride already accepted by someone else";

        transaction.update(rideRef, {
          status: 'accepted',
          driverId: driverId,
          driverName: profile?.name || 'Partner',
          vehicleNumber: vehicleNo,
          driverVehicle: vehicleNo
        });
      });

      // Optimistically update to 'accepted' so that if RideContext's Q1/Q2 race briefly
      // makes activeRide null, prevStatus is already 'accepted' and the cancellation-detection
      // effect won't show a false "Passenger ne ride cancel kar di" toast.
      const accepted = { ...newRequest, status: 'accepted', driverId };
      newRequestRef.current = accepted;
      setNewRequest(accepted);
    } catch (e) {
      console.error("Acceptance failed:", e);
      showToast(e?.message || String(e) || 'Ride accept nahi ho saki. Dobara try karein.', 'error');
      // Do NOT call setNewRequest(null) here — RideContext listeners handle cleanup.
      // Calling it here with prevStatus === 'pending' triggers the false cancel toast.
    }
  };

  const handleRejectRide = async (reason = '') => {
    if (!newRequest || !driverId) return;
    // Only mark as rejected for THIS driver — other drivers keep seeing the broadcast
    const update = { [`rejectedBy.${driverId}`]: true };
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
      showToast('Invalid operation. Ride must be accepted first.', 'error');
      return;
    }

    if (!newRequest.otp) {
      console.error("[CRITICAL] Ride has no OTP in DB!");
      showToast('Error: Ride session invalid (No OTP). Support se sampark karein.', 'error');
      return;
    }

    if (enteredOtp.trim() === newRequest.otp?.toString().trim()) {
      await updateDoc(doc(db, 'ride_requests', newRequest.id), {
        status: 'started',
        startedAt: serverTimestamp()
      });
      setEnteredOtp('');
      setIsDriverCardMinimized(true);
    } else {
      showToast('Galat OTP. Passenger se sahi code maangein.', 'error');
    }
  };

  const handleCompleteRide = async () => {
    const updates = { status: 'completed' };
    if (waitingSecondsRef.current > 0) {
      updates.waitingSeconds = Math.round(waitingSecondsRef.current);
    }
    await updateDoc(doc(db, 'ride_requests', newRequest.id), updates);
    // Save ride ID so payment card survives page refresh
    localStorage.setItem('pendingPaymentRideId', newRequest.id);
  };

  // Fare breakup for active completed ride (in newRequest card)
  const driverFareBreakup = useMemo(() => {
    if (!newRequest) return null;
    const distKm = newRequest.distanceKm || calculateDistance(
      Number(newRequest.pickup?.lat), Number(newRequest.pickup?.lng),
      Number(newRequest.destination?.lat), Number(newRequest.destination?.lng)
    );
    const serviceType = newRequest.vehicleType === 'battery_rickshaw' ? 'savaari' : 'logistics';
    return computeFare(distKm, newRequest.waitingSeconds || 0, serviceType, config);
  }, [newRequest?.id, newRequest?.waitingSeconds, config]);

  // Fare breakup for pending payment ride (localStorage-restored, separate from newRequest)
  const pendingFareBreakup = useMemo(() => {
    if (!pendingPaymentRide) return null;
    const distKm = pendingPaymentRide.distanceKm || calculateDistance(
      Number(pendingPaymentRide.pickup?.lat), Number(pendingPaymentRide.pickup?.lng),
      Number(pendingPaymentRide.destination?.lat), Number(pendingPaymentRide.destination?.lng)
    );
    const serviceType = pendingPaymentRide.vehicleType === 'battery_rickshaw' ? 'savaari' : 'logistics';
    return computeFare(distKm, pendingPaymentRide.waitingSeconds || 0, serviceType, config);
  }, [pendingPaymentRide?.id, pendingPaymentRide?.waitingSeconds, config]);

  const handleCashCollected = async (ride, fareBreakup) => {
    if (!ride || !driverId || !fareBreakup) return;
    const finalFare = fareBreakup.total;
    const commission = Math.round(finalFare * ((config.commissionPercent || 8) / 100));
    try {
      // Transaction ensures idempotency — agar passenger ne pehle confirm kar diya ho
      // toh driver ka double-deduction nahi hoga
      await runTransaction(db, async (txn) => {
        const rideRef = doc(db, 'ride_requests', ride.id);
        const rideSnap = await txn.get(rideRef);
        if (!rideSnap.exists()) throw new Error('Ride not found');
        if (rideSnap.data().status === 'payment_done' || rideSnap.data().status === 'paid') {
          throw new Error('already_paid');
        }
        txn.update(rideRef, {
          status: 'payment_done',
          paymentMethod: 'cash',
          paymentStatus: 'completed',
          fareAmount: finalFare,
          paidAt: serverTimestamp(),
        });
        txn.update(doc(db, 'drivers', driverId), {
          walletBalance: increment(-commission),
          totalEarnings: increment(finalFare),
          cashEarnings: increment(finalFare),
          totalRides: increment(1),
        });
        txn.set(doc(collection(db, 'wallet_transactions')), {
          driverId,
          amount: commission,
          fareCollected: finalFare,
          type: 'commission_deducted',
          status: 'completed',
          note: `Cash ride - Fare ₹${finalFare}, Platform Fee ₹${commission}`,
          createdAt: serverTimestamp(),
        });
      });
      // Clear pending payment state after success
      localStorage.removeItem('pendingPaymentRideId');
      setPendingPaymentRide(null);
    } catch (err) {
      if (err?.message === 'already_paid') {
        // Passenger ne pehle hi confirm kar diya — silently clear
        localStorage.removeItem('pendingPaymentRideId');
        setPendingPaymentRide(null);
      } else {
        console.error('Cash collection error:', err);
        showToast('Error aaya. Dobara try karein.', 'error');
      }
    }
  };

  const handleWithdrawRequest = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount < 50) {
      showToast('Minimum withdrawal amount ₹50 hai.', 'error');
      return;
    }
    if (!upiId) {
      showToast('Valid UPI ID darj karein.', 'error');
      return;
    }

    try {
      const driverRef = doc(db, 'drivers', driverId);
      const withdrawalRef = doc(collection(db, 'withdrawal_requests'));
      const walletTxRef = doc(collection(db, 'wallet_transactions'));

      await runTransaction(db, async (transaction) => {
        const driverSnap = await transaction.get(driverRef);
        if (!driverSnap.exists()) throw new Error("Driver record nahi mila.");

        const currentBalance = driverSnap.data().walletBalance || 0;
        if (amount > currentBalance) {
          throw new Error("Wallet mein itna balance nahi hai.");
        }

        transaction.update(driverRef, { walletBalance: increment(-amount) });
        transaction.set(withdrawalRef, {
          driverId,
          driverName: profile?.name || 'Driver',
          amount,
          upiId,
          status: 'pending',
          createdAt: serverTimestamp()
        });
        transaction.set(walletTxRef, {
          driverId,
          amount,
          type: 'withdrawn',
          status: 'pending',
          createdAt: serverTimestamp(),
          note: `Withdrawal to ${upiId}`
        });
      });

      showToast('Withdrawal request bhej di gayi!', 'success');
      setIsWithdrawModalOpen(false);
      setWithdrawAmount('');
      setUpiId('');
    } catch (err) {
      console.error(err);
      showToast('Error: ' + err.message, 'error');
    }
  };

  const handleForceClearRide = async () => {
    if (!newRequest) return;
    try {
      await updateDoc(doc(db, 'ride_requests', newRequest.id), {
        status: 'cancelled',
        cancelledReason: 'driver_forced_clear'
      });
    } catch { /* best-effort */ }
    setNewRequest(null);
  };

  // Called when driver taps "अगली सवारी के लिए तैयार" after payment_done.
  // Sets Firestore to 'finished' so RideContext drops the ride from activeStatuses,
  // and marks dismissedRideIdRef so the sync effect won't restore it before Q1 fires.
  const handleDoneRide = async () => {
    if (!newRequest) return;
    const rideId = newRequest.id;
    dismissedRideIdRef.current = rideId;
    newRequestRef.current = null;
    setNewRequest(null);
    localStorage.removeItem('pendingPaymentRideId');
    try {
      await updateDoc(doc(db, 'ride_requests', rideId), { status: 'finished' });
    } catch (e) { console.error('handleDoneRide error:', e); }
  };

  // nav labels now via i18n t() — cur kept for any remaining references
  const cur = {};

  return (
    <div className="h-screen w-full relative overflow-hidden bg-slate-50">

      {/* Loading overlay — fades out smoothly once data is ready */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="loading-overlay"
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-slate-50"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-2.5">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-3 h-3 rounded-full bg-blue-500"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Dashboard Khul Raha Hai...</p>
          </motion.div>
        )}
      </AnimatePresence>

    <div
      className="h-full w-full relative"
    >
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

      {/* Map Background — lazy: only load Maps API when driver is online or has active ride */}
      <div className="absolute inset-0 z-0">
        {(isOnline || newRequest) ? (
          <MapView
            driverGpsLocation={driverGpsLocation}
            newRequest={newRequest}
            profileLocation={profile?.location}
            mapRef={mapRef}
            driverHeading={driverHeading}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200" />
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
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 active:scale-90 transition-all"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-sm font-black text-slate-800">{profile?.name || 'Driver'}</h2>
              <span className="text-[10px] uppercase text-slate-400 font-bold">{profile?.vehicleType || 'Vahan'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div onClick={toggleStatus} className={`px-4 py-2 rounded-full cursor-pointer transition-all ${isOnline ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-slate-200 text-slate-500'} shadow-lg flex items-center gap-2`}>
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ride Mode Toggle — only when online */}
      {isOnline && (
        <div className="fixed top-[4.5rem] left-3 right-3 z-30">
          <div className="flex gap-1 bg-white/90 backdrop-blur-md p-1 rounded-2xl shadow-lg border border-white/20">
            <button onClick={() => handleToggleDriverMode('private')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${driverMode === 'private' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'text-slate-500'}`}>
              🚗 Private
            </button>
            <button onClick={() => handleToggleDriverMode('shared')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${driverMode === 'shared' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'text-slate-500'}`}>
              🛺 Shared
            </button>
          </div>
        </div>
      )}

      {/* Police Verification Countdown Banner */}
      {(() => {
        const deadline = privateProfile?.policeVerificationDeadline || profile?.policeVerificationDeadline;
        if (!deadline) return null;
        const deadlineMs = deadline?.toMillis ? deadline.toMillis() : new Date(deadline).getTime();
        const daysLeft = Math.ceil((deadlineMs - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) return (
          <div className="fixed top-16 left-0 right-0 z-30 mx-3 mt-1">
            <div className="bg-red-600 text-white rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-lg shadow-red-600/30">
              <AlertCircle size={14} className="shrink-0" />
              <p className="text-[11px] font-black">Police Verification Overdue! Turant kara lein.</p>
            </div>
          </div>
        );
        const color = daysLeft > 7 ? 'bg-emerald-500 shadow-emerald-500/30' : daysLeft > 3 ? 'bg-amber-500 shadow-amber-500/30' : 'bg-red-600 shadow-red-600/30';
        return (
          <div className="fixed top-16 left-0 right-0 z-30 mx-3 mt-1">
            <div className={`${color} text-white rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-lg`}>
              <Clock size={14} className="shrink-0" />
              <p className="text-[11px] font-black">Police Verification: <span className="text-base font-black">{daysLeft}</span> din baaki hain</p>
            </div>
          </div>
        );
      })()}

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Dark Overlay */}
            <motion.div
              key="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 bg-black/50 z-[80] backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />

            {/* Slide Panel */}
            <motion.div
              key="sidebar-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed top-0 left-0 h-full w-[300px] bg-white z-[90] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Profile Section */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-6 pt-12 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white text-2xl font-black">
                    {profile?.name ? profile.name.charAt(0).toUpperCase() : 'D'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-black text-base leading-tight truncate">{profile?.name || 'Driver'}</h3>
                    <p className="text-blue-200 text-[11px] font-bold truncate">{profile?.displayId || ''}</p>
                    <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isOnline ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/10 text-blue-200'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-300 animate-pulse' : 'bg-blue-300'}`} />
                      {isOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Nav Links */}
              <div className="flex-1 overflow-y-auto py-4">
                {[
                  { id: 'dashboard', icon: TrendingUp, label: 'Dashboard' },
                  { id: 'wallet', icon: IndianRupee, label: 'Wallet' },
                  { id: 'profile_edit', icon: User, label: 'Profile Update' },
                  { id: 'verify', icon: ShieldCheck, label: 'KYC Verify' },
                  { id: 'messages', icon: Bell, label: 'Notifications' },
                  { id: 'history', icon: History, label: 'History' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                    className={`w-full flex items-center gap-4 px-6 py-3.5 transition-colors ${activeTab === item.id ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <item.icon size={20} />
                    <span className="text-sm font-bold">{item.label}</span>
                  </button>
                ))}

                {/* Stats Grid */}
                <div className="mx-4 mt-4 bg-slate-50 rounded-2xl p-4 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Earnings</p>
                    <p className="text-sm font-black text-slate-800">₹{stats.totalEarnings}</p>
                  </div>
                  <div className="text-center border-x border-slate-200">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Rides</p>
                    <p className="text-sm font-black text-slate-800">{stats.rides}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Rating</p>
                    <p className="text-sm font-black text-emerald-600 flex items-center justify-center gap-0.5"><Star size={10} fill="currentColor" />{stats.rating}</p>
                  </div>
                </div>
              </div>

              {/* Grievance Contact */}
              <div className="px-4 pb-2">
                <button
                  onClick={() => { setIsSidebarOpen(false); setIsGrievanceOpen(true); }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <AlertCircle size={20} />
                  <span className="text-sm font-bold">Help & Grievance</span>
                </button>
              </div>

              {/* Logout Button */}
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => { setIsSidebarOpen(false); logout(); }}
                  className="w-full flex items-center justify-center gap-3 py-3.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-2xl font-black text-sm transition-colors"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* GPS — Meri Location Button */}
      <div className="fixed right-4 z-10 flex flex-col items-end gap-2" style={{ bottom: '8.5rem' }}>
        {locationError && (
          <div className="bg-red-600 text-white text-[10px] font-bold px-3 py-2 rounded-2xl max-w-[200px] text-right leading-snug shadow-lg">
            {locationError}
          </div>
        )}
        <button
          onClick={() => {
            setLocationError(null);
            if (!navigator.geolocation) {
              setLocationError('GPS is aapke device par available nahi hai');
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setDriverGpsLocation(loc);
                mapRef.current?.panTo(loc);
                mapRef.current?.setZoom(17);
              },
              () => setLocationError('Location allow karo: Settings > Privacy > Location'),
              { enableHighAccuracy: true, timeout: 10000 }
            );
          }}
          className="w-12 h-12 bg-white rounded-full shadow-2xl flex items-center justify-center text-blue-600 border border-slate-100 active:scale-90 transition-all"
        >
          <Navigation size={20} />
        </button>
      </div>

      {/* Shared Ride Panel */}
      {driverMode === 'shared' && isOnline && (
        <div className="fixed left-4 right-4 z-20 max-w-lg mx-auto" style={{ bottom: '7rem' }}>
          {!activeSharedRide ? (
            <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden">
              <div className="bg-blue-600 px-5 py-3">
                <p className="text-white font-black text-sm">{t('sharedRequests')}</p>
              </div>
              <div className="p-4 flex flex-col gap-3 max-h-72 overflow-y-auto">
                {sharedRideRequests.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm font-bold py-4">{t('noSharedRequests')}</p>
                ) : (
                  sharedRideRequests.map(ride => (
                    <div key={ride.id} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
                      <div>
                        <p className="text-sm font-black text-slate-800">{ride.routeName}</p>
                        <p className="text-xs text-slate-400 font-bold">{(ride.passengers || []).length} लोग इंतज़ार कर रहे हैं</p>
                      </div>
                      <button onClick={() => handleAcceptSharedRide(ride)}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">
                        {t('acceptRoute')}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden max-h-[70vh] flex flex-col">
              <div className="bg-blue-600 px-5 py-3 shrink-0">
                <p className="text-white font-black text-sm">{activeSharedRide.routeName}</p>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">सक्रिय साझी यात्रा</p>
              </div>
              {routeStops.length > 0 && (
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-1 flex-wrap gap-y-1">
                    {routeStops.map((stop, idx) => (
                      <React.Fragment key={idx}>
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg whitespace-nowrap ${
                          idx < currentStopIndex ? 'bg-emerald-100 text-emerald-600' :
                          idx === currentStopIndex ? 'bg-blue-600 text-white' :
                          'bg-slate-200 text-slate-400'
                        }`}>{idx < currentStopIndex ? '✓ ' : ''}{stop}</span>
                        {idx < routeStops.length - 1 && <span className="text-slate-300 text-[9px]">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                  {routeStops[currentStopIndex + 1] && (
                    <p className="text-[10px] font-bold text-blue-500 mt-1.5">{t('nextStop')}: {routeStops[currentStopIndex + 1]}</p>
                  )}
                </div>
              )}
              <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
                {sharedPassengers.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm font-bold py-4">यात्री लोड हो रहे हैं...</p>
                ) : (
                  sharedPassengers.map(p => (
                    <div key={p.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-black text-slate-800">{p.passengerName}</p>
                          <p className="text-[10px] text-slate-400 font-bold">चढ़ना: {p.boardingStop} → उतरना: {p.dropStop}</p>
                          <p className="text-[10px] text-slate-400 font-bold">सीटें: {p.seats || 1}</p>
                          <p className="text-sm font-black text-blue-600">₹{p.fare}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          p.status === 'onboard' ? 'bg-emerald-100 text-emerald-600' :
                          p.status === 'done' ? 'bg-slate-200 text-slate-500' :
                          'bg-amber-100 text-amber-600'
                        }`}>{p.status === 'driver_assigned' ? 'प्रतीक्षा' : p.status === 'onboard' ? 'सवार' : p.status === 'done' ? 'उतरे' : p.status}</span>
                      </div>
                      {p.status === 'driver_assigned' && p.boardingStop === routeStops[currentStopIndex] && (
                        <button onClick={() => handlePickupPassenger(p.id)}
                          className="w-full py-2 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">
                          {t('pickupDone')}
                        </button>
                      )}
                      {p.status === 'onboard' && p.dropStop === routeStops[currentStopIndex] && (
                        <button onClick={() => handleDropPassenger(p.id, p.fare)}
                          className="w-full py-2 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">
                          {t('dropDone')}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 shrink-0 border-t border-slate-100 flex flex-col gap-2">
                {routeStops.length > 0 && (
                  <button
                    onClick={() => handleStopReached(currentStopIndex)}
                    disabled={currentStopIndex >= routeStops.length - 1}
                    className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-40">
                    {t('stopReached')}
                  </button>
                )}
                {sharedPassengers.length > 0 && sharedPassengers.every(p => p.status === 'done') && (
                  <button onClick={handleCompleteSharedTrip}
                    className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest">
                    {t('tripComplete')} ✓
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Ride Overlay - Compact Floating Card */}
      <AnimatePresence>
        {newRequest && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed left-4 right-4 z-20 max-w-lg mx-auto overflow-y-auto"
            style={{ bottom: '7rem', maxHeight: 'calc(100dvh - 8rem)' }}
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
                    <ChevronRight className="-rotate-90 text-white" size={14} />
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
                      <div className="flex flex-col gap-2">
                        {walletZone !== 'normal' && (
                          <div className={`px-4 py-2.5 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest ${walletZone === 'blocked' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                            {walletZone === 'blocked'
                              ? `Account Blocked — Earnings Balance ₹${walletBalance.toFixed(0)} (limit -₹100). Admin se contact karein.`
                              : `Earnings Balance Restricted ₹${walletBalance.toFixed(0)} — Admin se contact karein.`}
                          </div>
                        )}
                        {walletZone === 'normal' && walletBalance <= -45 && (
                          <div className="px-4 py-2 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest bg-red-50 text-red-500">
                            Critical: Earnings Balance ₹{walletBalance.toFixed(0)} — Admin se contact karein
                          </div>
                        )}
                        {walletZone === 'normal' && walletBalance <= -30 && walletBalance > -45 && (
                          <div className="px-4 py-2 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest bg-amber-50 text-amber-600">
                            Low Earnings Balance: ₹{walletBalance.toFixed(0)}
                          </div>
                        )}
                        <div className="flex gap-3">
                          <button onClick={() => setShowRejectModal(true)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Reject</button>
                          <button
                            onClick={handleAcceptRide}
                            disabled={!canAcceptRide}
                            className={`flex-[2] py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                              canAcceptRide
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 active:scale-95'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {canAcceptRide ? 'Claim Ride →' : walletZone === 'blocked' ? 'Blocked' : 'Restricted'}
                          </button>
                        </div>
                      </div>
                    )}
                    {newRequest.status === 'accepted' && newRequest.driverId === driverId && (
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                          <input
                            type="password" inputMode="numeric" maxLength="4" placeholder="• • • •"
                            autoComplete="one-time-code"
                            value={enteredOtp} onChange={(e) => setEnteredOtp(e.target.value)}
                            onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                            className="flex-1 bg-slate-50 px-3 py-4 rounded-2xl text-center text-xl font-black tracking-[0.3em] outline-none border-2 border-slate-100 focus:border-blue-500 transition-all"
                          />
                          <button onClick={handleVerifyOtp} className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all">यात्रा शुरू</button>
                        </div>
                        {newRequest.userPhone && (
                          <button
                            onClick={() => window.location.href = `tel:${newRequest.userPhone}`}
                            className="w-full py-3.5 bg-blue-600/20 text-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            <Phone size={14} /> यात्री को कॉल करें
                          </button>
                        )}
                      </div>
                    )}
                    {newRequest.status === 'started' && newRequest.driverId === driverId && (
                      <div className="flex flex-col gap-3">
                        <button onClick={handleCompleteRide} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">यात्रा समाप्त करें</button>
                        {newRequest.userPhone && (
                          <button
                            onClick={() => window.location.href = `tel:${newRequest.userPhone}`}
                            className="w-full py-3.5 bg-blue-600/20 text-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            <Phone size={14} /> यात्री को कॉल करें
                          </button>
                        )}
                      </div>
                    )}
                    {newRequest.status === 'completed' && newRequest.driverId === driverId && driverFareBreakup && (
                      <div className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-3">
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest text-center">भुगतान लीजिए</p>
                        <div className="text-[10px] font-bold text-slate-500 space-y-1">
                          <div className="flex justify-between"><span>आधार किराया</span><span>₹{driverFareBreakup.base}</span></div>
                          <div className="flex justify-between"><span>दूरी</span><span>₹{driverFareBreakup.distance}</span></div>
                          {driverFareBreakup.waiting > 0 && (
                            <div className="flex justify-between text-amber-600"><span>प्रतीक्षा ({driverFareBreakup.waitingMins} मिनट)</span><span>₹{driverFareBreakup.waiting}</span></div>
                          )}
                          {driverFareBreakup.isNight && (
                            <div className="flex justify-between text-purple-600"><span>रात्रि शुल्क</span><span>₹{driverFareBreakup.nightSurcharge}</span></div>
                          )}
                          <div className="flex justify-between font-black text-slate-800 text-sm border-t border-emerald-200 pt-2">
                            <span>कुल</span><span>₹{driverFareBreakup.total}</span>
                          </div>
                        </div>
                        {/* Online Payment — Coming Soon */}
                        <div className="w-full flex flex-col items-center gap-1 bg-slate-100 rounded-xl px-4 py-3.5 border border-slate-200">
                          <Clock size={18} className="text-slate-400" />
                          <p className="text-[10px] font-black text-slate-500">ऑनलाइन भुगतान</p>
                          <p className="text-[11px] font-black text-slate-700">जल्द आ रहा है!</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coming Soon</p>
                        </div>
                        <button
                          onClick={() => handleCashCollected(newRequest, driverFareBreakup)}
                          className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={16} /> नकद मिला — पुष्टि करें
                        </button>
                      </div>
                    )}
                    {newRequest.status === 'payment_done' && newRequest.driverId === driverId && (
                      <div className="w-full space-y-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">✓ भुगतान पुष्ट</p>
                        </div>
                        <button
                          onClick={handleDoneRide}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
                        >
                          अगली सवारी के लिए तैयार
                        </button>
                      </div>
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

      {/* Pending Payment Card — shown when ride is outside RideContext window or after refresh */}
      {pendingPaymentRide &&
       pendingPaymentRide.status === 'completed' &&
       newRequest?.id !== pendingPaymentRide.id &&
       pendingFareBreakup && (
        <div className="mx-4 mb-4 bg-white rounded-3xl shadow-lg border-2 border-emerald-200 overflow-hidden">
          <div className="bg-emerald-600 px-4 py-3 flex items-center justify-between">
            <p className="text-white font-black text-[11px] uppercase tracking-widest">बाकी भुगतान</p>
            <p className="text-emerald-100 text-xs font-bold">
              {pendingPaymentRide.pickup?.address?.split(',')[0] || 'Pickup'} →{' '}
              {pendingPaymentRide.destination?.address?.split(',')[0] || 'Destination'}
            </p>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="text-[10px] font-bold text-slate-500 space-y-1">
              <div className="flex justify-between"><span>आधार किराया</span><span>₹{pendingFareBreakup.base}</span></div>
              <div className="flex justify-between"><span>दूरी</span><span>₹{pendingFareBreakup.distance}</span></div>
              {pendingFareBreakup.waiting > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>प्रतीक्षा ({pendingFareBreakup.waitingMins} मिनट)</span>
                  <span>₹{pendingFareBreakup.waiting}</span>
                </div>
              )}
              {pendingFareBreakup.isNight && (
                <div className="flex justify-between text-purple-600">
                  <span>रात्रि शुल्क</span><span>₹{pendingFareBreakup.nightSurcharge}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-slate-800 text-sm border-t border-slate-100 pt-2">
                <span>कुल</span><span>₹{pendingFareBreakup.total}</span>
              </div>
            </div>
            {/* Online Payment — Coming Soon */}
            <div className="w-full flex flex-col items-center gap-1 bg-slate-100 rounded-xl px-4 py-3.5 border border-slate-200">
              <Clock size={18} className="text-slate-400" />
              <p className="text-[10px] font-black text-slate-500">Online Payment</p>
              <p className="text-[11px] font-black text-slate-700">Jaldi Aa Raha Hai!</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coming Soon</p>
            </div>
            <button
              onClick={() => handleCashCollected(pendingPaymentRide, pendingFareBreakup)}
              className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> नकद मिला — पुष्टि करें
            </button>
          </div>
        </div>
      )}

      {/* Profile Edit Tab */}
      {activeTab === 'profile_edit' && (
        <ProfileEditTab
          profile={profile}
          driverId={driverId}
          onBack={() => setActiveTab('dashboard')}
        />
      )}

      {/* Navigation Content Switcher */}
      {activeTab === 'verify' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-24 px-6 overflow-y-auto pb-24">
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
              <KycForm driverId={driverId} setIsUploading={setIsUploading} isUploading={isUploading} showToast={showToast} />
            )}
          </div>
        </div>
      )}
      {activeTab === 'wallet' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-24 px-6 overflow-y-auto pb-24">
          <div className="max-w-md mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <IndianRupee size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Earnings Balance</h2>
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Earnings & Payouts</p>
              </div>
            </div>

            {/* Date Filter Tabs */}
            {(() => {
              const now = new Date();
              const startOf = {
                today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                week:  new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()),
                month: new Date(now.getFullYear(), now.getMonth(), 1),
                all:   new Date(0)
              };
              const filtered = walletTransactions.filter(tx => {
                const ts = tx.createdAt?.toMillis?.() || 0;
                return ts >= startOf[earningsFilter].getTime();
              });
              const filteredEarnings = filtered.reduce((sum, tx) => {
                if (tx.type === 'commission_deducted') return sum + (tx.fareCollected || 0);
                if (tx.type === 'online_earned' || tx.type === 'earned') return sum + (tx.fareCollected || 0);
                return sum;
              }, 0);
              const filteredNet = filtered.reduce((sum, tx) => {
                if (tx.type === 'commission_deducted') return sum + (tx.fareCollected || 0) - (tx.amount || 0);
                if (tx.type === 'online_earned' || tx.type === 'earned') return sum + (tx.amount || 0);
                return sum;
              }, 0);
              const FILTERS = [
                { key: 'today', label: 'Aaj' },
                { key: 'week',  label: 'Hafte' },
                { key: 'month', label: 'Mahina' },
                { key: 'all',   label: 'Sab' },
              ];
              return (
                <>
                  <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
                    {FILTERS.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setEarningsFilter(f.key)}
                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          earningsFilter === f.key
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-400'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {earningsFilter !== 'all' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Kul Vasool</p>
                        <p className="text-xl font-black text-blue-800">₹{filteredEarnings.toFixed(0)}</p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Net Kamai</p>
                        <p className="text-xl font-black text-emerald-800">₹{filteredNet.toFixed(0)}</p>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

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
              <div className="bg-amber-50 p-5 rounded-3xl border border-amber-100 shadow-sm">
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Nagad/Cash Kamai</p>
                <p className="text-2xl font-black text-amber-800">₹{Number(profile?.cashEarnings || 0).toFixed(0)}</p>
              </div>
              <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100 shadow-sm">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Online Kamai</p>
                <p className="text-2xl font-black text-emerald-800">₹{Number(profile?.onlineEarnings || 0).toFixed(0)}</p>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Kul Kamai</p>
                <p className="text-2xl font-black text-slate-800">₹{Number(stats.totalEarnings || 0).toFixed(0)}</p>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Platform Fee (8%)</p>
                <p className="text-2xl font-black text-red-500">₹{Math.round((stats.totalEarnings || 0) * ((config.commissionPercent || 8) / 100)) || 0}</p>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="pt-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-2">Transactions</h3>
              <div className="space-y-3">
                {walletTransactions.filter(tx => {
                  if (earningsFilter === 'all') return true;
                  const now = new Date();
                  const startOf = {
                    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                    week:  new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()),
                    month: new Date(now.getFullYear(), now.getMonth(), 1),
                  };
                  return (tx.createdAt?.toMillis?.() || 0) >= startOf[earningsFilter].getTime();
                }).map(tx => {
                  const isCash = tx.type === 'commission_deducted';
                  const isOnline = tx.type === 'online_earned' || tx.type === 'earned';
                  const isWithdrawal = tx.type === 'withdrawn';
                  return (
                    <div key={tx.id} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        isCash      ? 'bg-amber-50 text-amber-600' :
                        isOnline    ? 'bg-emerald-50 text-emerald-600' :
                        isWithdrawal? 'bg-red-50 text-red-500' :
                                      'bg-slate-50 text-slate-400'
                      }`}>
                        {isCash       ? <IndianRupee size={18} /> :
                         isOnline     ? <TrendingUp size={18} /> :
                         isWithdrawal ? <AlertCircle size={18} /> :
                                        <IndianRupee size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-slate-800">
                            {isCash ? 'Nagad Sawari' : isOnline ? 'Online Sawari' : isWithdrawal ? 'Nikasi' : tx.type}
                          </p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                            isCash ? 'bg-amber-100 text-amber-700' : isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {isCash ? 'CASH' : isOnline ? 'ONLINE' : 'WITHDRAWAL'}
                          </span>
                        </div>
                        {isCash && tx.fareCollected && (
                          <p className="text-[9px] font-bold text-slate-500">
                            Vasool: ₹{tx.fareCollected} · Platform Fee: −₹{tx.amount}
                          </p>
                        )}
                        {isOnline && tx.fareCollected && (
                          <p className="text-[9px] font-bold text-slate-500">
                            Fare: ₹{tx.fareCollected} · Credited: +₹{tx.amount}
                          </p>
                        )}
                        <p className="text-[9px] text-slate-300">{tx.createdAt?.toDate?.()?.toLocaleString('en-IN') || 'Abhi'}</p>
                      </div>
                      <div className={`text-sm font-black flex-shrink-0 ${
                        isOnline ? 'text-emerald-600' : isCash ? 'text-amber-700' : 'text-red-500'
                      }`}>
                        {isOnline ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                      </div>
                    </div>
                  );
                })}
                {walletTransactions && walletTransactions.length === 0 && (
                  <div className="text-center py-8 bg-white rounded-3xl border border-slate-100 border-dashed">
                    <p className="text-xs font-bold text-slate-400">Koi transaction nahi</p>
                  </div>
                )}
              </div>
            </div>

            {/* Refer & Earn Section */}
            <DriverReferSection config={config} driverId={driverId} profile={profile} />
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
                      readOnly
                      placeholder="KYC mein UPI ID submit karein"
                      className="w-full bg-slate-100 border border-slate-100 p-5 rounded-3xl outline-none font-bold text-slate-600 cursor-not-allowed"
                    />
                    <p className="text-[9px] text-slate-400 ml-2 mt-1">UPI change: admin se sampark karein</p>
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

      {/* Grievance Contact Modal */}
      <AnimatePresence>
        {isGrievanceOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsGrievanceOpen(false)}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[110] bg-white rounded-t-[2.5rem] p-8 pb-12 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-[1.5rem] flex items-center justify-center mx-auto mb-3">
                  <AlertCircle size={28} />
                </div>
                <h3 className="text-xl font-black text-slate-800">Help & Grievance</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">VahanSetu ApniGadi</p>
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Email</p>
                  <p className="text-sm font-black text-slate-800">apnigadivahansetu@gmail.com</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone / WhatsApp</p>
                  <p className="text-sm font-black text-slate-800">+91 {config.grievancePhone}</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-[11px] font-bold text-amber-800 text-center">Response time: 24-48 hours</p>
                </div>
                <button
                  onClick={() => window.open(`tel:+91${config.grievancePhone}`)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
                >
                  Call Now
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MESSAGES TAB ────────────────────────────────────────────────── */}
      {activeTab === 'messages' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-16 pb-20 overflow-y-auto">
          <div className="max-w-md mx-auto px-6 py-6 space-y-5">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Bell size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Notifications</h2>
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Admin Messages</p>
              </div>
            </div>

            {systemBroadcasts.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 border-dashed">
                <Bell size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-base font-black text-slate-400">Abhi koi notification nahi</p>
                <p className="text-[11px] text-slate-300 mt-1">Admin messages yahan aayenge</p>
              </div>
            ) : (
              <div className="space-y-3">
                {systemBroadcasts.map(msg => {
                  const ts = msg.timestamp?.toDate?.();
                  const isRecent = msg.timestamp?.toMillis() > Date.now() - 3600000;
                  return (
                    <div key={msg.id} className={`bg-white rounded-3xl p-5 border shadow-sm ${isRecent ? 'border-red-100' : 'border-slate-100'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isRecent ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                          <AlertCircle size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {isRecent && (
                            <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">New</span>
                          )}
                          <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">{msg.message}</p>
                          {ts && (
                            <p className="text-[9px] font-black text-slate-300 uppercase mt-2">
                              {ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • {ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] py-2">— End —</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="fixed inset-0 z-40 bg-slate-50 pt-16 pb-20 overflow-y-auto">
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
                  const earned = ride.fareAmount ? Math.round(ride.fareAmount * (1 - (config?.commissionPercent || 8) / 100)) : null;
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

      {/* Combined Stats + Navigation Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white border-t border-slate-100 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        {/* Stats row */}
        <div className="flex items-center justify-around px-4 pt-3 pb-1 border-b border-slate-50">
          <div className="text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Earnings</p>
            <p className="text-sm font-black text-slate-800">₹{stats.totalEarnings}</p>
          </div>
          <div className="w-px h-6 bg-slate-100" />
          <div className="text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Earnings Bal.</p>
            <p className="text-sm font-black text-emerald-600">₹{Number(stats.walletBalance || 0).toFixed(0)}</p>
          </div>
          <div className="w-px h-6 bg-slate-100" />
          <div className="text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rides</p>
            <p className="text-sm font-black text-slate-800">{stats.rides}</p>
          </div>
          <div className="w-px h-6 bg-slate-100" />
          <div className="text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rating</p>
            <p className="text-sm font-black text-emerald-600 flex items-center justify-center gap-0.5"><Star size={9} fill="currentColor" /> {stats.rating}</p>
          </div>
        </div>
        {/* Nav tabs row */}
        <div className="flex justify-around items-center px-4 py-2 h-14" style={{ position: 'relative' }}>
          <div className="absolute right-3 top-1">
            <LanguageToggle />
          </div>
          {[
            { id: 'dashboard', icon: TrendingUp, label: t('navDashboard') },
            { id: 'wallet', icon: IndianRupee, label: t('navWallet') },
            { id: 'verify', icon: ShieldCheck, label: t('navVerify') },
            { id: 'messages', icon: Bell, label: t('navMessages') },
            { id: 'history', icon: History, label: t('navHistory') }
          ].map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
              <item.icon size={20} />
              <span className="text-[8px] font-black uppercase">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
};

export default DriverDashboard;
