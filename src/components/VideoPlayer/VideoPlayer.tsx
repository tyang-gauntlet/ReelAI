import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Video as VideoType } from '../VideoFeed/VideoFeed';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { useEvent } from 'expo';
import * as FileSystem from 'expo-file-system';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { theme } from '../../styles/theme';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../hooks/useAuth';
import { saveVideo, checkIfSaved, unsaveVideo } from '../../services/saveVideoService';
import { likeVideo, unlikeVideo, checkIfLiked } from '../../services/interactionService';
import { useVideoList } from '../../contexts/VideoListContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINIMUM_BUFFER_MS = 2000; // Minimum buffer size in milliseconds
const VISIBILITY_DEBOUNCE_MS = 500; // Debounce time for visibility changes
const BUFFER_INDICATOR_DELAY = 500; // Delay before showing buffer indicator

interface VideoPlayerProps {
  video: VideoType & {
    storagePath?: string;
  };
  isVisible: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, isVisible }) => {
  const { user } = useAuth();
  const { triggerRefresh } = useVideoList();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likes);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [showBuffering, setShowBuffering] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [debouncedIsVisible, setDebouncedIsVisible] = useState(isVisible);
  const bufferingTimeout = useRef<NodeJS.Timeout>();
  const bufferIndicatorTimeout = useRef<NodeJS.Timeout>();
  const lastPlayAttempt = useRef<number>(0);
  const visibilityTimeout = useRef<NodeJS.Timeout>();

  const player = useVideoPlayer({
    uri: '',
    metadata: {
      title: video.title
    }
  });

  const loadVideo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPlayerReady(false);

      if (!video.storagePath) {
        throw new Error('No storage path available for video');
      }

      const storage = getStorage();
      const videoRef = ref(storage, video.storagePath);
      const storageUrl = await getDownloadURL(videoRef);
      const localFileName = `${FileSystem.cacheDirectory}video-${video.id}.mp4`;

      const fileInfo = await FileSystem.getInfoAsync(localFileName);
      if (!fileInfo.exists) {
        await FileSystem.downloadAsync(storageUrl, localFileName);
      }

      await player.replace({
        uri: localFileName,
        metadata: { title: video.title },
      });

      setLoading(false);
      setInitialLoad(false);

    } catch (error: any) {
      console.error('Error loading video:', error);
      setError('Failed to load video');
      setLoading(false);
      setInitialLoad(false);
    }
  }, [video, player]);

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    const isCurrentlyBuffering = status === 'loading';
    if (isCurrentlyBuffering !== buffering) {
      setBuffering(isCurrentlyBuffering);

      // Clear any existing buffer indicator timeout
      if (bufferIndicatorTimeout.current) {
        clearTimeout(bufferIndicatorTimeout.current);
      }

      if (isCurrentlyBuffering && !initialLoad) {
        // Only show buffering indicator after a delay and if we're not in initial load
        bufferIndicatorTimeout.current = setTimeout(() => {
          if (!initialLoad) {
            setShowBuffering(true);
          }
        }, BUFFER_INDICATOR_DELAY);
      } else {
        setShowBuffering(false);
      }
    }

    if (isCurrentlyBuffering) {
      if (bufferingTimeout.current) {
        clearTimeout(bufferingTimeout.current);
      }
    } else if (status === 'readyToPlay' && !isPlaying && isVisible && playerReady) {
      const now = Date.now();
      if (now - lastPlayAttempt.current >= MINIMUM_BUFFER_MS) {
        bufferingTimeout.current = setTimeout(() => {
          lastPlayAttempt.current = now;
          player.play();
        }, 500);
      }
    }

    return () => {
      if (bufferingTimeout.current) {
        clearTimeout(bufferingTimeout.current);
      }
      if (bufferIndicatorTimeout.current) {
        clearTimeout(bufferIndicatorTimeout.current);
      }
    };
  }, [status, isVisible, player, playerReady, buffering, isPlaying, initialLoad]);

  useEffect(() => {
    if (player) {
      player.loop = true;
    }
  }, [player]);

  useEffect(() => {
    if (visibilityTimeout.current) {
      clearTimeout(visibilityTimeout.current);
    }

    visibilityTimeout.current = setTimeout(() => {
      setDebouncedIsVisible(isVisible);
    }, VISIBILITY_DEBOUNCE_MS);

    return () => {
      if (visibilityTimeout.current) {
        clearTimeout(visibilityTimeout.current);
      }
    };
  }, [isVisible]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      try {
        if (debouncedIsVisible && status === 'readyToPlay' && playerReady && !isPlaying) {
          await player.play();
        } else if (!debouncedIsVisible && isPlaying) {
          await player.pause();
        }
      } catch (err) {
        console.error('Error handling visibility change:', err);
      }
    };

    handleVisibilityChange();
  }, [debouncedIsVisible, player, status, playerReady, isPlaying]);

  useEffect(() => {
    loadVideo();
  }, [video.id, loadVideo]);

  useEffect(() => {
    if (status === 'readyToPlay' && !playerReady) {
      setPlayerReady(true);
    }
  }, [status]);

  // Check initial like status
  useEffect(() => {
    const checkLikeStatus = async () => {
      if (!user) return;
      try {
        const isLiked = await checkIfLiked(user.uid, video.id);
        setLiked(isLiked);
      } catch (error) {
        console.error('Error checking like status:', error);
      }
    };

    checkLikeStatus();
  }, [user, video.id]);

  // Check initial save status
  useEffect(() => {
    const checkSaveStatus = async () => {
      if (!user) return;
      try {
        const isSaved = await checkIfSaved(user.uid, video.id);
        setSaved(isSaved);
      } catch (error) {
        console.error('Error checking save status:', error);
      }
    };

    checkSaveStatus();
  }, [user, video.id]);

  const togglePlayPause = useCallback(async () => {
    try {
      if (!playerReady) return;

      if (isPlaying) {
        await player.pause();
      } else {
        await player.play();
      }
    } catch (err) {
      console.error('Error toggling playback:', err);
    }
  }, [isPlaying, player, playerReady]);

  const handlePress = useCallback(() => {
    togglePlayPause();
  }, [togglePlayPause]);

  const handleShare = useCallback(async () => {
    try {
      if (!video.storagePath) {
        throw new Error('No storage path available for video');
      }

      const storage = getStorage();
      const videoRef = ref(storage, video.storagePath);
      const shareUrl = await getDownloadURL(videoRef);

      await Clipboard.setStringAsync(shareUrl);
      Alert.alert('Success', 'Video URL copied to clipboard!');
    } catch (error) {
      console.error('Error sharing video:', error);
      Alert.alert('Error', 'Failed to copy video URL');
    }
  }, [video.storagePath]);

  const handleLike = useCallback(async () => {
    try {
      if (!user) return;

      // Optimistically update UI
      setLiked(!liked);
      setLikeCount(current => current + (liked ? -1 : 1));

      if (liked) {
        await unlikeVideo(user.uid, video.id);
      } else {
        await likeVideo(user.uid, video.id);
      }
    } catch (error) {
      // Revert UI on error
      setLiked(liked);
      setLikeCount(current => current + (liked ? 1 : -1));
      console.error('Error toggling like:', error);
      Alert.alert('Error', 'Failed to update like status');
    }
  }, [video.id, liked, user]);

  const handleSave = useCallback(async () => {
    try {
      if (!user) return;

      // Optimistically update UI
      setSaved(!saved);

      if (!saved) {
        await saveVideo(user.uid, video.id);
      } else {
        await unsaveVideo(user.uid, video.id);
      }

      // Trigger refresh of video lists
      triggerRefresh();
    } catch (error) {
      // Revert UI on error
      setSaved(saved);
      console.error('Error saving video:', error);
      Alert.alert('Error', 'Failed to update save status');
    }
  }, [video.id, user, saved, triggerRefresh]);

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
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.videoWrapper}
        activeOpacity={1}
        onPress={handlePress}
      >
        <View style={styles.videoContainer}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            {...videoViewConfig}
          />
        </View>

        <View style={styles.overlayContainer} pointerEvents="box-none">
          {(loading || showBuffering) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
            </View>
          )}

          <View style={styles.controlsOverlay}>
            <View style={styles.rightControls}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleLike}
              >
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={30}
                  color={liked ? theme.colors.like : theme.colors.text.primary}
                />
                <Text style={styles.controlText}>{likeCount}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleSave}
              >
                <Ionicons
                  name={saved ? 'bookmark' : 'bookmark-outline'}
                  size={30}
                  color={saved ? theme.colors.accent : theme.colors.text.primary}
                />
                <Text style={styles.controlText}>Save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleShare}
              >
                <Ionicons
                  name="share-social-outline"
                  size={30}
                  color={theme.colors.text.primary}
                />
                <Text style={styles.controlText}>Share</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomInfo}>
              <Text style={styles.title}>{video.title}</Text>
              <Text style={styles.description}>{video.description}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoWrapper: {
    flex: 1,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  video: {
    flex: 1,
    width: '100%',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: theme.spacing.md,
  },
  rightControls: {
    position: 'absolute',
    right: theme.spacing.md,
    bottom: theme.spacing.xl * 2,
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    marginVertical: theme.spacing.xs,
  },
  controlText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.sm,
    marginTop: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    paddingRight: theme.spacing.xl * 3,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    marginBottom: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.md,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});

export default VideoPlayer; 