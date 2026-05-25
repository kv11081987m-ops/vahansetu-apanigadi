import React, { useState, useEffect } from 'react';
import {
  Users,
  Truck,
  Map as MapIcon,
  Activity,
  TrendingUp,
  Clock,
  AlertCircle,
  ChevronRight,
  Search,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  IndianRupee,
  Navigation,
  Battery,
  LogOut,
  Bell,
  X,
  FileDown,
  BarChart2,
  Wallet,
  Unlock,
  Lock,
  Plus,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { QRCodeCanvas } from 'qrcode.react';
import { db } from '../services/firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, updateDoc, addDoc, serverTimestamp, increment, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
  const { logout } = useAuth();
  const [activeView, setActiveView] = useState('overview');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDrivers: 0,
    totalRides: 0,
    totalRevenue: 0
  });
  const [drivers, setDrivers] = useState([]);
  const [recentRides, setRecentRides] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 26.495, lng: 83.759 });
  const [searchQuery, setSearchQuery] = useState('');
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [genName, setGenName] = useState('');
  const [genPhone, setGenPhone] = useState('');
  const [selectedGenDriver, setSelectedGenDriver] = useState(null);
  const [generatedLink, setGeneratedLink] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [platformConfig, setPlatformConfig] = useState({
    commissionPercent: 8,
    savaariBaseFare: 20,
    savaariIncludedKm: 1.5,
    savaariPerKm: 10,
    logisticsBaseFare: 150,
    logisticsIncludedKm: 1.5,
    logisticsPerKm: 20,
    waitingRatePerMin: 1,
    nightMultiplier: 1.25,
    nightStartHour: 22,
    nightEndHour: 5,
    minFare: 20,
    driverSearchRadiusKm: 3,
    minRideDistanceKm: 0.1,
    appStatus: 'active',
    maintenanceMessage: '',
    grievancePhone: '7529938896',
    grievanceEmail: 'apnigadivahansetu@gmail.com',
    upiId: '',
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [adjustAmounts, setAdjustAmounts] = useState({});
  const [driverPrivateData, setDriverPrivateData] = useState({}); // driverId → { adminTempAccess }

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  useEffect(() => {
    // 1. Stats & Drivers Listener
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const driversData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDrivers(driversData);
      setStats(prev => ({ ...prev, totalDrivers: driversData.length }));

      // Fetch adminTempAccess from private subcollection for restricted drivers
      const restrictedIds = driversData.filter(d => (d.walletBalance || 0) < -50).map(d => d.id);
      if (restrictedIds.length > 0) {
        Promise.all(
          restrictedIds.map(id =>
            getDoc(doc(db, 'drivers', id, 'private', 'data'))
              .then(snap => ({ id, adminTempAccess: snap.exists() ? (snap.data().adminTempAccess ?? false) : false }))
              .catch(() => ({ id, adminTempAccess: false }))
          )
        ).then(results => {
          setDriverPrivateData(prev => {
            const updated = { ...prev };
            results.forEach(r => { updated[r.id] = { adminTempAccess: r.adminTempAccess }; });
            return updated;
          });
        });
      }
    });

    // 2. Users Count
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStats(prev => ({ ...prev, totalUsers: snapshot.size }));
    });

    // 3. Rides & Revenue Listener
    const unsubRides = onSnapshot(query(collection(db, 'ride_requests'), orderBy('createdAt', 'desc'), limit(500)), (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentRides(rides);
      
      let revenue = 0;
      rides.forEach(ride => {
        if (ride.status === 'paid' || ride.status === 'payment_done') {
          revenue += (parseInt(ride.fareAmount) || parseInt(ride.fare) || 0);
        }
      });
      
      setStats(prev => ({ 
        ...prev, 
        totalRides: rides.length,
        totalRevenue: revenue
      }));
    });

    // 4. Payout Requests Listener
    const unsubPayouts = onSnapshot(query(collection(db, 'withdrawal_requests'), orderBy('createdAt', 'desc')), (snapshot) => {
      setPayoutRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 5. Platform Config Listener
    const unsubConfig = onSnapshot(doc(db, 'config', 'platform'), (snap) => {
      if (snap.exists()) setPlatformConfig(prev => ({ ...prev, ...snap.data() }));
    });

    return () => {
      unsubDrivers();
      unsubUsers();
      unsubRides();
      unsubPayouts();
      unsubConfig();
    };
  }, []);

  const handleSavePlatformConfig = async () => {
    setConfigSaving(true);
    try {
      await setDoc(doc(db, 'config', 'platform'), platformConfig, { merge: true });
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Error saving settings: ' + err.message);
    } finally {
      setConfigSaving(false);
    }
  };

  const UpiEditCell = ({ driverId, currentUpi }) => {
    const [editing, setEditing] = React.useState(false);
    const [val, setVal] = React.useState(currentUpi || '');
    const save = async () => {
      if (!val.trim()) return;
      await setDoc(doc(db, 'drivers', driverId, 'private', 'data'), { upiId: val.trim() }, { merge: true });
      setEditing(false);
    };
    if (editing) return (
      <div className="flex items-center gap-1">
        <input value={val} onChange={e => setVal(e.target.value)} className="bg-slate-800 text-white text-xs px-2 py-1 rounded-lg outline-none border border-slate-600 w-32" />
        <button onClick={save} className="text-emerald-400 text-xs font-black px-2">✓</button>
        <button onClick={() => setEditing(false)} className="text-slate-500 text-xs px-1">✕</button>
      </div>
    );
    return (
      <div className="flex items-center gap-2">
        <span className="font-bold text-slate-300">{currentUpi || 'N/A'}</span>
        <button onClick={() => setEditing(true)} className="text-blue-400 text-[9px] font-black uppercase underline">Edit</button>
      </div>
    );
  };

  const handleApproveKYC = async (id) => {
    try {
      await updateDoc(doc(db, 'drivers', id), { verificationStatus: 'verified' });
      alert("Driver verified successfully!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectKYC = async (id) => {
    try {
      await updateDoc(doc(db, 'drivers', id), { verificationStatus: 'rejected' });
      alert("Driver KYC rejected.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompletePayout = async (req) => {
    try {
      // 1. Mark withdrawal as completed
      await updateDoc(doc(db, 'withdrawal_requests', req.id), { 
        status: 'completed',
        paidAt: serverTimestamp()
      });

      // NOTE: We DO NOT deduct from walletBalance here because it is 
      // already deducted in DriverDashboard.jsx at the time of request.

      // 3. Add transaction record
      await addDoc(collection(db, 'wallet_transactions'), {
        driverId: req.driverId,
        amount: req.amount,
        type: 'withdrawn',
        status: 'completed',
        note: 'Withdrawal processed by admin',
        createdAt: serverTimestamp()
      });

      alert("Payout marked as completed successfully!");
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    try {
      await addDoc(collection(db, 'system_broadcasts'), {
        message: broadcastMessage,
        type: 'emergency',
        timestamp: serverTimestamp()
      });
      setBroadcastMessage('');
      alert("Broadcast sent to all drivers!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelRide = async (rideId) => {
    if (!window.confirm("Reject this ride request?")) return;
    try {
      await updateDoc(doc(db, 'ride_requests', rideId), { 
        status: 'cancelled',
        cancelledBy: 'admin',
        cancelledAt: serverTimestamp()
      });
      alert("Ride cancelled successfully.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleNuclearCleanup = async () => {
    if (!window.confirm("DANGEROUS: This will cancel ALL active/pending rides across the entire system. Proceed?")) return;
    try {
      const activeRides = recentRides.filter(r => ['pending', 'accepted', 'started', 'completed', 'payment_done'].includes(r.status));
      for (const ride of activeRides) {
        await updateDoc(doc(db, 'ride_requests', ride.id), { 
          status: 'cancelled',
          cancelledBy: 'admin_nuclear',
          cancelledAt: serverTimestamp()
        });
      }
      alert(`Cleanup complete! ${activeRides.length} rides cleared.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGrantTempAccess = async (driverId) => {
    await setDoc(doc(db, 'drivers', driverId, 'private', 'data'), { adminTempAccess: true }, { merge: true });
    setDriverPrivateData(prev => ({ ...prev, [driverId]: { adminTempAccess: true } }));
    alert("Temp access granted!");
  };

  const handleRevokeTempAccess = async (driverId) => {
    await setDoc(doc(db, 'drivers', driverId, 'private', 'data'), { adminTempAccess: false }, { merge: true });
    setDriverPrivateData(prev => ({ ...prev, [driverId]: { adminTempAccess: false } }));
    alert("Temp access revoked.");
  };

  const handleWalletAdjust = async (driver, type) => {
    const raw = adjustAmounts[driver.id];
    const amount = Number(raw);
    if (!amount || amount <= 0) return alert("Valid amount darj karo.");
    const delta = type === 'credit' ? amount : -amount;
    try {
      await updateDoc(doc(db, 'drivers', driver.id), {
        walletBalance: increment(delta)
      });
      await addDoc(collection(db, 'wallet_transactions'), {
        driverId: driver.id,
        amount,
        type: type === 'credit' ? 'admin_credit' : 'admin_debit',
        status: 'completed',
        note: `Admin wallet adjustment: ${delta > 0 ? '+' : ''}₹${delta}`,
        createdAt: serverTimestamp()
      });
      setAdjustAmounts(prev => ({ ...prev, [driver.id]: '' }));
      alert(`Wallet ${type === 'credit' ? 'credited' : 'debited'} ₹${amount} for ${driver.name}`);
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    }
  };

  const handleDownloadReport = () => {
    const monthNames = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];

    const monthRides = recentRides.filter(ride => {
      const d = ride.createdAt?.toDate?.();
      return d && d.getMonth() === reportMonth && d.getFullYear() === reportYear;
    });

    const completedRides = monthRides.filter(r =>
      ['paid', 'payment_done', 'finished'].includes(r.status)
    );
    const cancelledRides = monthRides.filter(r => r.status === 'cancelled');
    const totalRevenue = completedRides.reduce(
      (sum, r) => sum + (parseInt(r.fareAmount) || parseInt(r.fare) || 0), 0
    );
    const platformCommission = Math.round(totalRevenue * 0.08);
    const driverPayouts = totalRevenue - platformCommission;

    const driverMap = {};
    completedRides.forEach(ride => {
      const key = ride.driverName || 'Unknown Driver';
      if (!driverMap[key]) driverMap[key] = { rides: 0, earnings: 0 };
      driverMap[key].rides++;
      driverMap[key].earnings += (parseInt(ride.fareAmount) || parseInt(ride.fare) || 0);
    });
    const driverRows = Object.entries(driverMap).sort((a, b) => b[1].earnings - a[1].earnings);

    const monthPayouts = payoutRequests.filter(req => {
      const d = req.createdAt?.toDate?.();
      return d && d.getMonth() === reportMonth && d.getFullYear() === reportYear;
    });

    const reportPeriod = `${monthNames[reportMonth]} ${reportYear}`;
    const generatedOn = new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>VahanSetu Report – ${reportPeriod}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;background:#fff;padding:48px;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #0f172a}
    .brand{font-size:28px;font-weight:900;letter-spacing:-1px}
    .brand span{color:#3b82f6}
    .meta{text-align:right;color:#64748b;font-size:12px;line-height:1.8}
    h2{font-size:14px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin:32px 0 14px;padding-bottom:8px;border-bottom:1px solid #e2e8f0}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:8px}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}
    .box .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:5px}
    .box .val{font-size:20px;font-weight:900;color:#0f172a}
    .green{color:#059669}.blue{color:#3b82f6}.orange{color:#ea580c}
    table{width:100%;border-collapse:collapse;margin-top:4px}
    th{background:#0f172a;color:#fff;padding:9px 13px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
    td{padding:9px 13px;border-bottom:1px solid #f1f5f9;font-size:12px}
    tr:last-child td{border-bottom:none}
    tr:nth-child(even) td{background:#f8fafc}
    .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase}
    .bg{background:#d1fae5;color:#059669}.by{background:#fef9c3;color:#b45309}.br{background:#fee2e2;color:#dc2626}
    .footer{margin-top:48px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}
    @media print{body{padding:28px}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Vahan<span>Setu</span></div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;font-weight:600">Monthly Revenue Report</div>
    </div>
    <div class="meta">
      <div style="font-size:18px;font-weight:900;color:#0f172a">${reportPeriod}</div>
      <div>Generated: ${generatedOn}</div>
      <div>VahanSetu Admin Panel</div>
    </div>
  </div>

  <h2>Summary</h2>
  <div class="grid">
    <div class="box"><div class="lbl">Total Rides</div><div class="val blue">${monthRides.length}</div></div>
    <div class="box"><div class="lbl">Completed</div><div class="val green">${completedRides.length}</div></div>
    <div class="box"><div class="lbl">Cancelled</div><div class="val orange">${cancelledRides.length}</div></div>
    <div class="box"><div class="lbl">Gross Revenue</div><div class="val">₹${totalRevenue.toLocaleString('en-IN')}</div></div>
    <div class="box"><div class="lbl">Platform (8%)</div><div class="val green">₹${platformCommission.toLocaleString('en-IN')}</div></div>
    <div class="box"><div class="lbl">Driver Payouts</div><div class="val">₹${driverPayouts.toLocaleString('en-IN')}</div></div>
    <div class="box"><div class="lbl">Active Drivers</div><div class="val blue">${Object.keys(driverMap).length}</div></div>
    <div class="box"><div class="lbl">Withdrawals</div><div class="val orange">${monthPayouts.length}</div></div>
  </div>

  <h2>Driver Performance</h2>
  ${driverRows.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Driver</th><th>Rides</th><th>Gross</th><th>Net (92.5%)</th></tr></thead>
    <tbody>
      ${driverRows.map(([name, d], i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${name}</strong></td>
        <td>${d.rides}</td>
        <td>₹${d.earnings.toLocaleString('en-IN')}</td>
        <td>₹${Math.round(d.earnings * 0.92).toLocaleString('en-IN')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#64748b;padding:12px 0">No completed rides this month.</p>'}

  <h2>Completed Ride Details</h2>
  ${completedRides.length > 0 ? `
  <table>
    <thead><tr><th>Ride ID</th><th>Driver</th><th>Fare</th><th>Payment</th><th>Date</th></tr></thead>
    <tbody>
      ${completedRides.slice(0, 60).map(ride => `
      <tr>
        <td style="font-family:monospace;font-size:11px">#${ride.id.slice(-6).toUpperCase()}</td>
        <td>${ride.driverName || 'Partner'}</td>
        <td>₹${ride.fareAmount || ride.fare || 0}</td>
        <td><span class="badge ${ride.paymentMethod === 'cash' ? 'by' : 'bg'}">${ride.paymentMethod || '-'}</span></td>
        <td>${ride.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || '-'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${completedRides.length > 60 ? `<p style="font-size:11px;color:#64748b;margin-top:8px">Showing 60 of ${completedRides.length} rides.</p>` : ''}
  ` : '<p style="color:#64748b;padding:12px 0">No completed rides this month.</p>'}

  ${monthPayouts.length > 0 ? `
  <h2>Withdrawal Requests</h2>
  <table>
    <thead><tr><th>Driver</th><th>Amount</th><th>UPI ID</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>
      ${monthPayouts.map(req => `
      <tr>
        <td>${req.driverName || '-'}</td>
        <td>₹${req.amount}</td>
        <td style="font-size:11px">${req.upiId || 'N/A'}</td>
        <td><span class="badge ${req.status === 'completed' ? 'bg' : 'by'}">${req.status}</span></td>
        <td>${req.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || '-'}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="footer">This is a system-generated report from VahanSetu Admin Panel &bull; Confidential</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Popup blocked. Please allow popups for this site.'); return; }
    win.document.write(html);
    win.document.close();
  };

  useEffect(() => {
    if (selectedDriver?.location?.lat && selectedDriver?.location?.lng) {
      setMapCenter({ 
        lat: parseFloat(selectedDriver.location.lat), 
        lng: parseFloat(selectedDriver.location.lng) 
      });
    }
  }, [selectedDriver]);

  const mapContainerStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '1.5rem'
  };

  const center = { lat: 26.495, lng: 83.759 }; // Default center (Gorakhpur area based on user logs)

  const filteredDrivers = drivers.filter(d => 
    d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    d.vehicleType?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddDriver = async (e) => {
    e.preventDefault();
    if (!genName || !genPhone) return alert("Please enter name and phone");
    
    try {
      await addDoc(collection(db, 'drivers'), {
        name: genName,
        phone: genPhone.startsWith('+91') ? genPhone : `+91${genPhone}`,
        isOnline: false,
        vehicleType: 'battery_rickshaw',
        rating: 5.0,
        createdAt: serverTimestamp()
      });
      alert("Driver Registered Successfully!");
      setGenName('');
      setGenPhone('');
    } catch (err) {
      console.error(err);
      alert("Error adding driver");
    }
  };

  const StatCard = ({ title, value, icon: Icon, color }) => (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-[#1e293b] p-6 rounded-[2rem] border border-slate-800 shadow-xl"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-4 rounded-2xl ${color} bg-opacity-10 text-opacity-100`}>
          <Icon size={24} className={color.replace('bg-', 'text-')} />
        </div>
        <TrendingUp size={16} className="text-emerald-500" />
      </div>
      <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-white text-3xl font-black tracking-tight">{value}</p>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-300 flex font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-[#1e293b] border-r border-slate-800 flex flex-col p-6 hidden lg:flex">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tighter uppercase">Admin Panel</h1>
        </div>

        <nav className="flex flex-col gap-2">
          {[
            { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'drivers', label: 'Live Drivers', icon: Truck },
            { id: 'rides', label: 'Rides Feed', icon: Activity },
            { id: 'kyc', label: 'KYC Requests', icon: ShieldCheck },
            { id: 'payouts', label: 'Payouts', icon: IndianRupee },
            { id: 'commission', label: 'Commission', icon: Wallet },
            { id: 'reports', label: 'Reports', icon: BarChart2 },
            { id: 'generator', label: 'Link Generator', icon: Settings },
            { id: 'map', label: 'Live Map', icon: MapIcon },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${activeView === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-6 bg-slate-800/50 rounded-3xl border border-slate-700">
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Platform Status</p>
          <div className="flex items-center gap-2 text-emerald-500 text-sm font-black">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            LIVE NETWORK
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto p-6 lg:p-10">
        {/* Header */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">System {activeView.charAt(0).toUpperCase() + activeView.slice(1)}</h2>
            <p className="text-slate-500 text-sm font-medium">Monitoring VahanSetu Live Operations</p>
          </div>
          <div className="flex gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Search everything..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#1e293b] border border-slate-800 rounded-2xl py-3 pl-12 pr-6 focus:border-blue-600 outline-none transition-all text-sm w-64"
              />
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
                <Bell size={24} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-[#0f172a]"></span>
              </button>
              <button 
                onClick={logout}
                className="flex items-center gap-2 p-2 px-4 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Navigation (Bottom) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#1e293b] border-t border-slate-800 p-4 flex justify-around z-[1000] backdrop-blur-md bg-opacity-90">
          {[
            { id: 'overview', icon: LayoutDashboard },
            { id: 'drivers', icon: Truck },
            { id: 'kyc', icon: ShieldCheck },
            { id: 'payouts', icon: IndianRupee },
            { id: 'commission', icon: Wallet },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`p-3 rounded-xl transition-all ${activeView === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}
            >
              <item.icon size={20} />
            </button>
          ))}
        </div>

        {activeView === 'overview' && (
          <div className="flex flex-col gap-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} icon={Users} color="bg-blue-500" />
              <StatCard title="Live Drivers" value={stats.totalDrivers.toLocaleString()} icon={Truck} color="bg-emerald-500" />
              <StatCard title="Total Rides" value={stats.totalRides.toLocaleString()} icon={Navigation} color="bg-orange-500" />
              <StatCard title="Revenue" value={`₹${stats.totalRevenue.toLocaleString()}`} icon={IndianRupee} color="bg-purple-500" />
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Map Preview */}
              <div className="lg:col-span-2 bg-[#1e293b] rounded-[2rem] p-4 border border-slate-800 h-[500px] overflow-hidden">
                <div className="flex items-center justify-between p-4 mb-2">
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">Real-Time Tracker</h3>
                  <button onClick={() => setActiveView('map')} className="text-xs font-bold text-blue-500 flex items-center gap-1">FULL SCREEN <ChevronRight size={14} /></button>
                </div>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={mapCenter}
                    zoom={12}
                    options={{
                      styles: darkMapStyles,
                      disableDefaultUI: true,
                    }}
                  >
                    {drivers.map(driver => (
                      driver.location?.lat && driver.location?.lng && (
                        <Marker
                          key={driver.id}
                          position={{ lat: parseFloat(driver.location.lat), lng: parseFloat(driver.location.lng) }}
                          onClick={() => setSelectedDriver(driver)}
                          icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 10,
                            fillColor: driver.isOnline ? '#10b981' : '#64748b',
                            fillOpacity: 1,
                            strokeWeight: 4,
                            strokeColor: '#ffffff',
                          }}
                        />
                      )
                    ))}
                    {selectedDriver && (
                      <InfoWindow
                        position={selectedDriver.location}
                        onCloseClick={() => setSelectedDriver(null)}
                      >
                        <div className="p-2 text-slate-800">
                          <p className="font-black">{selectedDriver.name}</p>
                          <p className="text-xs text-slate-500">{selectedDriver.vehicleType}</p>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                ) : <div className="w-full h-full bg-slate-800 animate-pulse rounded-3xl" />}
              </div>

              {/* Driver Status List */}
              <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-slate-800 flex flex-col">
                <h3 className="font-black text-white uppercase tracking-widest text-sm mb-6">Driver Status</h3>
                <div className="flex flex-col gap-4 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                  {drivers.map(driver => (
                    <button 
                      key={driver.id} 
                      onClick={() => {
                        if (driver.location?.lat && driver.location?.lng) {
                          setSelectedDriver(driver);
                        } else {
                          alert(`${driver.name} has no live location data yet.`);
                        }
                      }}
                      className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center hover:bg-slate-700/50 transition-all text-left w-full"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${driver.location ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-700 text-slate-500'}`}>
                          {driver.location ? <Navigation size={18} /> : <MapIcon size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">{driver.name}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">{driver.vehicleType?.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[10px] font-black uppercase mb-1 ${driver.isOnline ? 'text-emerald-500' : 'text-slate-500'}`}>
                          {driver.isOnline ? 'Online' : 'Offline'}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                          <Battery size={10} className={driver.batteryLevel < 20 ? 'text-red-500' : 'text-emerald-500'} />
                          {driver.batteryLevel}%
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Admin Broadcast Tool */}
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-[2rem] p-8 border border-blue-700/30 mb-8 shadow-2xl">
              <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Emergency Broadcast</h3>
                  <p className="text-blue-200/60 text-xs font-medium">Send an instant alert to every driver in the network.</p>
                </div>
                <div className="flex-1 w-full flex gap-4">
                  <input 
                    type="text" 
                    placeholder="e.g. Station road closed due to mela..."
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/20 rounded-2xl py-4 px-6 text-white placeholder:text-white/30 focus:bg-white/20 outline-none transition-all"
                  />
                  <button 
                    onClick={handleSendBroadcast}
                    className="px-8 py-4 bg-white text-blue-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 transition-all shadow-xl"
                  >
                    Send Alert
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activities */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">Recent Activity Feed</h3>
                  <p className="text-xs text-slate-500 font-bold mt-1">Total {recentRides.length} sessions tracked</p>
                </div>
                <button 
                  onClick={handleNuclearCleanup}
                  className="px-6 py-3 bg-red-600/10 text-red-500 rounded-2xl border border-red-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                >
                  <AlertCircle size={14} /> NUCLEAR CLEANUP
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="pb-4 px-4">Driver / Ride ID</th>
                      <th className="pb-4 px-4">Amount</th>
                      <th className="pb-4 px-4">Payment</th>
                      <th className="pb-4 px-4">Status</th>
                      <th className="pb-4 px-4">Action</th>
                      <th className="pb-4 px-4 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recentRides.slice(0, 20).map((ride) => (
                      <tr key={ride.id} className="hover:bg-slate-800/50 transition-all">
                        <td className="py-5 px-4">
                          <p className="text-sm font-black text-white">{ride.driverName || 'Partner'}</p>
                          <p className="text-[10px] text-slate-500 font-mono">#{ride.id.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className="py-5 px-4 font-black text-white">₹{ride.fareAmount || ride.fare}</td>
                        <td className="py-5 px-4">
                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${ride.paymentMethod === 'cash' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {ride.paymentMethod || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-5 px-4">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${
                            ride.status === 'completed' || ride.status === 'paid' || ride.status === 'payment_done' ? 'bg-emerald-500/10 text-emerald-500' : 
                            ride.status === 'cancelled' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {ride.status}
                          </span>
                        </td>
                        <td className="py-5 px-4">
                          {['pending', 'accepted', 'started'].includes(ride.status) && (
                            <button 
                              onClick={() => handleCancelRide(ride.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Reject/Cancel"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </td>
                        <td className="py-5 px-4 text-right text-xs text-slate-500 font-medium">
                          {ride.createdAt?.toDate?.()?.toLocaleTimeString() || 'Just now'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === 'payouts' && (
          <div className="flex flex-col gap-8">
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-8">Payout Requests</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="pb-4 px-4">Driver</th>
                      <th className="pb-4 px-4">Amount</th>
                      <th className="pb-4 px-4">UPI ID</th>
                      <th className="pb-4 px-4">Date</th>
                      <th className="pb-4 px-4">Status</th>
                      <th className="pb-4 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {payoutRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/50 transition-all">
                        <td className="py-5 px-4">
                          <p className="text-sm font-black text-white">{req.driverName}</p>
                          <p className="text-[10px] text-slate-500 font-mono">#{req.driverId.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className="py-5 px-4 font-black text-emerald-500 text-lg">₹{req.amount}</td>
                        <td className="py-5 px-4">
                          <p className="text-xs font-bold text-slate-300">{req.upiId || 'N/A'}</p>
                        </td>
                        <td className="py-5 px-4 text-xs text-slate-400 font-medium">
                          {req.timestamp?.toDate?.()?.toLocaleString() || 'Recently'}
                        </td>
                        <td className="py-5 px-4">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${req.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-orange-500'}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="py-5 px-4 text-right">
                          {req.status === 'pending' && (
                            <button 
                              onClick={() => handleCompletePayout(req)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {payoutRequests.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-20 text-center text-slate-500 font-bold">No payout requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === 'commission' && (() => {
          const restrictedDrivers = drivers.filter(d => (d.walletBalance ?? 0) < -50 && (d.walletBalance ?? 0) >= -100);
          const blockedDrivers = drivers.filter(d => (d.walletBalance ?? 0) < -100);
          const totalOwed = drivers.reduce((s, d) => s + Math.min(d.walletBalance ?? 0, 0), 0);

          return (
            <div className="flex flex-col gap-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-orange-500/20">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Restricted Zone</p>
                  <p className="text-4xl font-black text-orange-400">{restrictedDrivers.length}</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Wallet -₹50 to -₹100</p>
                </div>
                <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-red-500/20">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Blocked Zone</p>
                  <p className="text-4xl font-black text-red-400">{blockedDrivers.length}</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Wallet &lt; -₹100</p>
                </div>
                <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-slate-700">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Pending Recovery</p>
                  <p className="text-4xl font-black text-red-400">₹{Math.abs(totalOwed).toFixed(0)}</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Across all negative wallets</p>
                </div>
              </div>

              {/* Restricted Zone Drivers */}
              <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-orange-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
                    <AlertCircle size={20} className="text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-white uppercase tracking-widest text-sm">Restricted Zone Drivers</h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">Wallet -₹50 se -₹100 ke beech — Accept button disabled hai. Admin temp access de sakta hai.</p>
                  </div>
                </div>

                {restrictedDrivers.length === 0 ? (
                  <div className="py-12 text-center">
                    <Unlock size={40} className="text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">Koi driver restricted zone mein nahi hai.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                          <th className="pb-4 px-4">Driver</th>
                          <th className="pb-4 px-4">Wallet Balance</th>
                          <th className="pb-4 px-4">Temp Access</th>
                          <th className="pb-4 px-4">Adjust Wallet</th>
                          <th className="pb-4 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {restrictedDrivers.map(driver => (
                          <tr key={driver.id} className="hover:bg-slate-800/50 transition-all">
                            <td className="py-4 px-4">
                              <p className="text-sm font-black text-white">{driver.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">#{driver.id.slice(-6).toUpperCase()}</p>
                              <p className="text-[10px] text-slate-500">{driver.vehicleType?.replace('_', ' ')}</p>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-lg font-black text-orange-400">₹{(driver.walletBalance ?? 0).toFixed(0)}</span>
                              <p className="text-[10px] text-orange-400/60 font-bold">Restricted</p>
                            </td>
                            <td className="py-4 px-4">
                              {driverPrivateData[driver.id]?.adminTempAccess ? (
                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-black uppercase">Granted</span>
                              ) : (
                                <span className="px-3 py-1 bg-slate-700 text-slate-400 rounded-lg text-[10px] font-black uppercase">None</span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  placeholder="₹ amount"
                                  value={adjustAmounts[driver.id] || ''}
                                  onChange={e => setAdjustAmounts(prev => ({ ...prev, [driver.id]: e.target.value }))}
                                  className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none focus:border-blue-600 transition-all"
                                />
                                <button onClick={() => handleWalletAdjust(driver, 'credit')} className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all" title="Credit">
                                  <Plus size={14} />
                                </button>
                                <button onClick={() => handleWalletAdjust(driver, 'debit')} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all" title="Debit">
                                  <Minus size={14} />
                                </button>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              {driverPrivateData[driver.id]?.adminTempAccess ? (
                                <button onClick={() => handleRevokeTempAccess(driver.id)} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all ml-auto">
                                  <Lock size={12} /> Revoke
                                </button>
                              ) : (
                                <button onClick={() => handleGrantTempAccess(driver.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 ml-auto">
                                  <Unlock size={12} /> Grant Access
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Blocked Zone Drivers */}
              <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-red-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                    <Lock size={20} className="text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-white uppercase tracking-widest text-sm">Blocked Zone Drivers</h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">Wallet -₹100 se neeche — Rides bilkul accept nahi kar sakte. Recharge mandatory hai.</p>
                  </div>
                </div>

                {blockedDrivers.length === 0 ? (
                  <div className="py-12 text-center">
                    <ShieldCheck size={40} className="text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">Koi driver blocked zone mein nahi hai.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                          <th className="pb-4 px-4">Driver</th>
                          <th className="pb-4 px-4">Wallet Balance</th>
                          <th className="pb-4 px-4">Recovery Required</th>
                          <th className="pb-4 px-4 text-right">Wallet Adjust</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {blockedDrivers.map(driver => (
                          <tr key={driver.id} className="hover:bg-slate-800/50 transition-all">
                            <td className="py-4 px-4">
                              <p className="text-sm font-black text-white">{driver.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">#{driver.id.slice(-6).toUpperCase()}</p>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-lg font-black text-red-400">₹{(driver.walletBalance ?? 0).toFixed(0)}</span>
                              <p className="text-[10px] text-red-400/60 font-bold">Blocked</p>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-sm font-black text-white">₹{Math.abs(driver.walletBalance ?? 0).toFixed(0)}</span>
                              <p className="text-[10px] text-slate-500 font-bold">minimum recharge</p>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <input
                                  type="number"
                                  placeholder="₹ amount"
                                  value={adjustAmounts[driver.id] || ''}
                                  onChange={e => setAdjustAmounts(prev => ({ ...prev, [driver.id]: e.target.value }))}
                                  className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none focus:border-blue-600 transition-all"
                                />
                                <button onClick={() => handleWalletAdjust(driver, 'credit')} className="flex items-center gap-1 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-500/20 transition-all">
                                  <Plus size={12} /> Credit
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {activeView === 'rides' && (
          <div className="flex flex-col gap-8">
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">System Ride Feed</h3>
                  <p className="text-xs text-slate-500 font-bold mt-1">Live monitoring and cleanup center</p>
                </div>
                <button 
                  onClick={handleNuclearCleanup}
                  className="px-6 py-3 bg-red-600/10 text-red-500 rounded-2xl border border-red-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                >
                  <AlertCircle size={14} /> NUCLEAR CLEANUP
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="pb-4 px-4">Driver / ID</th>
                      <th className="pb-4 px-4">Customer</th>
                      <th className="pb-4 px-4">Fare</th>
                      <th className="pb-4 px-4">Status</th>
                      <th className="pb-4 px-4">Action</th>
                      <th className="pb-4 px-4 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recentRides.map((ride) => (
                      <tr key={ride.id} className="hover:bg-slate-800/50 transition-all">
                        <td className="py-5 px-4">
                          <p className="text-sm font-black text-white">{ride.driverName || 'Looking for driver...'}</p>
                          <p className="text-[10px] text-slate-500 font-mono">#{ride.id.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className="py-5 px-4">
                          <p className="text-sm font-bold text-slate-400">{ride.userName || 'Guest'}</p>
                        </td>
                        <td className="py-5 px-4 font-black text-white">₹{ride.fareAmount || ride.fare}</td>
                        <td className="py-5 px-4">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${
                            ride.status === 'completed' || ride.status === 'paid' || ride.status === 'payment_done' ? 'bg-emerald-500/10 text-emerald-500' : 
                            ride.status === 'cancelled' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {ride.status}
                          </span>
                        </td>
                        <td className="py-5 px-4">
                          {['pending', 'accepted', 'started'].includes(ride.status) && (
                            <button 
                              onClick={() => handleCancelRide(ride.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Force Cancel"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </td>
                        <td className="py-5 px-4 text-right text-xs text-slate-500 font-medium">
                          {ride.createdAt?.toDate?.()?.toLocaleTimeString() || 'Just now'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeView === 'kyc' && (
          <div className="flex flex-col gap-8">
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-8">KYC — Pending & Unverified Drivers</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {drivers.filter(d => !d.verificationStatus || d.verificationStatus === 'pending' || d.verificationStatus === 'unverified').length > 0 ? (
                  drivers.filter(d => !d.verificationStatus || d.verificationStatus === 'pending' || d.verificationStatus === 'unverified').map(driver => (
                    <div key={driver.id} className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700 flex flex-col gap-6">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-600/10 text-blue-500 rounded-2xl flex items-center justify-center font-black">
                            {driver.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-white">{driver.name}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{driver.vehicleType}</p>
                          </div>
                        </div>
                        <div className="bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full text-[10px] font-black uppercase">Pending</div>
                      </div>

                      {/* KYC Data */}
                      <div className="flex flex-col gap-2 bg-slate-900/50 p-4 rounded-2xl text-xs">
                        {driver.kycData?.license && <div className="flex justify-between"><span className="text-slate-500">DL No.:</span><span className="font-bold text-slate-300">{driver.kycData.license}</span></div>}
                        {(driver.rcNumber || driver.kycData?.rcNumber) && <div className="flex justify-between"><span className="text-slate-500">RC No.:</span><span className="font-bold text-slate-300">{driver.rcNumber || driver.kycData?.rcNumber}</span></div>}
                        {driver.insuranceExpiry && <div className="flex justify-between"><span className="text-slate-500">Insurance Expiry:</span><span className="font-bold text-slate-300">{driver.insuranceExpiry}</span></div>}
                        {driver.pucExpiry && <div className="flex justify-between"><span className="text-slate-500">PUC Expiry:</span><span className="font-bold text-slate-300">{driver.pucExpiry}</span></div>}
                        {driver.kycData?.aadhar && <div className="flex justify-between"><span className="text-slate-500">Aadhar:</span><span className="font-bold text-slate-300">{driver.kycData.aadhar}</span></div>}
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">UPI ID:</span>
                          <UpiEditCell driverId={driver.id} currentUpi={driver.upiId} />
                        </div>
                        {driver.policeVerificationDeadline && (() => {
                          const dl = driver.policeVerificationDeadline?.toDate?.() || new Date(driver.policeVerificationDeadline);
                          const days = Math.ceil((dl - Date.now()) / 86400000);
                          return <div className="flex justify-between"><span className="text-slate-500">Police Verification:</span><span className={`font-bold ${days <= 0 ? 'text-red-400' : days <= 3 ? 'text-orange-400' : 'text-emerald-400'}`}>{days <= 0 ? 'OVERDUE' : `${days} din baaki`}</span></div>;
                        })()}
                      </div>

                      {/* Document Photos */}
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        {[
                          { url: driver.kyc_documents?.dlPhotoUrl,       label: 'DL Photo' },
                          { url: driver.kyc_documents?.rcPhotoUrl,       label: 'RC Photo' },
                          { url: driver.kyc_documents?.passbookPhotoUrl, label: 'Passbook' },
                          { url: driver.kyc_documents?.aadharPhotoUrl,   label: 'Aadhar' },
                        ].filter(d => d.url).map(({ url, label }) => (
                          <div key={label} className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</span>
                            <a href={url} target="_blank" rel="noreferrer" className="block h-24 bg-slate-900 rounded-xl overflow-hidden border border-slate-700 hover:border-blue-500 transition-all">
                              <img src={url} alt={label} className="w-full h-full object-cover" />
                            </a>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => handleRejectKYC(driver.id)}
                          className="py-3 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 transition-all"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApproveKYC(driver.id)}
                          className="py-3 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center flex flex-col items-center">
                    <ShieldCheck size={64} className="text-slate-800 mb-4" />
                    <p className="text-slate-500 font-bold">No pending KYC requests at the moment.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeView === 'generator' && (
          <div className="flex flex-col items-center gap-8 py-10">
            <div className="bg-[#1e293b] p-10 rounded-[3rem] border border-slate-800 w-full max-w-xl text-center shadow-2xl">
              <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Driver Link Generator</h3>
              <p className="text-slate-500 mb-8 font-medium">Create a pre-filled registration link for new drivers.</p>
              
              <div className="flex flex-col gap-6 text-left">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Select Existing Driver</label>
                  <select 
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-600 transition-all cursor-pointer"
                    onChange={(e) => {
                      const drv = drivers.find(d => d.id === e.target.value);
                      if (drv) {
                        setSelectedGenDriver(drv);
                        const baseUrl = window.location.origin;
                        // Use UID for exact matching
                        const link = `${baseUrl}/login?role=driver&name=${encodeURIComponent(drv.name)}&driverId=${drv.id}`;
                        setGeneratedLink(link);
                      }
                    }}
                  >
                    <option value="">-- Choose Driver --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.phone || 'No Phone'}) - {d.id.slice(-4)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-4 py-4">
                  <div className="h-px bg-slate-800 flex-1" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase">OR NEW DRIVER</span>
                  <div className="h-px bg-slate-800 flex-1" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Quick Register Driver</label>
                  <input 
                    type="text" 
                    placeholder="Vivek"
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-600 transition-all mb-2"
                  />
                  <input 
                    type="tel" 
                    placeholder="7084605722"
                    value={genPhone}
                    onChange={(e) => setGenPhone(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-600 transition-all"
                  />
                  <button 
                    onClick={handleAddDriver}
                    className="mt-2 py-4 bg-emerald-600 text-white rounded-2xl font-black tracking-widest text-[10px] uppercase shadow-xl shadow-emerald-600/20"
                  >
                    Register Driver in Database
                  </button>
                </div>

                {generatedLink && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6 mt-4">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl border-4 border-blue-600/20">
                      <QRCodeCanvas value={generatedLink} size={200} />
                    </div>
                    
                    <div className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 break-all text-[10px] font-mono text-blue-400">
                      {generatedLink}
                    </div>

                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLink);
                        alert("Link copied to clipboard!");
                      }}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black tracking-widest text-[10px] uppercase shadow-xl shadow-blue-600/20"
                    >
                      Copy Link to Clipboard
                    </button>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Send this link or QR to the driver</p>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'settings' && (
          <div className="flex flex-col gap-6 max-w-3xl">

            {/* Fare Configuration */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-3">
                <IndianRupee size={18} className="text-blue-400" /> Fare Configuration
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Savaari (E-Rickshaw)</p>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Base Fare (₹)</span>
                    <input type="number" value={platformConfig.savaariBaseFare}
                      onChange={e => setPlatformConfig(p => ({ ...p, savaariBaseFare: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Included KM (free)</span>
                    <input type="number" step="0.5" min="0" value={platformConfig.savaariIncludedKm}
                      onChange={e => setPlatformConfig(p => ({ ...p, savaariIncludedKm: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Per KM Rate (₹ beyond included)</span>
                    <input type="number" value={platformConfig.savaariPerKm}
                      onChange={e => setPlatformConfig(p => ({ ...p, savaariPerKm: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <div className="bg-slate-900/60 rounded-xl px-4 py-3 text-[11px] text-slate-400 font-bold">
                    ₹{platformConfig.savaariBaseFare} incl. {platformConfig.savaariIncludedKm}km, then ₹{platformConfig.savaariPerKm}/km
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logistics (Chhota Hathi)</p>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Base Fare (₹)</span>
                    <input type="number" value={platformConfig.logisticsBaseFare}
                      onChange={e => setPlatformConfig(p => ({ ...p, logisticsBaseFare: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Included KM (free)</span>
                    <input type="number" step="0.5" min="0" value={platformConfig.logisticsIncludedKm}
                      onChange={e => setPlatformConfig(p => ({ ...p, logisticsIncludedKm: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Per KM Rate (₹ beyond included)</span>
                    <input type="number" value={platformConfig.logisticsPerKm}
                      onChange={e => setPlatformConfig(p => ({ ...p, logisticsPerKm: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <div className="bg-slate-900/60 rounded-xl px-4 py-3 text-[11px] text-slate-400 font-bold">
                    ₹{platformConfig.logisticsBaseFare} incl. {platformConfig.logisticsIncludedKm}km, then ₹{platformConfig.logisticsPerKm}/km
                  </div>
                </div>
              </div>

              {/* Waiting & Night Surcharge */}
              <div className="grid grid-cols-2 gap-6 mt-6">
                <div className="flex flex-col gap-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Traffic / Waiting</p>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Waiting Rate (₹/min, speed &lt; 5km/h)</span>
                    <input type="number" step="0.5" min="0" value={platformConfig.waitingRatePerMin}
                      onChange={e => setPlatformConfig(p => ({ ...p, waitingRatePerMin: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Min Fare (₹)</span>
                    <input type="number" min="0" value={platformConfig.minFare}
                      onChange={e => setPlatformConfig(p => ({ ...p, minFare: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                </div>
                <div className="flex flex-col gap-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Night Surcharge</p>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Multiplier (e.g. 1.25 = 25% extra)</span>
                    <input type="number" step="0.05" min="1" max="3" value={platformConfig.nightMultiplier}
                      onChange={e => setPlatformConfig(p => ({ ...p, nightMultiplier: Number(e.target.value) }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-slate-400">Start Hour (24h)</span>
                      <input type="number" min="0" max="23" value={platformConfig.nightStartHour}
                        onChange={e => setPlatformConfig(p => ({ ...p, nightStartHour: Number(e.target.value) }))}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-slate-400">End Hour (24h)</span>
                      <input type="number" min="0" max="23" value={platformConfig.nightEndHour}
                        onChange={e => setPlatformConfig(p => ({ ...p, nightEndHour: Number(e.target.value) }))}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                    </label>
                  </div>
                  <div className="bg-slate-900/60 rounded-xl px-4 py-3 text-[11px] text-slate-400 font-bold">
                    {platformConfig.nightStartHour}:00 – {platformConfig.nightEndHour}:00 → {((platformConfig.nightMultiplier - 1) * 100).toFixed(0)}% extra
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Rules */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-3">
                <Settings size={18} className="text-emerald-400" /> Platform Rules
              </h3>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-400">Platform Commission (%)</span>
                  <div className="flex items-center gap-3">
                    <input type="number" step="0.5" min="0" max="50" value={platformConfig.commissionPercent}
                      onChange={e => setPlatformConfig(p => ({ ...p, commissionPercent: Number(e.target.value) }))}
                      className="w-40 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                    <span className="text-slate-400 text-sm font-bold">
                      → Driver gets {(100 - platformConfig.commissionPercent).toFixed(1)}%
                    </span>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-400">Driver Search Radius (km)</span>
                  <input type="number" step="0.5" min="0.5" max="20" value={platformConfig.driverSearchRadiusKm}
                    onChange={e => setPlatformConfig(p => ({ ...p, driverSearchRadiusKm: Number(e.target.value) }))}
                    className="w-40 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-400">Min Ride Distance (km)</span>
                  <input type="number" step="0.05" min="0.05" max="2" value={platformConfig.minRideDistanceKm}
                    onChange={e => setPlatformConfig(p => ({ ...p, minRideDistanceKm: Number(e.target.value) }))}
                    className="w-40 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                </label>
              </div>
            </div>

            {/* App Status */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-3">
                <Activity size={18} className="text-purple-400" /> App Status
              </h3>
              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  {['active', 'maintenance'].map(status => (
                    <button key={status} onClick={() => setPlatformConfig(p => ({ ...p, appStatus: status }))}
                      className={`flex-1 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${
                        platformConfig.appStatus === status
                          ? status === 'active' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}>
                      {status === 'active' ? '✓ Active' : '⚠ Maintenance'}
                    </button>
                  ))}
                </div>
                {platformConfig.appStatus === 'maintenance' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400">Maintenance Message (users ko dikhega)</span>
                    <input type="text" placeholder="App abhi maintenance mein hai. Thodi der baad try karein."
                      value={platformConfig.maintenanceMessage}
                      onChange={e => setPlatformConfig(p => ({ ...p, maintenanceMessage: e.target.value }))}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  </label>
                )}
              </div>
            </div>

            {/* Grievance Contact */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-3">
                <AlertCircle size={18} className="text-red-400" /> Grievance Contact Settings
              </h3>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-400">Grievance Phone Number</span>
                  <input type="text" value={platformConfig.grievancePhone}
                    onChange={e => setPlatformConfig(p => ({ ...p, grievancePhone: e.target.value }))}
                    placeholder="10-digit mobile number"
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                  <span className="text-[10px] text-slate-500">Yeh number app mein Grievance section mein dikhega</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-400">Grievance Email</span>
                  <input type="email" value={platformConfig.grievanceEmail}
                    onChange={e => setPlatformConfig(p => ({ ...p, grievanceEmail: e.target.value }))}
                    placeholder="contact@example.com"
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-600 transition-all" />
                </label>
              </div>
            </div>

            {/* UPI ID for Online Payment */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <h3 className="font-black text-white uppercase tracking-widest text-sm mb-2 flex items-center gap-3">
                <IndianRupee size={18} className="text-emerald-400" /> Online Payment — UPI ID
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-5">Feature abhi Coming Soon hai — ID save karein future ke liye</p>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-400">Platform UPI ID</span>
                  <input type="text" value={platformConfig.upiId}
                    onChange={e => setPlatformConfig(p => ({ ...p, upiId: e.target.value.trim() }))}
                    placeholder="example@ybl"
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-emerald-500 transition-all font-mono tracking-wide" />
                  <span className="text-[10px] text-slate-500">Jab online payment live hoga, yahi UPI ID QR code aur payment link mein use hoga</span>
                </label>
                {platformConfig.upiId ? (
                  <div className="bg-slate-900/60 rounded-xl px-4 py-3 text-[11px] text-emerald-400 font-bold font-mono">
                    ✓ UPI ID set: {platformConfig.upiId}
                  </div>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl px-4 py-3 text-[11px] text-slate-500 font-bold">
                    ⚠ UPI ID abhi set nahi hai
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <button onClick={handleSavePlatformConfig} disabled={configSaving}
              className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black tracking-widest text-[11px] uppercase shadow-2xl shadow-blue-600/20 hover:bg-blue-500 transition-all disabled:opacity-50">
              {configSaving ? 'Saving...' : 'Save All Settings'}
            </button>

            {/* Danger Zone */}
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-red-900/40">
              <h3 className="font-black text-red-500 uppercase tracking-widest text-sm mb-6 flex items-center gap-3">
                <AlertCircle size={18} /> Danger Zone
              </h3>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between bg-slate-900/60 rounded-2xl p-5 border border-slate-800">
                  <div>
                    <p className="text-sm font-black text-white">Nuclear Cleanup</p>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">Saare active/pending rides ek saath cancel karo</p>
                  </div>
                  <button onClick={handleNuclearCleanup}
                    className="px-6 py-3 bg-red-600/10 text-red-500 rounded-xl border border-red-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center gap-2 shrink-0">
                    <AlertCircle size={14} /> Run Cleanup
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeView === 'reports' && (
          <div className="flex flex-col gap-8">
            <div className="bg-[#1e293b] rounded-[2rem] p-8 border border-slate-800">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
                <div>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm mb-1">Monthly Revenue Report</h3>
                  <p className="text-xs text-slate-500 font-bold">Select month aur PDF generate karo</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={reportMonth}
                    onChange={e => setReportMonth(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-sm outline-none focus:border-blue-600 transition-all"
                  >
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={reportYear}
                    onChange={e => setReportYear(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-sm outline-none focus:border-blue-600 transition-all"
                  >
                    {[2024, 2025, 2026].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
                  >
                    <FileDown size={16} /> Download PDF
                  </button>
                </div>
              </div>

              {/* Live preview for selected month */}
              {(() => {
                const monthRides = recentRides.filter(r => {
                  const d = r.createdAt?.toDate?.();
                  return d && d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                });
                const completed = monthRides.filter(r => ['paid','payment_done','finished'].includes(r.status));
                const cancelled = monthRides.filter(r => r.status === 'cancelled');
                const revenue = completed.reduce((s, r) => s + (parseInt(r.fareAmount) || parseInt(r.fare) || 0), 0);
                const monthPayouts = payoutRequests.filter(req => {
                  const d = req.createdAt?.toDate?.();
                  return d && d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                });

                return (
                  <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Total Rides', value: monthRides.length, color: 'text-blue-400' },
                        { label: 'Completed', value: completed.length, color: 'text-emerald-400' },
                        { label: 'Cancelled', value: cancelled.length, color: 'text-orange-400' },
                        { label: 'Gross Revenue', value: `₹${revenue.toLocaleString('en-IN')}`, color: 'text-white' },
                        { label: 'Platform (8%)', value: `₹${Math.round(revenue * 0.08).toLocaleString('en-IN')}`, color: 'text-emerald-400' },
                        { label: 'Driver Payouts', value: `₹${Math.round(revenue * 0.92).toLocaleString('en-IN')}`, color: 'text-slate-300' },
                        { label: 'Active Drivers', value: new Set(completed.map(r => r.driverName).filter(Boolean)).size, color: 'text-blue-400' },
                        { label: 'Withdrawals', value: monthPayouts.length, color: 'text-orange-400' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</p>
                          <p className={`text-2xl font-black ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {completed.length > 0 && (
                      <div className="overflow-x-auto">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Driver Breakdown</p>
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                              <th className="pb-3 px-4">#</th>
                              <th className="pb-3 px-4">Driver</th>
                              <th className="pb-3 px-4">Rides</th>
                              <th className="pb-3 px-4">Gross</th>
                              <th className="pb-3 px-4 text-right">Net (92.5%)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {Object.entries(
                              completed.reduce((acc, r) => {
                                const k = r.driverName || 'Unknown';
                                if (!acc[k]) acc[k] = { rides: 0, earnings: 0 };
                                acc[k].rides++;
                                acc[k].earnings += parseInt(r.fareAmount) || parseInt(r.fare) || 0;
                                return acc;
                              }, {})
                            ).sort((a, b) => b[1].earnings - a[1].earnings)
                              .map(([name, d], i) => (
                                <tr key={name} className="hover:bg-slate-800/50 transition-all">
                                  <td className="py-4 px-4 text-slate-500 font-black text-xs">{i + 1}</td>
                                  <td className="py-4 px-4 font-black text-white">{name}</td>
                                  <td className="py-4 px-4 text-slate-300 font-bold">{d.rides}</td>
                                  <td className="py-4 px-4 font-black text-white">₹{d.earnings.toLocaleString('en-IN')}</td>
                                  <td className="py-4 px-4 text-right font-black text-emerald-400">₹{Math.round(d.earnings * 0.92).toLocaleString('en-IN')}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {monthRides.length === 0 && (
                      <div className="py-16 text-center flex flex-col items-center gap-4">
                        <BarChart2 size={48} className="text-slate-700" />
                        <p className="text-slate-500 font-bold">Is mahine ka koi data nahi mila.</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeView === 'map' && (
          <div className="flex-1 bg-[#1e293b] rounded-[3rem] p-4 border border-slate-800 overflow-hidden relative">
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={14}
                options={{
                  styles: darkMapStyles,
                }}
              >
                {drivers.map(driver => (
                  driver.location && (
                    <Marker
                      key={driver.id}
                      position={driver.location}
                      label={{
                        text: driver.name || 'P',
                        className: 'font-black text-[10px] bg-white px-2 py-1 rounded-full shadow-lg -mt-10 border border-slate-200 text-blue-600 uppercase tracking-tighter'
                      }}
                      icon={{
                        url: driver.vehicleType === 'battery_rickshaw' 
                          ? 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png' 
                          : 'https://cdn-icons-png.flaticon.com/512/2555/2555013.png',
                        scaledSize: new window.google.maps.Size(35, 35),
                        anchor: new window.google.maps.Point(17, 17)
                      }}
                      onClick={() => setSelectedDriver(driver)}
                    />
                  )
                ))}
              </GoogleMap>
            ) : <div className="w-full h-full bg-slate-800 animate-pulse rounded-3xl" />}
            
            <button 
              onClick={() => setActiveView('overview')}
              className="absolute top-8 left-8 bg-white text-slate-900 px-6 py-3 rounded-2xl font-black text-xs shadow-2xl flex items-center gap-2"
            >
              <ChevronRight className="rotate-180" size={16} /> BACK TO DASHBOARD
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

const darkMapStyles = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
  { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] },
  { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
  { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
];

export default AdminDashboard;
