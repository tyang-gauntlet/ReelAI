import { onCall } from 'firebase-functions/v2/https';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
