import { storage, db } from '../config/firebase';
import {
  ref,
  getDownloadURL,
  listAll,
  getStorage,
  uploadBytesResumable,
  getMetadata,
  deleteObject,
  uploadBytes,
} from 'firebase/storage';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  where,
  deleteField,
} from 'firebase/firestore';
import { Video } from '../components/VideoFeed/VideoFeed';
import * as FileSystem from 'expo-file-system';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

export const fetchVideoURLFromStorage = async (path: string): Promise<string> => {
  try {
    const videoRef = ref(storage, path);
    return await getDownloadURL(videoRef);
  } catch (error) {
    console.error('Error fetching video URL:', error);
    throw error;
  }
};

interface FetchVideosResult {
  videos: Video[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export const fetchVideosFromFirestore = async (
  lastDocument?: QueryDocumentSnapshot,
  hashtagFilter?: string,
) => {
  try {
    console.log('Fetching videos with params:', { hashtagFilter, hasLastDoc: !!lastDocument });

    const videosRef = collection(db, 'videos');
    let q = query(videosRef, orderBy('createdAt', 'desc'), limit(10));

    if (hashtagFilter) {
      // Remove '#' if present for searching
      const searchTag = hashtagFilter.replace('#', '');
      console.log('Searching for hashtag:', searchTag);

      // Search for the tag in any format
      q = query(
        videosRef,
        where('metadata.hashtags', 'array-contains-any', [searchTag, `#${searchTag}`]),
        orderBy('createdAt', 'desc'),
        limit(10),
      );
    }

    if (lastDocument) {
      q = query(q, startAfter(lastDocument));
    }

    const querySnapshot = await getDocs(q);
    const videos = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Video[];

    console.log('Firestore query results:', {
      totalVideos: videos.length,
      videosWithHashtags: videos.filter(v => v.metadata?.hashtags?.length).length,
      allHashtags: videos.map(v => v.metadata?.hashtags).filter(Boolean),
    });

    return {
      videos,
      lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
      hasMore: querySnapshot.docs.length === 10,
    };
  } catch (error) {
    console.error('Error fetching videos:', error);
    return {
      videos: [],
      lastDoc: null,
      hasMore: false,
    };
  }
};

export const cleanupVideoCache = async () => {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return;

    const dirContents = await FileSystem.readDirectoryAsync(cacheDir);
    const videoFiles = dirContents.filter(file => file.startsWith('video-'));

    for (const file of videoFiles) {
      const filePath = `${cacheDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (fileInfo.exists && (fileInfo.size ?? 0) < 10000) {
        console.log('Deleting invalid cache file:', file);
        await FileSystem.deleteAsync(filePath);
      }
    }
  } catch (error) {
    console.error('Error cleaning video cache:', error);
  }
};

export const testStorageEndpoint = async () => {
  try {
    console.log('Starting storage test...');

    const storage = getStorage();
    console.log('Storage config:', {
      bucket: storage.app.options.storageBucket,
      appName: storage.app.name,
    });

    // Try to list root
    console.log('Listing root directory...');
    const rootRef = ref(storage, '');
    const list = await listAll(rootRef);
    console.log('Root listing successful:', {
      items: list.items.length,
      prefixes: list.prefixes.length,
      files: list.items.map(item => item.fullPath),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Storage test failed:', error);
    throw error;
  }
};

export const populateFirestoreFromStorage = async () => {
  try {
    console.log('Starting Firestore population from Storage...');

    // Get list of videos from storage
    const rootRef = ref(storage, '');
    const list = await listAll(rootRef);

    // Get existing videos from Firestore to avoid duplicates
    const videosCollection = collection(db, 'videos');
    const existingDocs = await getDocs(videosCollection);
    const existingPaths = new Set(existingDocs.docs.map(doc => doc.data().storagePath));

    // Create Firestore entries for each storage file
    const addPromises = list.items
      .filter(item => !existingPaths.has(item.fullPath)) // Skip if already exists
      .map(async item => {
        try {
          // Get download URL
          const url = await getDownloadURL(item);

          // Create Firestore document
          const docData = {
            title: item.name.replace('.mp4', ''),
            description: `Video from Firebase Storage: ${item.name}`,
            storagePath: item.fullPath,
            storageUrl: url,
            likes: 0,
            views: 0,
            createdAt: new Date(),
          };

          console.log('Adding video to Firestore:', {
            name: item.name,
            path: item.fullPath,
          });

          await addDoc(collection(db, 'videos'), docData);
        } catch (error) {
          console.error('Error adding video:', item.name, error);
        }
      });

    await Promise.all(addPromises);
    console.log('Firestore population complete');
  } catch (error) {
    console.error('Error populating Firestore:', error);
    throw error;
  }
};

export const generateThumbnailsForExistingVideos = async () => {
  try {
    const videosRef = collection(db, 'videos');
    const q = query(videosRef, where('thumbnailUrl', '==', null));
    const querySnapshot = await getDocs(q);

    const updates = querySnapshot.docs.map(async doc => {
      const videoData = doc.data();
      if (!videoData.storageUrl || !videoData.storagePath) {
        console.log('Missing required data for video:', doc.id);
        return;
      }

      try {
        // Create thumbnail path from video path
        const filename = videoData.storagePath.split('/').pop() || '';
        const thumbnailPath = `thumbnails/${filename.replace(/\.[^/.]+$/, '')}.jpg`;
        const thumbnailRef = ref(storage, thumbnailPath);

        // Download video temporarily
        const videoResponse = await fetch(videoData.storageUrl);
        const videoBlob = await videoResponse.blob();

        // Upload first frame as thumbnail
        await uploadBytes(thumbnailRef, videoBlob);
        const thumbnailUrl = await getDownloadURL(thumbnailRef);

        // Update video document
        await updateDoc(doc.ref, {
          thumbnailPath,
          thumbnailUrl,
          updatedAt: new Date(),
        });

        console.log('Generated thumbnail for video:', doc.id);
      } catch (error) {
        console.error('Error generating thumbnail for video:', doc.id, error);
      }
    });

    await Promise.all(updates);
    console.log('Finished generating thumbnails for all videos');
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    throw error;
  }
};

interface UploadVideoMetadata {
  title: string;
  description?: string;
  userId: string;
}

export const uploadVideo = async (uri: string, metadata: UploadVideoMetadata) => {
  try {
    // Create a reference to the video file in storage
    const filename = uri.split('/').pop() || 'video.mp4';
    const storagePath = `videos/${filename}`;
    const storageRef = ref(storage, storagePath);

    // Upload the video file
    const response = await fetch(uri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob);

    // Get the storage URL
    const storageUrl = await getDownloadURL(storageRef);

    // Create the video document in Firestore
    const videoCollection = collection(db, 'videos');
    const videoDoc = await addDoc(videoCollection, {
      ...metadata,
      storagePath,
      storageUrl,
      thumbnailUrl: null, // Will be set by cloud function
      thumbnailPath: null, // Will be set by cloud function
      processingStatus: 'pending', // Track thumbnail generation status
      likes: 0,
      createdAt: new Date(),
    });

    console.log('Video uploaded, waiting for thumbnail generation:', {
      videoId: videoDoc.id,
      storagePath,
    });

    return {
      id: videoDoc.id,
      ...metadata,
      storagePath,
      storageUrl,
      thumbnailUrl: null,
      processingStatus: 'pending',
      likes: 0,
      createdAt: new Date(),
    };
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};

export const migrateHashtagsToNormalized = async () => {
  try {
    console.log('Starting hashtag normalization migration...');
    const videosRef = collection(db, 'videos');
    const q = query(videosRef);
    const querySnapshot = await getDocs(q);

    const updates = querySnapshot.docs.map(async doc => {
      const videoData = doc.data();
      let hashtags: string[] = [];

      // Collect hashtags from all possible locations
      if (videoData.metadata?.hashtags) {
        hashtags = [...hashtags, ...videoData.metadata.hashtags];
      }
      if (videoData.hashtags) {
        hashtags = [...hashtags, ...videoData.hashtags];
      }

      if (hashtags.length > 0) {
        // Remove duplicates and ensure proper formatting
        const uniqueHashtags = Array.from(new Set(hashtags));
        const formattedHashtags = uniqueHashtags.map(tag =>
          tag.startsWith('#') ? tag : `#${tag}`,
        );
        const normalizedHashtags = formattedHashtags.map(tag => tag.replace('#', '').toLowerCase());

        // Update document with consistent hashtag storage
        await updateDoc(doc.ref, {
          'metadata.hashtags': formattedHashtags,
          'metadata.normalizedHashtags': normalizedHashtags,
          // Remove old hashtags field if it exists
          hashtags: deleteField(),
        });

        console.log('Updated hashtags for video:', {
          id: doc.id,
          original: hashtags,
          formatted: formattedHashtags,
          normalized: normalizedHashtags,
        });
      }
    });

    await Promise.all(updates);
    console.log('Hashtag normalization migration complete');
  } catch (error) {
    console.error('Error migrating hashtags:', error);
    throw error;
  }
};
