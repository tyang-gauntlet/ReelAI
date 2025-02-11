import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
  uploadBytes,
} from 'firebase/storage';
import { db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import base64 from 'base64-js';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// Types for the analysis response
interface AnalysisResponse {
  success: boolean;
  videoId: string;
  analysis: {
    technical_analysis: Record<string, any>;
    lighting_analysis: Record<string, any>;
    color_analysis: Record<string, any>;
    composition_analysis: Record<string, any>;
    equipment_estimates: string[];
    recommendations: string[];
  };
}

// Keep both function names for backward compatibility
export const analyzeScreenshot = async (
  base64Image: string,
  videoId: string,
): Promise<AnalysisResponse> => {
  try {
    const functions = getFunctions();
    const analyzeFunction = httpsCallable<{ imageData: string; videoId: string }, AnalysisResponse>(
      functions,
      'video_frame_analyzer',
    );

    // Try different data formats
    let imageData = base64Image;

    // Remove any existing data URI prefix
    imageData = imageData.replace(/^data:image\/\w+;base64,/, '');

    // Remove any whitespace
    imageData = imageData.trim();

    // Ensure valid base64 padding
    while (imageData.length % 4) {
      imageData += '=';
    }

    // Prepare request data
    const requestData = {
      imageData,
      videoId,
    };

    // Log the request
    console.log('Cloud Function request:', {
      dataLength: requestData.imageData.length,
      videoId: requestData.videoId,
      sampleData: requestData.imageData.substring(0, 50),
    });

    // Make the request
    const result = await analyzeFunction(requestData);
    return result.data;
  } catch (error) {
    console.error('Cloud Function error:', error);
    throw error;
  }
};

// New function name
export const analyzeVideoFrame = async (
  videoId: string,
  base64Image: string,
): Promise<AnalysisResponse> => {
  try {
    const storage = getStorage();
    const functions = getFunctions();

    // Keep using screenshots folder
    const filename = `screenshots/${videoId}_${Date.now()}.jpg`;
    const imageRef = ref(storage, filename);

    // Clean base64 data first
    let imageData = base64Image;
    if (imageData.includes('base64,')) {
      imageData = imageData.split('base64,')[1];
    }

    // Remove all non-base64 characters
    imageData = imageData.replace(/[^A-Za-z0-9+/]/g, '');

    // Add proper base64 padding
    while (imageData.length % 4) {
      imageData += '=';
    }

    console.log('Upload preparation:', {
      filename,
      originalLength: base64Image.length,
      cleanedLength: imageData.length,
      sample: imageData.substring(0, 50),
      hasValidChars: /^[A-Za-z0-9+/=]+$/.test(imageData),
    });

    // Upload using data URL format since that's what the camera provides
    const dataUrl = `data:image/jpeg;base64,${imageData}`;
    await uploadString(imageRef, dataUrl, 'data_url', {
      contentType: 'image/jpeg',
      customMetadata: {
        originalFilename: `${videoId}.jpg`,
        uploadTime: new Date().toISOString(),
      },
    });
    console.log('Image uploaded to storage');

    // Get the download URL
    const imageUrl = await getDownloadURL(imageRef);
    console.log('Got download URL:', imageUrl);

    // Now call the analyze_stored_image function with the URL
    const analyzeFunction = httpsCallable<{ imageUrl: string; videoId: string }, AnalysisResponse>(
      functions,
      'analyze_stored_image',
    );

    // Send the URL for analysis
    const result = await analyzeFunction({
      imageUrl,
      videoId,
    });

    if (!result.data) {
      throw new Error('No analysis result');
    }

    // Store the analysis result in Firestore
    await setDoc(doc(db, 'video_analyses', videoId), {
      ...result.data,
      timestamp: new Date().toISOString(),
      imageUrl,
    });

    return result.data;
  } catch (error) {
    console.error('Analysis error:', {
      error,
      type: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};

// Helper function to get analysis results from Firestore
export const getVideoAnalysis = async (videoId: string) => {
  try {
    const analysisRef = doc(db, 'video_analyses', videoId);
    const analysisDoc = await analysisRef.get();
    return analysisDoc.exists() ? analysisDoc.data() : null;
  } catch (error) {
    console.error('Error getting video analysis:', error);
    throw error;
  }
};

// Add this test function
export const testImageUpload = async (): Promise<string> => {
  try {
    const storage = getStorage();
    const testFilename = 'thumbnails/1500734-hd_1920_1080_24fps.jpg';
    const newFilename = `screenshots/test_${Date.now()}.jpg`;
    const sourceRef = ref(storage, testFilename);
    const destRef = ref(storage, newFilename);

    console.log('Test upload starting:', {
      source: testFilename,
      destination: newFilename,
    });

    // Get the download URL of source file
    const sourceUrl = await getDownloadURL(sourceRef);
    console.log('Got source URL:', sourceUrl);

    // Download and re-upload the file
    const response = await fetch(sourceUrl);
    const blob = await response.blob();
    await uploadBytes(destRef, blob);
    console.log('Test file uploaded');

    // Get the new download URL
    const destUrl = await getDownloadURL(destRef);
    console.log('Got destination URL:', destUrl);

    return destUrl;
  } catch (error) {
    console.error('Test upload error:', {
      error,
      type: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
