import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, Dimensions } from 'react-native';

interface SafeAreaWrapperProps {
  children: React.ReactNode;
}

export const SafeAreaWrapper: React.FC<SafeAreaWrapperProps> = ({ children }) => {
  const window = Dimensions.get('window');

  // Get initial insets based on platform and screen dimensions
  const initialMetrics = {
    frame: { x: 0, y: 0, width: window.width, height: window.height },
    insets: Platform.select({
      ios: { top: 47, left: 0, right: 0, bottom: 34 },
      android: { top: 24, left: 0, right: 0, bottom: 0 },
      default: { top: 0, left: 0, right: 0, bottom: 0 },
    }),
  };

  return (
    <SafeAreaProvider
      initialMetrics={initialMetrics}
      style={{ flex: 1 }}
    >
      {children}
    </SafeAreaProvider>
  );
}; 