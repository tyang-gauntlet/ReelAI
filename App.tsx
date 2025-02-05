import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LogBox, AppState, AppStateStatus, Platform } from 'react-native';
import { ensureDemoAccount, clearAuthState } from './src/config/firebase';

// Ignore non-critical warnings
LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  'Setting a timer for a long period of time',
]);

// Add this before your App component
if (__DEV__) {
  const isAndroid = Platform.OS === 'android';
  const debugHost = isAndroid ? '10.0.2.2' : 'localhost';

  // Set up dev tools connection
  global.XMLHttpRequest = global.originalXMLHttpRequest || global.XMLHttpRequest;
  global.WebSocket = global.originalWebSocket || global.WebSocket;
}

export default function App() {
  useEffect(() => {
    // Add this debug log
    console.log('App mounted, Hermes:', !!global.HermesInternal);
    console.log('Development mode:', __DEV__);

    // Create demo account on app start
    ensureDemoAccount().catch(console.error);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Clear auth state when app goes to background
        clearAuthState();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}
