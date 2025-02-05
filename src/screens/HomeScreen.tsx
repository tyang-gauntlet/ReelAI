import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import VideoFeed from '../components/VideoFeed/VideoFeed';
import { cleanupVideoCache } from '../services/videoService';

export const HomeScreen: React.FC = () => {
  useEffect(() => {
    const initializeVideos = async () => {
      try {
        // First clean up any invalid cached videos
        await cleanupVideoCache();
      } catch (error) {
        console.error('Error initializing videos:', error);
      }
    };

    initializeVideos();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <VideoFeed />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
}); 