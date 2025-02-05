import React from 'react';
import { View, StyleSheet, ViewStyle, StatusBar, Platform } from 'react-native';

interface SafeScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
}

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 47 : 24;

export const SafeScreen: React.FC<SafeScreenProps> = ({
  children,
  style,
  backgroundColor = '#000',
}) => {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <View style={[styles.content, style]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: STATUSBAR_HEIGHT,
  },
}); 