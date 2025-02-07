import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/types';
import VideoFeed from '../../components/VideoFeed/VideoFeed';
import { SafeScreen } from '../../components/layout/SafeScreen';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { theme } from '../../styles/theme';

type HashtagScreenRouteProp = RouteProp<MainStackParamList, 'Hashtag'>;

export const HashtagScreen = () => {
  const route = useRoute<HashtagScreenRouteProp>();
  const navigation = useNavigation();
  const { tag } = route.params;

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
              {tag.startsWith('#') ? tag : `#${tag}`}
            </Text>
          </View>
        </View>
        <VideoFeed hashtagFilter={tag} />
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
  },
  hashtagText: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
}); 