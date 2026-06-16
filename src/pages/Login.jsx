import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  Car,
  User,
  AlertCircle,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  MessageSquare,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import LanguageToggle from '../components/LanguageToggle';

const Login = () => {
  const navigate = useNavigate();
  const { setupRecaptcha, signInPhone, signInWithPassword, signInWithGoogle, registerUser, user, userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const loggedInUserRef = useRef(null);

  const preFilledName = searchParams.get('name') || '';
  const preFilledRole = searchParams.get('role') === 'driver' ? 'driver' : 'customer';

  // step: 'login' | 'otp' | 'register'
  const [step, setStep] = useState('login');

  // Login step state
  const [identifier, setIdentifier] = useState('');
  const [authMethod, setAuthMethod] = useState('otp'); // 'otp' | 'password'
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP step state
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [resolvedPhone, setResolvedPhone] = useState('');

  // Register step state
  const [name, setName] = useState(preFilledName);
  const [role, setRole] = useState(preFilledRole);
  const [vehicleType, setVehicleType] = useState('battery_rickshaw');
  const [referredBy, setReferredBy] = useState(() => localStorage.getItem('vs_referral') || '');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Already logged in → redirect to their home page (handles back-button-to-login case)
  useEffect(() => {
    if (user && userProfile && userProfile.role !== 'new_user') {
      const target =
        userProfile.role === 'driver' ? '/dashboard' :
        userProfile.role === 'admin' ? '/admin' : '/home';
      navigate(target, { replace: true });
    }
  }, [user, userProfile, navigate]);

  useEffect(() => {
    setupRecaptcha('recaptcha-container');
  }, []);

  // ?ref=VS-XXXX deep link → auto-fill referral field
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      const code = refCode.toUpperCase();
      localStorage.setItem('vs_referral', code);
      setReferredBy(code);
    }
  }, [searchParams]);

  // Resolve identifier (mobile or VS-ID) to E.164 phone number
  const resolvePhone = async (id) => {
    const trimmed = id.trim();
    if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
    if (/^\+91\d{10}$/.test(trimmed)) return trimmed;
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('VS-')) {
      const idSnap = await getDoc(doc(db, 'id_lookup', upper));
      if (!idSnap.exists()) throw new Error('VS-ID nahi mila. Mobile number se try karein.');
      return idSnap.data().phone;
    }
    throw new Error('Valid mobile number (10 digit) ya VS-ID (VS-XXXXXX) darj karein.');
  };

  const handleSubmit = async () => {
    if (!identifier.trim()) return setError('Mobile number ya VS-ID darj karein.');
    if (authMethod === 'password') {
      await handlePasswordLogin();
    } else {
      await handleSendOtp();
    }
  };

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const phone = await resolvePhone(identifier);
      setResolvedPhone(phone);
      setupRecaptcha('recaptcha-container'); // fresh verifier on every attempt
      const result = await signInPhone(phone);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'OTP bhejne mein error aaya. Dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // redirect via useEffect watching user+userProfile
    } catch (err) {
      const code = err.code || '';
      setError(
        code === 'auth/popup-closed-by-user'
          ? 'Login cancel kar diya. Dobara try karein.'
          : 'Google login mein error aaya. Dobara try karein.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!password) return setError('Password darj karein.');
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPassword(identifier, password);
      const loggedInUser = result.user;
      const userDoc = await getDoc(doc(db, 'users', loggedInUser.uid));
      if (userDoc.exists()) {
        const profile = userDoc.data();
        const target =
          profile.role === 'driver' ? '/dashboard' :
          profile.role === 'admin' ? '/admin' : '/home';
        navigate(target);
      } else {
        loggedInUserRef.current = loggedInUser;
        setStep('register');
      }
    } catch (err) {
      const code = err.code || '';
      const msg =
        code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? 'Password galat hai. Dobara try karein ya OTP se login karein.'
          : code === 'auth/user-not-found'
          ? 'Is number pe password set nahi hua. OTP se login karein.'
          : code === 'auth/too-many-requests'
          ? 'Bahut zyada attempts. Kuch der baad try karein.'
          : err.message || 'Login fail. Dobara try karein.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await confirmationResult.confirm(otp);
      const loggedInUser = result.user;
      loggedInUserRef.current = loggedInUser;

      const userDoc = await getDoc(doc(db, 'users', loggedInUser.uid));
      if (userDoc.exists()) {
        const profile = userDoc.data();
        const target =
          profile.role === 'driver' ? '/dashboard' :
          profile.role === 'admin' ? '/admin' : '/home';
        navigate(target);
      } else {
        setStep('register');
      }
    } catch (err) {
      setError('Invalid OTP. Dobara try karein.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishRegistration = async () => {
    if (!name) return setError('Apna naam darj karein.');
    const uid = loggedInUserRef.current?.uid || user?.uid;
    if (!uid) return setError('Session expire ho gayi. Dobara login karein.');
    setLoading(true);
    try {
      const profile = await registerUser(uid, {
        role,
        name,
        referredBy,
        ...(role === 'driver' && { vehicleType }),
        ...(newPassword && { password: newPassword }),
      });

      localStorage.removeItem('vs_referral');
      navigate(role === 'driver' ? '/dashboard' : '/home');
    } catch (err) {
      console.error(err);
      setError('Registration fail ho gayi. Dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  const headerColor = step === 'register' && role === 'driver'
    ? 'bg-emerald-600'
    : 'bg-blue-600';

  const headerTitle =
    step === 'otp' ? 'OTP Verify Karein' :
    step === 'register' ? 'Profile Banao' :
    'Welcome';

  const roles = [
    { id: 'customer', label: 'Passenger', icon: User },
    { id: 'driver', label: 'Driver', icon: Car },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="fixed top-4 right-4 z-50">
        <LanguageToggle />
      </div>
      <div id="recaptcha-container" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className={`px-6 py-5 text-white transition-all duration-700 relative overflow-hidden ${headerColor}`}>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-3">
              <div className="p-1 bg-white/20 rounded-xl backdrop-blur-md border border-white/30">
                <img src="/VahanSetu_Final_Logo.png" alt="VahanSetu Logo" className="w-10 h-10 rounded-lg object-contain" />
              </div>
              <div className="text-right">
                <h2 className="text-xl font-black tracking-tighter uppercase leading-none">VahanSetu</h2>
              </div>
            </div>
            <h1 className="text-2xl font-black mb-0.5 tracking-tight">{headerTitle}</h1>
            <p className="text-white/70 font-bold text-[10px] uppercase tracking-widest">
              {step === 'login' && 'ID ya Mobile se login karein'}
              {step === 'otp' && `${resolvedPhone || identifier} pe bheja gaya`}
              {step === 'register' && 'Apni profile complete karein'}
            </p>
          </div>
          <div className="absolute top-[-20%] right-[-10%] w-36 h-36 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-[-20%] left-[-10%] w-36 h-36 bg-black/10 rounded-full blur-3xl" />
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Error Banner */}
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 p-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-2"
              >
                <AlertCircle size={14} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">

            {/* ── Step: Login ── */}
            {step === 'login' && (
              <motion.div
                key="login-step"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-3"
              >
                {/* Identifier Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    VS-ID ya Mobile Number
                  </label>
                  <input
                    type="text"
                    placeholder="VS-XXXXXX ya 9XXXXXXXXX"
                    value={identifier}
                    onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none focus:border-blue-500 transition-all"
                  />
                </div>

                {/* Auth Method Toggle */}
                <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    onClick={() => { setAuthMethod('otp'); setError(''); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-300 ${
                      authMethod === 'otp'
                        ? 'bg-white text-slate-900 shadow shadow-slate-200'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <MessageSquare size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">OTP</span>
                  </button>
                  <button
                    onClick={() => { setAuthMethod('password'); setError(''); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-300 ${
                      authMethod === 'password'
                        ? 'bg-white text-slate-900 shadow shadow-slate-200'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <KeyRound size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Password</span>
                  </button>
                </div>

                {/* Password Input (visible only when password method selected) */}
                <AnimatePresence>
                  {authMethod === 'password' && (
                    <motion.div
                      key="pw-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 overflow-hidden"
                    >
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setError(''); }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pr-10 text-slate-800 font-bold outline-none focus:border-blue-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-[9px] text-slate-400 text-center">
                  Pilot phase | Technology platform, taxi company nahi
                </p>

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-white font-black tracking-widest text-[10px] uppercase shadow-lg transition-all active:scale-95 disabled:opacity-50 bg-blue-600 shadow-blue-600/20"
                >
                  {loading
                    ? 'Please wait...'
                    : authMethod === 'otp'
                    ? 'OTP Bhejo'
                    : 'Login Karein'
                  }
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">YA</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Google Login */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-3 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center gap-3 font-black text-slate-700 text-[10px] uppercase tracking-widest active:bg-slate-50 transition-all disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                  </svg>
                  Google se Login Karein
                </button>
              </motion.div>
            )}

            {/* ── Step: OTP ── */}
            {step === 'otp' && (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 text-center"
              >
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    6-Digit OTP Darj Karein
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0 0 0 0 0 0"
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value); setError(''); }}
                    maxLength={6}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3 text-center text-2xl font-black tracking-[0.5em] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                  />
                  <p className="text-[9px] font-bold text-slate-400">{resolvedPhone || identifier} pe bheja gaya</p>
                </div>

                <button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length < 6}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl font-black tracking-widest text-[10px] uppercase shadow-lg shadow-black/20 disabled:opacity-50"
                >
                  {loading ? 'Verify ho raha hai...' : 'Verify & Login'}
                </button>

                <p className="text-[9px] text-slate-400 text-center">
                  Login karke aap hamare{' '}
                  <a href="/terms" className="text-blue-500 hover:text-blue-700 font-bold">Terms</a>
                  {' '}aur{' '}
                  <a href="/privacy-policy" className="text-blue-500 hover:text-blue-700 font-bold">Privacy Policy</a>
                  {' '}se agree karte hain.
                </p>

                <button
                  onClick={() => { setStep('login'); setOtp(''); setError(''); }}
                  className="text-slate-400 font-black text-[9px] uppercase tracking-widest hover:text-slate-600"
                >
                  ← Wapas Jaao
                </button>
              </motion.div>
            )}

            {/* ── Step: Register ── */}
            {step === 'register' && (
              <motion.div
                key="register-step"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* Role Tabs */}
                <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRole(r.id)}
                      className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all duration-500 ${
                        role === r.id
                          ? 'bg-white text-slate-900 shadow shadow-slate-200 z-10'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <r.icon size={15} />
                      <span className="text-[9px] font-black uppercase tracking-widest">{r.label}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Pura Naam *</label>
                    <input
                      type="text"
                      placeholder="e.g. Vivek Kumar"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-black outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>

                  {/* Vehicle Type (driver only) */}
                  {role === 'driver' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Vehicle Type</label>
                      <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-black outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                      >
                        <option value="battery_rickshaw">Battery Rickshaw</option>
                        <option value="chhota_hathi">Chhota Hathi</option>
                      </select>
                    </div>
                  )}

                  {/* Referral Code */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Referral Code (Optional)</label>
                    <input
                      type="text"
                      placeholder="VS-XXXXXX"
                      value={referredBy}
                      onChange={(e) => setReferredBy(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-black outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>

                  {/* Password Setup (optional) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Password Set Karo <span className="text-slate-300 normal-case font-bold">(Optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Aage se password se bhi login kar sakte hain"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pr-10 text-slate-800 font-black outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-400 ml-1">
                      Password set karna zaroori nahi. OTP hamesha kaam karega.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleFinishRegistration}
                  disabled={loading}
                  className={`w-full py-3 rounded-xl text-white font-black tracking-widest text-[10px] uppercase shadow-lg transition-all disabled:opacity-50 ${
                    role === 'driver' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-blue-600 shadow-blue-600/20'
                  }`}
                >
                  {loading ? 'Account ban raha hai...' : 'Account Banao'}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <div className="flex justify-center gap-6 opacity-30 grayscale mb-4">
            <Smartphone size={16} />
            <ShieldCheck size={16} />
            <Lock size={16} />
          </div>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">VahanSetu Secured Platform</p>
          <div className="mt-3 flex justify-center gap-4">
            <a
              href="/privacy-policy"
              className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
            >
              Privacy Policy
            </a>
            <span className="text-slate-300 text-[9px]">•</span>
            <a
              href="/terms"
              className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </motion.div>

      {/* Driver Banein — fixed bottom-right, only on login step */}
      {step === 'login' && (
        <button
          onClick={() => navigate('/driver-login')}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-white border-2 border-emerald-500 rounded-full shadow-xl active:scale-95 transition-all"
        >
          <span className="text-emerald-600 font-black text-sm">🚗 Driver Banein</span>
        </button>
      )}
    </div>
  );
};

export default Login;
