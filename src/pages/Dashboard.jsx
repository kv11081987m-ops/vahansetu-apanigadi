import React from 'react';
import DriverDashboard from '../components/DriverDashboard';
import { motion } from 'framer-motion';

const Dashboard = () => {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50">
      <DriverDashboard />
    </div>
  );
};

export default Dashboard;
