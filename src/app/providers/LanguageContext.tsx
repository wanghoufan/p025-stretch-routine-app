import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { translate, type Language } from '../../shared/i18n';
import { useServices } from './ServicesContext';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'app_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const [language, setLanguageState] = useState<Language>('zh');
  const languageRef = useRef<Language>('zh');

  useEffect(() => {
    let cancelled = false;
    services.settings.load().then((loaded) => {
      if (cancelled) return;
      const stored = (loaded as unknown as Record<string, unknown>)[STORAGE_KEY];
      if (stored === 'zh' || stored === 'en') {
        languageRef.current = stored;
        setLanguageState(stored);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [services]);

  const setLanguage = useCallback((lang: Language) => {
    languageRef.current = lang;
    setLanguageState(lang);
    services.settings.load().then((loaded) => {
      const updated = { ...loaded, [STORAGE_KEY]: lang };
      return services.settings.save(updated);
    }).catch(() => {});
  }, [services]);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translate(languageRef.current, key, params);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return value;
}
