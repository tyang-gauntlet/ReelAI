"""Thumbnail generator module for video content."""

import os
from typing import Dict, Any
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
import tempfile
from firebase_admin import storage, firestore
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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
        logger.error(f"Error generating thumbnail: {str(e)}")
        raise


def process_video(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a video and generate thumbnail."""
    try:
        # Get video path from request
        if not request_data or 'videoPath' not in request_data:
            logger.error("No video path provided in request data")
            return {"error": "No video path provided"}

        video_path = request_data['videoPath']
        # Handle both root and videos/ directory paths
        video_id = os.path.splitext(os.path.basename(video_path))[0]

        logger.info(f"Processing video: {video_path} (ID: {video_id})")

        # Get video from storage
        bucket = storage.bucket()
        logger.info(f"Accessing bucket: {bucket.name}")

        video_blob = bucket.blob(video_path)
        logger.info(f"Checking existence of video blob: {video_path}")

        if not video_blob.exists():
            logger.error(f"Video not found in storage: {video_path}")
            return {"error": "Video not found"}

        logger.info("Video found in storage, downloading to temp file...")

        # Download to temp file
        _, temp_local_filename = tempfile.mkstemp()
        video_blob.download_to_filename(temp_local_filename)
        logger.info(
            f"Video downloaded to temporary file: {temp_local_filename}")

        try:
            # Extract dimensions
            logger.info("Extracting video dimensions...")
            dimensions = extract_dimensions_from_video(temp_local_filename)
            logger.info(f"Video dimensions: {dimensions}")

            # Generate thumbnail
            logger.info("Generating thumbnail...")
            thumbnail_data = generate_thumbnail(temp_local_filename)
            logger.info("Thumbnail generated successfully")

            # Upload thumbnail to thumbnails/ directory
            thumbnail_path = f"thumbnails/{video_id}.jpg"
            logger.info(f"Uploading thumbnail to: {thumbnail_path}")
            thumbnail_blob = bucket.blob(thumbnail_path)
            thumbnail_blob.upload_from_string(
                thumbnail_data,
                content_type='image/jpeg'
            )
            logger.info("Thumbnail uploaded successfully")

            # Update video metadata in Firestore
            if dimensions:
                logger.info("Updating video metadata in Firestore...")
                db = firestore.client()
                video_ref = db.collection('videos').document(video_id)
                video_ref.update({
                    'metadata': {
                        'width': dimensions['width'],
                        'height': dimensions['height'],
                        'fps': dimensions['fps']
                    },
                    'thumbnailUrl': f"gs://{bucket.name}/{thumbnail_path}",
                    'thumbnailPath': thumbnail_path,
                    'processingStatus': 'completed',
                    'updatedAt': firestore.SERVER_TIMESTAMP
                })
                logger.info("Firestore metadata updated successfully")

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
                logger.info("Temporary file cleaned up")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing video: {error_msg}")

        # Update error status in Firestore
        try:
            db = firestore.client()
            video_ref = db.collection('videos').document(video_id)
            video_ref.update({
                'processingStatus': 'failed',
                'processingError': error_msg,
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
            logger.info("Updated failure status in Firestore")
        except Exception as update_error:
            logger.error(f"Error updating failure status: {str(update_error)}")

        return {"error": error_msg}
