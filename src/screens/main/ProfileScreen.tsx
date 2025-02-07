import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, Image, Dimensions, ActivityIndicator, Modal, PanResponder, ScrollView } from 'react-native';
import { SafeScreen } from '../../components/layout/SafeScreen';
import { useAuth } from '../../hooks/useAuth';
import { theme } from '../../styles/theme';
import { Ionicons } from '@expo/vector-icons';
import { getSavedVideos } from '../../services/saveVideoService';
import { getLikedVideos } from '../../services/interactionService';
import { Video } from '../../components/VideoFeed/VideoFeed';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { generateThumbnailsForExistingVideos } from '../../services/videoService';
import { useVideoList } from '../../contexts/VideoListContext';
import { useNavigation, CompositeNavigationProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainStackParamList, RootStackParamList } from '../../navigation/types';
import VideoPlayer from '../../components/VideoPlayer/VideoPlayer';
import { useVideoState } from '../../contexts/VideoStateContext';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainStackParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type TabType = 'liked' | 'saved';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_WIDTH = (SCREEN_WIDTH - theme.spacing.lg * 4) / 2;
const VIDEO_HEIGHT = VIDEO_WIDTH * 1.3;

const VideoItem = React.memo(({
  video,
  onPress,
  thumbnails,
  loadingThumbnails,
  onLoadThumbnail,
  onThumbnailError
}: {
  video: Video;
  onPress: (video: Video) => void;
  thumbnails: { [key: string]: string };
  loadingThumbnails: { [key: string]: boolean };
  onLoadThumbnail: (video: Video) => void;
  onThumbnailError: (videoId: string) => void;
}) => {
  useEffect(() => {
    onLoadThumbnail(video);
  }, [video, onLoadThumbnail]);

  return (
    <TouchableOpacity
      style={styles.videoThumbnail}
      onPress={() => onPress(video)}
    >
      <View style={styles.thumbnailContainer}>
        {thumbnails[video.id] ? (
          <View>
            <Image
              source={{ uri: thumbnails[video.id] }}
              style={styles.thumbnail}
              resizeMode="cover"
              onError={() => onThumbnailError(video.id)}
            />
            <View style={styles.playIconOverlay}>
              <Ionicons name="play-circle" size={30} color="white" />
            </View>
          </View>
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.placeholderContent}>
              <Ionicons name="videocam" size={30} color={theme.colors.text.secondary} />
              <View style={styles.placeholderTextContainer}>
                <Text style={styles.placeholderTitle} numberOfLines={1}>
                  {video.title}
                </Text>
                <Text style={styles.placeholderText}>
                  {loadingThumbnails[video.id] ? 'Loading...' : 'Preview not available'}
                </Text>
              </View>
            </View>
          </View>
        )}
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={1}>
            {video.title}
          </Text>
          <View style={styles.statsRow}>
            <Ionicons name="heart" size={12} color={theme.colors.like} style={styles.statsIcon} />
            <Text style={styles.videoStats}>
              {video.likes} likes
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout } = useAuth();
  const { refreshTrigger } = useVideoList();
  const { videoStates, initializeVideoState, getVideoState } = useVideoState();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<TabType>('liked');
  const [likedVideos, setLikedVideos] = useState<Video[]>([]);
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<{ [key: string]: string }>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<{ [key: string]: boolean }>({});
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const dy = Math.abs(gestureState.dy);
        const dx = Math.abs(gestureState.dx);
        return dy > dx && dy > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 100) {
          handleCloseVideo();
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50 && Math.abs(gestureState.vy) > 0.5) {
          handleCloseVideo();
        }
      },
    })
  ).current;

  useEffect(() => {
    const fetchVideos = async () => {
      if (!user || !isFocused) return;

      try {
        setLoading(true);
        const [liked, saved] = await Promise.all([
          getLikedVideos(user.uid),
          getSavedVideos(user.uid)
        ]);

        // Initialize video states with liked and saved status
        initializeVideoState(
          [...liked, ...saved],
          liked.map(v => v.id),
          saved.map(v => v.id)
        );

        setLikedVideos(liked);
        setSavedVideos(saved);
      } catch (error) {
        console.error('Error fetching videos:', error);
        Alert.alert('Error', 'Failed to load videos');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [user, refreshTrigger, isFocused, initializeVideoState]);

  const loadThumbnail = async (video: Video) => {
    if (
      thumbnails[video.id] ||
      loadingThumbnails[video.id] ||
      failedThumbnails.has(video.id)
    ) return;

    try {
      setLoadingThumbnails(prev => ({ ...prev, [video.id]: true }));
      const storage = getStorage();
      const thumbPath = `thumbnails/${video.id}.jpg`;
      const thumbRef = ref(storage, thumbPath);
      const url = await getDownloadURL(thumbRef);
      setThumbnails(prev => ({ ...prev, [video.id]: url }));
    } catch (error) {
      console.error('Error loading thumbnail:', video.id, error);
      setFailedThumbnails(prev => new Set(prev).add(video.id));
    } finally {
      setLoadingThumbnails(prev => ({ ...prev, [video.id]: false }));
    }
  };

  // Reset failed thumbnails when changing tabs or refreshing
  useEffect(() => {
    setFailedThumbnails(new Set());
  }, [refreshTrigger]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  const handleVideoPress = (video: Video) => {
    setSelectedVideo(video);
  };

  const handleVideoUpdate = (videoId: string, updates: { liked?: boolean; saved?: boolean }) => {
    // Update liked videos
    setLikedVideos(prev => prev.map(v => {
      if (v.id === videoId) {
        return {
          ...v,
          likes: v.likes + (updates.liked ? 1 : -1)
        };
      }
      return v;
    }));

    // Update saved videos
    setSavedVideos(prev => {
      if (updates.saved === undefined) return prev;
      if (updates.saved) {
        // Add to saved if not already there
        if (!prev.find(v => v.id === videoId)) {
          const video = likedVideos.find(v => v.id === videoId);
          if (video) return [...prev, video];
        }
      } else {
        // Remove from saved
        return prev.filter(v => v.id !== videoId);
      }
      return prev;
    });
  };

  const handleCloseVideo = async () => {
    setSelectedVideo(null);
    // Refresh videos when modal is closed to ensure we have the latest state
    if (user) {
      try {
        setLoading(true);
        if (activeTab === 'liked') {
          const videos = await getLikedVideos(user.uid);
          setLikedVideos(videos);
        } else {
          const videos = await getSavedVideos(user.uid);
          setSavedVideos(videos);
        }
      } catch (error) {
        console.error('Error refreshing videos:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleThumbnailError = (videoId: string) => {
    setThumbnails(prev => {
      const newThumbnails = { ...prev };
      delete newThumbnails[videoId];
      return newThumbnails;
    });
  };

  const handleTabPress = (tab: TabType) => {
    setActiveTab(tab);
    // Scroll to the appropriate page when tab is pressed
    scrollViewRef.current?.scrollTo({
      x: tab === 'liked' ? 0 : SCREEN_WIDTH,
      animated: true
    });
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (offsetX >= SCREEN_WIDTH / 2 && activeTab !== 'saved') {
      setActiveTab('saved');
    } else if (offsetX < SCREEN_WIDTH / 2 && activeTab !== 'liked') {
      setActiveTab('liked');
    }
  };

  const renderVideoItem = ({ item: video }: { item: Video }) => {
    const state = getVideoState(video.id);
    const updatedVideo = {
      ...video,
      likes: state.likes || video.likes,
    };

    return (
      <VideoItem
        video={updatedVideo}
        onPress={handleVideoPress}
        thumbnails={thumbnails}
        loadingThumbnails={loadingThumbnails}
        onLoadThumbnail={loadThumbnail}
        onThumbnailError={handleThumbnailError}
      />
    );
  };

  const renderTabContent = (tabType: TabType) => {
    const videos = tabType === 'liked'
      ? likedVideos.filter(v => getVideoState(v.id).isLiked)
      : savedVideos.filter(v => getVideoState(v.id).isSaved);

    if (videos.length === 0) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>
            No {tabType} videos yet
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={videos}
        renderItem={renderVideoItem}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={true}
      />
    );
  };

  if (loading) {
    return (
      <SafeScreen backgroundColor={theme.colors.background}>
        <View style={styles.container}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen backgroundColor={theme.colors.background}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
        </TouchableOpacity>

        <View style={styles.profileContent}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person-circle-outline" size={80} color={theme.colors.accent} />
          </View>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'liked' && styles.activeTab]}
            onPress={() => handleTabPress('liked')}
          >
            <Ionicons
              name="heart"
              size={20}
              color={activeTab === 'liked' ? theme.colors.accent : theme.colors.text.secondary}
            />
            <Text style={[
              styles.tabText,
              activeTab === 'liked' && styles.activeTabText
            ]}>Liked</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'saved' && styles.activeTab]}
            onPress={() => handleTabPress('saved')}
          >
            <Ionicons
              name="bookmark"
              size={20}
              color={activeTab === 'saved' ? theme.colors.accent : theme.colors.text.secondary}
            />
            <Text style={[
              styles.tabText,
              activeTab === 'saved' && styles.activeTabText
            ]}>Saved</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
        >
          <View style={styles.page}>
            {renderTabContent('liked')}
          </View>
          <View style={styles.page}>
            {renderTabContent('saved')}
          </View>
        </ScrollView>

        <Modal
          visible={selectedVideo !== null}
          animationType="fade"
          transparent={true}
          onRequestClose={handleCloseVideo}
        >
          <View
            style={styles.modalContainer}
            {...panResponder.panHandlers}
          >
            {selectedVideo && (
              <VideoPlayer
                video={selectedVideo}
                isVisible={true}
                onVideoUpdate={handleVideoUpdate}
              />
            )}
          </View>
        </Modal>
      </View>
    </SafeScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  logoutButton: {
    position: 'absolute',
    top: theme.spacing.lg,
    right: theme.spacing.lg,
    zIndex: 1,
    padding: theme.spacing.sm,
  },
  profileContent: {
    alignItems: 'center',
    marginTop: '15%',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  email: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    marginTop: theme.spacing.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginTop: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
  },
  tabText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  activeTabText: {
    color: theme.colors.accent,
  },
  contentContainer: {
    flex: 1,
    marginTop: theme.spacing.lg,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.spacing.xl * 2,
  },
  emptyText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.md,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
  },
  listContent: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  videoThumbnail: {
    width: VIDEO_WIDTH,
    marginBottom: theme.spacing.lg,
  },
  thumbnailContainer: {
    position: 'relative',
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  thumbnail: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    borderRadius: theme.borderRadius.md,
  },
  thumbnailPlaceholder: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  placeholderContent: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  placeholderTextContainer: {
    alignItems: 'center',
  },
  placeholderTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    textAlign: 'center',
  },
  placeholderText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.xs,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  videoInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
  },
  videoTitle: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  videoStats: {
    color: theme.colors.text.secondary,
    fontSize: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playIconOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -15 }, { translateY: -15 }],
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 15,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  page: {
    width: SCREEN_WIDTH - theme.spacing.lg * 2,
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsIcon: {
    marginRight: 4,
  },
}); 