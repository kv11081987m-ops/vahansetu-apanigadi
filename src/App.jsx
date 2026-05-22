import React, { useEffect } from 'react';
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
  if (userProfile && userProfile.role !== 'admin') return <Navigate to="/" />;
  return children;
};

const App = () => {
  const { user, userProfile, loading } = useAuth();

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
    </BrowserRouter>
  );
};

export default App;
