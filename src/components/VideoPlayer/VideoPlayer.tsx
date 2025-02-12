import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { useVideoPlayer, VideoView, VideoPlayer as ExpoVideoPlayer } from 'expo-video';
import { Video as VideoType } from '../VideoFeed/VideoFeed';
import { Ionicons } from '@expo/vector-icons';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { useEvent } from 'expo';
import * as FileSystem from 'expo-file-system';
import { theme } from '../../styles/theme';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../hooks/useAuth';
import { saveVideo, checkIfSaved, unsaveVideo } from '../../services/saveVideoService';
import { likeVideo, unlikeVideo, checkIfLiked } from '../../services/interactionService';
import { useVideoList } from '../../contexts/VideoListContext';
import { Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useVideoState } from '../../contexts/VideoStateContext';
import { AIAnalysisModal } from '../AIAnalysis/AIAnalysisModal';
import { functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { requestAnalysis } from '../../services/aiAnalysisService';

const VISIBILITY_DEBOUNCE_MS = 500; // Debounce time for visibility changes
const MAX_LOAD_RETRIES = 3;
const RETRY_DELAY = 1000;

interface VideoPlayerProps {
  video: VideoType & {
    storagePath?: string;
  };
  isVisible: boolean;
  onVideoUpdate?: (videoId: string, updates: { liked?: boolean; saved?: boolean }) => void;
  onHashtagPress?: (hashtag: string) => void;
  showBackButton?: boolean;
  onBackPress?: () => void;
}

// Add interface for the analysis result
interface AIAnalysis {
  description: string;
  subject: string;
  action: string;
  mood: string;
  composition: string;
  lighting: string;
  technicalQuality: string;
  environmentalContext: string;
  cinematographicElements: string;
  narrativeSignificance: string;
}

// Add type for playback status
interface PlaybackStatus {
  isLoaded: boolean;
  positionMillis: number;
  // ... other status fields
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, isVisible, onVideoUpdate, onHashtagPress, showBackButton, onBackPress }) => {
  const { user } = useAuth();
  const { triggerRefresh } = useVideoList();
  const { getVideoState, updateVideoState } = useVideoState();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  // Initialize state from VideoStateContext
  const videoState = getVideoState(video.id);
  const [liked, setLiked] = useState(videoState.isLiked);
  const [likeCount, setLikeCount] = useState(videoState.likes || video.likes);
  const [saved, setSaved] = useState(videoState.isSaved);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [debouncedIsVisible, setDebouncedIsVisible] = useState(isVisible);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysis | null>(null);
  const videoRef = useRef<ExpoVideoPlayer>(null);

  const lastTap = useRef<number>(0);
  const doubleTapTimeout = useRef<NodeJS.Timeout>();
  const likeAnimationTimeout = useRef<NodeJS.Timeout>();
  const likeAnimScale = useRef(new Animated.Value(0)).current;
  const visibilityTimeout = useRef<NodeJS.Timeout>();
  const spinValue = useRef(new Animated.Value(0)).current;

  const [videoPosition, setVideoPosition] = useState(0);
  const positionInterval = useRef<NodeJS.Timeout>();

  const player = useVideoPlayer({
    uri: '',
    metadata: {
      title: video.title
    }
  });

  // Simplified status handling
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Only log play/pause events
  useEffect(() => {
    if (isPlaying !== undefined) {
      console.log('Playback state changed:', {
        isPlaying,
        videoId: video.id,
        timestamp: new Date().toISOString()
      });
    }
  }, [isPlaying, video.id]);

  const mountedRef = useRef(true);
  const loadAttemptRef = useRef(0);
  const loadTimeoutRef = useRef<NodeJS.Timeout>();

  const loadVideo = useCallback(async () => {
    if (!mountedRef.current) return;

    // Clear any existing load timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = undefined;
    }

    try {
      console.log('Starting video load:', {
        videoId: video.id,
        attempt: loadAttemptRef.current + 1,
        timestamp: new Date().toISOString()
      });

      setLoading(true);
      setPlayerReady(false);

      if (!video.storagePath) {
        throw new Error('No storage path available for video');
      }

      const storage = getStorage();
      const videoRef = ref(storage, video.storagePath);
      const storageUrl = await getDownloadURL(videoRef);
      const localFileName = `${FileSystem.cacheDirectory}video-${video.id}.mp4`;

      const fileInfo = await FileSystem.getInfoAsync(localFileName);

      // If file exists but previous load failed, try deleting and redownloading
      if (fileInfo.exists && loadAttemptRef.current > 0) {
        await FileSystem.deleteAsync(localFileName, { idempotent: true });
        await FileSystem.downloadAsync(storageUrl, localFileName);
      } else if (!fileInfo.exists) {
        await FileSystem.downloadAsync(storageUrl, localFileName);
      }

      if (!mountedRef.current) return;

      try {
        console.log('Replacing video source:', {
          videoId: video.id,
          localFileName,
          timestamp: new Date().toISOString()
        });

        await player.replace({
          uri: localFileName,
          metadata: { title: video.title },
        });

        if (video.metadata?.width && video.metadata?.height) {
          setVideoDimensions({
            width: video.metadata.width,
            height: video.metadata.height
          });
        }

        loadAttemptRef.current = 0; // Reset attempts on success
        setLoading(false);
        setInitialLoad(false);

      } catch (replaceError) {
        console.error('Error replacing video:', replaceError);
        throw replaceError;
      }

    } catch (error) {
      console.error('Error loading video:', error);

      if (!mountedRef.current) return;

      loadAttemptRef.current++;

      if (loadAttemptRef.current < MAX_LOAD_RETRIES) {
        console.log(`Retrying video load (attempt ${loadAttemptRef.current + 1}/${MAX_LOAD_RETRIES})`);
        loadTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            loadVideo();
          }
        }, RETRY_DELAY);
      } else {
        setLoading(false);
        setInitialLoad(false);
        console.error(`Failed to load video after ${MAX_LOAD_RETRIES} attempts`);
      }
    }
  }, [video, player]);

  useEffect(() => {
    if (player) {
      console.log('Setting up player:', {
        videoId: video.id,
        timestamp: new Date().toISOString()
      });
      player.loop = true;
    }
  }, [player, video.id]);

  useEffect(() => {
    if (visibilityTimeout.current) {
      clearTimeout(visibilityTimeout.current);
    }

    visibilityTimeout.current = setTimeout(() => {
      if (mountedRef.current) {
        setDebouncedIsVisible(isVisible);
      }
    }, VISIBILITY_DEBOUNCE_MS);

    return () => {
      if (visibilityTimeout.current) {
        clearTimeout(visibilityTimeout.current);
      }
    };
  }, [isVisible]);

  // Cleanup timeouts when component unmounts
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (visibilityTimeout.current) {
        clearTimeout(visibilityTimeout.current);
      }
      if (doubleTapTimeout.current) {
        clearTimeout(doubleTapTimeout.current);
      }
      if (likeAnimationTimeout.current) {
        clearTimeout(likeAnimationTimeout.current);
      }
      if (positionInterval.current) {
        clearInterval(positionInterval.current);
      }
    };
  }, []);

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
    if (isVisible) {
      loadVideo();
    }
  }, [video.id, isVisible, loadVideo]);

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
    if (!user) return;

    // Optimistically update UI first
    const newLiked = !liked;
    const newLikeCount = likeCount + (newLiked ? 1 : -1);
    setLiked(newLiked);
    setLikeCount(newLikeCount);
    updateVideoState(video.id, {
      isLiked: newLiked,
      likes: newLikeCount
    });
    onVideoUpdate?.(video.id, { liked: newLiked });

    // Then update database
    try {
      if (newLiked) {
        await likeVideo(user.uid, video.id);
      } else {
        await unlikeVideo(user.uid, video.id);
      }
      triggerRefresh();
    } catch (error) {
      // Revert UI on error
      setLiked(!newLiked);
      setLikeCount(likeCount);
      updateVideoState(video.id, {
        isLiked: !newLiked,
        likes: likeCount
      });
      onVideoUpdate?.(video.id, { liked: !newLiked });
      console.error('Error toggling like:', error);
      Alert.alert('Error', 'Failed to update like status');
    }
  }, [video.id, liked, likeCount, user, triggerRefresh, onVideoUpdate, updateVideoState]);

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
  }, [liked, handleLike, likeAnimScale]);

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

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save videos');
      return;
    }

    // Optimistically update UI first
    const newSaved = !saved;
    setSaved(newSaved);
    updateVideoState(video.id, { isSaved: newSaved });
    onVideoUpdate?.(video.id, { saved: newSaved });

    // Then update database
    try {
      if (newSaved) {
        await saveVideo(user.uid, video.id);
      } else {
        await unsaveVideo(user.uid, video.id);
      }
      triggerRefresh();
    } catch (error) {
      // Revert UI on error
      setSaved(!newSaved);
      updateVideoState(video.id, { isSaved: !newSaved });
      onVideoUpdate?.(video.id, { saved: !newSaved });
      console.error('Error toggling save status:', error);
      Alert.alert('Error', 'Failed to update save status');
    }
  };

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
    hideNativeControls: true
  };

  const handleDescriptionPress = useCallback(() => {
    setIsDescriptionExpanded(prev => !prev);
  }, []);

  const handleAnalysisPress = async () => {
    try {
      if (!player || !playerReady) {
        Alert.alert('Error', 'Video player not ready');
        return;
      }

      // Check if video is in a valid state for analysis
      if (loading || !player.duration || player.status !== 'readyToPlay') {
        Alert.alert(
          'Cannot Analyze',
          'Please wait for the video to load completely before analyzing.'
        );
        return;
      }

      const currentTimeSeconds = videoPosition / 1000; // Convert from ms to seconds

      // Validate the current time is within video bounds
      if (currentTimeSeconds < 0 || currentTimeSeconds > player.duration) {
        Alert.alert(
          'Invalid Position',
          'Cannot analyze this frame. Please try again when the video is playing properly.'
        );
        return;
      }

      // Only log when AI button is pressed
      console.log('AI Analysis requested:', {
        currentTimeSeconds,
        videoId: video.id,
        duration: player.duration,
        status: player.status,
        timestamp: new Date().toISOString()
      });

      setIsAnalyzing(true);
      if (!video.storagePath) throw new Error('No video storage path available');

      const result = await requestAnalysis({
        videoPath: video.storagePath,
        timestamp: currentTimeSeconds,
        fullVideo: video
      });

      // Check for failed analysis response
      if (!result || result.text?.includes('Analysis failed') || result.highlights?.length === 0) {
        Alert.alert(
          'Cannot Analyze',
          'Unable to analyze this frame. The video might be in a transition or black screen. Please try a different moment in the video.'
        );
        return;
      }

      setAnalysisResult(result);
      setShowAIAnalysis(true);
    } catch (error) {
      console.error('Error requesting analysis:', error);
      Alert.alert(
        'Analysis Failed',
        'Could not analyze the current frame. Please ensure the video is playing properly and try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (isAnalyzing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [isAnalyzing]);

  const handleHashtagPress = useCallback((hashtag: string) => {
    if (onHashtagPress) {
      // Use the provided handler from parent component
      const formattedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
      onHashtagPress(formattedHashtag);
    } else {
      // Navigate to hashtag screen while keeping current screen in stack
      const formattedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
      navigation.push('Hashtag', { tag: formattedHashtag });
    }
  }, [onHashtagPress, navigation]);

  // Update the hashtags rendering in the bottomInfo section
  const renderHashtags = () => {
    if (!video.metadata?.hashtags || video.metadata.hashtags.length === 0) {
      return null;
    }

    return (
      <View style={styles.hashtagsContainer}>
        {video.metadata.hashtags.map((tag, index) => {
          const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
          return (
            <TouchableOpacity
              key={index}
              onPress={() => handleHashtagPress(formattedTag)}
              style={styles.hashtagButton}
            >
              <Text style={styles.hashtagText}>{formattedTag}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Update position tracking to be silent
  useEffect(() => {
    if (player && playerReady && player.playing) {
      if (positionInterval.current) {
        clearInterval(positionInterval.current);
      }

      positionInterval.current = setInterval(() => {
        const currentTime = player.currentTime;
        if (typeof currentTime === 'number') {
          setVideoPosition(currentTime * 1000); // Convert seconds to milliseconds
        }
      }, 200);
    }

    return () => {
      if (positionInterval.current) {
        clearInterval(positionInterval.current);
      }
    };
  }, [player, playerReady, player?.playing]);

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
    <>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.videoWrapper}
          activeOpacity={1}
          onPress={handlePress}
        >
          <View style={styles.videoContainer}>
            <VideoView
              {...videoViewConfig}
              player={player}
              style={styles.video}
              contentFit={getContentFit()}
              ref={videoRef}
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded && status.positionMillis) {
                  setVideoPosition(status.positionMillis);
                }
              }}
            />
          </View>

          <View style={styles.overlayContainer} pointerEvents="box-none">
            {showBackButton && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={onBackPress}
              >
                <Ionicons
                  name="chevron-back"
                  size={30}
                  color={theme.colors.text.primary}
                />
              </TouchableOpacity>
            )}

            {(loading) && (
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
                  <Text style={styles.controlText}>
                    {likeCount > 0 ? likeCount.toString() : 'Like'}
                  </Text>
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

                <TouchableOpacity
                  style={[styles.controlButton, isAnalyzing && styles.controlButtonDisabled]}
                  onPress={handleAnalysisPress}
                  disabled={isAnalyzing}
                >
                  <Animated.View style={{
                    transform: [{
                      rotate: spinValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg']
                      })
                    }]
                  }}>
                    <Ionicons
                      name="sparkles-outline"
                      size={30}
                      color={theme.colors.text.primary}
                    />
                  </Animated.View>
                  <Text style={styles.controlText}>
                    AI
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bottomInfo}>
                <TouchableOpacity onPress={handleDescriptionPress} activeOpacity={0.7}>
                  <Text style={styles.title} numberOfLines={isDescriptionExpanded ? undefined : 1}>
                    {video.title}
                  </Text>
                  {video.description && (
                    <Text style={styles.description} numberOfLines={isDescriptionExpanded ? undefined : 1}>
                      {video.description}
                    </Text>
                  )}
                  {isDescriptionExpanded && renderHashtags()}
                </TouchableOpacity>
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
      </View>

      <AIAnalysisModal
        visible={showAIAnalysis}
        onClose={() => setShowAIAnalysis(false)}
        analysis={analysisResult}
        currentTime={videoPosition / 1000}
      />
    </>
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
    bottom: Platform.OS === 'ios' ? 160 : 140,
    alignItems: 'center',
    zIndex: 10,
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
    marginBottom: theme.spacing.sm,
  },
  hashtags: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  hashtag: {
    color: theme.colors.text.primary,
    fontWeight: '700',
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
  expandButton: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.sm,
    marginTop: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  controlTextDisabled: {
    color: theme.colors.text.secondary,
  },
  hashtagButton: {
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  hashtagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  hashtagText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});

export default VideoPlayer; 