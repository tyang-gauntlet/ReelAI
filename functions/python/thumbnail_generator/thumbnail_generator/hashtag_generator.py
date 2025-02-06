"""Module for generating hashtags from video content using OpenAI."""

import os
import cv2
import base64
import logging
from typing import List, Dict, Any
import tempfile
from openai import OpenAI
from .config import firebase_config
import firebase_admin
from firebase_admin import storage, firestore
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

logger = logging.getLogger(__name__)

# Storage bucket name
BUCKET_NAME = "reelai-c82fc.firebasestorage.app"

# Constants for optimization
MAX_IMAGE_SIZE = 384  # Reduced from 512 to save memory
JPEG_QUALITY = 60    # Reduced from 80 to save memory
MAX_WORKERS = 3      # Reduced from 5 to save memory


def resize_image(frame: np.ndarray) -> np.ndarray:
    """Resize image while maintaining aspect ratio."""
    height, width = frame.shape[:2]
    if height > MAX_IMAGE_SIZE or width > MAX_IMAGE_SIZE:
        scale = MAX_IMAGE_SIZE / max(height, width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        return cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
    return frame


def process_single_video(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single video in a separate thread."""
    try:
        with HashtagGenerator(video_data['id'], video_data) as generator:
            return generator.process()
    except Exception as e:
        logger.error(f"Error processing video {video_data['id']}: {str(e)}")
        return {
            "success": False,
            "videoId": video_data['id'],
            "error": str(e)
        }


def get_videos_without_hashtags() -> List[Dict[str, Any]]:
    """Get list of videos that don't have hashtags yet and sync storage with Firestore."""
    try:
        # Initialize Firebase if not already initialized
        if not firebase_admin._apps:
            firebase_config.initialize()

        storage_client = storage.bucket(BUCKET_NAME)
        db = firestore.client()

        # List all files in storage root
        logger.info("Listing blobs in storage root")
        blobs = list(storage_client.list_blobs())
        logger.info(f"Found {len(blobs)} total blobs in storage")

        videos_without_hashtags = []
        videos_collection = db.collection('videos')

        for blob in blobs:
            logger.info(f"Processing blob: {blob.name}")

            # Skip thumbnails directory and non-video files
            if (blob.name.startswith('thumbnails/') or
                blob.name.startswith('metadata/') or
                    not blob.name.lower().endswith(('.mp4', '.mov', '.avi'))):
                logger.info(
                    f"Skipping non-video file or directory: {blob.name}")
                continue

            video_id = os.path.splitext(os.path.basename(blob.name))[0]

            # Get or create video document in Firestore
            video_ref = videos_collection.document(video_id)
            video_doc = video_ref.get()

            if not video_doc.exists:
                # Create new video document if it doesn't exist
                video_ref.set({
                    'id': video_id,
                    'storagePath': blob.name,
                    'createdAt': firestore.SERVER_TIMESTAMP,
                    'hasHashtags': False
                })
                logger.info(f"Created new video document for: {video_id}")
                video_doc = video_ref.get()  # Refresh document

            video_data = video_doc.to_dict()

            # Check if video needs hashtags
            if not video_data.get('hasHashtags', False):
                logger.info(f"No hashtags found for video: {video_id}")
                videos_without_hashtags.append({
                    'id': video_id,
                    'storagePath': blob.name
                })
            else:
                logger.info(f"Hashtags already exist for video: {video_id}")

        logger.info(
            f"Found {len(videos_without_hashtags)} videos without hashtags")
        return videos_without_hashtags

    except Exception as e:
        logger.error(f"Error getting videos without hashtags: {str(e)}")
        return []


class HashtagGenerator:
    def __init__(self, video_id: str, video_data: Dict[str, Any]):
        self.video_id = video_id
        self.video_data = video_data
        self.storage_client = storage.bucket(BUCKET_NAME)
        self.openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.db = firestore.client()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def _download_video(self) -> str:
        """Download video to temporary file."""
        storage_path = self.video_data['storagePath']
        blob = self.storage_client.blob(storage_path)

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
        blob.download_to_filename(temp_file.name)
        return temp_file.name

    def _extract_frames(self, video_path: str, num_frames: int = 1) -> List[str]:
        """Extract frames from video and convert to temporary URLs."""
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Take frame from middle of video
        middle_frame = total_frames // 2
        frame_urls = []

        cap.set(cv2.CAP_PROP_POS_FRAMES, middle_frame)
        ret, frame = cap.read()
        if ret:
            # Resize frame
            frame = resize_image(frame)
            # Convert frame to jpg format with reduced quality
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
            _, buffer = cv2.imencode('.jpg', frame, encode_params)

            # Save frame to temporary file in storage
            temp_frame_path = f"temp/{self.video_id}_frame.jpg"
            frame_blob = self.storage_client.blob(temp_frame_path)
            frame_blob.upload_from_string(
                buffer.tobytes(), content_type='image/jpeg')

            # Get public URL (valid for 1 hour)
            frame_url = frame_blob.generate_signed_url(
                version="v4",
                expiration=3600,  # 1 hour
                method="GET"
            )
            frame_urls.append(frame_url)

        cap.release()
        return frame_urls

    def _cleanup_temp_files(self):
        """Clean up temporary files from storage."""
        try:
            temp_frame_path = f"temp/{self.video_id}_frame.jpg"
            frame_blob = self.storage_client.blob(temp_frame_path)
            if frame_blob.exists():
                frame_blob.delete()
        except Exception as e:
            logger.warning(f"Error cleaning up temp files: {str(e)}")

    def _generate_hashtags(self, frame_urls: List[str]) -> List[str]:
        """Generate hashtags using OpenAI Vision API."""
        try:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Generate 3-5 relevant hashtags for this video content. Focus on the main subjects, themes, and activities. Return only the hashtags without explanation, separated by spaces."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": frame_urls[0],
                                "detail": "low"
                            }
                        }
                    ]
                }
            ]

            response = self.openai_client.chat.completions.create(
                model="gpt-4-turbo",  # DO NOT CHANGE THIS MODEL
                messages=messages,
                max_tokens=50,  # Increased for more hashtags
                temperature=0.7
            )

            # Split response into individual hashtags
            hashtags = response.choices[0].message.content.strip().split()

            # Ensure all hashtags start with #
            hashtags = [tag if tag.startswith(
                '#') else f'#{tag}' for tag in hashtags]

            return hashtags[:5]  # Limit to maximum 5 hashtags

        except Exception as e:
            logger.error(f"Error generating hashtags: {str(e)}")
            return []
        finally:
            # Clean up temporary files
            self._cleanup_temp_files()

    def _save_hashtags(self, hashtags: List[str]):
        """Save hashtags to Firestore."""
        if not hashtags:
            return

        # Update video document in Firestore
        video_ref = self.db.collection('videos').document(self.video_id)
        video_ref.update({
            'hashtags': hashtags,
            'hasHashtags': True,
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        logger.info(f"Saved hashtags for video {self.video_id} to Firestore")

    def process(self) -> Dict[str, Any]:
        """Process video and generate hashtags."""
        try:
            # Download video
            video_path = self._download_video()

            # Extract frames
            frame_urls = self._extract_frames(video_path)

            # Cleanup video file early to save memory
            os.unlink(video_path)

            # Generate hashtags
            hashtags = self._generate_hashtags(frame_urls)

            # Save hashtags
            self._save_hashtags(hashtags)

            return {
                "success": True,
                "videoId": self.video_id,
                "hashtags": hashtags
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"Error processing video {self.video_id}: {error_msg}")
            # Make sure to clean up temp files even on error
            self._cleanup_temp_files()
            return {
                "success": False,
                "videoId": self.video_id,
                "error": error_msg
            }


def process_all_videos() -> Dict[str, Any]:
    """Process all videos that don't have hashtags."""
    try:
        videos = get_videos_without_hashtags()
        if not videos:
            return {
                "success": True,
                "message": "No videos found without hashtags",
                "processed": 0,
                "total": 0
            }

        results = []
        # Process videos in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit all tasks
            future_to_video = {
                executor.submit(process_single_video, video): video
                for video in videos
            }

            # Collect results as they complete
            for future in as_completed(future_to_video):
                result = future.result()
                results.append(result)

        successful = len([r for r in results if r.get('success', False)])

        return {
            "success": True,
            "message": f"Processed {successful} out of {len(results)} videos",
            "processed": successful,
            "total": len(results),
            "results": results
        }

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in process_all_videos: {error_msg}")
        return {
            "success": False,
            "error": error_msg
        }
