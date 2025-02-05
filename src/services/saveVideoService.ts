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

export const getSavedVideos = async (userId: string): Promise<Video[]> => {
  try {
    const savedRef = collection(db, 'savedVideos');
    const q = query(savedRef, where('userId', '==', userId));
    const savedSnapshot = await getDocs(q);

    // Get all video IDs that the user has saved
    const videoIds = savedSnapshot.docs.map(doc => doc.data().videoId);

    if (videoIds.length === 0) return [];

    // Fetch the actual video documents
    const videosRef = collection(db, 'videos');
    const videos: Video[] = [];

    // Fetch videos one by one since Firestore doesn't support 'in' queries on document IDs
    for (const videoId of videoIds) {
      const videoDoc = doc(videosRef, videoId);
      const videoSnapshot = await getDoc(videoDoc);

      if (videoSnapshot.exists()) {
        videos.push({
          id: videoSnapshot.id,
          ...videoSnapshot.data(),
          createdAt: videoSnapshot.data().createdAt?.toDate(),
        } as Video);
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
