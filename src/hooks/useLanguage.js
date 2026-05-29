import { useState } from 'react';
import { t as translate } from '../i18n/translations';

export const useLanguage = () => {
  const [lang, setLang] = useState(() =>
    localStorage.getItem('vs_lang') || 'hi'
  );

  const toggleLanguage = () => {
    const newLang = lang === 'hi' ? 'en' : 'hi';
    setLang(newLang);
    localStorage.setItem('vs_lang', newLang);
  };

  const t = (key) => translate(lang, key);

  return { lang, toggleLanguage, t };
};
