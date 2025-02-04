import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LogBox } from 'react-native';
import { ensureDemoAccount } from './src/config/firebase';

// Ignore non-critical warnings
LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  'Setting a timer for a long period of time',
]);

export default function App() {
  useEffect(() => {
    // Create demo account on app start
    ensureDemoAccount().catch(console.error);
  }, []);

  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}
