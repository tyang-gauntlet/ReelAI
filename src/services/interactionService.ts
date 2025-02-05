import { db } from '../config/firebase';
import {
  doc,
  updateDoc,
  increment,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';
import { Video } from '../components/VideoFeed/VideoFeed';

export const likeVideo = async (userId: string, videoId: string) => {
  try {
    // Add like document
    await addDoc(collection(db, 'likes'), {
      userId,
      videoId,
      likedAt: new Date(),
    });

    // Increment video likes count
    const videoRef = doc(db, 'videos', videoId);
    await updateDoc(videoRef, {
      likes: increment(1),
    });
  } catch (error) {
    console.error('Error liking video:', error);
    throw error;
  }
};

export const unlikeVideo = async (userId: string, videoId: string) => {
  try {
    // Find and delete like document
    const likesRef = collection(db, 'likes');
    const q = query(likesRef, where('userId', '==', userId), where('videoId', '==', videoId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);
    }

    // Decrement video likes count
    const videoRef = doc(db, 'videos', videoId);
    await updateDoc(videoRef, {
      likes: increment(-1),
    });
  } catch (error) {
    console.error('Error unliking video:', error);
    throw error;
  }
};

export const checkIfLiked = async (userId: string, videoId: string): Promise<boolean> => {
  try {
    const likesRef = collection(db, 'likes');
    const q = query(likesRef, where('userId', '==', userId), where('videoId', '==', videoId));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking like status:', error);
    throw error;
  }
};

export const getLikedVideos = async (userId: string): Promise<Video[]> => {
  try {
    const likesRef = collection(db, 'likes');
    const q = query(likesRef, where('userId', '==', userId));
    const likesSnapshot = await getDocs(q);

    // Get all video IDs that the user has liked
    const videoIds = likesSnapshot.docs.map(doc => doc.data().videoId);

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
    console.error('Error fetching liked videos:', error);
    throw error;
  }
};

export const shareVideo = async (videoUrl: string, title: string) => {
  try {
    await Clipboard.setStringAsync(videoUrl);
    return true;
  } catch (error) {
    console.error('Error copying video URL:', error);
    throw error;
  }
};
