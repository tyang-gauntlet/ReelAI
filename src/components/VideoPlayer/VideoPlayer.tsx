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
import { Animated } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MINIMUM_BUFFER_MS = 2000; // Minimum buffer size in milliseconds
const VISIBILITY_DEBOUNCE_MS = 500; // Debounce time for visibility changes
const BUFFER_INDICATOR_DELAY = 500; // Delay before showing buffer indicator
const DOT_SIZE = 4;
const EXPANDED_SIZE = 48; // Slightly larger base size
const SPACING = 16;
const ACTIVE_SCALE = 1.6; // Increased scale factor

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
  const [userPaused, setUserPaused] = useState(false);
  const [debouncedIsVisible, setDebouncedIsVisible] = useState(isVisible);
  const bufferingTimeout = useRef<NodeJS.Timeout>();
  const bufferIndicatorTimeout = useRef<NodeJS.Timeout>();
  const lastPlayAttempt = useRef<number>(0);
  const visibilityTimeout = useRef<NodeJS.Timeout>();
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = useRef(Array.from({ length: 4 }, () => new Animated.Value(0))).current;
  const activeIndexAnim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef<number>(0);
  const doubleTapTimeout = useRef<NodeJS.Timeout>();
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const likeAnimationTimeout = useRef<NodeJS.Timeout>();
  const likeAnimScale = useRef(new Animated.Value(0)).current;

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

      console.log('Loading video metadata:', video.metadata);
      console.log('Video object:', {
        id: video.id,
        metadata: video.metadata,
        storagePath: video.storagePath
      });

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

      // Get video dimensions from metadata if available
      if (video.metadata?.width && video.metadata?.height) {
        const dimensions = {
          width: video.metadata.width,
          height: video.metadata.height
        };
        console.log('Setting video dimensions:', dimensions);
        setVideoDimensions(dimensions);
      } else {
        console.log('No video dimensions in metadata');
      }

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

      if (bufferIndicatorTimeout.current) {
        clearTimeout(bufferIndicatorTimeout.current);
      }

      if (isCurrentlyBuffering && !initialLoad) {
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
    } else if (status === 'readyToPlay' && !isPlaying && isVisible && playerReady && !userPaused) {
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
  }, [status, isVisible, player, playerReady, buffering, isPlaying, initialLoad, userPaused]);

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
      if (!playerReady) return;

      try {
        if (!debouncedIsVisible && player.playing) {
          await player.pause();
        } else if (debouncedIsVisible && status === 'readyToPlay' && !player.playing && !userPaused) {
          await player.play();
        }
      } catch (err) {
        console.error('Error handling visibility change:', err);
      }
    };

    handleVisibilityChange();
  }, [debouncedIsVisible, player, status, playerReady, userPaused]);

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
    if (!playerReady) return;

    try {
      if (player.playing) {
        await player.pause();
        setUserPaused(true);
      } else {
        setUserPaused(false);
        if (debouncedIsVisible) {
          await player.play();
        }
      }
    } catch (err) {
      console.error('Error toggling playback:', err);
    }
  }, [player, playerReady, debouncedIsVisible]);

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

  const handleDoubleTap = useCallback(() => {
    if (!liked) {
      handleLike();
    }

    // Show like animation
    setShowLikeAnimation(true);
    Animated.sequence([
      Animated.spring(likeAnimScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 400,
        friction: 15,
      }),
      Animated.timing(likeAnimScale, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
        delay: 500,
      }),
    ]).start(() => {
      setShowLikeAnimation(false);
    });
  }, [liked, handleLike]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (doubleTapTimeout.current) {
      clearTimeout(doubleTapTimeout.current);
      doubleTapTimeout.current = undefined;

      if (now - lastTap.current < DOUBLE_TAP_DELAY) {
        // Double tap detected
        handleDoubleTap();
        return;
      }
    }

    lastTap.current = now;
    doubleTapTimeout.current = setTimeout(() => {
      // Single tap detected
      togglePlayPause();
      doubleTapTimeout.current = undefined;
    }, DOUBLE_TAP_DELAY);
  }, [togglePlayPause, handleDoubleTap]);

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

  // Determine content fit based on video dimensions
  const getContentFit = useCallback(() => {
    if (!videoDimensions) return 'contain';
    const isVertical = videoDimensions.height > videoDimensions.width;
    return isVertical ? 'cover' : 'contain';
  }, [videoDimensions]);

  const videoViewConfig = {
    nativeControls: false,
    showNativeControls: false,
    useNativeControls: false,
    hideNativeControls: true,
  };

  const handleExpand = () => {
    Animated.timing(expandAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const handleCollapse = () => {
    Animated.timing(expandAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const handleScale = (index: number) => {
    Animated.timing(scaleAnims[index], {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const handleScaleBack = (index: number) => {
    Animated.timing(scaleAnims[index], {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const handleActiveIndex = (index: number) => {
    activeIndexAnim.setValue(index);
  };

  if (Platform.OS === 'web') {
    return (
      <video
        controls
        style={{ width: '100%', height: '100%' }}
        src={video.storageUrl}
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
            contentFit={getContentFit()}
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

          {showLikeAnimation && (
            <Animated.View style={[styles.likeAnimation, {
              transform: [{ scale: likeAnimScale }]
            }]}>
              <Ionicons
                name="heart"
                size={100}
                color={theme.colors.like}
              />
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded dock */}
      {isExpanded && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 50, // Move popup higher
            flexDirection: 'row',
            backgroundColor: 'rgba(28, 28, 30, 0.92)',
            borderRadius: 20,
            padding: 8,
            paddingHorizontal: 10,
            transform: [{
              translateY: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [15, 0],
              })
            }],
            opacity: expandAnim,
            shadowColor: '#000',
            shadowOffset: {
              width: 0,
              height: 4,
            },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          {routes.map((route, index) => {
            const isActive = state.index === index;
            const baseScale = scaleAnims[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0.8, 1], // Start from larger initial scale
            });

            const hoverScale = Animated.multiply(
              activeIndexAnim.interpolate({
                inputRange: [index - 1, index, index + 1],
                outputRange: [1, ACTIVE_SCALE, 1],
                extrapolate: 'clamp',
              }),
              expandAnim
            );

            const finalScale = Animated.multiply(baseScale, hoverScale);

            return (
              <Animated.View
                key={route.name}
                style={{
                  marginHorizontal: SPACING / 2,
                  transform: [
                    { scale: finalScale }
                  ],
                }}
              >
                <View
                  style={{
                    width: EXPANDED_SIZE,
                    height: EXPANDED_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={(route.icon + (isActive ? '' : '-outline')) as keyof typeof Ionicons.glyphMap}
                    size={32} // Larger icon size
                    color="#fff"
                    style={{
                      opacity: isActive ? 1 : 0.8,
                    }}
                  />
                </View>
              </Animated.View>
            );
          })}
        </Animated.View>
      )}
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
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    bottom: Platform.OS === 'ios' ? 180 : 160,
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
    marginBottom: Platform.OS === 'ios' ? 180 : 160,
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
  likeAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});

export default VideoPlayer; 