import { db, storage } from '../config/firebase';
import { ref, getMetadata, updateMetadata } from 'firebase/storage';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';

export interface VideoMetadata {
  duration?: number;
  size?: number;
  contentType?: string;
  thumbnailTimestamps?: number[];
  hashtags?: string[];
  normalizedHashtags?: string[];
  aiTags?: {
    objects?: string[];
    actions?: string[];
    scenes?: string[];
    confidence: number;
  }[];
  category?: string;
  region?: string;
  species?: string;
  habitat?: string;
  customMetadata?: {
    [key: string]: string;
  };
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  technical: {
    duration: number;
    size: number;
    bitrate: number;
    format: string;
    resolution: {
      width: number;
      height: number;
    };
  };
  thumbnails: string[];
  aiAnalysis: {
    objects: Array<{
      name: string;
      confidence: number;
      timeRanges: Array<{
        start: number;
        end: number;
      }>;
    }>;
    actions: Array<{
      name: string;
      confidence: number;
      timeRange: {
        start: number;
        end: number;
      };
    }>;
    scenes: Array<{
      name: string;
      confidence: number;
      timeRange: {
        start: number;
        end: number;
      };
    }>;
    landmarks: Array<{
      name: string;
      confidence: number;
      location: {
        latitude: number;
        longitude: number;
      };
    }>;
  };
}

export const updateVideoMetadata = async (
  videoId: string,
  storagePath: string,
  metadata: Partial<VideoMetadata>,
) => {
  try {
    // If hashtags are provided, create normalized version
    if (metadata.hashtags) {
      // Ensure hashtags have '#' prefix for display and store normalized version without '#'
      metadata.hashtags = metadata.hashtags.map(tag => (tag.startsWith('#') ? tag : `#${tag}`));
      metadata.normalizedHashtags = metadata.hashtags.map(tag =>
        tag.replace('#', '').toLowerCase(),
      );
    }

    // Update Firestore document
    const videoRef = doc(db, 'videos', videoId);
    await updateDoc(videoRef, {
      metadata: metadata,
      updatedAt: new Date(),
    });

    // Update Storage metadata
    const storageRef = ref(storage, storagePath);
    const existingMetadata = await getMetadata(storageRef);

    await updateMetadata(storageRef, {
      ...existingMetadata,
      customMetadata: {
        ...existingMetadata.customMetadata,
        ...metadata.customMetadata,
        aiProcessed: 'true',
        aiProcessedAt: new Date().toISOString(),
      },
    });

    console.log('Updated metadata for video:', {
      videoId,
      storagePath,
      metadata,
    });
  } catch (error) {
    console.error('Error updating video metadata:', error);
    throw error;
  }
};

// Function to extract metadata from video file
export const extractVideoMetadata = async (
  storagePath: string,
): Promise<Partial<VideoMetadata>> => {
  try {
    const storageRef = ref(storage, storagePath);
    const metadata = await getMetadata(storageRef);

    return {
      duration: metadata.customMetadata?.duration
        ? Number(metadata.customMetadata.duration)
        : undefined,
      size: metadata.size,
      contentType: metadata.contentType,
      customMetadata: metadata.customMetadata,
    };
  } catch (error) {
    console.error('Error extracting video metadata:', error);
    throw error;
  }
};

// Function to add AI-generated tags
export const addAITags = async (
  videoId: string,
  tags: {
    objects?: string[];
    actions?: string[];
    scenes?: string[];
    confidence: number;
  },
) => {
  try {
    const videoRef = doc(db, 'videos', videoId);
    await updateDoc(videoRef, {
      'metadata.aiTags': tags,
      'metadata.aiProcessedAt': new Date(),
    });

    console.log('Added AI tags for video:', {
      videoId,
      tags,
    });
  } catch (error) {
    console.error('Error adding AI tags:', error);
    throw error;
  }
};

// Function to add category metadata
export const addCategoryMetadata = async (
  videoId: string,
  categoryData: {
    category: string;
    region?: string;
    species?: string;
    habitat?: string;
  },
) => {
  try {
    const videoRef = doc(db, 'videos', videoId);
    await updateDoc(videoRef, {
      ...categoryData,
      'metadata.categorizedAt': new Date(),
    });

    console.log('Added category metadata for video:', {
      videoId,
      categoryData,
    });
  } catch (error) {
    console.error('Error adding category metadata:', error);
    throw error;
  }
};
