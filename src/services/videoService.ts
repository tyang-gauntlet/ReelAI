import { storage, db } from '../config/firebase';
import {
  ref,
  getDownloadURL,
  listAll,
  getStorage,
  uploadBytesResumable,
  getMetadata,
  deleteObject,
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
} from 'firebase/firestore';
import { Video } from '../components/VideoFeed/VideoFeed';
import * as FileSystem from 'expo-file-system';

export const fetchVideoURLFromStorage = async (path: string): Promise<string> => {
  const videoRef = ref(storage, path);
  return getDownloadURL(videoRef);
};

interface FetchVideosResult {
  videos: Video[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export const fetchVideosFromFirestore = async (
  lastDoc?: QueryDocumentSnapshot,
): Promise<FetchVideosResult> => {
  try {
    const videosCollection = collection(db, 'videos');
    let videosQuery = query(videosCollection, orderBy('createdAt', 'desc'), limit(5));

    if (lastDoc) {
      videosQuery = query(
        videosCollection,
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(5),
      );
    }

    const querySnapshot = await getDocs(videosQuery);
    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;

    // Only include videos that have a storage path
    const videos = querySnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      }))
      .filter(video => video.storagePath) as Video[];

    console.log('Fetched videos:', {
      total: querySnapshot.docs.length,
      withStoragePath: videos.length,
      videos: videos.map(v => ({
        id: v.id,
        storagePath: v.storagePath,
      })),
    });

    return {
      videos,
      lastDoc: lastVisible,
      hasMore: videos.length === 5,
    };
  } catch (error) {
    console.error('Error fetching videos:', error);
    throw error;
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
