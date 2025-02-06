import os
import functions_framework
from typing import Dict, Any, List
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
import tempfile
import firebase_admin
from firebase_admin import initialize_app, storage, firestore, credentials
import logging
import json
from dotenv import load_dotenv
import requests
from urllib.parse import unquote
import base64
from datetime import datetime
import sys
from google.cloud import storage as google_storage

# Configure logging for both stdout and Cloud Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.StreamHandler(sys.stderr)
    ]
)

# Create a logger instance
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def log_separator():
    """Print a separator line for better log readability."""
    logger.info("\n" + "="*50 + "\n")


def convert_timestamps(data: Any) -> Any:
    """Convert Firestore timestamps to ISO format strings."""
    if isinstance(data, dict):
        return {k: convert_timestamps(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_timestamps(i) for i in data]
    elif hasattr(data, 'timestamp'):  # Check if it's a Firestore timestamp
        try:
            # Convert to seconds and nanoseconds
            seconds = data.timestamp()
            nanos = getattr(data, 'nanoseconds', 0)
            # Create datetime from seconds and add nanoseconds
            dt = datetime.fromtimestamp(seconds)
            # Format with maximum precision
            return dt.isoformat() + f'.{nanos:09d}'[:26] + 'Z'
        except Exception as e:
            logger.warning(f"Error converting timestamp: {e}")
            return str(data)
    return data


def initialize_firebase():
    """Initialize Firebase Admin SDK with proper error handling."""
    if not firebase_admin._apps:
        try:
            log_separator()
            logger.info("=== Initializing Firebase Admin SDK ===")

            # Load environment variables
            load_dotenv()

            # Log configuration details
            project_id = os.getenv('FIREBASE_PROJECT_ID')
            storage_bucket = os.getenv('FIREBASE_STORAGE_BUCKET')
            client_email = os.getenv('FIREBASE_CLIENT_EMAIL')

            logger.info(f"Project ID: {project_id}")
            logger.info(f"Storage Bucket: {storage_bucket}")
            logger.info(f"Service Account Email: {client_email}")

            # Verify storage bucket format
            if not storage_bucket:
                raise ValueError(
                    "FIREBASE_STORAGE_BUCKET environment variable is not set")

            # Try to access bucket directly first to verify it exists
            try:
                storage_client = google_storage.Client(project=project_id)
                bucket = storage_client.bucket(storage_bucket)
                bucket.reload()  # This will fail if bucket doesn't exist
                logger.info("✅ Storage bucket exists and is accessible")
            except Exception as bucket_error:
                logger.error("❌ Failed to access storage bucket directly")
                logger.error(f"Error type: {type(bucket_error).__name__}")
                logger.error(f"Error message: {str(bucket_error)}")
                # Try alternative bucket name formats
                alternative_buckets = [
                    f"{project_id}.appspot.com",
                    project_id
                ]
                logger.info(
                    f"Trying alternative bucket names: {alternative_buckets}")
                for alt_bucket in alternative_buckets:
                    try:
                        bucket = storage_client.bucket(alt_bucket)
                        bucket.reload()
                        logger.info(
                            f"✅ Found accessible bucket with name: {alt_bucket}")
                        storage_bucket = alt_bucket
                        break
                    except Exception:
                        logger.warning(
                            f"❌ Alternative bucket {alt_bucket} not accessible")
                else:
                    raise ValueError(
                        f"No accessible storage bucket found. Tried: {[storage_bucket] + alternative_buckets}")

            # Get and format private key
            private_key = os.getenv('FIREBASE_PRIVATE_KEY', '')
            logger.info("Formatting private key...")

            # Handle escaped newlines from environment variable
            private_key = private_key.replace('\\n', '\n')

            # Remove any existing headers/footers and extra whitespace
            private_key = private_key.replace(
                '-----BEGIN PRIVATE KEY-----', '')
            private_key = private_key.replace('-----END PRIVATE KEY-----', '')
            private_key = private_key.replace('\n', '')
            private_key = private_key.strip()

            # Add proper PEM formatting with line breaks every 64 characters
            lines = [private_key[i:i+64]
                     for i in range(0, len(private_key), 64)]
            private_key = '-----BEGIN PRIVATE KEY-----\n' + \
                '\n'.join(lines) + '\n-----END PRIVATE KEY-----\n'

            logger.info("Private key formatted successfully")

            # Create credentials from environment variables
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": project_id,
                "private_key": private_key,
                "client_email": client_email,
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc@{project_id}.iam.gserviceaccount.com"
            })

            # Initialize the app with explicit bucket
            app = initialize_app(credential=cred, options={
                'storageBucket': storage_bucket
            })

            # Verify storage bucket access
            try:
                bucket = storage.bucket()
                # Try to list a single file to verify access
                next(bucket.list_blobs(max_results=1), None)
                logger.info("✅ Storage bucket access verified successfully")
            except Exception as bucket_error:
                logger.error("❌ Failed to access storage bucket")
                logger.error(f"Error type: {type(bucket_error).__name__}")
                logger.error(f"Error message: {str(bucket_error)}")
                raise

            logger.info("=== Firebase Admin SDK initialized successfully ===")
            return app

        except Exception as e:
            logger.error("=== Error initializing Firebase Admin SDK ===")
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Error message: {str(e)}")
            raise


