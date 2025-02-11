import { onCall } from 'firebase-functions/v2/https';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vision from '@google-cloud/vision';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Vision client
const client = new vision.ImageAnnotatorClient();

export const generateVideoThumbnail = onCall(async request => {
  const pythonScript = join(
    __dirname,
    'python',
    'thumbnail_generator',
    'thumbnail_generator',
    'main.py',
  );

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3.11', [pythonScript], {
      env: {
        ...process.env,
        VIDEO_PATH: request.data.videoPath,
      },
    });

    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', data => {
      result += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      error += data.toString();
    });

    pythonProcess.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${error}`));
      } else {
        try {
          resolve(JSON.parse(result));
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${result}`));
        }
      }
    });
  });
});

export const analyzeImage = onCall(async request => {
  try {
    const { imageUrl } = request.data;

    if (!imageUrl) {
      throw new Error('No image URL provided');
    }

    // Analyze the image
    const [result] = await client.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: 'LABEL_DETECTION' },
        { type: 'OBJECT_LOCALIZATION' },
        { type: 'TEXT_DETECTION' },
        { type: 'LANDMARK_DETECTION' },
        { type: 'LOGO_DETECTION' },
        { type: 'FACE_DETECTION' },
      ],
    });

    return {
      success: true,
      analysis: {
        labels: result.labelAnnotations?.map(label => label.description) || [],
        objects: result.localizedObjectAnnotations?.map(obj => obj.name) || [],
        text: result.textAnnotations?.map(text => text.description) || [],
        landmarks: result.landmarkAnnotations?.map(landmark => landmark.description) || [],
        logos: result.logoAnnotations?.map(logo => logo.description) || [],
        faces:
          result.faceAnnotations?.map(face => ({
            joy: face.joyLikelihood === 'VERY_LIKELY' || face.joyLikelihood === 'LIKELY',
            sorrow: face.sorrowLikelihood === 'VERY_LIKELY' || face.sorrowLikelihood === 'LIKELY',
            anger: face.angerLikelihood === 'VERY_LIKELY' || face.angerLikelihood === 'LIKELY',
            surprise:
              face.surpriseLikelihood === 'VERY_LIKELY' || face.surpriseLikelihood === 'LIKELY',
          })) || [],
      },
    };
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw new Error('Failed to analyze image');
  }
});
