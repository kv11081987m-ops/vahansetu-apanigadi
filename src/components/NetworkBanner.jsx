import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const NetworkBanner = () => {
  const { isOnline, showReconnected } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white py-2.5 px-4 flex items-center justify-center gap-2 shadow-lg">
        <span className="text-lg">📡</span>
        <span className="text-sm font-bold">इंटरनेट नहीं है — कनेक्शन का इंतज़ार करें...</span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-emerald-600 text-white py-2.5 px-4 flex items-center justify-center gap-2 shadow-lg animate-pulse">
        <span className="text-lg">✅</span>
        <span className="text-sm font-bold">इंटरनेट वापस आ गया!</span>
      </div>
    );
  }

  return null;
};

export default NetworkBanner;
