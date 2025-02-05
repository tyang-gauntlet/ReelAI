import React, { createContext, useContext, useState, useCallback } from 'react';

interface VideoListContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const VideoListContext = createContext<VideoListContextType | undefined>(undefined);

export const VideoListProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <VideoListContext.Provider value={{ refreshTrigger, triggerRefresh }}>
      {children}
    </VideoListContext.Provider>
  );
};

export const useVideoList = () => {
  const context = useContext(VideoListContext);
  if (!context) {
    throw new Error('useVideoList must be used within a VideoListProvider');
  }
  return context;
}; 