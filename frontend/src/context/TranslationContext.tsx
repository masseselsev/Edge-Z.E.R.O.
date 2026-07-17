import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';
import type { Language } from '../i18n/translations';

interface TranslationContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, variables?: Record<string, any>) => string;
}

const TranslationContext = createContext<TranslationContextProps | undefined>(undefined);

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('user-locale');
    return (saved === 'uk' || saved === 'ru' || saved === 'en') ? saved as Language : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('user-locale', lang);
  };

  const t = (key: string, variables?: Record<string, any>): string => {
    const langDict = translations[language];
    if (!langDict) return key;
    let translation = langDict[key];
    if (translation === undefined) {
      // Fallback to English
      translation = translations['en'][key] || key;
    }
    if (variables) {
      Object.entries(variables).forEach(([k, v]) => {
        translation = translation.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return translation;
  };

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
