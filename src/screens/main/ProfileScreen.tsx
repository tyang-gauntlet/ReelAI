import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, Image, Dimensions, ActivityIndicator, Modal, PanResponder, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeScreen } from '../../components/layout/SafeScreen';
import { useAuth } from '../../hooks/useAuth';
import { theme } from '../../styles/theme';
import { Ionicons } from '@expo/vector-icons';
import { getSavedVideos, cleanupDuplicateSavedVideos } from '../../services/saveVideoService';
import { getLikedVideos } from '../../services/interactionService';
import { Video as VideoType } from '../../components/VideoFeed/VideoFeed';
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
import { saveVideo } from '../../services/saveVideoService';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainStackParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type TabType = 'liked' | 'saved';

interface SavedVideo extends VideoType {
  category?: string;
}

interface Video {
  id: string;
  title: string;
  likes: number;
  category?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_WIDTH = SCREEN_WIDTH;
const VIDEO_WIDTH = (SCREEN_WIDTH - theme.spacing.lg * 4) / 2;
const VIDEO_HEIGHT = VIDEO_WIDTH * 1.3;

const VideoItem = React.memo(({
  video,
  onPress,
  onLongPress,
  thumbnails,
  loadingThumbnails,
  onLoadThumbnail,
  onThumbnailError
}: {
  video: SavedVideo;
  onPress: (video: SavedVideo) => void;
  onLongPress?: (video: SavedVideo) => void;
  thumbnails: { [key: string]: string };
  loadingThumbnails: { [key: string]: boolean };
  onLoadThumbnail: (video: SavedVideo) => void;
  onThumbnailError: (videoId: string) => void;
}) => {
  useEffect(() => {
    onLoadThumbnail(video);
  }, [video, onLoadThumbnail]);

  return (
    <TouchableOpacity
      style={styles.videoThumbnail}
      onPress={() => onPress(video)}
      onLongPress={() => onLongPress?.(video)}
      delayLongPress={500}
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
  const { refreshTrigger, triggerRefresh } = useVideoList();
  const { videoStates, initializeVideoState, getVideoState } = useVideoState();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<TabType>('liked');
  const [likedVideos, setLikedVideos] = useState<VideoType[]>([]);
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<{ [key: string]: string }>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<{ [key: string]: boolean }>({});
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVideoForCategory, setSelectedVideoForCategory] = useState<SavedVideo | null>(null);
  const [showCategorySelectionModal, setShowCategorySelectionModal] = useState(false);
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const tabSwitchTimeout = useRef<NodeJS.Timeout>();
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  // Add lastActiveTab ref to remember the last active tab
  const lastActiveTab = useRef<TabType>('liked');

  useEffect(() => {
    if (activeTab !== lastActiveTab.current) {
      lastActiveTab.current = activeTab;
    }
  }, [activeTab]);

  useEffect(() => {
    const fetchVideos = async () => {
      if (!user || !isFocused) return;

      try {
        setLoading(true);
        const [liked, saved] = await Promise.all([
          getLikedVideos(user.uid),
          getSavedVideos(user.uid)
        ]);

        initializeVideoState(
          [...liked, ...saved],
          liked.map(v => v.id),
          saved.map(v => v.id)
        );

        setLikedVideos(liked);
        setSavedVideos(saved);

        // After setting the videos, update the UI state
        if (lastActiveTab.current === 'saved') {
          setActiveTab('saved');
          // Use requestAnimationFrame to ensure the ScrollView is ready
          requestAnimationFrame(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                x: PAGE_WIDTH,
                animated: false
              });
            }
          });
        }
      } catch (error) {
        console.error('Error fetching videos:', error);
        Alert.alert('Error', 'Failed to load videos');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [user, refreshTrigger, isFocused, initializeVideoState]);

  // Get unique categories from saved videos
  const categories = React.useMemo(() => {
    const uniqueCategories = new Set(savedVideos.map(video => video.category || 'Uncategorized'));
    return Array.from(uniqueCategories).sort();
  }, [savedVideos]);

  // Filter saved videos by category
  const filteredSavedVideos = React.useMemo(() => {
    if (!selectedCategory) return savedVideos;
    return savedVideos.filter(video =>
      selectedCategory === 'Uncategorized'
        ? !video.category
        : video.category === selectedCategory
    );
  }, [savedVideos, selectedCategory]);

  const loadThumbnail = async (video: VideoType) => {
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

  const handleVideoPress = (video: VideoType) => {
    const videos = activeTab === 'liked'
      ? likedVideos.filter(v => getVideoState(v.id).isLiked)
      : filteredSavedVideos.filter(v => getVideoState(v.id).isSaved);
    const index = videos.findIndex(v => v.id === video.id);
    setCurrentVideoIndex(index);
    setSelectedVideo(video);
  };

  const handleNextVideo = () => {
    const videos = activeTab === 'liked'
      ? likedVideos.filter(v => getVideoState(v.id).isLiked)
      : filteredSavedVideos.filter(v => getVideoState(v.id).isSaved);

    if (currentVideoIndex < videos.length - 1) {
      const nextVideo = videos[currentVideoIndex + 1];
      setCurrentVideoIndex(currentVideoIndex + 1);
      setSelectedVideo(nextVideo);
    }
  };

  const handlePreviousVideo = () => {
    const videos = activeTab === 'liked'
      ? likedVideos.filter(v => getVideoState(v.id).isLiked)
      : filteredSavedVideos.filter(v => getVideoState(v.id).isSaved);

    if (currentVideoIndex > 0) {
      const previousVideo = videos[currentVideoIndex - 1];
      setCurrentVideoIndex(currentVideoIndex - 1);
      setSelectedVideo(previousVideo);
    }
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

  // Add effect to sync scroll position with active tab when screen is focused
  useEffect(() => {
    if (isFocused && scrollViewRef.current) {
      // Use a small timeout to ensure the scroll view is ready
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: activeTab === 'liked' ? 0 : SCREEN_WIDTH - theme.spacing.lg * 2,
          animated: false
        });
      }, 50);
    }
  }, [isFocused, activeTab]);

  // Update handleTabPress to be more reliable
  const handleTabPress = (tab: TabType) => {
    if (isTabSwitching || tab === activeTab) return;

    setIsTabSwitching(true);
    setActiveTab(tab);
    lastActiveTab.current = tab;

    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: tab === 'liked' ? 0 : PAGE_WIDTH,
        animated: true
      });
    }

    // Clear any existing timeout
    if (tabSwitchTimeout.current) {
      clearTimeout(tabSwitchTimeout.current);
    }

    // Set a timeout to prevent rapid switching
    tabSwitchTimeout.current = setTimeout(() => {
      setIsTabSwitching(false);
    }, 300);
  };

  // Update handleScroll to be more precise
  const handleScroll = (event: any) => {
    if (isTabSwitching) return;

    const offsetX = event.nativeEvent.contentOffset.x;
    const newTab = offsetX > PAGE_WIDTH / 2 ? 'saved' : 'liked';

    if (newTab !== activeTab) {
      setActiveTab(newTab);
      lastActiveTab.current = newTab;
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tabSwitchTimeout.current) {
        clearTimeout(tabSwitchTimeout.current);
      }
    };
  }, []);

  const handleUpdateCategory = async (videoId: string, category: string) => {
    if (!user) return;
    try {
      await saveVideo(user.uid, videoId, category);
      setSavedVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, category } : v
      ));
      triggerRefresh();
    } catch (error) {
      console.error('Error updating category:', error);
      Alert.alert('Error', 'Failed to update category');
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;

    const trimmedCategory = newCategory.trim();

    // Add an empty video entry with the new category to ensure it shows up in pills
    setSavedVideos(prev => {
      const hasCategory = prev.some(v => v.category === trimmedCategory);
      if (!hasCategory) {
        // Create a temporary SavedVideo object
        const tempVideo: SavedVideo = {
          id: `temp-${Date.now()}`,
          title: '',
          likes: 0,
          category: trimmedCategory,
          storageUrl: '',
          createdAt: new Date(),
          userId: user?.uid || '',
        };
        return [...prev, tempVideo];
      }
      return prev;
    });

    // Remove the setSelectedCategory call so it doesn't switch to the new category
    setNewCategory('');
    setShowNewCategoryModal(false);
  };

  // Add a new function to handle assigning categories to videos
  const handleAssignCategory = async (videoId: string, category: string | null) => {
    if (!user) return;
    try {
      if (category) {
        await saveVideo(user.uid, videoId, category);
      }
      setSavedVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, category: category || undefined } : v
      ));
      triggerRefresh();
    } catch (error) {
      console.error('Error updating category:', error);
      Alert.alert('Error', 'Failed to update category');
    }
  };

  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      // Clean up duplicates first if it's the test account
      if (user.email === 'test@realai.com') {
        await cleanupDuplicateSavedVideos(user.uid);
      }

      const [liked, saved] = await Promise.all([
        getLikedVideos(user.uid),
        getSavedVideos(user.uid)
      ]);

      initializeVideoState(
        [...liked, ...saved],
        liked.map(v => v.id),
        saved.map(v => v.id)
      );

      setLikedVideos(liked);
      setSavedVideos(saved);
    } catch (error) {
      console.error('Error refreshing videos:', error);
      Alert.alert('Error', 'Failed to refresh videos');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLongPress = (video: VideoType) => {
    if (activeTab === 'saved') {
      setSelectedVideoForCategory(video);
      setShowCategorySelectionModal(true);
    }
  };

  const handleCategorySelect = async (category: string | null) => {
    if (!selectedVideoForCategory || !user) return;

    try {
      await handleAssignCategory(selectedVideoForCategory.id, category);
      setShowCategorySelectionModal(false);
      setSelectedVideoForCategory(null);

      // Update the saved videos list without changing tabs
      const updatedSaved = await getSavedVideos(user.uid);
      setSavedVideos(updatedSaved);
    } catch (error) {
      console.error('Error changing category:', error);
      Alert.alert('Error', 'Failed to change category');
    }
  };

  const handleCleanupDuplicates = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const removedCount = await cleanupDuplicateSavedVideos(user.uid);
      Alert.alert('Success', `Removed ${removedCount} duplicate videos`);
      // Refresh the list after cleanup
      handleRefresh();
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      Alert.alert('Error', 'Failed to clean up duplicates');
    } finally {
      setLoading(false);
    }
  };

  const handleHashtagPress = (hashtag: string) => {
    // Ensure hashtag has '#' prefix
    const formattedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
    // Use push instead of navigate to stack the screen
    navigation.push('Hashtag', { tag: formattedHashtag });
  };

  const renderVideoItem = ({ item: video }: { item: VideoType }) => {
    const state = getVideoState(video.id);
    const updatedVideo = {
      ...video,
      likes: state.likes || video.likes,
    };

    return (
      <VideoItem
        video={updatedVideo}
        onPress={handleVideoPress}
        onLongPress={handleLongPress}
        thumbnails={thumbnails}
        loadingThumbnails={loadingThumbnails}
        onLoadThumbnail={loadThumbnail}
        onThumbnailError={handleThumbnailError}
      />
    );
  };

  const renderCategoryPills = () => {
    if (activeTab !== 'saved' || categories.length === 0) return null;

    return (
      <View style={styles.categoryPillsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryPillsScroll}
          contentContainerStyle={styles.categoryPillsContainer}
        >
          <TouchableOpacity
            style={[
              styles.categoryPill,
              !selectedCategory && styles.selectedCategoryPill
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[
              styles.categoryPillText,
              !selectedCategory && styles.selectedCategoryPillText
            ]}>All</Text>
          </TouchableOpacity>
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryPill,
                selectedCategory === category && styles.selectedCategoryPill
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[
                styles.categoryPillText,
                selectedCategory === category && styles.selectedCategoryPillText
              ]}>{category}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.categoryPill, styles.addCategoryPill]}
            onPress={() => setShowNewCategoryModal(true)}
          >
            <Ionicons name="add" size={16} color={theme.colors.accent} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderTabContent = (tabType: TabType) => {
    const videos = tabType === 'liked'
      ? likedVideos.filter(v => getVideoState(v.id).isLiked)
      : filteredSavedVideos.filter(v => getVideoState(v.id).isSaved);

    if (videos.length === 0) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>
            No {tabType} videos{selectedCategory ? ` in ${selectedCategory}` : ''} yet
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
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    );
  };

  const CategorySelectionModal = ({
    visible,
    onClose,
    onSelect,
    categories,
    currentCategory,
  }: {
    visible: boolean;
    onClose: () => void;
    onSelect: (category: string | null) => void;
    categories: string[];
    currentCategory?: string | null;
  }) => (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.newCategoryModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.newCategoryTitle}>Move to Category</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.categorySelectionList}>
            <TouchableOpacity
              style={[
                styles.categorySelectionItem,
                currentCategory === null && styles.selectedCategoryItem
              ]}
              onPress={() => onSelect(null)}
            >
              <Text style={[
                styles.categorySelectionText,
                currentCategory === null && styles.selectedCategoryText
              ]}>Uncategorized</Text>
              {currentCategory === null && (
                <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
              )}
            </TouchableOpacity>
            {categories.filter(cat => cat !== 'Uncategorized').map((category) => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categorySelectionItem,
                  currentCategory === category && styles.selectedCategoryItem
                ]}
                onPress={() => onSelect(category)}
              >
                <Text style={[
                  styles.categorySelectionText,
                  currentCategory === category && styles.selectedCategoryText
                ]}>{category}</Text>
                {currentCategory === category && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.newCategoryButton}
            onPress={() => {
              onClose();
              setShowNewCategoryModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.accent} />
            <Text style={styles.newCategoryButtonText}>New Category</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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
    <SafeScreen style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
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

      {renderCategoryPills()}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
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

      {selectedVideo && (
        <View style={[styles.modalContainer, StyleSheet.absoluteFill]}>
          <FlatList
            data={activeTab === 'liked'
              ? likedVideos.filter(v => getVideoState(v.id).isLiked)
              : filteredSavedVideos.filter(v => getVideoState(v.id).isSaved)}
            renderItem={({ item }) => (
              <View style={styles.videoPlayerContainer}>
                <VideoPlayer
                  video={item}
                  isVisible={item.id === selectedVideo.id}
                  onVideoUpdate={handleVideoUpdate}
                  onHashtagPress={handleHashtagPress}
                  showBackButton={true}
                  onBackPress={handleCloseVideo}
                />
              </View>
            )}
            keyExtractor={item => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            initialScrollIndex={currentVideoIndex}
            getItemLayout={(data, index) => ({
              length: Dimensions.get('window').height,
              offset: Dimensions.get('window').height * index,
              index,
            })}
            onViewableItemsChanged={({ viewableItems }) => {
              if (viewableItems.length > 0) {
                setSelectedVideo(viewableItems[0].item);
                setCurrentVideoIndex(viewableItems[0].index || 0);
              }
            }}
            viewabilityConfig={{
              itemVisiblePercentThreshold: 50
            }}
            removeClippedSubviews={true}
            windowSize={3}
            maxToRenderPerBatch={2}
            initialNumToRender={1}
            vertical
          />
        </View>
      )}

      <Modal
        visible={showNewCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewCategoryModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.newCategoryModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.newCategoryTitle}>New Category</Text>
              <TouchableOpacity
                onPress={() => {
                  setNewCategory('');
                  setShowNewCategoryModal(false);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.newCategoryInput}
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="Enter category name"
              placeholderTextColor={theme.colors.text.secondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddCategory}
            />
            <View style={styles.newCategoryButtons}>
              <TouchableOpacity
                style={[styles.newCategoryButton, styles.cancelButton]}
                onPress={() => {
                  setNewCategory('');
                  setShowNewCategoryModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newCategoryButton, styles.addButton]}
                onPress={handleAddCategory}
                disabled={!newCategory.trim()}
              >
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CategorySelectionModal
        visible={showCategorySelectionModal}
        onClose={() => {
          setShowCategorySelectionModal(false);
          setSelectedVideoForCategory(null);
        }}
        onSelect={handleCategorySelect}
        categories={categories}
        currentCategory={selectedVideoForCategory?.category}
      />
    </SafeScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  logoutButton: {
    padding: theme.spacing.xs,
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
    marginBottom: 12,
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
    paddingTop: theme.spacing.lg * 2,
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
    paddingBottom: theme.spacing.lg * 2,
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
    marginTop: 0,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  page: {
    width: SCREEN_WIDTH - theme.spacing.lg * 2,
    flex: 1,
  },
  modalContainer: {
    backgroundColor: '#000',
    zIndex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsIcon: {
    marginRight: 4,
  },
  categoryPillsWrapper: {
    height: 36,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    marginBottom: 4,
  },
  categoryPillsScroll: {
    height: 36,
  },
  categoryPillsContainer: {
    paddingHorizontal: theme.spacing.lg,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  selectedCategoryPill: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.accent,
  },
  categoryPillText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  selectedCategoryPillText: {
    color: theme.colors.accent,
  },
  addCategoryPill: {
    width: 32,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderColor: theme.colors.accent,
    borderStyle: 'dashed',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  newCategoryModal: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    width: '100%',
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  newCategoryTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.primary,
  },
  categorySelectionList: {
    marginBottom: theme.spacing.lg,
  },
  categorySelectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xs,
  },
  selectedCategoryItem: {
    backgroundColor: theme.colors.surface,
  },
  categorySelectionText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    flex: 1,
  },
  selectedCategoryText: {
    color: theme.colors.accent,
    fontWeight: theme.typography.weights.bold,
  },
  newCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  newCategoryButtonText: {
    color: theme.colors.accent,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  newCategoryInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    height: 48,
  },
  newCategoryButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  cancelButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    flex: 1,
  },
  addButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    flex: 1,
  },
  cancelButtonText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    textAlign: 'center',
  },
  addButtonText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    textAlign: 'center',
  },
  videoPlayerContainer: {
    height: Dimensions.get('window').height,
    width: '100%',
  },
}); 