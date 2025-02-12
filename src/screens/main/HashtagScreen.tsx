import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, Alert, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/types';
import VideoFeed from '../../components/VideoFeed/VideoFeed';
import { SafeScreen } from '../../components/layout/SafeScreen';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../styles/theme';
import { useAuth } from '../../hooks/useAuth';
import { followHashtag, unfollowHashtag, isHashtagFollowed, getFollowedHashtags } from '../../services/hashtagService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type HashtagScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;
type HashtagScreenRouteProp = RouteProp<MainStackParamList, 'Hashtag'>;

export const HashtagScreen = () => {
  const route = useRoute<HashtagScreenRouteProp>();
  const navigation = useNavigation<HashtagScreenNavigationProp>();
  const { user } = useAuth();
  const { tag, mode } = route.params;
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [followedHashtags, setFollowedHashtags] = useState<string[]>([]);

  useEffect(() => {
    if (mode === 'followed') {
      loadFollowedHashtags();
    } else if (tag) {
      checkFollowStatus();
    }
  }, [user, tag, mode]);

  const loadFollowedHashtags = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const hashtags = await getFollowedHashtags(user.uid);
      setFollowedHashtags(hashtags);
    } catch (error) {
      console.error('Error loading followed hashtags:', error);
      Alert.alert('Error', 'Failed to load followed hashtags');
    } finally {
      setLoading(false);
    }
  };

  const checkFollowStatus = async () => {
    if (!user || !tag) return;
    const followed = await isHashtagFollowed(user.uid, tag);
    setIsFollowing(followed);
  };

  const handleFollowToggle = async () => {
    if (!user || !tag) {
      Alert.alert('Sign In Required', 'Please sign in to follow hashtags');
      return;
    }

    try {
      setLoading(true);
      if (isFollowing) {
        await unfollowHashtag(user.uid, tag);
        setIsFollowing(false);
      } else {
        await followHashtag(user.uid, tag);
        setIsFollowing(true);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setLoading(false);
    }
  };

  const handleHashtagPress = (hashtag: string) => {
    navigation.navigate('Hashtag', { tag: hashtag });
  };

  if (mode === 'followed') {
    return (
      <SafeScreen backgroundColor={theme.colors.background}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Followed Hashtags</Text>
          </View>
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
            </View>
          ) : followedHashtags.length === 0 ? (
            <View style={styles.centerContent}>
              <Text style={styles.emptyText}>No followed hashtags yet</Text>
            </View>
          ) : (
            <FlatList
              data={followedHashtags}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.hashtagItem}
                  onPress={() => handleHashtagPress(item)}
                >
                  <Text style={styles.hashtagText}>
                    {item.startsWith('#') ? item : `#${item}`}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen backgroundColor={theme.colors.background}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.hashtagContainer}>
            <Text style={styles.hashtagText}>
              {tag?.startsWith('#') ? tag : `#${tag}`}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.followButton,
              isFollowing && styles.followingButton,
              loading && styles.loadingButton
            ]}
            onPress={handleFollowToggle}
            disabled={loading}
          >
            <Ionicons
              name={isFollowing ? "checkmark" : "add"}
              size={18}
              color={isFollowing ? theme.colors.accent : theme.colors.text.primary}
            />
            <Text style={[
              styles.followButtonText,
              isFollowing && styles.followingButtonText
            ]}>
              {loading ? 'Loading...' : (isFollowing ? 'Following' : 'Follow')}
            </Text>
          </TouchableOpacity>
        </View>
        {tag && <VideoFeed hashtagFilter={tag} />}
      </View>
    </SafeScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    height: 56,
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: theme.spacing.xl,
  },
  backButton: {
    padding: theme.spacing.xs,
    position: 'absolute',
    left: theme.spacing.md,
    zIndex: 1,
  },
  hashtagContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 50,
  },
  hashtagText: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    gap: 4,
    position: 'absolute',
    right: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  followingButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderColor: theme.colors.accent,
  },
  loadingButton: {
    opacity: 0.7,
  },
  followButtonText: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  followingButtonText: {
    color: theme.colors.accent,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.md,
  },
  listContent: {
    paddingTop: 56 + theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
}); 