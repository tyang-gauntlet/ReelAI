import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, FlatList, Dimensions, ActivityIndicator, ViewToken, StyleSheet, Text, TouchableOpacity, Platform, Animated, Image } from 'react-native';
import { QueryDocumentSnapshot, collection, query, where, orderBy, limit, getDocs, startAfter, doc, getDoc } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import { db } from '../../config/firebase';
import { theme } from '../../styles/theme';
import VideoCard from '../VideoCard/VideoCard';
import { useAuth } from '../../hooks/useAuth';
import { fetchVideosFromFirestore } from '../../services/videoService';

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
    width?: number;
    height?: number;
    fps?: number;
    hashtags?: string[];
    normalizedHashtags?: string[];
  };
}

interface VideoFeedProps {
  hashtagFilter?: string;
  isPersonalized?: boolean;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ hashtagFilter, isPersonalized = false }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const pageHeight = WINDOW_HEIGHT;

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [visibleVideoIndex, setVisibleVideoIndex] = useState<number>(0);
  const [followedHashtags, setFollowedHashtags] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const fetchedVideoIds = useRef(new Set<string>());
  const fetchDebounceTimeout = useRef<NodeJS.Timeout>();
  const isInitialLoad = useRef(true);
  const [endReached, setEndReached] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollViewRef = useRef(null);
  const [preloadedVideos] = useState(() => new Set<string>());
  const lastVisibleIndex = useRef<number>(0);

  const MAX_VIDEOS_IN_MEMORY = 10;
  const MAX_CACHED_IDS = 50;

  const fetchUserHashtags = useCallback(async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        setFollowedHashtags(userDocSnap.data()?.followedHashtags || []);
      }
    } catch (error) {
      console.error('Error fetching user hashtags:', error);
    }
  }, [user]);

  const fetchPersonalizedVideos = useCallback(async () => {
    if (!user || followedHashtags.length === 0) {
      // Fetch all videos and randomly select from them
      const videosRef = collection(db, 'videos');
      let q = query(
        videosRef,
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      const querySnapshot = await getDocs(q);
      const allVideos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Video[];

      // Randomly shuffle the videos
      const shuffledVideos = [...allVideos].sort(() => Math.random() - 0.5);

      // Take first 3 videos
      const fetchedVideos = shuffledVideos.slice(0, 3);

      return {
        videos: fetchedVideos,
        lastDoc: null,
        hasMore: true,
      };
    }

    // For personalized feed, fetch videos with matching hashtags
    const videosRef = collection(db, 'videos');
    let q = query(
      videosRef,
      where('metadata.normalizedHashtags', 'array-contains-any', followedHashtags),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const querySnapshot = await getDocs(q);
    const videos = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Video[];

    // Score and sort videos based on hashtag matches
    const scoredVideos = videos.map(video => {
      const matchingTags = (video.metadata?.normalizedHashtags || []).filter(tag =>
        followedHashtags.includes(tag)
      );
      return {
        ...video,
        score: matchingTags.length,
      };
    });

    // Sort by score (descending) and then randomly within same scores
    scoredVideos.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.random() - 0.5;
    });

    // Take top 3 videos
    const selectedVideos = scoredVideos.slice(0, 3);

    return {
      videos: selectedVideos,
      lastDoc: null,
      hasMore: true,
    };
  }, [user, followedHashtags]);

  const fetchVideos = useCallback(async (lastDocument?: QueryDocumentSnapshot) => {
    // Don't fetch if we're already fetching, unless it's the initial load
    if (isFetching && !isInitialLoad.current) {
      console.log('Skipping fetch - already fetching');
      return;
    }

    try {
      setIsFetching(true);
      console.log('Starting video fetch:', {
        isInitialLoad: isInitialLoad.current,
        hashtagFilter,
        isPersonalized
      });

      let result;
      if (isPersonalized) {
        result = await fetchPersonalizedVideos();
      } else {
        // Fetch videos based on hashtag filter if provided
        const videosRef = collection(db, 'videos');
        let q;

        if (hashtagFilter) {
          // Remove '#' if present and convert to lowercase for normalized search
          const normalizedHashtag = hashtagFilter.replace('#', '').toLowerCase().trim();
          console.log('Searching for hashtag:', {
            original: hashtagFilter,
            normalized: normalizedHashtag
          });

          // First, let's get all videos to check their structure
          const debugQuery = query(
            videosRef,
            orderBy('createdAt', 'desc'),
            limit(5)
          );

          const debugSnapshot = await getDocs(debugQuery);
          console.log('Debug: First few videos structure:',
            debugSnapshot.docs.map(doc => ({
              id: doc.id,
              metadata: doc.data().metadata,
              hashtags: doc.data().metadata?.hashtags,
              normalizedHashtags: doc.data().metadata?.normalizedHashtags
            }))
          );

          // Try multiple variations of the hashtag
          const hashtagVariations = [
            normalizedHashtag,
            '#' + normalizedHashtag,
            normalizedHashtag.toLowerCase(),
            '#' + normalizedHashtag.toLowerCase(),
            hashtagFilter,
            hashtagFilter.toLowerCase()
          ];

          console.log('Trying hashtag variations:', hashtagVariations);

          // Query with all variations
          q = query(
            videosRef,
            where('metadata.hashtags', 'array-contains-any', hashtagVariations),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
        } else {
          q = query(
            videosRef,
            orderBy('createdAt', 'desc'),
            limit(50)
          );
        }

        const querySnapshot = await getDocs(q);
        const allVideos = querySnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Video[];

        console.log('Query results:', {
          totalVideos: allVideos.length,
          hashtags: allVideos.map(v => v.metadata?.normalizedHashtags),
          hashtagFilter
        });

        // Filter completed videos after fetching
        const completedVideos = allVideos.filter(video => video.processingStatus === 'completed');

        if (completedVideos.length === 0) {
          console.log('No completed videos found');
          setIsFetching(false);
          return;
        }

        // For hashtag filtered videos, we don't need to shuffle
        const fetchedVideos = hashtagFilter
          ? completedVideos
          : [...completedVideos].sort(() => Math.random() - 0.5).slice(0, 4);

        result = {
          videos: fetchedVideos,
          lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
          hasMore: querySnapshot.docs.length === 50,
        };
      }

      // Filter out videos we've already seen
      const newVideos = result.videos.filter(
        newVideo => !fetchedVideoIds.current.has(newVideo.id)
      );

      console.log('Filtered videos:', {
        totalVideos: result.videos.length,
        newVideos: newVideos.length,
        seenVideos: fetchedVideoIds.current.size,
      });

      // If we got no new videos, clear the cache and try again
      if (newVideos.length === 0) {
        console.log('No new videos, clearing cache and retrying');
        fetchedVideoIds.current.clear();
        setVideos([]); // Clear all videos to prevent duplicates
        setIsFetching(false);
        setTimeout(() => fetchVideos(), 0);
        return;
      }

      // Update our set of seen videos, maintaining maximum cache size
      newVideos.forEach(video => {
        if (fetchedVideoIds.current.size >= MAX_CACHED_IDS) {
          const oldestId = Array.from(fetchedVideoIds.current)[0];
          fetchedVideoIds.current.delete(oldestId);
        }
        fetchedVideoIds.current.add(video.id);
      });

      // Update videos list, maintaining maximum size
      setVideos(prev => {
        const updatedVideos = [...prev, ...newVideos];
        if (updatedVideos.length > MAX_VIDEOS_IN_MEMORY) {
          // Keep only the most recent videos
          return updatedVideos.slice(-MAX_VIDEOS_IN_MEMORY);
        }
        return updatedVideos;
      });

      console.log('Videos loaded successfully:', {
        count: result.videos.length,
        newVideosCount: newVideos.length,
        totalFetchedIds: fetchedVideoIds.current.size,
        totalVideosInMemory: videos.length,
        isPersonalized,
        followedHashtagsCount: followedHashtags.length,
      });
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      if (isInitialLoad.current) {
        setLoading(false);
        isInitialLoad.current = false;
      }
      setIsFetching(false);
    }
  }, [isPersonalized, followedHashtags, fetchPersonalizedVideos, videos.length, hashtagFilter]);

  useEffect(() => {
    if (isPersonalized) {
      fetchUserHashtags();
    }
  }, [isPersonalized, fetchUserHashtags]);

  useEffect(() => {
    // Reset states when filter or personalization changes
    isInitialLoad.current = true;
    setIsFetching(false);
    setLoading(true);
    setEndReached(false);
    fetchedVideoIds.current.clear();
    setLastDoc(null);
    setVideos([]);
    fetchVideos();

    // Cleanup function
    return () => {
      isInitialLoad.current = true;
      setEndReached(false);
      fetchedVideoIds.current.clear();
      if (fetchDebounceTimeout.current) {
        clearTimeout(fetchDebounceTimeout.current);
      }
    };
  }, [hashtagFilter, isPersonalized]);

  const loadMore = useCallback(() => {
    // Don't load more if we're in initial load or already fetching
    if (isInitialLoad.current || isFetching) {
      console.log('Skipping loadMore:', {
        isInitialLoad: isInitialLoad.current,
        isFetching,
      });
      return;
    }

    // Don't load more if we have less than 4 videos and we're in hashtag mode
    if (hashtagFilter && videos.length < 4) {
      console.log('Skipping loadMore: Not enough videos in hashtag mode');
      return;
    }

    // Clear any existing timeout
    if (fetchDebounceTimeout.current) {
      clearTimeout(fetchDebounceTimeout.current);
    }

    console.log('Scheduling loadMore');
    // Debounce the fetch call
    fetchDebounceTimeout.current = setTimeout(() => {
      if (!isFetching) {
        console.log('Executing loadMore');
        fetchVideos();
      } else {
        console.log('Skipping scheduled loadMore - already fetching');
      }
    }, 300);
  }, [isFetching, fetchVideos, videos.length, hashtagFilter]);

  // Reset end reached when videos change
  useEffect(() => {
    if (videos.length === 0) {
      setEndReached(false);
    }
  }, [videos]);

  const onScrollBeginDrag = useCallback(() => {
    setIsScrolling(true);
  }, []);

  const onScrollEndDrag = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 150); // Small delay to ensure scroll has settled
  }, []);

  const trackPreloadedVideo = useCallback((videoId: string) => {
    preloadedVideos.add(videoId);
  }, [preloadedVideos]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const visibleItem = viewableItems[0];
      const newIndex = visibleItem.index ?? 0;

      // Only update visible index if we're not actively scrolling
      if (!isScrolling) {
        setVisibleVideoIndex(newIndex);
        lastVisibleIndex.current = newIndex;
      }

      // Only try to load more if we're not in hashtag mode or we have at least 4 videos
      if ((!hashtagFilter || videos.length >= 4) && newIndex >= videos.length - 2 && !isFetching) {
        console.log('Preemptively loading more videos');
        loadMore();
      }
    }
  }, [videos, isScrolling, isFetching, loadMore, hashtagFilter]);

  const handleHashtagPress = (hashtag: string) => {
    // Ensure hashtag has '#' prefix
    const formattedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
    navigation.navigate('Hashtag', { tag: formattedHashtag });
  };

  const renderHashtags = (hashtags?: string[]) => {
    if (!hashtags || hashtags.length === 0) {
      return null;
    }

    return (
      <View style={styles.hashtagsContainer}>
        <Text style={styles.hashtagText}>
          {hashtags.map((hashtag, index) => (
            <Text
              key={index}
              onPress={() => handleHashtagPress(hashtag)}
              style={styles.hashtagText}
            >
              #{hashtag}{' '}
            </Text>
          ))}
        </Text>
      </View>
    );
  };

  const renderItem = useCallback(({ item, index }: { item: Video; index: number }) => {
    console.log('Rendering video item:', {
      index,
      videoId: item.id,
      isVisible: index === visibleVideoIndex,
      isFocused,
      totalVideos: videos.length,
      isPreloaded: preloadedVideos.has(item.id)
    });

    // Increase the preload window to load more videos in advance
    const shouldRender = Math.abs(index - visibleVideoIndex) <= 3;
    // Consider videos within 1 position of current as "visible" to trigger preloading
    const isNearVisible = Math.abs(index - visibleVideoIndex) <= 1;
    const isActive = index === visibleVideoIndex && isFocused && !isScrolling;

    // Track this video as preloaded if it's being rendered
    if (shouldRender && !preloadedVideos.has(item.id)) {
      trackPreloadedVideo(item.id);
    }

    return (
      <View style={[styles.pageContainer, { height: pageHeight }]}>
        <View style={styles.pageContent}>
          {shouldRender ? (
            <VideoPlayer
              key={`${item.id}`}
              video={item}
              isVisible={isActive || isNearVisible}
              onHashtagPress={handleHashtagPress}
            />
          ) : (
            <View style={styles.placeholderContainer}>
              <View style={styles.placeholderBackground} />
            </View>
          )}
        </View>
      </View>
    );
  }, [visibleVideoIndex, isFocused, pageHeight, handleHashtagPress, videos.length, isScrolling, preloadedVideos, trackPreloadedVideo]);

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
          ref={scrollViewRef}
          data={videos}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={1}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollBegin={() => setIsScrolling(true)}
          onMomentumScrollEnd={() => setTimeout(() => setIsScrolling(false), 150)}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 50,
            minimumViewTime: 100,
          }}
          getItemLayout={(data, index) => ({
            length: pageHeight,
            offset: pageHeight * index,
            index,
          })}
          snapToInterval={pageHeight}
          decelerationRate={Platform.OS === 'ios' ? 0.992 : 0.98}
          removeClippedSubviews={false}
          initialNumToRender={6} // Increased from 4 to 6
          maxToRenderPerBatch={6} // Increased from 4 to 6
          windowSize={9} // Increased from 7 to 9
          updateCellsBatchingPeriod={50} // Decreased from 100 to 50
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 3,
          }}
          ListFooterComponent={
            isFetching ? (
              <View style={[styles.quietLoadingContainer]}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
              </View>
            ) : null
          }
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
  footerLoadingContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingVertical: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  hashtagsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 180 : 160,
    left: 0,
    right: 0,
    padding: theme.spacing.md,
    paddingRight: theme.spacing.xl * 3,
    zIndex: 11,
  },
  hashtagText: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  loadingText: {
    color: theme.colors.text.primary,
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  placeholderContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
  },
  quietLoadingContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
    zIndex: 100,
  },
});

export default VideoFeed; 