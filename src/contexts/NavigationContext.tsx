import React, { createContext, useContext, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

type NavigationContextType = {
  currentScreen: 'loading' | 'auth' | 'main';
};

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<'loading' | 'auth' | 'main'>('loading');
  const { loading, user } = useAuth();

  // Update current screen based on auth state
  React.useEffect(() => {
    if (loading) {
      setCurrentScreen('loading');
    } else if (!user) {
      setCurrentScreen('auth');
    } else {
      setCurrentScreen('main');
    }
  }, [loading, user]);

  return (
    <NavigationContext.Provider value={{ currentScreen }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useAppNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useAppNavigation must be used within a NavigationProvider');
  }
  return context;
}; 