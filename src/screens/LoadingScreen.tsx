import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeScreen } from '../components/layout/SafeScreen';

export const LoadingScreen = () => {
  return (
    <SafeScreen>
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={styles.spinner} />
        <Text style={styles.text}>Loading...</Text>
      </View>
    </SafeScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  spinner: {
    transform: [{ scale: 1.5 }],
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
  },
}); 