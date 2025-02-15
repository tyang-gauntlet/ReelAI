import os
from typing import Dict, Any
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
import tempfile
import firebase_functions as functions
from firebase_admin import initialize_app, storage, firestore
import logging
from python.image_analyzer.image_analyzer.main import analyze_image

# Initialize Firebase Admin
initialize_app()


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

        # Read first frame
        success, frame = cap.read()
        if not success:
            raise ValueError("Could not read video frame")

        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Convert to PIL Image
        image = Image.fromarray(rgb_frame)

        # Save to bytes
        img_byte_arr = BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=85)

        cap.release()
        return img_byte_arr.getvalue()
    except Exception as e:
        logging.error(f"Error generating thumbnail: {str(e)}")
        raise


@functions.on_call()
def generate_video_thumbnail(request: functions.CallableRequest) -> Dict[str, Any]:
    """Cloud Function to generate video thumbnail."""
    try:
        # Get video path from request
        data = request.data
        if not data or 'videoPath' not in data:
            return {"error": "No video path provided"}

        video_path = data['videoPath']
        video_id = os.path.splitext(os.path.basename(video_path))[0]

        # Get video from storage
        bucket = storage.bucket()
        video_blob = bucket.blob(video_path)

        if not video_blob.exists():
            return {"error": "Video not found"}

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

            # Get thumbnail URL
            thumbnail_url = f"gs://{bucket.name}/{thumbnail_path}"

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
                    'thumbnailUrl': thumbnail_url,
                    'thumbnailPath': thumbnail_path,
                    'processingStatus': 'completed',
                    'updatedAt': firestore.SERVER_TIMESTAMP
                })

            return {
                "success": True,
                "videoId": video_id,
                "thumbnailPath": thumbnail_path,
                "thumbnailUrl": thumbnail_url,
                "dimensions": dimensions
            }

        finally:
            # Clean up temp file
            if os.path.exists(temp_local_filename):
                os.remove(temp_local_filename)

    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error processing video: {error_msg}")

        # Update error status in Firestore
        try:
            db = firestore.client()
            video_ref = db.collection('videos').document(video_id)
            video_ref.update({
                'processingStatus': 'failed',
                'processingError': error_msg,
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
        except Exception as update_error:
            logging.error(
                f"Error updating failure status: {str(update_error)}")

        return {"error": error_msg}


@functions.on_call()
def analyze_screenshot(request: functions.CallableRequest) -> Dict[str, Any]:
    """Cloud Function to analyze an image using Google Cloud Vision API."""
    try:
        image_data = request.data.get('imageData')
        if not image_data:
            raise ValueError('No image data provided')

        return analyze_image(image_data)
    except Exception as e:
        logging.error(f"Error in analyze_screenshot: {str(e)}")
        raise functions.HttpsError('internal', str(e))
