import React, { createContext, useContext, useState, useCallback } from 'react';
import { Video } from '../components/VideoFeed/VideoFeed';

interface VideoPlayerCache {
  [videoId: string]: {
    position: number;
    isPlaying: boolean;
    lastUpdated: number;
  };
}

interface VideoPlayerCacheContextType {
  playerCache: VideoPlayerCache;
  updatePlayerCache: (videoId: string, updates: {
    position?: number;
    isPlaying?: boolean;
  }) => void;
  getPlayerCache: (videoId: string) => {
    position: number;
    isPlaying: boolean;
    lastUpdated: number;
  } | null;
  clearOldCache: () => void;
}

const MAX_CACHE_SIZE = 5;

const VideoPlayerCacheContext = createContext<VideoPlayerCacheContextType | undefined>(undefined);

export const VideoPlayerCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playerCache, setPlayerCache] = useState<VideoPlayerCache>({});

  const updatePlayerCache = useCallback((videoId: string, updates: {
    position?: number;
    isPlaying?: boolean;
  }) => {
    setPlayerCache(prev => {
      const newCache = { ...prev };
      newCache[videoId] = {
        ...newCache[videoId],
        ...updates,
        lastUpdated: Date.now(),
      };
      return newCache;
    });
  }, []);

  const getPlayerCache = useCallback((videoId: string) => {
    return playerCache[videoId] || null;
  }, [playerCache]);

  const clearOldCache = useCallback(() => {
    setPlayerCache(prev => {
      const entries = Object.entries(prev);
      if (entries.length <= MAX_CACHE_SIZE) return prev;

      // Sort by lastUpdated, newest first
      entries.sort((a, b) => b[1].lastUpdated - a[1].lastUpdated);

      // Keep only the MAX_CACHE_SIZE most recent entries
      const newCache: VideoPlayerCache = {};
      entries.slice(0, MAX_CACHE_SIZE).forEach(([id, data]) => {
        newCache[id] = data;
      });

      return newCache;
    });
  }, []);

  return (
    <VideoPlayerCacheContext.Provider value={{
      playerCache,
      updatePlayerCache,
      getPlayerCache,
      clearOldCache,
    }}>
      {children}
    </VideoPlayerCacheContext.Provider>
  );
};

export const useVideoPlayerCache = () => {
  const context = useContext(VideoPlayerCacheContext);
  if (context === undefined) {
    throw new Error('useVideoPlayerCache must be used within a VideoPlayerCacheProvider');
  }
  return context;
}; 