"""Hashtag generator module for video content."""

import os
from typing import Dict, Any, List
import tempfile
import logging
import openai
from firebase_admin import storage, firestore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def analyze_video_content(video_path: str) -> Dict[str, Any]:
    """Analyze video content and generate relevant hashtags."""
    try:
        # Initialize OpenAI client
        openai.api_key = os.getenv('OPENAI_API_KEY')

        # TODO: Implement video content analysis using OpenAI's API
        # This is a placeholder that returns sample tags
        tags = {
            'objects': ['person', 'car', 'building'],
            'actions': ['walking', 'talking', 'driving'],
            'scenes': ['city', 'street', 'outdoor'],
            'confidence': 0.85
        }

        return tags
    except Exception as e:
        logger.error(f"Error analyzing video content: {str(e)}")
        raise


def generate_hashtags(video_path: str) -> Dict[str, Any]:
    """Generate hashtags from video content analysis."""
    try:
        # Analyze video content
        tags = analyze_video_content(video_path)

        # Combine all tags
        all_tags = []
        if 'objects' in tags:
            all_tags.extend(
                [f"#{obj.replace(' ', '')}" for obj in tags['objects']])
        if 'actions' in tags:
            all_tags.extend(
                [f"#{action.replace(' ', '')}" for action in tags['actions']])
        if 'scenes' in tags:
            all_tags.extend(
                [f"#{scene.replace(' ', '')}" for scene in tags['scenes']])

        return {
            'tags': tags,
            'hashtags': all_tags,
            'confidence': tags.get('confidence', 0)
        }
    except Exception as e:
        logger.error(f"Error generating hashtags: {str(e)}")
        raise


def process_video(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single video and generate hashtags."""
    try:
        video_path = video_data.get('storagePath')
        video_id = video_data.get('id')

        if not video_path:
            raise ValueError("No video path provided")

        logger.info(f"Processing video: {video_path}")

        # Get video from storage
        bucket = storage.bucket()
        video_blob = bucket.blob(video_path)

        if not video_blob.exists():
            logger.error(f"Video not found: {video_path}")
            return {"error": "Video not found"}

        # Download to temp file
        _, temp_local_filename = tempfile.mkstemp(suffix='.mp4')
        video_blob.download_to_filename(temp_local_filename)
        logger.info(f"Downloaded video to: {temp_local_filename}")

        try:
            # Generate hashtags
            result = generate_hashtags(temp_local_filename)
            logger.info("Generated hashtags")

            # Update video metadata in Firestore
            db = firestore.client()
            video_ref = db.collection('videos').document(video_id)
            video_ref.update({
                'metadata.aiTags': result['tags'],
                'metadata.hashtags': result['hashtags'],
                'metadata.aiConfidence': result['confidence'],
                'metadata.aiProcessedAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
            logger.info("Updated video metadata in Firestore")

            return {
                "success": True,
                "videoId": video_id,
                "hashtags": result['hashtags'],
                "tags": result['tags']
            }

        finally:
            # Clean up temp file
            if os.path.exists(temp_local_filename):
                os.remove(temp_local_filename)
                logger.info("Cleaned up temporary file")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing video: {error_msg}")

        # Update error status in Firestore
        try:
            db = firestore.client()
            video_ref = db.collection('videos').document(video_id)
            video_ref.update({
                'metadata.aiProcessingError': error_msg,
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
        except Exception as update_error:
            logger.error(f"Error updating failure status: {str(update_error)}")

        return {"error": error_msg}
