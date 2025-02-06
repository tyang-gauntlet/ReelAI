"""Video processing module for thumbnail generation."""

import os
import logging
import tempfile
from io import BytesIO
from typing import Dict, Any, Optional
from datetime import datetime
import requests
from urllib.parse import unquote

# Configure logging
logger = logging.getLogger(__name__)

try:
    # Import numpy first to avoid OpenCV import issues
    import numpy
    import cv2
    from PIL import Image
    from firebase_admin import storage, firestore
except ImportError as e:
    logger.error(f"Failed to import required modules: {str(e)}")
    raise


class VideoProcessor:
    """Video processing class for thumbnail generation."""

    def __init__(self, video_id: str, video_data: Dict[str, Any]):
        """Initialize video processor."""
        self.video_id = video_id
        self.video_data = video_data
        self.temp_file: Optional[str] = None

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit with cleanup."""
        self.cleanup()

    def cleanup(self):
        """Clean up temporary files."""
        if self.temp_file and os.path.exists(self.temp_file):
            try:
                os.remove(self.temp_file)
                logger.info(f"Cleaned up temp file: {self.temp_file}")
            except Exception as e:
                logger.warning(f"Failed to clean up temp file: {str(e)}")

    def extract_dimensions(self) -> Dict[str, int]:
        """Extract dimensions from video file."""
        if not self.temp_file:
            raise ValueError("No video file loaded")

        try:
            cap = cv2.VideoCapture(self.temp_file)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            cap.release()
            return {"width": width, "height": height, "fps": fps}
        except Exception as e:
            logger.error(f"Error extracting dimensions: {str(e)}")
            return {}

    def generate_thumbnail(self) -> bytes:
        """Generate thumbnail from video file."""
        if not self.temp_file:
            raise ValueError("No video file loaded")

        try:
            cap = cv2.VideoCapture(self.temp_file)
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

    def get_possible_paths(self) -> list[str]:
        """Get all possible paths where the video might be stored."""
        possible_paths = []

        # 1. Try storagePath first if available
        if storage_path := self.video_data.get('storagePath'):
            possible_paths.append(storage_path)
            if storage_path.endswith('.mp4'):
                possible_paths.append(storage_path[:-4])

        # 2. Try paths from storageUrl
        if storage_url := self.video_data.get('storageUrl'):
            if storage_url.startswith('gs://'):
                path = '/'.join(storage_url.split('/')[3:])
                possible_paths.append(path)
            elif storage_url.startswith('https://') and 'o/' in storage_url:
                path = unquote(storage_url.split('o/', 1)[-1].split('?')[0])
                possible_paths.append(path)

        # 3. Try standard paths
        standard_paths = [
            f"videos/{self.video_id}.mp4",
            f"videos/{self.video_id}",
            f"raw/{self.video_id}.mp4",
            f"raw/{self.video_id}",
            f"{self.video_id}.mp4",
            self.video_id
        ]

        possible_paths.extend(
            path for path in standard_paths if path not in possible_paths)
        return possible_paths

    def download_from_url(self, url: str) -> bool:
        """Download video from URL to temporary file."""
        try:
            _, self.temp_file = tempfile.mkstemp(suffix='.mp4')

            if url.startswith('gs://'):
                bucket_name = url.split('/')[2]
                path = '/'.join(url.split('/')[3:])
                bucket = storage.bucket(bucket_name)
                blob = bucket.blob(path)

                if blob.exists():
                    blob.download_to_filename(self.temp_file)
                    return True
            else:
                response = requests.get(url, stream=True)
                if response.status_code == 200:
                    with open(self.temp_file, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)
                    return True

            return False
        except Exception as e:
            logger.error(f"Error downloading from URL: {str(e)}")
            self.cleanup()
            return False

    def download_from_storage(self, path: str) -> bool:
        """Download video from Firebase Storage."""
        try:
            bucket = storage.bucket()
            blob = bucket.blob(path)

            if blob.exists():
                _, self.temp_file = tempfile.mkstemp(suffix='.mp4')
                blob.download_to_filename(self.temp_file)
                return True

            return False
        except Exception as e:
            logger.error(f"Error downloading from storage: {str(e)}")
            self.cleanup()
            return False

    def process(self) -> Dict[str, Any]:
        """Process video to generate thumbnail and extract metadata."""
        try:
            # Try direct URL download first
            if storage_url := self.video_data.get('storageUrl'):
                if self.download_from_url(storage_url):
                    return self._process_loaded_video(self.video_data.get('storagePath', ''))

            # Try all possible storage paths
            for path in self.get_possible_paths():
                if self.download_from_storage(path):
                    return self._process_loaded_video(path)

            error_msg = f"Video not found. Tried paths: {', '.join(self.get_possible_paths())}"
            logger.error(error_msg)
            return {"error": error_msg, "videoId": self.video_id}

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error processing video: {error_msg}")
            self._update_processing_status('failed', error_msg)
            return {"error": error_msg, "videoId": self.video_id}

    def _process_loaded_video(self, video_path: str) -> Dict[str, Any]:
        """Process already loaded video file."""
        try:
            # Extract dimensions
            dimensions = self.extract_dimensions()

            # Generate thumbnail
            thumbnail_data = self.generate_thumbnail()

            # Upload thumbnail
            thumbnail_path = f"thumbnails/{self.video_id}.jpg"
            bucket = storage.bucket()
            thumbnail_blob = bucket.blob(thumbnail_path)
            thumbnail_blob.upload_from_string(
                thumbnail_data,
                content_type='image/jpeg'
            )

            # Update video metadata
            update_data = {
                'metadata': dimensions,
                'thumbnailUrl': f"gs://{bucket.name}/{thumbnail_path}",
                'processingStatus': 'completed',
                'storagePath': video_path,
                'updatedAt': datetime.now()
            }

            db = firestore.client()
            video_ref = db.collection('videos').document(self.video_id)
            video_ref.update(update_data)

            return {
                "success": True,
                "videoId": self.video_id,
                "thumbnailPath": thumbnail_path,
                "dimensions": dimensions,
                "videoPath": video_path
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error processing loaded video: {error_msg}")
            self._update_processing_status('failed', error_msg)
            return {"error": error_msg, "videoId": self.video_id}

    def _update_processing_status(self, status: str, error_msg: str = '') -> None:
        """Update video processing status in Firestore."""
        try:
            db = firestore.client()
            video_ref = db.collection('videos').document(self.video_id)
            update_data = {
                'processingStatus': status,
                'updatedAt': datetime.now()
            }
            if error_msg:
                update_data['processingError'] = error_msg
            video_ref.update(update_data)
        except Exception as e:
            logger.error(f"Error updating processing status: {str(e)}")


def get_videos_without_thumbnails() -> list[Dict[str, Any]]:
    """Get all videos that don't have thumbnails."""
    try:
        db = firestore.client()
        videos_ref = db.collection('videos')

        # Query for videos without thumbnails
        query = videos_ref.where('thumbnailUrl', '==', None).get()

        results = []
        for video in query:
            video_data = video.to_dict()
            video_data['id'] = video.id

            # Only include videos with a storage URL
            if 'storageUrl' in video_data:
                results.append(video_data)

        return results

    except Exception as e:
        logger.error(f"Error fetching videos without thumbnails: {str(e)}")
        return []
