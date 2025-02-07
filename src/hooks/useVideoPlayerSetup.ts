import { useState, useEffect, useRef, useCallback } from 'react';
import { useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { Video } from '../components/VideoFeed/VideoFeed';

const VISIBILITY_DEBOUNCE_MS = 500;

interface VideoPlayerState {
  isPlaying: boolean;
  playbackStatus: string;
  loading: boolean;
  error: string | null;
  buffering: boolean;
  showBuffering: boolean;
  downloadProgress: number;
  initialLoad: boolean;
  playerReady: boolean;
  userPaused: boolean;
  videoDimensions: { width: number; height: number } | null;
}

export const useVideoPlayerSetup = (video: Video, isVisible: boolean) => {
  // Create player ref first
  const playerRef = useRef<ReturnType<typeof useVideoPlayer> | null>(null);
  const [player, setPlayer] = useState<ReturnType<typeof useVideoPlayer> | null>(null);
  const mountedRef = useRef(true);

  // State
  const [state, setState] = useState<VideoPlayerState>({
    isPlaying: false,
    playbackStatus: 'idle',
    loading: true,
    error: null,
    buffering: false,
    showBuffering: false,
    downloadProgress: 0,
    initialLoad: true,
    playerReady: false,
    userPaused: false,
    videoDimensions: null,
  });

  // Refs for cleanup
  const debouncedVisibilityRef = useRef<NodeJS.Timeout>();
  const playingChangeSubscriptionRef = useRef<any>(null);
  const statusChangeSubscriptionRef = useRef<any>(null);

  // Initialize player
  useEffect(() => {
    // Create new player instance
    const videoPlayer = useVideoPlayer({
      uri: '',
      metadata: { title: video.title },
    });

    playerRef.current = videoPlayer;
    setPlayer(videoPlayer);

    return () => {
      mountedRef.current = false;

      // Cleanup subscriptions
      if (playingChangeSubscriptionRef.current) {
        playingChangeSubscriptionRef.current.remove();
      }
      if (statusChangeSubscriptionRef.current) {
        statusChangeSubscriptionRef.current.remove();
      }

      // Try to cleanup player
      try {
        if (playerRef.current) {
          playerRef.current.pause();
          playerRef.current = null;
        }
      } catch (e) {
        console.log('Error cleaning up player:', e);
      }
    };
  }, [video.title]); // Only recreate if title changes

  // Update functions
  const updateState = useCallback((updates: Partial<VideoPlayerState>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  // Set up event listeners when player is available
  useEffect(() => {
    if (!player) return;

    try {
      playingChangeSubscriptionRef.current = player.addListener(
        'playingChange',
        (event: { isPlaying: boolean }) => {
          updateState({ isPlaying: event.isPlaying });
        },
      );

      statusChangeSubscriptionRef.current = player.addListener(
        'statusChange',
        (event: { status: string }) => {
          updateState({ playbackStatus: event.status });
        },
      );
    } catch (e) {
      console.log('Error setting up event listeners:', e);
    }

    return () => {
      try {
        if (playingChangeSubscriptionRef.current) {
          playingChangeSubscriptionRef.current.remove();
        }
        if (statusChangeSubscriptionRef.current) {
          statusChangeSubscriptionRef.current.remove();
        }
      } catch (e) {
        console.log('Error removing event listeners:', e);
      }
    };
  }, [player, updateState]);

  // Load video when player is ready
  useEffect(() => {
    if (!player || !mountedRef.current) return;

    const loadVideo = async () => {
      try {
        updateState({ loading: true, error: null, playerReady: false });

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

        if (mountedRef.current && player) {
          await player.replace({
            uri: localFileName,
            metadata: { title: video.title },
          });

          if (video.metadata?.width && video.metadata?.height) {
            updateState({
              videoDimensions: {
                width: video.metadata.width,
                height: video.metadata.height,
              },
            });
          }

          updateState({
            loading: false,
            initialLoad: false,
            playerReady: true,
          });
        }
      } catch (error) {
        console.error('Error loading video:', error);
        if (mountedRef.current) {
          updateState({
            error: 'Failed to load video',
            loading: false,
            initialLoad: false,
          });
        }
      }
    };

    loadVideo();
  }, [video.id, video.storagePath, video.title, video.metadata, player, updateState]);

  // Handle visibility changes
  useEffect(() => {
    if (!state.playerReady || !player) return;

    if (debouncedVisibilityRef.current) {
      clearTimeout(debouncedVisibilityRef.current);
    }

    debouncedVisibilityRef.current = setTimeout(() => {
      if (mountedRef.current && player) {
        try {
          if (!isVisible && state.isPlaying) {
            player.pause();
          } else if (isVisible && !state.isPlaying && !state.userPaused) {
            player.play();
          }
        } catch (e) {
          console.log('Error handling visibility change:', e);
        }
      }
    }, VISIBILITY_DEBOUNCE_MS);

    return () => {
      if (debouncedVisibilityRef.current) {
        clearTimeout(debouncedVisibilityRef.current);
      }
    };
  }, [isVisible, state.playerReady, state.isPlaying, state.userPaused, player]);

  const togglePlayPause = useCallback(async () => {
    if (!state.playerReady || !player) return;

    try {
      if (state.isPlaying) {
        await player.pause();
        updateState({ userPaused: true });
      } else {
        updateState({ userPaused: false });
        if (isVisible) {
          await player.play();
        }
      }
    } catch (err) {
      console.error('Error toggling playback:', err);
    }
  }, [state.playerReady, state.isPlaying, isVisible, player, updateState]);

  return {
    player,
    ...state,
    togglePlayPause,
  };
};
