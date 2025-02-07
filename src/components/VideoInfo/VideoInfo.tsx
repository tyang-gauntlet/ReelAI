import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
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

  return (
    <>
      {/* Top Stats */}
      <View style={[styles.statsContainer, { marginTop: insets.top || theme.spacing.md }]}>
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
        </View>
      </View>

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
  statsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.sm,
    zIndex: 10,
  },
  statsGroup: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
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
  statText: {
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