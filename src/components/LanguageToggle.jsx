import React from 'react';
import { useLanguage } from '../hooks/useLanguage';

const LanguageToggle = ({ className = '' }) => {
  const { lang, toggleLanguage } = useLanguage();
  return (
    <button
      onClick={toggleLanguage}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border transition-all active:scale-95 ${
        lang === 'hi'
          ? 'bg-orange-50 border-orange-200 text-orange-600'
          : 'bg-blue-50 border-blue-200 text-blue-600'
      } ${className}`}
    >
      {lang === 'hi' ? '🇬🇧 English' : '🇮🇳 हिंदी'}
    </button>
  );
};

export default LanguageToggle;
