import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export type ThemeId = 'dark' | 'light' | 'midnight' | 'cyberpunk';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId | 'auto') => void;
  resolvedTheme: ThemeId;
  configTheme: string; // the raw config value including 'auto'
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  resolvedTheme: 'dark',
  configTheme: 'dark',
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ThemeId {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function resolveTheme(configValue: string): ThemeId {
  if (configValue === 'auto') return getSystemTheme();
  if (['dark', 'light', 'midnight', 'cyberpunk'].includes(configValue)) return configValue as ThemeId;
  return 'dark';
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeProviderProps {
  children: ReactNode;
  configTheme: string;
  onThemeChange?: (theme: string) => void;
}

export function ThemeProvider({ children, configTheme, onThemeChange }: ThemeProviderProps) {
  const [resolved, setResolved] = useState<ThemeId>(() => resolveTheme(configTheme));

  const setTheme = useCallback((value: ThemeId | 'auto') => {
    const newResolved = resolveTheme(value);
    setResolved(newResolved);
    applyTheme(newResolved);
    onThemeChange?.(value);
  }, [onThemeChange]);

  // React to config changes
  useEffect(() => {
    const newResolved = resolveTheme(configTheme);
    setResolved(newResolved);
    applyTheme(newResolved);
  }, [configTheme]);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (configTheme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const newResolved = resolveTheme('auto');
      setResolved(newResolved);
      applyTheme(newResolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [configTheme]);

  return (
    <ThemeContext.Provider value={{ theme: resolved, setTheme, resolvedTheme: resolved, configTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
