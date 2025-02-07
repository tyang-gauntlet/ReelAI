"""Main module for hashtag generation."""

import os
import logging
import functions_framework
import json
from typing import Dict, Any
import sys

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.StreamHandler(sys.stderr)
    ]
)

logger = logging.getLogger(__name__)

try:
    from .config import firebase_config
    from .hashtag_generator import process_single_video, get_videos_without_content, process_all_videos as process_all
except ImportError as e:
    logger.error(f"Failed to import required modules: {str(e)}")
    raise


def process_video(video_path: str, force: bool = False) -> Dict[str, Any]:
    """Process a single video to generate hashtags and content."""
    try:
        # Initialize Firebase
        firebase_config.initialize()

        # Create video data structure
        video_id = os.path.splitext(os.path.basename(video_path))[0]
        video_data = {
            'id': video_id,
            'storagePath': video_path
        }

        # Process video
        return process_single_video(video_data)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing video: {error_msg}")
        return {"error": error_msg}


def process_all_videos(force: bool = False) -> Dict[str, Any]:
    """Process all videos that need content generation."""
    try:
        # Initialize Firebase
        firebase_config.initialize()

        # Get videos that need processing
        videos = get_videos_without_content(force)
        logger.info(f"Found {len(videos)} videos to process")

        if not videos:
            return {
                "success": True,
                "message": "No videos found needing content generation",
                "processed": 0,
                "total": 0
            }

        # Process all videos
        result = process_all(force)
        logger.info(f"Processed {result.get('processed', 0)} videos")

        return result

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in process_all_videos: {error_msg}")
        return {
            "success": False,
            "error": error_msg
        }


def health() -> Dict[str, Any]:
    """Health check function."""
    return {"status": "healthy"}