@functions_framework.http
def health(request):
    """Health check endpoint."""
    try:
        # Initialize Firebase to ensure credentials work
        initialize_firebase()
        return (json.dumps({"status": "healthy"}), 200, {'Content-Type': 'application/json'})
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return (json.dumps({"status": "unhealthy", "error": str(e)}), 500, {'Content-Type': 'application/json'})


def extract_dimensions_from_video(video_path: str) -> Dict[str, int]:
    """Extract width and height from video file."""
    try:
        cap = cv2.VideoCapture(video_path)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        cap.release()
        return {"width": width, "height": height, "fps": fps}
    except Exception as e:
        logger.error(f"Error extracting dimensions: {str(e)}")
        return {}


def generate_thumbnail(video_path: str) -> bytes:
    """Generate thumbnail from video file."""
    try:
        cap = cv2.VideoCapture(video_path)
        success, frame = cap.read()
        if not success:
            raise ValueError("Could not read video frame")
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb_frame)
        img_byte_arr = BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=85)
        cap.release()
        return img_byte_arr.getvalue()
    except Exception as e:
        logger.error(f"Error generating thumbnail: {str(e)}")
        raise


def get_videos_without_thumbnails() -> List[Dict[str, Any]]:
    """Get all videos that don't have thumbnails."""
    try:
        log_separator()
        logger.info("=== Fetching videos without thumbnails ===")
        db = firestore.client()
        videos_ref = db.collection('videos')

        # Get all videos first
        logger.info("Querying Firestore for all videos...")
        all_videos = videos_ref.get()
        total_videos = len(list(all_videos))
        logger.info(f"Found {total_videos} total videos")

        results = []
        for video in all_videos:
            video_data = video.to_dict()
            video_data['id'] = video.id

            # Convert timestamps to ISO format strings
            video_data = convert_timestamps(video_data)

            # Check if video has no thumbnailUrl or if thumbnailUrl is None or empty
            if ('storageUrl' in video_data and
                ('thumbnailUrl' not in video_data or
                 video_data.get('thumbnailUrl') is None or
                 video_data.get('thumbnailUrl') == '')):
                log_separator()
                logger.info("=== Found video without thumbnail ===")
                logger.info(f"Video ID: {video.id}")
                logger.info(
                    f"Storage URL: {video_data.get('storageUrl', 'N/A')}")
                logger.info(
                    f"Storage Path: {video_data.get('storagePath', 'N/A')}")
                logger.info(
                    f"Current Processing Status: {video_data.get('processingStatus', 'N/A')}")
                logger.info(
                    f"Created At: {video_data.get('createdAt', 'N/A')}")
                logger.info(
                    f"Updated At: {video_data.get('updatedAt', 'N/A')}")
                logger.info(
                    f"Full Video Data: {json.dumps(video_data, indent=2)}")
                results.append(video_data)

        log_separator()
        logger.info(f"=== Summary ===")
        logger.info(f"Total videos in database: {total_videos}")
        logger.info(f"Videos without thumbnails: {len(results)}")
        return results
    except Exception as e:
        logger.error("=== Error getting videos without thumbnails ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        return []


def process_local_video(video_id: str, temp_local_filename: str, video_path: str) -> Dict[str, Any]:
    """Process a local video file and update metadata."""
    try:
        logger.info(f"\n=== Processing local video file ===")
        logger.info(f"Video ID: {video_id}")
        logger.info(f"Temp file: {temp_local_filename}")
        logger.info(f"Storage path: {video_path}")

        # Extract dimensions
        logger.info("Extracting video dimensions...")
        dimensions = extract_dimensions_from_video(temp_local_filename)
        logger.info(f"Dimensions: {dimensions}")

        # Generate thumbnail
        logger.info("Generating thumbnail...")
        thumbnail_data = generate_thumbnail(temp_local_filename)
        logger.info(f"Thumbnail size: {len(thumbnail_data)} bytes")

        # Upload thumbnail
        thumbnail_path = f"thumbnails/{video_id}.jpg"
        logger.info(f"Uploading thumbnail to: {thumbnail_path}")
        bucket = storage.bucket()
        thumbnail_blob = bucket.blob(thumbnail_path)
        thumbnail_blob.upload_from_string(
            thumbnail_data,
            content_type='image/jpeg'
        )
        logger.info("Thumbnail uploaded successfully")

        # Update video metadata in Firestore
        logger.info("Updating video metadata in Firestore...")
        db = firestore.client()
        video_ref = db.collection('videos').document(video_id)
        update_data = {
            'metadata': {
                'width': dimensions['width'],
                'height': dimensions['height'],
                'fps': dimensions['fps']
            },
            'thumbnailUrl': f"gs://{bucket.name}/{thumbnail_path}",
            'processingStatus': 'completed',
            'storagePath': video_path
        }
        video_ref.update(update_data)
        logger.info("Firestore update successful")

        result = {
            "success": True,
            "videoId": video_id,
            "thumbnailPath": thumbnail_path,
            "dimensions": dimensions,
            "videoPath": video_path
        }
        logger.info(f"Processing complete: {json.dumps(result, indent=2)}")
        return result

    except Exception as e:
        logger.error(f"\n=== Error processing local video file ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        raise
    finally:
        # Clean up temp file
        if os.path.exists(temp_local_filename):
            logger.info(f"Cleaning up temp file: {temp_local_filename}")
            os.remove(temp_local_filename)
            logger.info("Temp file removed")


def get_possible_video_paths(video_data: Dict[str, Any]) -> List[str]:
    """Get all possible paths where the video might be stored."""
    video_id = video_data['id']
    possible_paths = []

    # Log the video data we're working with
    logger.info(f"Generating possible paths for video {video_id}")
    logger.info(f"Storage URL: {video_data.get('storageUrl', 'N/A')}")
    logger.info(f"Storage Path: {video_data.get('storagePath', 'N/A')}")

    # 1. Try storagePath first if available
    if 'storagePath' in video_data and video_data['storagePath']:
        path = video_data['storagePath']
        possible_paths.append(path)
        logger.info(f"Added storagePath: {path}")

        # Also try without .mp4 extension if it has one
        if path.endswith('.mp4'):
            base_path = path[:-4]
            possible_paths.append(base_path)
            logger.info(f"Added base path: {base_path}")

    # 2. Try paths from storageUrl
    if 'storageUrl' in video_data and video_data['storageUrl']:
        url = video_data['storageUrl']
        logger.info(f"Processing storage URL: {url}")

        if url.startswith('gs://'):
            # Extract path from gs:// URL
            path = '/'.join(url.split('/')[3:])
            possible_paths.append(path)
            logger.info(f"Added path from gs:// URL: {path}")
        elif url.startswith('https://'):
            # Extract path from https:// URL
            if 'o/' in url:
                path = url.split('o/', 1)[-1].split('?')[0]
                path = unquote(path)
                possible_paths.append(path)
                logger.info(f"Added path from https:// URL: {path}")

    # 3. Try standard paths
    standard_paths = [
        f"videos/{video_id}.mp4",
        f"videos/{video_id}",
        f"raw/{video_id}.mp4",
        f"raw/{video_id}",
        video_id + '.mp4',
        video_id
    ]

    for path in standard_paths:
        if path not in possible_paths:
            possible_paths.append(path)
    logger.info(f"Added standard paths: {', '.join(standard_paths)}")

    # Remove duplicates while preserving order
    unique_paths = []
    for path in possible_paths:
        if path and path not in unique_paths:
            unique_paths.append(path)

    logger.info(f"Final paths to try ({len(unique_paths)}):")
    for path in unique_paths:
        logger.info(f"- {path}")

    return unique_paths


def process_video(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single video to generate thumbnail and extract metadata."""
    try:
        video_id = video_data['id']
        log_separator()
        logger.info(f"=== Processing video {video_id} ===")

        # Convert timestamps before logging
        log_data = convert_timestamps(video_data)
        logger.info(f"Full video data: {json.dumps(log_data, indent=2)}")

        # Get bucket information
        bucket = storage.bucket()
        logger.info(f"=== Storage Bucket Information ===")
        logger.info(f"Bucket Name: {bucket.name}")
        logger.info(f"Bucket Location: {bucket.location}")
        logger.info(f"Bucket Storage Class: {bucket.storage_class}")
        try:
            bucket.reload()
            logger.info("✅ Bucket is accessible")
        except Exception as bucket_error:
            logger.error("❌ Failed to access bucket")
            logger.error(f"Error type: {type(bucket_error).__name__}")
            logger.error(f"Error message: {str(bucket_error)}")
            raise

        # Get all possible paths for the video
        possible_paths = get_possible_video_paths(video_data)

        # First try to download directly from storageUrl if available
        if 'storageUrl' in video_data and video_data['storageUrl']:
            try:
                storage_url = video_data['storageUrl']
                logger.info(f"\n--- Attempting download from URL ---")
                logger.info(f"URL: {storage_url}")

                # If it's a gs:// URL, use the storage client
                if storage_url.startswith('gs://'):
                    bucket_name = storage_url.split('/')[2]
                    path = '/'.join(storage_url.split('/')[3:])
                    logger.info(f"Using Cloud Storage client for gs:// URL")
                    logger.info(f"Bucket: {bucket_name}")
                    logger.info(f"Path: {path}")

                    try:
                        bucket = storage.bucket(bucket_name)
                        blob = bucket.blob(path)
                        if blob.exists():
                            _, temp_local_filename = tempfile.mkstemp(
                                suffix='.mp4')
                            logger.info(
                                f"Downloading to temp file: {temp_local_filename}")
                            blob.download_to_filename(temp_local_filename)
                            logger.info(
                                "Successfully downloaded from gs:// URL")
                            return process_local_video(video_id, temp_local_filename, path)
                    except Exception as bucket_error:
                        logger.error(f"Error accessing bucket {bucket_name}")
                        logger.error(
                            f"Error type: {type(bucket_error).__name__}")
                        logger.error(f"Error message: {str(bucket_error)}")
                else:
                    # Download to temp file using HTTP
                    logger.info("Using HTTP client for download")
                    _, temp_local_filename = tempfile.mkstemp(suffix='.mp4')
                    logger.info(
                        f"Downloading to temp file: {temp_local_filename}")

                    try:
                        response = requests.get(storage_url, stream=True)
                        if response.status_code == 200:
                            with open(temp_local_filename, 'wb') as f:
                                for chunk in response.iter_content(chunk_size=8192):
                                    f.write(chunk)
                            logger.info(
                                "Successfully downloaded from HTTP URL")
                            return process_local_video(video_id, temp_local_filename, video_data.get('storagePath'))
                        else:
                            logger.error(
                                f"HTTP download failed with status code: {response.status_code}")
                            logger.error(f"Response content: {response.text}")
                    except Exception as http_error:
                        logger.error("Error downloading from HTTP URL")
                        logger.error(
                            f"Error type: {type(http_error).__name__}")
                        logger.error(f"Error message: {str(http_error)}")

            except Exception as download_error:
                logger.error(
                    f"Error downloading from URL: {str(download_error)}")
                logger.error(f"Error type: {type(download_error).__name__}")

        # If direct download failed or wasn't available, try storage paths
        logger.info("\n--- Trying storage paths ---")

        # Try each possible path
        for path in possible_paths:
            logger.info(f"Checking path: {path}")
            try:
                blob = bucket.blob(path)
                if blob.exists():
                    logger.info(f"✅ Found video at path: {path}")
                    _, temp_local_filename = tempfile.mkstemp(suffix='.mp4')
                    logger.info(
                        f"Downloading to temp file: {temp_local_filename}")
                    blob.download_to_filename(temp_local_filename)
                    logger.info("Download successful")
                    return process_local_video(video_id, temp_local_filename, path)
                else:
                    logger.info(f"❌ Path not found: {path}")
            except Exception as blob_error:
                logger.error(f"Error checking path {path}")
                logger.error(f"Error type: {type(blob_error).__name__}")
                logger.error(f"Error message: {str(blob_error)}")

        # If we get here, we couldn't find the video
        error_msg = f"Video not found. Tried paths: {', '.join(possible_paths)}"
        logger.error(error_msg)
        return {"error": error_msg, "videoId": video_id}

    except Exception as e:
        error_msg = str(e)
        logger.error(
            f"\n=== Error processing video {video_data.get('id')} ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {error_msg}")
        # Update status to failed in Firestore
        try:
            db = firestore.client()
            video_ref = db.collection('videos').document(video_data['id'])
            video_ref.update({
                'processingStatus': 'failed',
                'processingError': error_msg
            })
            logger.info("Updated Firestore with failed status")
        except Exception as update_error:
            logger.error(f"Error updating failed status: {str(update_error)}")
            logger.error(f"Error type: {type(update_error).__name__}")
        return {"error": error_msg, "videoId": video_data.get('id')}


@functions_framework.http
def generate_video_thumbnail(request):
    """HTTP Cloud Function."""
    try:
        # Log the function invocation
        logger.info("Function invoked")

        # Set CORS headers for the preflight request
        if request.method == 'OPTIONS':
            headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '3600'
            }
            return ('', 204, headers)

        # Set CORS headers for the main request
        headers = {
            'Access-Control-Allow-Origin': '*'
        }

        # Health check endpoint
        if request.path == "/_ah/warmup" or request.path == "/health":
            return (json.dumps({"status": "healthy"}), 200, headers)

        # Initialize Firebase before processing request
        initialize_firebase()

        request_json = request.get_json(silent=True)
        logger.info(f"Received request: {request_json}")

        # If videoPath is provided, process single video
        if request_json and 'videoPath' in request_json:
            video_path = request_json['videoPath']
            video_id = os.path.splitext(os.path.basename(video_path))[0]
            result = process_video({
                'id': video_id,
                'storagePath': video_path
            })
            return (json.dumps(result), 200 if 'success' in result else 500, headers)

        # Process all videos without thumbnails
        videos = get_videos_without_thumbnails()
        if not videos:
            return (json.dumps({"message": "No videos found without thumbnails"}), 200, headers)

        results = []
        for video in videos:
            result = process_video(video)
            results.append(result)

        summary = {
            "total": len(results),
            "successful": len([r for r in results if 'success' in r]),
            "failed": len([r for r in results if 'error' in r]),
            "results": results
        }

        return (json.dumps(summary), 200, headers)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in generate_video_thumbnail: {error_msg}")
        return (json.dumps({"error": error_msg}), 500, headers)
