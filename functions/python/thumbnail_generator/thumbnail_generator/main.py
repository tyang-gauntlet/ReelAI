import os
import sys
import json
from typing import Dict, Any
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
import tempfile
import firebase_admin
from firebase_admin import initialize_app, storage, firestore
import logging
from dotenv import load_dotenv
import requests
from urllib.parse import unquote

# Load environment variables in local development
if not firebase_admin._apps:
    load_dotenv()
    # Initialize Firebase Admin with bucket from environment
    initialize_app(options={
        'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET', 'reelai-c82fc.appspot.com')
    })


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
        logging.error(f"Error extracting dimensions: {str(e)}")
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
        logging.error(f"Error generating thumbnail: {str(e)}")
        raise


def process_video(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single video to generate thumbnail and extract metadata."""
    try:
        video_id = video_data['id']

        # First try to download directly from storageUrl if available
        if 'storageUrl' in video_data and video_data['storageUrl']:
            try:
                storage_url = video_data['storageUrl']
                logging.info(f"Attempting to download from URL: {storage_url}")

                # Download to temp file
                _, temp_local_filename = tempfile.mkstemp(suffix='.mp4')

                # Use requests to download the file
                response = requests.get(storage_url, stream=True)
                if response.status_code == 200:
                    with open(temp_local_filename, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)

                    try:
                        # Extract dimensions
                        dimensions = extract_dimensions_from_video(
                            temp_local_filename)

                        # Generate thumbnail
                        thumbnail_data = generate_thumbnail(
                            temp_local_filename)

                        # Upload thumbnail
                        thumbnail_path = f"thumbnails/{video_id}.jpg"
                        bucket = storage.bucket()
                        thumbnail_blob = bucket.blob(thumbnail_path)
                        thumbnail_blob.upload_from_string(
                            thumbnail_data,
                            content_type='image/jpeg'
                        )

                        # Update video metadata in Firestore
                        db = firestore.client()
                        video_ref = db.collection('videos').document(video_id)
                        update_data = {
                            'metadata': {
                                'width': dimensions['width'],
                                'height': dimensions['height'],
                                'fps': dimensions['fps']
                            },
                            'thumbnailUrl': f"gs://{bucket.name}/{thumbnail_path}",
                            'processingStatus': 'completed'
                        }
                        video_ref.update(update_data)

                        return {
                            "success": True,
                            "videoId": video_id,
                            "thumbnailPath": thumbnail_path,
                            "dimensions": dimensions
                        }
                    finally:
                        # Clean up temp file
                        if os.path.exists(temp_local_filename):
                            os.remove(temp_local_filename)

            except Exception as download_error:
                logging.error(
                    f"Error downloading from URL: {str(download_error)}")
                # Continue to try other methods if direct download fails

        # If direct download failed or wasn't available, try storage paths
        possible_paths = []

        # Add path from storagePath if available
        if 'storagePath' in video_data and video_data['storagePath']:
            possible_paths.append(video_data['storagePath'])

        # Add path from storageUrl if available
        if 'storageUrl' in video_data and video_data['storageUrl']:
            storage_url = video_data['storageUrl']
            # Extract path from gs:// URL or https:// URL
            if storage_url.startswith('gs://'):
                path = storage_url.split('/', 3)[-1]
                possible_paths.append(path)
            elif storage_url.startswith('https://'):
                # Extract the path after the bucket name
                path = storage_url.split('o/', 1)[-1].split('?')[0]
                # URL decode the path
                path = unquote(path)
                possible_paths.append(path)

        # Add default paths as fallback
        possible_paths.extend([
            f"videos/{video_id}.mp4",
            f"videos/{video_id}"
        ])

        # Filter out empty paths and remove duplicates
        possible_paths = list(set(filter(None, possible_paths)))
        logging.info(
            f"Trying possible paths for video {video_id}: {possible_paths}")

        # Get video from storage
        bucket = storage.bucket()
        video_blob = None
        video_path = None

        # Try each possible path
        for path in possible_paths:
            temp_blob = bucket.blob(path)
            if temp_blob.exists():
                video_blob = temp_blob
                video_path = path
                logging.info(f"Found video at path: {path}")
                break

        if not video_blob:
            return {"error": f"Video not found. Tried paths: {', '.join(possible_paths)}"}

        # Download to temp file
        _, temp_local_filename = tempfile.mkstemp(suffix='.mp4')
        video_blob.download_to_filename(temp_local_filename)

        try:
            # Extract dimensions
            dimensions = extract_dimensions_from_video(temp_local_filename)

            # Generate thumbnail
            thumbnail_data = generate_thumbnail(temp_local_filename)

            # Upload thumbnail
            thumbnail_path = f"thumbnails/{video_id}.jpg"
            thumbnail_blob = bucket.blob(thumbnail_path)
            thumbnail_blob.upload_from_string(
                thumbnail_data,
                content_type='image/jpeg'
            )

            # Update video metadata in Firestore
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
                'storagePath': video_path  # Update with the correct path we found
            }
            video_ref.update(update_data)

            return {
                "success": True,
                "videoId": video_id,
                "thumbnailPath": thumbnail_path,
                "dimensions": dimensions,
                "videoPath": video_path
            }

        finally:
            # Clean up temp file
            if os.path.exists(temp_local_filename):
                os.remove(temp_local_filename)

    except Exception as e:
        error_msg = str(e)
        logging.error(
            f"Error processing video {video_data.get('id')}: {error_msg}")
        # Update status to failed in Firestore
        try:
            db = firestore.client()
            video_ref = db.collection('videos').document(video_data['id'])
            video_ref.update({
                'processingStatus': 'failed',
                'processingError': error_msg
            })
        except Exception as update_error:
            logging.error(f"Error updating failed status: {str(update_error)}")
        return {"error": error_msg, "videoId": video_data.get('id')}


def main():
    try:
        # Get video path from environment variable
        video_path = os.environ.get('VIDEO_PATH')
        if not video_path:
            raise ValueError("No video path provided")

        video_id = os.path.splitext(os.path.basename(video_path))[0]

        # Get video from storage
        bucket = storage.bucket()
        video_blob = bucket.blob(video_path)

        if not video_blob.exists():
            raise ValueError("Video not found")

        # Download to temp file
        _, temp_local_filename = tempfile.mkstemp()
        video_blob.download_to_filename(temp_local_filename)

        try:
            # Extract dimensions
            dimensions = extract_dimensions_from_video(temp_local_filename)

            # Generate thumbnail
            thumbnail_data = generate_thumbnail(temp_local_filename)

            # Upload thumbnail
            thumbnail_path = f"thumbnails/{video_id}.jpg"
            thumbnail_blob = bucket.blob(thumbnail_path)
            thumbnail_blob.upload_from_string(
                thumbnail_data,
                content_type='image/jpeg'
            )

            # Update video metadata in Firestore
            if dimensions:
                db = firestore.client()
                video_ref = db.collection('videos').document(video_id)
                video_ref.update({
                    'metadata': {
                        'width': dimensions['width'],
                        'height': dimensions['height'],
                        'fps': dimensions['fps']
                    },
                    'thumbnailUrl': f"gs://{bucket.name}/{thumbnail_path}"
                })

            result = {
                "success": True,
                "thumbnailPath": thumbnail_path,
                "dimensions": dimensions
            }
            print(json.dumps(result))

        finally:
            # Clean up temp file
            if os.path.exists(temp_local_filename):
                os.remove(temp_local_filename)

    except Exception as e:
        error_result = {"error": str(e)}
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()
