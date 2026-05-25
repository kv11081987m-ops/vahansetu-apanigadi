import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import ActiveRideBar from './components/ActiveRideBar';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full shadow-lg" />
    </div>
  );
  return user ? children : <Navigate to="/" />;
};

const AdminRoute = ({ children }) => {
  const { user, userProfile, loading } = useAuth();
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full shadow-lg" />
    </div>
  );
  if (!user) return <Navigate to="/" />;
  // null check zaroori hai — profile fetch fail ho toh render mat karo
  if (!userProfile || userProfile.role !== 'admin') return <Navigate to="/" />;
  return children;
};

const App = () => {
  const { user, userProfile, loading } = useAuth();
  const [showExitToast, setShowExitToast] = useState(false);

  useEffect(() => {
    let canExit = false;
    let exitTimer = null;

    // Sentinel entry — gives WebView one history level before closing
    window.history.pushState({ twa: true }, '', window.location.href);

    const handlePopState = (e) => {
      // capture: true fires BEFORE React Router's bubble-phase listener.
      // stopImmediatePropagation prevents React Router from ever seeing this
      // popstate — so it never navigates to the login page on back press.
      e.stopImmediatePropagation();

      if (canExit) {
        // Second back press within 2 s — hand control back to browser/TWA to close
        clearTimeout(exitTimer);
        setShowExitToast(false);
        window.removeEventListener('popstate', handlePopState, { capture: true });
        window.history.back();
        return;
      }

      // Stay on current page
      window.history.pushState({ twa: true }, '', window.location.href);

      // Show "press again to exit" hint
      canExit = true;
      setShowExitToast(true);
      exitTimer = setTimeout(() => {
        canExit = false;
        setShowExitToast(false);
      }, 2000);
    };

    window.addEventListener('popstate', handlePopState, { capture: true });
    return () => {
      window.removeEventListener('popstate', handlePopState, { capture: true });
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, []);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full shadow-lg" />
    </div>
  );

  const getHomePath = () => {
    if (!userProfile) return null; 
    if (userProfile.role === 'new_user') return null; // Stay on login for setup
    if (userProfile.role === 'admin') return "/admin";
    if (userProfile.role === 'driver') return "/dashboard";
    return "/home";
  };

  const homePath = getHomePath();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        {/* Fallback */}
        <Route path="*" element={user && homePath ? <Navigate to={homePath} /> : <Navigate to="/" />} />
      </Routes>
      <ActiveRideBar />

      {/* Double-back exit toast */}
      {showExitToast && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center z-[99999] pointer-events-none">
          <div className="bg-slate-800/90 text-white text-sm font-bold px-6 py-3 rounded-full shadow-2xl backdrop-blur-sm">
            App band karne ke liye dobara press karein
          </div>
        </div>
      )}
    </BrowserRouter>
  );
};

export default App;
