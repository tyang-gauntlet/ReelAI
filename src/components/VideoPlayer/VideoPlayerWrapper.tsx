import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoPlayer } from 'expo-video';
import { Video } from '../VideoFeed/VideoFeed';
import * as FileSystem from 'expo-file-system';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { useVideoPlayerCache } from '../../contexts/VideoPlayerCacheContext';

// Static cache for URIs only
const videoUriCache: { [key: string]: string } = {};
const loadingPromises: { [key: string]: Promise<string> | undefined } = {};

// Preload function that can be called from outside
export const preloadVideo = async (video: Video): Promise<string> => {
  if (videoUriCache[video.id]) return videoUriCache[video.id];

  const existingPromise = loadingPromises[video.id];
  if (existingPromise) return existingPromise;

  const loadPromise = (async () => {
    try {
      if (!video.storagePath) {
        throw new Error('No storage path available for video');
      }

      const storage = getStorage();
      const videoRef = ref(storage, video.storagePath);
      const storageUrl = await getDownloadURL(videoRef);
      const localUri = `${FileSystem.cacheDirectory}video-${video.id}.mp4`;

      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        await FileSystem.downloadAsync(storageUrl, localUri);
      }

      videoUriCache[video.id] = localUri;
      return localUri;
    } catch (error) {
      console.error(`[${video.id}] Error preloading video:`, error);
      throw error;
    } finally {
      delete loadingPromises[video.id];
    }
  })();

  loadingPromises[video.id] = loadPromise;
  return loadPromise;
};

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
  videoUri: string | null;
}

interface VideoPlayerWrapperProps {
  video: Video;
  isVisible: boolean;
  autoPlay?: boolean;
  children: (props: {
    player: ReturnType<typeof useVideoPlayer>;
    state: VideoPlayerState;
    togglePlayPause: () => Promise<void>;
  }) => React.ReactNode;
}

export const VideoPlayerWrapper: React.FC<VideoPlayerWrapperProps> = ({
  video,
  isVisible,
  autoPlay = false,
  children
}) => {
  const { getPlayerCache, updatePlayerCache, clearOldCache } = useVideoPlayerCache();
  const player = useVideoPlayer({
    uri: videoUriCache[video.id] || '',
    metadata: { title: video.title },
    shouldPlay: isVisible && autoPlay,
  });

  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const positionUpdateInterval = useRef<NodeJS.Timeout>();
  const playAttemptTimeout = useRef<NodeJS.Timeout>();

  const [state, setState] = useState<VideoPlayerState>({
    isPlaying: false,
    playbackStatus: 'idle',
    loading: !videoUriCache[video.id],
    error: null,
    buffering: false,
    showBuffering: false,
    downloadProgress: 0,
    initialLoad: true,
    playerReady: !!videoUriCache[video.id],
    userPaused: false,
    videoDimensions: null,
    videoUri: videoUriCache[video.id] || null,
  });

  const updateState = useCallback((updates: Partial<VideoPlayerState>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const attemptPlay = useCallback(() => {
    if (!state.playerReady) {
      console.log(`[Wrapper] Video ${video.id} not ready to play yet`);
      return;
    }

    console.log(`[Wrapper] Attempting to play video ${video.id}`);
    try {
      player.play();
      console.log(`[Wrapper] Play command sent for video ${video.id}`);
    } catch (error) {
      console.error(`[Wrapper] Error playing video ${video.id}:`, error);
      // Retry after a short delay
      if (playAttemptTimeout.current) {
        clearTimeout(playAttemptTimeout.current);
      }
      playAttemptTimeout.current = setTimeout(attemptPlay, 500);
    }
  }, [state.playerReady, video.id, player]);

  // Load video if needed
  useEffect(() => {
    if (hasLoadedRef.current) return;

    const loadVideo = async () => {
      try {
        console.log(`[Wrapper] Loading video ${video.id}`);
        if (!videoUriCache[video.id]) {
          const localUri = await preloadVideo(video);
          if (mountedRef.current) {
            console.log(`[Wrapper] Replacing video source for ${video.id}`);
            await player.replace({
              uri: localUri,
              metadata: { title: video.title },
              shouldPlay: isVisible && autoPlay,
            });

            updateState({
              videoUri: localUri,
              loading: false,
              playerReady: true,
            });

            if (isVisible && autoPlay) {
              console.log(`[Wrapper] Auto-playing after load for ${video.id}`);
              attemptPlay();
            }
          }
        }
        hasLoadedRef.current = true;
      } catch (error) {
        console.error(`[Wrapper] Error loading video ${video.id}:`, error);
        updateState({ error: String(error), loading: false });
      }
    };

    loadVideo();
  }, [video.id, isVisible, autoPlay, attemptPlay]);

  // Handle visibility and auto-play
  useEffect(() => {
    if (!state.playerReady) {
      console.log(`[Wrapper] Video ${video.id} not ready for visibility change`);
      return;
    }

    console.log(`[Wrapper] Visibility changed for ${video.id}: visible=${isVisible}, autoPlay=${autoPlay}`);
    if (isVisible && autoPlay) {
      attemptPlay();
    } else {
      console.log(`[Wrapper] Pausing video ${video.id}`);
      player.pause();
    }
  }, [isVisible, autoPlay, state.playerReady, attemptPlay, video.id]);

  // Cache position periodically when playing
  useEffect(() => {
    if (!state.playerReady || !isVisible) return;

    const updatePosition = async () => {
      try {
        // Since we can't get the exact position, we'll just track play state
        updatePlayerCache(video.id, {
          position: 0, // We'll just use this as a flag
          isPlaying: state.isPlaying
        });
      } catch (error) {
        console.error('Error updating position cache:', error);
      }
    };

    // Clear old interval if exists
    if (positionUpdateInterval.current) {
      clearInterval(positionUpdateInterval.current);
    }

    // Start new interval if playing
    if (state.isPlaying) {
      positionUpdateInterval.current = setInterval(updatePosition, 1000);
      clearOldCache(); // Clean up old cache entries
    }

    return () => {
      if (positionUpdateInterval.current) {
        clearInterval(positionUpdateInterval.current);
      }
    };
  }, [state.isPlaying, state.playerReady, isVisible, video.id]);

  // Handle events
  useEffect(() => {
    const playingChangeSubscription = player.addListener('playingChange',
      (event: { isPlaying: boolean }) => {
        updateState({ isPlaying: event.isPlaying });
        updatePlayerCache(video.id, { isPlaying: event.isPlaying });
      }
    );

    const statusChangeSubscription = player.addListener('statusChange',
      (event: { status: string }) => {
        updateState({ playbackStatus: event.status });
        if (event.status === 'completed' && isVisible && !state.userPaused) {
          player.play();
        }
      }
    );

    return () => {
      playingChangeSubscription.remove();
      statusChangeSubscription.remove();
    };
  }, [isVisible, state.userPaused]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (positionUpdateInterval.current) {
        clearInterval(positionUpdateInterval.current);
      }
      if (playAttemptTimeout.current) {
        clearTimeout(playAttemptTimeout.current);
      }
    };
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!state.playerReady) return;

    try {
      if (state.isPlaying) {
        player.pause();
        updateState({ userPaused: true });
      } else {
        updateState({ userPaused: false });
        if (isVisible) {
          player.play();
        }
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  }, [state.isPlaying, state.playerReady, isVisible]);

  return children({
    player,
    state,
    togglePlayPause,
  });
}; 