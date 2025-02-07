import { onCall, HttpsOptions } from 'firebase-functions/v2/https';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runPythonFunction = async (functionName: string, data: any) => {
  const pythonScript = join(__dirname, 'main.py');

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3.11', [pythonScript, functionName], {
      env: {
        ...process.env,
        FUNCTION_DATA: JSON.stringify(data),
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
};

// Common options for all functions
const commonOptions = {
  region: 'us-central1',
  cors: true,
} as const;

// Specific options for each function
const thumbnailOptions: HttpsOptions = {
  ...commonOptions,
  memory: '512mb',
  timeoutSeconds: 540,
  minInstances: 0,
  maxInstances: 10,
};

const hashtagOptions: HttpsOptions = {
  ...commonOptions,
  memory: '2048mb',
  timeoutSeconds: 300,
  minInstances: 0,
  maxInstances: 10,
};

const healthOptions: HttpsOptions = {
  ...commonOptions,
  memory: '256mb',
  timeoutSeconds: 30,
  minInstances: 0,
  maxInstances: 1,
};

const listVideosOptions: HttpsOptions = {
  ...commonOptions,
  memory: '256mb',
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 2,
};

export const generateVideoThumbnail = onCall(thumbnailOptions, async request => {
  return runPythonFunction('generate_video_thumbnail', request.data);
});

export const generateVideoHashtags = onCall(hashtagOptions, async request => {
  return runPythonFunction('generate_video_hashtags', request.data);
});

export const health = onCall(healthOptions, async request => {
  return runPythonFunction('health', request.data);
});

export const listRootVideos = onCall(listVideosOptions, async request => {
  return runPythonFunction('list_root_videos', request.data);
});
