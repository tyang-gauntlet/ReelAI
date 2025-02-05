import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, Dimensions, ActivityIndicator, ViewToken, StyleSheet } from 'react-native';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import { fetchVideosFromFirestore } from '../../services/videoService';
import { theme } from '../../styles/theme';

const { height: WINDOW_HEIGHT, width: WINDOW_WIDTH } = Dimensions.get('window');

export interface Video {
  id: string;
  title: string;
  description?: string;
  videoUrl?: string;
  storageUrl: string;
  thumbnailUrl?: string;
  storagePath?: string;
  likes: number;
  createdAt: Date;
  userId: string;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: {
    duration?: number;
    size?: number;
    contentType?: string;
  };
}

const VideoFeed: React.FC = () => {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const pageHeight = WINDOW_HEIGHT - insets.bottom - 60;

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
    <View style={[styles.pageContainer, { height: pageHeight }]}>
      <View style={styles.pageContent}>
        <VideoPlayer
          video={item}
          isVisible={index === visibleVideoIndex && isFocused}
        />
      </View>
    </View>
  ), [visibleVideoIndex, isFocused, pageHeight]);

  if (loading && videos.length === 0) {
    return (
      <View style={[styles.loadingContainer, { height: pageHeight }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.feedContainer, { height: pageHeight }]}>
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
            length: pageHeight,
            offset: pageHeight * index,
            index,
          })}
          snapToInterval={pageHeight}
          decelerationRate="fast"
          removeClippedSubviews={true}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          ListFooterComponent={loading && videos.length > 0 ? (
            <View style={[styles.footerContainer, { height: pageHeight }]}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
            </View>
          ) : null}
          style={styles.list}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  feedContainer: {
    width: WINDOW_WIDTH,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  list: {
    flex: 1,
  },
  pageContainer: {
    width: WINDOW_WIDTH,
    backgroundColor: '#000',
  },
  pageContent: {
    flex: 1,
    backgroundColor: '#000',
  },
  footerContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});

export default VideoFeed; 