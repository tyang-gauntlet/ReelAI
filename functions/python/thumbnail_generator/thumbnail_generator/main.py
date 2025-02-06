"""Main module for the thumbnail generator."""

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
    # Import numpy first to avoid OpenCV import issues
    import numpy
    from .config import firebase_config
    from .video import VideoProcessor, get_videos_without_thumbnails
except ImportError as e:
    logger.error(f"Failed to import required modules: {str(e)}")
    raise


@functions_framework.http
def health(request) -> tuple[str, int, Dict[str, str]]:
    """Health check endpoint."""
    try:
        # Initialize Firebase to ensure credentials work
        firebase_config.initialize()
        return (json.dumps({"status": "healthy"}), 200, {'Content-Type': 'application/json'})
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return (json.dumps({"status": "unhealthy", "error": str(e)}), 500, {'Content-Type': 'application/json'})


@functions_framework.http
def generate_video_thumbnail(request) -> Dict[str, Any]:
    """Cloud Function to generate video thumbnail.

    Handles two cases:
    1. Single video processing when videoPath is provided
    2. Batch processing of all videos without thumbnails when no videoPath is provided
    """
    try:
        # Initialize Firebase
        firebase_config.initialize()

        # Get request data
        data = request.get_json(silent=True) if request.is_json else None

        # Case 1: Process single video if videoPath is provided
        if data and 'videoPath' in data:
            video_path = data['videoPath']
            video_id = os.path.splitext(os.path.basename(video_path))[0]

            # Create video data structure
            video_data = {
                'id': video_id,
                'storagePath': video_path
            }

            # Process video
            with VideoProcessor(video_id, video_data) as processor:
                return processor.process()

        # Case 2: Process all videos without thumbnails
        else:
            videos = get_videos_without_thumbnails()
            if not videos:
                return {"message": "No videos found without thumbnails"}

            results = []
            for video in videos:
                with VideoProcessor(video['id'], video) as processor:
                    result = processor.process()
                    results.append(result)

            return {
                "total": len(results),
                "successful": len([r for r in results if r.get('success', False)]),
                "failed": len([r for r in results if 'error' in r]),
                "results": results
            }

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in generate_video_thumbnail: {error_msg}")
        return {"error": error_msg}
