import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, Image, Dimensions, ActivityIndicator, Modal } from 'react-native';
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
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainStackParamList, RootStackParamList } from '../../navigation/types';
import VideoPlayer from '../../components/VideoPlayer/VideoPlayer';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainStackParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type TabType = 'liked' | 'saved';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_WIDTH = (SCREEN_WIDTH - theme.spacing.lg * 3) / 2;
const VIDEO_HEIGHT = VIDEO_WIDTH * 1.5;

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
              <Ionicons name="play-circle" size={40} color="white" />
            </View>
          </View>
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.placeholderContent}>
              <Ionicons name="videocam" size={40} color={theme.colors.text.secondary} />
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
          <Text style={styles.videoStats}>
            {video.likes} likes
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout } = useAuth();
  const { refreshTrigger } = useVideoList();
  const [activeTab, setActiveTab] = useState<TabType>('liked');
  const [likedVideos, setLikedVideos] = useState<Video[]>([]);
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<{ [key: string]: string }>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<{ [key: string]: boolean }>({});
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    const fetchVideos = async () => {
      if (!user) return;

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
        console.error('Error fetching videos:', error);
        Alert.alert('Error', 'Failed to load videos');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [user, activeTab, refreshTrigger]);

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
  }, [activeTab, refreshTrigger]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  const handleGenerateThumbnails = async () => {
    try {
      setLoading(true);
      await generateThumbnailsForExistingVideos();
      // Refresh the videos to show new thumbnails
      if (activeTab === 'liked') {
        const videos = await getLikedVideos(user!.uid);
        setLikedVideos(videos);
      } else {
        const videos = await getSavedVideos(user!.uid);
        setSavedVideos(videos);
      }
    } catch (error) {
      console.error('Error generating thumbnails:', error);
      Alert.alert('Error', 'Failed to generate thumbnails');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoPress = (video: Video) => {
    setSelectedVideo(video);
  };

  const handleCloseVideo = () => {
    setSelectedVideo(null);
  };

  const handleThumbnailError = (videoId: string) => {
    setThumbnails(prev => {
      const newThumbnails = { ...prev };
      delete newThumbnails[videoId];
      return newThumbnails;
    });
  };

  const renderVideoItem = ({ item: video }: { item: Video }) => (
    <VideoItem
      video={video}
      onPress={handleVideoPress}
      thumbnails={thumbnails}
      loadingThumbnails={loadingThumbnails}
      onLoadThumbnail={loadThumbnail}
      onThumbnailError={handleThumbnailError}
    />
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      );
    }

    const videos = activeTab === 'liked' ? likedVideos : savedVideos;

    if (videos.length === 0) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>
            No {activeTab} videos yet
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

  return (
    <SafeScreen backgroundColor={theme.colors.background}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={handleGenerateThumbnails}
          >
            <Ionicons name="refresh" size={24} color={theme.colors.accent} />
          </TouchableOpacity>
        )}

        <View style={styles.profileContent}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person-circle-outline" size={80} color={theme.colors.accent} />
          </View>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'liked' && styles.activeTab]}
            onPress={() => setActiveTab('liked')}
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
            onPress={() => setActiveTab('saved')}
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

        <View style={styles.contentContainer}>
          {renderContent()}
        </View>

        <Modal
          visible={selectedVideo !== null}
          animationType="fade"
          transparent={true}
          onRequestClose={handleCloseVideo}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCloseVideo}
            >
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
            {selectedVideo && (
              <VideoPlayer
                video={selectedVideo}
                isVisible={true}
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
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  thumbnail: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: theme.colors.surface,
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
    padding: theme.spacing.sm,
  },
  videoTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  videoStats: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.xs,
    marginTop: theme.spacing.xs,
  },
  playIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generateButton: {
    position: 'absolute',
    top: theme.spacing.lg,
    right: theme.spacing.lg * 3,
    zIndex: 1,
    padding: theme.spacing.sm,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  closeButton: {
    position: 'absolute',
    top: theme.spacing.lg,
    right: theme.spacing.lg,
    zIndex: 2,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
  },
}); 