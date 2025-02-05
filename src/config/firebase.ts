import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
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

// Export Firebase services
export { auth, firestore, storage };

// Add this function to clear auth state
export const clearAuthState = async () => {
  try {
    await auth().signOut();
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
    const videoRef = storage().ref(videoPath);
    console.log('Storage reference created');

    const url = await videoRef.getDownloadURL();
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
    console.log('Storage instance:', storage() ? 'Initialized' : 'Not initialized');
    console.log('Storage bucket:', storage().app.options.storageBucket);

    // Try to get video URL
    console.log('Attempting to get video URL...');
    const videoRef = storage().ref(videoPath);
    console.log('Video reference:', videoRef.fullPath);

    const url = await videoRef.getDownloadURL();
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

// Test account credentials
export const TEST_EMAIL = 'test@reelai.com';
export const TEST_PASSWORD = 'test123456';

// Create demo account if it doesn't exist
export const ensureDemoAccount = async () => {
  try {
    // First try to create the account
    const userCredential = await auth().signInWithEmailAndPassword(DEMO_EMAIL, DEMO_PASSWORD);
    console.log('Demo account created successfully');
    // Sign out after creation
    await auth().signOut();
  } catch (error: any) {
    // If account already exists, that's fine
    if (error.code === 'auth/email-already-in-use') {
      console.log('Demo account already exists');
    } else {
      console.error('Error setting up demo account:', error);
    }
  }
};

// Create test account if it doesn't exist
export const ensureTestAccount = async () => {
  try {
    // First try to create the account
    const userCredential = await auth().signInWithEmailAndPassword(TEST_EMAIL, TEST_PASSWORD);
    console.log('Test account created successfully');
    // Sign out after creation
    await auth().signOut();
  } catch (error: any) {
    // If account already exists, that's fine
    if (error.code === 'auth/email-already-in-use') {
      console.log('Test account already exists');
    } else {
      console.error('Error setting up test account:', error);
    }
  }
};

export const signInWithGoogleCredential = async (idToken: string) => {
  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  return auth().signInWithCredential(googleCredential);
};
