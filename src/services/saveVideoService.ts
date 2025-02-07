import { db } from '../config/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
} from 'firebase/firestore';
import { Video } from '../components/VideoFeed/VideoFeed';

export const saveVideo = async (userId: string, videoId: string, category?: string) => {
  try {
    const saveData = {
      userId,
      videoId,
      savedAt: new Date(),
    };

    // Only add category if it's provided
    if (category) {
      Object.assign(saveData, { category });
    }

    await addDoc(collection(db, 'savedVideos'), saveData);
  } catch (error) {
    console.error('Error saving video:', error);
    throw error;
  }
};

export const getSavedVideos = async (
  userId: string,
): Promise<(Video & { category?: string })[]> => {
  try {
    const savedRef = collection(db, 'savedVideos');
    const q = query(savedRef, where('userId', '==', userId));
    const savedSnapshot = await getDocs(q);

    // Create a map to deduplicate videos by videoId
    const videoMap = new Map<string, { category?: string }>();

    // Get unique video IDs and their latest category
    savedSnapshot.docs.forEach(doc => {
      const data = doc.data();
      videoMap.set(data.videoId, { category: data.category });
    });

    if (videoMap.size === 0) return [];

    // Fetch the actual video documents
    const videosRef = collection(db, 'videos');
    const videos: (Video & { category?: string })[] = [];

    // Fetch videos one by one since Firestore doesn't support 'in' queries on document IDs
    for (const [videoId, { category }] of videoMap.entries()) {
      const videoDoc = doc(videosRef, videoId);
      const videoSnapshot = await getDoc(videoDoc);

      if (videoSnapshot.exists()) {
        videos.push({
          id: videoSnapshot.id,
          ...videoSnapshot.data(),
          createdAt: videoSnapshot.data().createdAt?.toDate(),
          category,
        } as Video & { category?: string });
      }
    }

    return videos;
  } catch (error) {
    console.error('Error fetching saved videos:', error);
    throw error;
  }
};

export const checkIfSaved = async (userId: string, videoId: string): Promise<boolean> => {
  try {
    const savedRef = collection(db, 'savedVideos');
    const q = query(savedRef, where('userId', '==', userId), where('videoId', '==', videoId));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking save status:', error);
    throw error;
  }
};

export const unsaveVideo = async (userId: string, videoId: string) => {
  try {
    const savedRef = collection(db, 'savedVideos');
    const q = query(savedRef, where('userId', '==', userId), where('videoId', '==', videoId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);
    }
  } catch (error) {
    console.error('Error unsaving video:', error);
    throw error;
  }
};

export const cleanupDuplicateSavedVideos = async (userId: string) => {
  try {
    const savedRef = collection(db, 'savedVideos');
    const q = query(savedRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    // Create a map to track videos by their videoId
    const videoMap = new Map<string, { docId: string; videoId: string }>();
    const toDelete: string[] = [];

    // First pass: find all entries and keep track of duplicates
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const key = data.videoId;

      if (!videoMap.has(key)) {
        // First time seeing this videoId
        videoMap.set(key, { docId: doc.id, videoId: data.videoId });
      } else {
        // It's a duplicate, mark for deletion
        toDelete.push(doc.id);
      }
    });

    // Delete all duplicates
    const deletePromises = toDelete.map(docId => deleteDoc(doc(db, 'savedVideos', docId)));

    await Promise.all(deletePromises);
    console.log(`Cleaned up ${deletePromises.length} duplicate videos`);
    return deletePromises.length;
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
    throw error;
  }
};
