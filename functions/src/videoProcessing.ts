import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as ffmpeg from 'fluent-ffmpeg';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { Storage } from '@google-cloud/storage';
import * as vision from '@google-cloud/vision';
import * as videoIntelligence from '@google-cloud/video-intelligence';

const storage = new Storage();
const visionClient = new vision.ImageAnnotatorClient();
const videoClient = new videoIntelligence.VideoIntelligenceServiceClient();

export const processVideoUpload = functions.storage.object().onFinalize(async object => {
  if (!object.contentType?.includes('video/')) return;

  const filePath = object.name;
  if (!filePath) return;

  const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));
  const bucket = storage.bucket(object.bucket);
  const db = admin.firestore();

  try {
    // Download video to temp storage
    await bucket.file(filePath).download({ destination: tempFilePath });

    // Extract basic metadata
    const metadata = await extractVideoMetadata(tempFilePath);

    // Generate thumbnails
    const thumbnailPaths = await generateThumbnails(tempFilePath, filePath);

    // Analyze video content
    const [videoAnalysis, thumbnailAnalysis] = await Promise.all([
      analyzeVideoContent(tempFilePath),
      analyzeThumbnails(thumbnailPaths),
    ]);

    // Combine all metadata
    const combinedMetadata = {
      ...metadata,
      thumbnails: thumbnailPaths,
      aiTags: {
        objects: videoAnalysis.objects,
        actions: videoAnalysis.actions,
        scenes: videoAnalysis.scenes,
        labels: thumbnailAnalysis.labels,
        confidence: videoAnalysis.confidence,
      },
      category: determineCategory(videoAnalysis, thumbnailAnalysis),
      habitat: determineHabitat(videoAnalysis, thumbnailAnalysis),
      species: determineSpecies(videoAnalysis, thumbnailAnalysis),
      region: determineRegion(videoAnalysis, thumbnailAnalysis),
    };

    // Update Firestore
    const videoDoc = await findVideoDocByStoragePath(db, filePath);
    if (videoDoc) {
      await videoDoc.ref.update({
        metadata: combinedMetadata,
        processingStatus: 'completed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Cleanup
    await cleanupTempFiles([tempFilePath, ...thumbnailPaths]);
  } catch (error) {
    console.error('Error processing video:', error);
    throw error;
  }
});

async function extractVideoMetadata(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      resolve({
        duration: metadata.format.duration,
        size: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        format: metadata.format.format_name,
        resolution: {
          width: metadata.streams[0].width,
          height: metadata.streams[0].height,
        },
      });
    });
  });
}

async function generateThumbnails(videoPath: string, originalPath: string): Promise<string[]> {
  const timestamps = [0, 25, 50, 75]; // Percentage of video duration
  const thumbnailPaths: string[] = [];

  for (const timestamp of timestamps) {
    const thumbnailPath = path.join(
      os.tmpdir(),
      `thumb_${timestamp}_${path.basename(originalPath)}.jpg`,
    );
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp + '%'],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
        })
        .on('end', resolve)
        .on('error', reject);
    });
    thumbnailPaths.push(thumbnailPath);
  }

  return thumbnailPaths;
}

async function analyzeVideoContent(videoPath: string) {
  const [operation] = await videoClient.annotateVideo({
    inputContent: fs.readFileSync(videoPath).toString('base64'),
    features: ['LABEL_DETECTION', 'SHOT_CHANGE_DETECTION', 'OBJECT_TRACKING'],
  });

  const [result] = await operation.promise();

  return {
    objects: extractObjects(result),
    actions: extractActions(result),
    scenes: extractScenes(result),
    confidence: calculateConfidence(result),
  };
}

async function analyzeThumbnails(thumbnailPaths: string[]) {
  const analyses = await Promise.all(
    thumbnailPaths.map(async path => {
      const [result] = await visionClient.annotateImage({
        image: { content: fs.readFileSync(path) },
        features: [
          { type: 'LABEL_DETECTION' },
          { type: 'OBJECT_LOCALIZATION' },
          { type: 'LANDMARK_DETECTION' },
        ],
      });
      return result;
    }),
  );

  return {
    labels: combineLabels(analyses),
    landmarks: extractLandmarks(analyses),
  };
}

// Helper functions for categorization
function determineCategory(videoAnalysis: any, thumbnailAnalysis: any) {
  // Implement logic to determine category based on detected objects and scenes
  // Return 'wildlife', 'marine', 'birds', etc.
}

function determineHabitat(videoAnalysis: any, thumbnailAnalysis: any) {
  // Implement logic to determine habitat based on scenes and landmarks
  // Return 'forest', 'ocean', 'savanna', etc.
}

function determineSpecies(videoAnalysis: any, thumbnailAnalysis: any) {
  // Implement logic to determine species from detected objects
  // Return specific animal species if detected
}

function determineRegion(videoAnalysis: any, thumbnailAnalysis: any) {
  // Implement logic to determine region based on landmarks and geography
  // Return geographical region if detected
}
