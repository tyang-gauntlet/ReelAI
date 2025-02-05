import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadVideoToStorage } from '../services/storage';

export const uploadAllVideos = async () => {
  try {
    const videosRef = collection(db, 'videos');
    const snapshot = await getDocs(videosRef);

    console.log(`Found ${snapshot.size} videos to upload`);

    for (const doc of snapshot.docs) {
      const video = doc.data();
      console.log(`Uploading video: ${doc.id}`);

      await uploadVideoToStorage(doc.id, video.url);

      console.log(`Completed upload for: ${doc.id}`);
    }

    console.log('All videos uploaded successfully');
  } catch (error) {
    console.error('Error uploading videos:', error);
    throw error;
  }
};
