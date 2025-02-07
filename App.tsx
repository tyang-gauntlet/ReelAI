import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationProvider } from './src/contexts/NavigationContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ensureDemoAccount, clearAuthState, ensureTestAccount } from './src/config/firebase';
import { VideoListProvider } from './src/contexts/VideoListContext';
import { VideoStateProvider } from './src/contexts/VideoStateContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationProvider>
        <VideoStateProvider>
          <VideoListProvider>
            <RootNavigator />
          </VideoListProvider>
        </VideoStateProvider>
      </NavigationProvider>
    </SafeAreaProvider>
  );
}
