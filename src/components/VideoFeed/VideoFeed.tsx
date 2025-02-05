import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, Dimensions, ActivityIndicator, ViewToken, StyleSheet } from 'react-native';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import { fetchVideosFromFirestore } from '../../services/videoService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  storagePath?: string;
  thumbnailUrl: string;
  likes: number;
  views: number;
  createdAt: Date;
}

const VideoFeed: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [visibleVideoIndex, setVisibleVideoIndex] = useState<number>(0);

  const fetchVideos = useCallback(async (lastDocument?: QueryDocumentSnapshot) => {
    try {
      const result = await fetchVideosFromFirestore(lastDocument);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);

      if (lastDocument) {
        setVideos(prev => [...prev, ...result.videos]);
      } else {
        setVideos(result.videos);
      }

      console.log('Videos loaded:', {
        count: result.videos.length,
        hasStoragePath: result.videos.filter(v => v.storagePath).length,
      });
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const loadMore = () => {
    if (!hasMore || loading || !lastDoc) return;
    fetchVideos(lastDoc);
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const visibleItem = viewableItems[0];
      setVisibleVideoIndex(visibleItem.index ?? 0);
      console.log('Video visibility changed:', {
        index: visibleItem.index,
        videoId: videos[visibleItem.index ?? 0]?.id,
        isViewable: visibleItem.isViewable,
      });
    }
  }, [videos]);

  const renderItem = useCallback(({ item, index }: { item: Video; index: number }) => (
    <View style={styles.videoContainer}>
      <VideoPlayer
        video={item}
        isVisible={index === visibleVideoIndex}
      />
    </View>
  ), [visibleVideoIndex]);

  if (loading && videos.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{
        itemVisiblePercentThreshold: 50,
        minimumViewTime: 0,
      }}
      getItemLayout={(data, index) => ({
        length: SCREEN_HEIGHT,
        offset: SCREEN_HEIGHT * index,
        index,
      })}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={5}
      ListFooterComponent={loading && videos.length > 0 ? (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      ) : null}
    />
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  videoContainer: {
    width: '100%',
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  footerContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});

export default VideoFeed; 