import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, increment, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionConsentPending, setSessionConsentPending] = useState(null); // null | 'driver' | 'passenger'
  const sessionUnsubRef = useRef(null);

  const startSessionWatcher = useCallback((uid, currentSid) => {
    if (sessionUnsubRef.current) sessionUnsubRef.current();
    sessionUnsubRef.current = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (!snap.exists()) return;
      const newSid = snap.data().sessionId;
      if (newSid && newSid !== currentSid) {
        // Another device claimed the session — force logout this device
        localStorage.removeItem('vs_session_id');
        signOut(auth);
      }
    });
  }, []);

  const handleSessionCheck = useCallback(async (uid, profile) => {
    const firestoreSessionId = profile.sessionId;
    const localSid = localStorage.getItem('vs_session_id');

    if (!firestoreSessionId) {
      // No session claimed yet — claim silently (first login on any device)
      const newSid = crypto.randomUUID();
      localStorage.setItem('vs_session_id', newSid);
      try {
        await updateDoc(doc(db, 'users', uid), { sessionId: newSid });
      } catch (e) {
        console.error('[AuthContext] session claim error:', e);
      }
      startSessionWatcher(uid, newSid);
      return;
    }

    if (localSid === firestoreSessionId) {
      // Same device — all good, just watch for takeovers
      startSessionWatcher(uid, localSid);
      return;
    }

    // localSid missing (e.g. back button / WebView cleared localStorage) — silently reclaim
    if (!localSid) {
      const newSid = crypto.randomUUID();
      localStorage.setItem('vs_session_id', newSid);
      try {
        await updateDoc(doc(db, 'users', uid), { sessionId: newSid });
      } catch (e) {
        console.error('[AuthContext] session claim error:', e);
      }
      startSessionWatcher(uid, newSid);
      return;
    }

    // Conflict: another device has an active session
    if (profile.role === 'driver') {
      setSessionConsentPending('driver');
    } else {
      setSessionConsentPending('passenger');
    }
  }, [startSessionWatcher]);

  const confirmSessionTakeover = useCallback(async () => {
    if (!user) return;
    const newSid = crypto.randomUUID();
    localStorage.setItem('vs_session_id', newSid);
    try {
      await updateDoc(doc(db, 'users', user.uid), { sessionId: newSid });
      setSessionConsentPending(null);
      startSessionWatcher(user.uid, newSid);
    } catch (e) {
      console.error('[AuthContext] session takeover error:', e);
    }
  }, [user, startSessionWatcher]);

  const dismissSessionModal = useCallback(() => {
    // Passenger only — they can continue without kicking other devices
    setSessionConsentPending(null);
  }, []);

  // Persistence and profile fetching
  useEffect(() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      auth.settings.appVerificationDisabledForTesting = true;
    }

    setPersistence(auth, browserLocalPersistence);

    // APK/WebView mein localStorage kabhi kabhi clear ho jaata hai — sessionStorage backup
    const storedSid = localStorage.getItem('vs_session_id');
    if (storedSid) {
      sessionStorage.setItem('vs_session_id_backup', storedSid);
    } else {
      const backup = sessionStorage.getItem('vs_session_id_backup');
      if (backup) {
        localStorage.setItem('vs_session_id', backup);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data();
          setUserProfile(profile);
          if (profile.role !== 'admin' && profile.role !== 'new_user') {
            handleSessionCheck(currentUser.uid, profile);
          }
        } else {
          setUserProfile({ role: 'new_user' });
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setSessionConsentPending(null);
        if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [handleSessionCheck]);

  // Setup reCAPTCHA
  const setupRecaptcha = (containerId) => {
    if (window.recaptchaVerifier) return;
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      'size': 'invisible',
      'callback': () => {}
    });
  };

  // Sign in with Phone
  const signInPhone = async (phoneNumber) => {
    try {
      const verifier = window.recaptchaVerifier;
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      return confirmationResult;
    } catch (error) {
      console.error("Phone sign-in error:", error);
      throw error;
    }
  };

  // Complete Registration / Update Profile
  const registerUser = async (uid, data) => {
    const generateShortId = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let result = 'VS-';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const { password: _pw, ...safeData } = data;
    const newSid = crypto.randomUUID();
    localStorage.setItem('vs_session_id', newSid);
    const profile = {
      uid,
      displayId: data.displayId || generateShortId(),
      phoneNumber: auth.currentUser.phoneNumber,
      role: data.role,
      balance: data.referredBy ? 15 : 0,
      createdAt: new Date().toISOString(),
      sessionId: newSid,
      ...safeData
    };
    await setDoc(doc(db, 'users', uid), profile);

    if (data.referredBy) {
      const q = query(collection(db, 'users'), where('displayId', '==', data.referredBy));
      const referrerSnap = await getDocs(q);
      if (!referrerSnap.empty) {
        const referrerDoc = referrerSnap.docs[0];
        await updateDoc(doc(db, 'users', referrerDoc.id), {
          balance: increment(10)
        });
        const drvDoc = await getDoc(doc(db, 'drivers', referrerDoc.id));
        if (drvDoc.exists()) {
          await updateDoc(doc(db, 'drivers', referrerDoc.id), {
            walletBalance: increment(10)
          });
        }
      }
    }

    if (data.role === 'driver') {
      await setDoc(doc(db, 'drivers', uid), {
        uid,
        displayId: profile.displayId,
        name: data.name || 'Driver Partner',
        phone: auth.currentUser.phoneNumber,
        vehicleType: data.vehicleType || 'battery_rickshaw',
        isOnline: false,
        rating: 5.0,
        walletBalance: profile.balance || 0,
        verificationStatus: 'unverified',
        createdAt: new Date().toISOString()
      });
    }

    setUserProfile(profile);
    // Start session watcher immediately after registration
    startSessionWatcher(uid, newSid);
    return profile;
  };

  const logout = () => {
    localStorage.removeItem('vs_session_id');
    return signOut(auth);
  };

  const value = {
    user,
    userProfile,
    loading,
    setupRecaptcha,
    signInPhone,
    registerUser,
    logout,
    isAdmin: userProfile?.role === 'admin',
    isDriver: userProfile?.role === 'driver',
    isCustomer: userProfile?.role === 'customer',
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}

      {/* Single-device session consent modal */}
      {sessionConsentPending && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📱</span>
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-2">Doosra Device Active Hai</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Aapka account kisi doosre device pe already active hai.
                {sessionConsentPending === 'driver'
                  ? ' Driver account ek waqt mein sirf ek hi device pe use ho sakta hai.'
                  : ' Kya aap us device ko logout karke yahan login karna chahte hain?'
                }
              </p>
            </div>

            <button
              onClick={confirmSessionTakeover}
              className="w-full bg-orange-500 active:bg-orange-600 text-white font-black py-4 rounded-2xl text-base mb-3 transition-colors"
            >
              Haan, Is Device Pe Login Karein
            </button>

            {sessionConsentPending === 'passenger' && (
              <button
                onClick={dismissSessionModal}
                className="w-full bg-slate-100 active:bg-slate-200 text-slate-600 font-bold py-3 rounded-2xl text-sm transition-colors"
              >
                Nahi, Rehne Do
              </button>
            )}

            {sessionConsentPending === 'driver' && (
              <button
                onClick={() => { localStorage.removeItem('vs_session_id'); signOut(auth); }}
                className="w-full text-slate-400 font-medium py-2 text-xs"
              >
                Logout Karein
              </button>
            )}
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
