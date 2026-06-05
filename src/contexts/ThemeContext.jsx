import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('system');
  const [resolvedTheme, setResolvedTheme] = useState('dark');
  const [isLoading, setIsLoading] = useState(true);

  // Get system preference
  const getSystemTheme = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };

  // Resolve theme (system -> dark/light)
  const resolveTheme = (themePreference) => {
    if (themePreference === 'system') {
      return getSystemTheme();
    }
    return themePreference;
  };

  // Apply theme to document
  const applyTheme = (themeToApply) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themeToApply);
    setResolvedTheme(themeToApply);
  };

  // Load theme from storage on mount
  useEffect(() => {
    chrome.storage.sync.get(['theme_preference'], (result) => {
      const savedTheme = result.theme_preference || 'system';
      setTheme(savedTheme);
      const resolved = resolveTheme(savedTheme);
      applyTheme(resolved);
      setIsLoading(false);
    });
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      applyTheme(e.matches ? 'dark' : 'light');
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme]);

  // Update theme when preference changes
  const updateTheme = (newTheme) => {
    setTheme(newTheme);
    const resolved = resolveTheme(newTheme);
    applyTheme(resolved);
    chrome.storage.sync.set({ theme_preference: newTheme });
  };

  const value = {
    theme,
    resolvedTheme,
    setTheme: updateTheme,
    isLoading
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}


