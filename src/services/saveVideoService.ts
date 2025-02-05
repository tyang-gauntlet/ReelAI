import { db } from '../config/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

export const saveVideo = async (userId: string, videoId: string, category?: string) => {
  try {
    await addDoc(collection(db, 'savedVideos'), {
      userId,
      videoId,
      category,
      savedAt: new Date(),
    });
  } catch (error) {
    console.error('Error saving video:', error);
    throw error;
  }
};

export const getSavedVideos = async (userId: string) => {
  try {
    const q = query(collection(db, 'savedVideos'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching saved videos:', error);
    throw error;
  }
};
