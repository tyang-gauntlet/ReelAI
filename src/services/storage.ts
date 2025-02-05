import { storage } from '../config/firebase';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  getStorage,
} from 'firebase/storage';
import { db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export interface UploadProgressCallback {
  (progress: number): void;
}

export interface VideoMetadata {
  fileName: string;
  contentType: string;
  timestamp: number;
  userId: string;
}

/**
 * Uploads a video file to Firebase Storage
 * @param uri Local URI of the video file
 * @param userId ID of the user uploading the video
 * @param onProgress Optional callback for upload progress
 * @returns Promise with download URL
 */
export const uploadVideo = async (
  uri: string,
  userId: string,
  onProgress?: UploadProgressCallback,
): Promise<{ downloadUrl: string; metadata: VideoMetadata }> => {
  try {
    // Create blob from uri
    const response = await fetch(uri);
    const blob = await response.blob();

    // Generate unique filename
    const fileName = `${userId}_${Date.now()}.mp4`;
    const storageRef = ref(storage, `videos/${fileName}`);

    // Create upload task
    const uploadTask = uploadBytesResumable(storageRef, blob);

    // Return promise that resolves with download URL
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        snapshot => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.(progress);
        },
        error => {
          reject(error);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const metadata: VideoMetadata = {
            fileName,
            contentType: 'video/mp4',
            timestamp: Date.now(),
            userId,
          };
          resolve({ downloadUrl, metadata });
        },
      );
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};

/**
 * Deletes a video from Firebase Storage
 * @param videoUrl The full URL or path of the video to delete
 */
export const deleteVideo = async (videoUrl: string): Promise<void> => {
  try {
    // If it's a full URL, extract the path
    const path = videoUrl.includes('firebase')
      ? videoUrl.split('videos%2F')[1].split('?')[0]
      : videoUrl;
    const videoRef = ref(storage, `videos/${path}`);
    await deleteObject(videoRef);
  } catch (error) {
    console.error('Error deleting video:', error);
    throw error;
  }
};

/**
 * Gets all videos for a specific user
 * @param userId ID of the user
 * @returns Promise with array of video URLs
 */
export const getUserVideos = async (userId: string): Promise<string[]> => {
  try {
    const videosRef = ref(storage, 'videos');
    const result = await listAll(videosRef);

    const urls = await Promise.all(
      result.items
        .filter(item => item.name.startsWith(`${userId}_`))
        .map(item => getDownloadURL(item)),
    );

    return urls;
  } catch (error) {
    console.error('Error getting user videos:', error);
    throw error;
  }
};

export const uploadVideoToStorage = async (videoId: string, videoUrl: string) => {
  try {
    // Download video from URL
    const response = await fetch(videoUrl);
    const blob = await response.blob();

    // Upload to Firebase Storage
    const storage = getStorage();
    const storagePath = `videos/${videoId}.mp4`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        snapshot => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress);
        },
        error => {
          console.error('Upload error:', error);
          reject(error);
        },
        async () => {
          // Upload completed successfully
          const downloadURL = await getDownloadURL(storageRef);

          // Update Firestore document with storage path
          const videoRef = doc(db, 'videos', videoId);
          await updateDoc(videoRef, {
            storagePath: storagePath,
            storageUrl: downloadURL,
          });

          resolve({ storagePath, downloadURL });
        },
      );
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};
