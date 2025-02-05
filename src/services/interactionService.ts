import { db } from '../config/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import Share from 'react-native-share';

export const likeVideo = async (videoId: string) => {
  try {
    const videoRef = doc(db, 'videos', videoId);
    await updateDoc(videoRef, {
      likes: increment(1),
    });
  } catch (error) {
    console.error('Error liking video:', error);
    throw error;
  }
};

export const shareVideo = async (videoUrl: string, title: string) => {
  try {
    await Share.open({
      title,
      url: videoUrl,
    });
  } catch (error) {
    console.error('Error sharing video:', error);
    throw error;
  }
};
