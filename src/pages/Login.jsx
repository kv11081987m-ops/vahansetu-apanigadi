import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  Car,
  User,
  AlertCircle,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

const Login = () => {
  const navigate = useNavigate();
  const { setupRecaptcha, signInPhone, registerUser, user } = useAuth();
  const [searchParams] = useSearchParams();

  const preFilledName = searchParams.get('name') || '';
  const preFilledRole = searchParams.get('role') === 'driver' ? 'driver' : 'customer';

  const [step, setStep] = useState('phone');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState(preFilledName);
  const [role, setRole] = useState(preFilledRole);
  const [vehicleType, setVehicleType] = useState('battery_rickshaw');
  const [referredBy, setReferredBy] = useState('');

  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setupRecaptcha('recaptcha-container');
  }, []);

  const handleSendOtp = async () => {
    if (identifier.length < 10) return setError('Valid phone number darj karein.');
    setLoading(true);
    setError('');
    try {
      const formattedPhone = identifier.startsWith('+91') ? identifier : `+91${identifier}`;
      const result = await signInPhone(formattedPhone);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err) {
      setError('OTP bhejne mein error aaya. Dobara try karein.');
      console.error(err);
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

      const userDoc = await getDoc(doc(db, 'users', loggedInUser.uid));
      if (userDoc.exists()) {
        const profile = userDoc.data();
        const target = profile.role === 'driver' ? '/dashboard' : profile.role === 'admin' ? '/admin' : '/home';
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
    setLoading(true);
    try {
      const profile = await registerUser(user.uid, {
        role,
        name,
        referredBy,
        ...(role === 'driver' && { vehicleType })
      });

      alert(`Welcome ${profile.name}! Aapka VahanSetu ID: ${profile.displayId}`);

      const target = role === 'driver' ? '/dashboard' : '/home';
      navigate(target);
    } catch (err) {
      console.error(err);
      setError('Registration fail ho gayi. Dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { id: 'customer', label: 'Passenger', icon: User },
    { id: 'driver', label: 'Driver', icon: Car },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div id="recaptcha-container"></div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className={`p-10 text-white transition-all duration-700 relative overflow-hidden ${
          role === 'driver' ? 'bg-emerald-600' : 'bg-blue-600'
        }`}>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-8">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md border border-white/30">
                <Car size={32} />
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">VahanSetu</h2>
                <p className="text-white/60 text-[8px] font-bold tracking-[0.3em] uppercase mt-1">Apani Gadi • Digital Era</p>
              </div>
            </div>
            <h1 className="text-4xl font-black mb-1 tracking-tight">Welcome</h1>
            <p className="text-white/70 font-bold text-xs uppercase tracking-widest">Identify yourself to continue</p>
          </div>
          <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 bg-black/10 rounded-full blur-3xl" />
        </div>

        <div className="p-10">
          {/* Role Tabs — only on phone step */}
          {step === 'phone' && (
            <div className="flex p-1.5 bg-slate-100 rounded-[1.5rem] mb-10 border border-slate-200">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all duration-500 ${
                    role === r.id
                      ? 'bg-white text-slate-900 shadow-xl shadow-slate-200 scale-105 z-10'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <r.icon size={18} />
                  <span className="text-[9px] font-black uppercase tracking-widest">{r.label}</span>
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-3"
              >
                <AlertCircle size={14} /> {error}
              </motion.div>
            )}

            {/* Step 1 — Phone */}
            {step === 'phone' && (
              <motion.div
                key="phone-step"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="9XXXXXXXXX"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-800 font-bold outline-none focus:border-blue-500 transition-all"
                  />
                </div>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed px-2">
                  VahanSetu ApniGadi abhi pilot phase mein chal raha hai. Yeh ek technology platform hai, taxi company nahi.<br />
                  <span className="text-[9px]">VahanSetu ApniGadi is currently in pilot phase. This is a technology platform, not a taxi company.</span>
                </p>

                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  className={`w-full py-5 rounded-2xl text-white font-black tracking-widest text-[10px] uppercase shadow-xl transition-all active:scale-95 disabled:opacity-50 ${
                    role === 'driver' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-blue-600 shadow-blue-600/20'
                  }`}
                >
                  {loading ? 'Please wait...' : 'OTP Bhejo'}
                </button>
              </motion.div>
            )}

            {/* Step 2 — OTP */}
            {step === 'otp' && (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8 text-center"
              >
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OTP Darj Karein</label>
                  <input
                    type="text"
                    placeholder="0 0 0 0 0 0"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 text-center text-3xl font-black tracking-[0.5em] text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                  />
                  <p className="text-[10px] font-bold text-slate-400">{identifier} pe bheja gaya</p>
                </div>
                <button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black tracking-widest text-[11px] uppercase shadow-2xl shadow-black/20 disabled:opacity-50"
                >
                  {loading ? 'Verify ho raha hai...' : 'Verify & Continue'}
                </button>
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  Login karke aap hamare{' '}
                  <a href="/terms" className="text-blue-500 hover:text-blue-700 font-bold">Terms of Service</a>
                  {' '}aur{' '}
                  <a href="/privacy-policy" className="text-blue-500 hover:text-blue-700 font-bold">Privacy Policy</a>
                  {' '}se agree karte hain.
                </p>
                <button onClick={() => setStep('phone')} className="text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600">
                  Number badlein
                </button>
              </motion.div>
            )}

            {/* Step 3 — Register */}
            {step === 'register' && (
              <motion.div
                key="register-step"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Pura Naam</label>
                    <input
                      type="text"
                      placeholder="e.g. Vivek Kumar"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-800 font-black outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                    />
                  </div>

                  {role === 'driver' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Vehicle Type</label>
                      <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-800 font-black outline-none focus:border-emerald-500 appearance-none cursor-pointer shadow-inner"
                      >
                        <option value="battery_rickshaw">Battery Rickshaw</option>
                        <option value="chhota_hathi">Chhota Hathi</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Referral Code (Optional)</label>
                    <input
                      type="text"
                      placeholder="VS-XXXXXX"
                      value={referredBy}
                      onChange={(e) => setReferredBy(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-800 font-black outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>

                <button
                  onClick={handleFinishRegistration}
                  disabled={loading}
                  className={`w-full py-5 rounded-[1.5rem] text-white font-black tracking-widest text-[11px] uppercase shadow-2xl transition-all disabled:opacity-50 ${
                    role === 'driver' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-blue-600 shadow-blue-600/20'
                  }`}
                >
                  {loading ? 'Account ban raha hai...' : 'Account Banao'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 text-center">
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
    </div>
  );
};

export default Login;
