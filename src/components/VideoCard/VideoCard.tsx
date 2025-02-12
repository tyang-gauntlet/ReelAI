import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Video } from '../VideoFeed/VideoFeed';
import { theme } from '../../styles/theme';

interface VideoCardProps {
  video: Video;
  onHashtagPress?: (hashtag: string) => void;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onHashtagPress }) => {
  const renderHashtags = () => {
    if (!video.metadata?.hashtags || video.metadata.hashtags.length === 0) {
      return null;
    }

    return (
      <View style={styles.hashtagsContainer}>
        {video.metadata.hashtags.map((tag, index) => {
          const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onHashtagPress?.(formattedTag)}
              style={styles.hashtagButton}
            >
              <Text style={styles.hashtagText}>{formattedTag}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{video.title}</Text>
      {video.description && (
        <Text style={styles.description}>{video.description}</Text>
      )}
      {renderHashtags()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  hashtagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  hashtagButton: {
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  hashtagText: {
    color: theme.colors.accent,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
});

export default VideoCard; 