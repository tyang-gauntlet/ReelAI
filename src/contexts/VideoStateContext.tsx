import React, { createContext, useContext, useState, useCallback } from 'react';
import { Video } from '../components/VideoFeed/VideoFeed';

interface VideoState {
  [videoId: string]: {
    likes: number;
    isLiked: boolean;
    isSaved: boolean;
  };
}

interface VideoStateContextType {
  videoStates: VideoState;
  updateVideoState: (videoId: string, updates: {
    likes?: number;
    isLiked?: boolean;
    isSaved?: boolean;
  }) => void;
  getVideoState: (videoId: string) => {
    likes: number;
    isLiked: boolean;
    isSaved: boolean;
  };
  initializeVideoState: (videos: Video[], likedIds?: string[], savedIds?: string[]) => void;
}

const VideoStateContext = createContext<VideoStateContextType | undefined>(undefined);

export const VideoStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [videoStates, setVideoStates] = useState<VideoState>({});

  const updateVideoState = useCallback((videoId: string, updates: {
    likes?: number;
    isLiked?: boolean;
    isSaved?: boolean;
  }) => {
    setVideoStates(prev => ({
      ...prev,
      [videoId]: {
        ...prev[videoId],
        ...updates,
      },
    }));
  }, []);

  const getVideoState = useCallback((videoId: string) => {
    return videoStates[videoId] || {
      likes: 0,
      isLiked: false,
      isSaved: false,
    };
  }, [videoStates]);

  const initializeVideoState = useCallback((videos: Video[], likedIds: string[] = [], savedIds: string[] = []) => {
    const newStates: VideoState = {};
    videos.forEach(video => {
      newStates[video.id] = {
        likes: video.likes,
        isLiked: likedIds.includes(video.id),
        isSaved: savedIds.includes(video.id),
      };
    });
    setVideoStates(prev => ({
      ...prev,
      ...newStates,
    }));
  }, []);

  return (
    <VideoStateContext.Provider value={{
      videoStates,
      updateVideoState,
      getVideoState,
      initializeVideoState,
    }}>
      {children}
    </VideoStateContext.Provider>
  );
};

export const useVideoState = () => {
  const context = useContext(VideoStateContext);
  if (!context) {
    throw new Error('useVideoState must be used within a VideoStateProvider');
  }
  return context;
}; 