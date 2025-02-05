import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL, connectStorageEmulator } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_API_KEY, PROJECT_ID } from '@env';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: 'reelai-c82fc.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  databaseURL: `https://reelai-c82fc.firebaseio.com`,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and Storage
export const db = getFirestore(app);
export const storage = getStorage(app, 'gs://reelai-c82fc.firebasestorage.app');

// Initialize Auth with persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Configure storage settings
// storage.maxOperationRetryTime = 10000; // 10 seconds max for operations
// storage.maxUploadRetryTime = 10000; // 10 seconds max for uploads

// Add this function to clear auth state
export const clearAuthState = async () => {
  try {
    await signOut(auth);
    // Clear any stored auth data
    await AsyncStorage.removeItem('@auth_state');
    console.log('Auth state cleared successfully');
  } catch (error) {
    console.error('Error clearing auth state:', error);
  }
};

// Helper function to get direct download URL
export const getVideoUrl = async (videoPath: string) => {
  try {
    console.log('Attempting to get video URL for path:', videoPath);
    const videoRef = ref(storage, videoPath);
    console.log('Storage reference created');

    const url = await getDownloadURL(videoRef);
    console.log('Retrieved download URL:', url);

    // Verify the URL is accessible
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`Video URL returned status ${response.status}`);
    }

    return url;
  } catch (error: any) {
    console.error('Error getting video URL:', {
      error,
      code: error.code,
      message: error.message,
      path: videoPath,
    });
    throw error;
  }
};

// Add this debug function
export const debugVideoAccess = async (videoPath: string) => {
  console.log('=== Starting Video Debug ===');
  try {
    // Check if storage is initialized
    console.log('Storage instance:', storage ? 'Initialized' : 'Not initialized');
    console.log('Storage bucket:', storage.app.options.storageBucket);

    // Try to get video URL
    console.log('Attempting to get video URL...');
    const videoRef = ref(storage, videoPath);
    console.log('Video reference:', videoRef.fullPath);

    const url = await getDownloadURL(videoRef);
    console.log('Download URL obtained:', url);

    // Test URL access
    const response = await fetch(url, { method: 'HEAD' });
    console.log('URL access test status:', response.status);
    console.log('URL access test ok:', response.ok);

    return url;
  } catch (error: any) {
    console.error('=== Video Debug Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    throw error;
  }
};

// Demo account credentials
export const DEMO_EMAIL = 'demo@reelai.com';
export const DEMO_PASSWORD = 'demo123456';

// Create demo account if it doesn't exist
export const ensureDemoAccount = async () => {
  try {
    // First try to create the account
    const userCredential = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
    console.log('Demo account created successfully');
    // Sign out after creation
    await signOut(auth);
  } catch (error: any) {
    // If account already exists, that's fine
    if (error.code === 'auth/email-already-in-use') {
      console.log('Demo account already exists');
    } else {
      console.error('Error setting up demo account:', error);
    }
  }
};

export const signInWithGoogleCredential = async (idToken: string) => {
  const googleCredential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, googleCredential);
};

export default app;
