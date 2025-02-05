import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Video as VideoType } from '../VideoFeed/VideoFeed';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { useEvent } from 'expo';
import * as FileSystem from 'expo-file-system';
import { getAuth, signInAnonymously } from 'firebase/auth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VideoPlayerProps {
  video: VideoType & {
    storagePath?: string;
  };
  isVisible: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, isVisible }) => {
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<any>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);

  const player = useVideoPlayer({
    uri: '',
    metadata: {
      title: video.title
    }
  }, player => {
    player.loop = true;
    player.controls = false;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing }, event => {
    console.log('Playing state changed:', {
      oldValue: event.oldValue,
      newValue: event.newValue,
      currentPlaying: player.playing,
    });
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    const handleVisibilityChange = async () => {
      try {
        if (isVisible && status === 'readyToPlay') {
          console.log('Playing video:', video.id);
          await player.play();
        } else {
          console.log('Pausing video:', video.id);
          await player.pause();
        }
      } catch (err) {
        console.error('Error handling visibility change:', err);
      }
    };

    handleVisibilityChange();
  }, [isVisible, player, status, video.id]);

  useEffect(() => {
    console.log('VideoPlayer mounted/updated:', {
      id: video.id,
      isVisible,
      hasStoragePath: !!video.storagePath,
      hasDirectUrl: !!video.url,
    });
    loadVideo();
  }, [video.id, loadVideo]);

  useEffect(() => {
    console.log('Video data:', {
      id: video.id,
      storagePath: video.storagePath,
      title: video.title,
    });
  }, [video]);

  useEffect(() => {
    if (status === 'readyToPlay' && !playerReady) {
      setPlayerReady(true);
    }
  }, [status]);

  const loadVideo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!video.storagePath) {
        console.error('Missing storage path for video:', video.id);
        throw new Error('No storage path available for video');
      }

      console.log('Loading video from storage:', {
        id: video.id,
        storagePath: video.storagePath,
      });

      const storage = getStorage();
      const videoRef = ref(storage, video.storagePath);
      const storageUrl = await getDownloadURL(videoRef);
      console.log('Got storage URL:', {
        id: video.id,
        url: storageUrl,
      });

      const localFileName = `${FileSystem.cacheDirectory}video-${video.id}.mp4`;

      const fileInfo = await FileSystem.getInfoAsync(localFileName);
      console.log('Local file check:', {
        id: video.id,
        exists: fileInfo.exists,
        size: fileInfo.size,
        uri: localFileName,
      });

      if (!fileInfo.exists || (fileInfo.size ?? 0) < 10000) {
        console.log('Starting download for video:', video.id);

        const downloadResult = await FileSystem.downloadAsync(storageUrl, localFileName);
        console.log('Download result:', {
          id: video.id,
          status: downloadResult.status,
          uri: downloadResult.uri,
        });

        if (downloadResult.status !== 200) {
          throw new Error(`Download failed with status ${downloadResult.status}`);
        }

        const downloadedFileInfo = await FileSystem.getInfoAsync(localFileName);
        if (!downloadedFileInfo.exists || (downloadedFileInfo.size ?? 0) < 10000) {
          throw new Error('Downloaded file is missing or too small');
        }

        console.log('Download verified:', {
          id: video.id,
          size: downloadedFileInfo.size,
          uri: localFileName,
          sizeInMB: ((downloadedFileInfo.size ?? 0) / (1024 * 1024)).toFixed(2) + ' MB',
        });
      }

      console.log('Setting video source:', {
        id: video.id,
        uri: localFileName,
      });

      await player.replace({
        uri: localFileName,
        metadata: {
          title: video.title,
        },
      });

      setLoading(false);
      setInitialLoad(false);

      if (isVisible) {
        console.log('Playing video:', video.id);
        await player.play();
      }
    } catch (error: any) {
      console.error('Error loading video:', {
        id: video.id,
        error: error.message,
        stack: error.stack,
      });
      setError('Failed to load video');
      setLoading(false);
      setInitialLoad(false);
    }
  }, [video, isVisible, player]);

  const togglePlayPause = useCallback(async () => {
    try {
      console.log('Toggle play/pause START:', {
        isPlaying,
        status,
        playerReady,
        playing: player.playing,
        currentTime: player.currentTime,
      });

      if (!playerReady) {
        console.log('Player not ready, ignoring tap');
        return;
      }

      if (isPlaying) {
        console.log('Attempting to pause...');
        await player.pause();
        console.log('Pause complete, new state:', {
          isPlaying,
          playing: player.playing,
          status: player.status,
        });
      } else {
        console.log('Attempting to play...');
        await player.play();
        console.log('Play complete, new state:', {
          isPlaying,
          playing: player.playing,
          status: player.status,
        });
      }

      // Log final state
      console.log('Toggle play/pause END:', {
        isPlaying,
        status,
        playing: player.playing,
        currentTime: player.currentTime,
      });
    } catch (err) {
      console.error('Error toggling playback:', err);
    }
  }, [isPlaying, status, player, playerReady]);

  const handlePress = useCallback(() => {
    console.log('Tap received, current state:', {
      isPlaying,
      status,
      playerReady,
      playing: player.playing,
    });
    togglePlayPause();
  }, [isPlaying, status, playerReady, player, togglePlayPause]);

  const videoViewConfig = {
    nativeControls: false,
    showNativeControls: false,
    useNativeControls: false,
    hideNativeControls: true,
  };

  if (Platform.OS === 'web') {
    return (
      <video
        controls
        style={{ width: '100%', height: '100%' }}
        src={video.url}
      />
    );
  }

  return (
    <View
      style={styles.container}
      onTouchEnd={handlePress}
    >
      <TouchableOpacity
        style={styles.videoWrapper}
        activeOpacity={1}
        onPress={handlePress}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          {...videoViewConfig}
        />
      </TouchableOpacity>

      <View
        style={styles.overlayContainer}
        pointerEvents="none"
      >
        {(loading && !initialLoad) && (
          <View style={styles.centeredOverlay}>
            <MaterialIcons name="sync" size={50} color="white" />
            {downloadProgress > 0 && downloadProgress < 1 && (
              <Text style={styles.progressText}>
                {`${(downloadProgress * 100).toFixed(0)}%`}
              </Text>
            )}
          </View>
        )}

        {error && (
          <View style={styles.centeredOverlay}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!isPlaying && !loading && !error && status === 'readyToPlay' && (
          <View style={styles.centeredOverlay}>
            <MaterialIcons name="play-arrow" size={50} color="white" />
          </View>
        )}

        <View style={styles.controlsOverlay}>
          <View style={styles.rightControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => setLiked(!liked)}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={30}
                color={liked ? 'red' : 'white'}
              />
              <Text style={styles.controlText}>{video.likes}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="share-social-outline" size={30} color="white" />
              <Text style={styles.controlText}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomInfo}>
            <Text style={styles.title}>{video.title}</Text>
            <Text style={styles.description}>{video.description}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  videoWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  rightControls: {
    position: 'absolute',
    right: 10,
    bottom: 80,
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    marginVertical: 8,
  },
  controlText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    padding: 16,
    paddingRight: 80,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    color: 'white',
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  progressText: {
    color: 'white',
    fontSize: 16,
    marginTop: 8,
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    padding: 16,
  },
});

export default VideoPlayer; 