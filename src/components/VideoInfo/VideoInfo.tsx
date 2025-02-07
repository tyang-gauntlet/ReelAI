import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video } from '../VideoFeed/VideoFeed';
import { theme } from '../../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface VideoInfoProps {
  video: Video;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  isLiked: boolean;
  isSaved: boolean;
  likeCount: number;
}

export const VideoInfo: React.FC<VideoInfoProps> = ({
  video,
  onLike,
  onSave,
  onShare,
  isLiked,
  isSaved,
  likeCount,
}) => {
  const insets = useSafeAreaInsets();

  const formatResolution = () => {
    const { width, height } = video.metadata || {};
    if (!width || !height) return '';
    return `${width}x${height}`;
  };

  const formatQuality = () => {
    const resolution = formatResolution();
    if (!resolution) return '';

    const [width, height] = resolution.split('x').map(Number);
    if (Math.max(width, height) >= 3840) return '4K';
    if (Math.max(width, height) >= 1920) return 'HD';
    return 'SD';
  };

  const formatDuration = () => {
    const duration = video.metadata?.duration;
    if (!duration) return '';

    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = () => {
    const size = video.metadata?.size;
    if (!size) return '';

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)}KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatDate = () => {
    if (!video.createdAt) return '';
    const date = new Date(video.createdAt);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <>
      {/* Top Stats */}
      <LinearGradient
        colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0)']}
        style={[styles.topContainer, { paddingTop: insets.top || theme.spacing.md }]}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>{video.title}</Text>
          {video.description && (
            <Text style={styles.description} numberOfLines={2}>{video.description}</Text>
          )}
        </View>

        <View style={styles.statsGroup}>
          <View style={styles.stat}>
            <Ionicons name="videocam" size={14} color={theme.colors.text.secondary} />
            <Text style={styles.statText}>{formatQuality()}</Text>
          </View>
          {video.metadata?.fps && (
            <View style={styles.stat}>
              <Ionicons name="speedometer" size={14} color={theme.colors.text.secondary} />
              <Text style={styles.statText}>{video.metadata.fps}fps</Text>
            </View>
          )}
          <View style={styles.stat}>
            <Ionicons name="expand" size={14} color={theme.colors.text.secondary} />
            <Text style={styles.statText}>{formatResolution()}</Text>
          </View>
          {video.metadata?.duration && (
            <View style={styles.stat}>
              <Ionicons name="time-outline" size={14} color={theme.colors.text.secondary} />
              <Text style={styles.statText}>{formatDuration()}</Text>
            </View>
          )}
        </View>

        <View style={styles.infoGroup}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.text.secondary} />
            <Text style={styles.infoText}>{formatDate()}</Text>
          </View>
          {video.metadata?.size && (
            <View style={styles.infoItem}>
              <Ionicons name="document-outline" size={14} color={theme.colors.text.secondary} />
              <Text style={styles.infoText}>{formatFileSize()}</Text>
            </View>
          )}
        </View>

        {/* Hashtags */}
        {video.metadata?.hashtags && video.metadata.hashtags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hashtagsContainer}
          >
            {video.metadata.hashtags.map((hashtag, index) => (
              <View key={index} style={styles.hashtag}>
                <Text style={styles.hashtagText}>{hashtag}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </LinearGradient>

      {/* Right Side Interactions */}
      <View style={[styles.interactionContainer, { bottom: Platform.OS === 'ios' ? 100 : 80 }]}>
        <View style={styles.interactionButton}>
          <TouchableOpacity onPress={onLike}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={28}
              color={isLiked ? theme.colors.like : theme.colors.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.interactionText}>{likeCount}</Text>
        </View>

        <View style={styles.interactionButton}>
          <TouchableOpacity onPress={onSave}>
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={28}
              color={isSaved ? theme.colors.accent : theme.colors.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.interactionText}>Save</Text>
        </View>

        <View style={styles.interactionButton}>
          <TouchableOpacity onPress={onShare}>
            <Ionicons
              name="share-social-outline"
              size={28}
              color={theme.colors.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.interactionText}>Share</Text>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  topContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.sm,
    zIndex: 10,
  },
  titleContainer: {
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  statsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  infoGroup: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  infoText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  hashtagsContainer: {
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  hashtag: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.xs,
  },
  hashtagText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  interactionContainer: {
    position: 'absolute',
    right: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  interactionButton: {
    alignItems: 'center',
  },
  interactionText: {
    color: theme.colors.text.primary,
    fontSize: 12,
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
}); 