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
def generate_video_thumbnail(request) -> tuple[str, int, Dict[str, str]]:
    """Cloud Function to generate video thumbnail.

    Handles two cases:
    1. Single video processing when videoPath is provided
    2. Batch processing of all videos without thumbnails when action=process_all
    """
    try:
        # Initialize Firebase
        firebase_config.initialize()

        # Get request data
        request_json = request.get_json(silent=True)
        if not request_json:
            return (
                json.dumps({"error": "No request data provided"}),
                400,
                {'Content-Type': 'application/json'}
            )

        logger.info(f"Received request: {request_json}")

        # Case 1: Process single video if videoPath is provided
        if 'videoPath' in request_json:
            video_path = request_json['videoPath']
            video_id = os.path.splitext(os.path.basename(video_path))[0]
            logger.info(f"Processing single video: {video_path}")

            # Create video data structure
            video_data = {
                'id': video_id,
                'storagePath': video_path
            }

            # Process video
            with VideoProcessor(video_id, video_data) as processor:
                result = processor.process()
                logger.info(f"Single video processing result: {result}")
                return (
                    json.dumps(result),
                    200,
                    {'Content-Type': 'application/json'}
                )

        # Case 2: Process all videos without thumbnails
        elif request_json.get('action') == 'process_all':
            logger.info(
                "Starting batch processing of all videos without thumbnails")
            videos = get_videos_without_thumbnails()

            if not videos:
                logger.info("No videos found without thumbnails")
                return (
                    json.dumps(
                        {"message": "No videos found without thumbnails"}),
                    200,
                    {'Content-Type': 'application/json'}
                )

            logger.info(f"Found {len(videos)} videos to process")
            results = []

            for video_data in videos:
                video_id = video_data['id']
                logger.info(f"Processing video {video_id}")

                try:
                    with VideoProcessor(video_id, video_data) as processor:
                        result = processor.process()
                        results.append(result)
                        logger.info(f"Processed video {video_id}: {result}")
                except Exception as e:
                    error_msg = f"Error processing video {video_id}: {str(e)}"
                    logger.error(error_msg)
                    results.append({"error": error_msg, "videoId": video_id})

            response_data = {
                "message": f"Processed {len(results)} videos",
                "results": results
            }
            return (
                json.dumps(response_data),
                200,
                {'Content-Type': 'application/json'}
            )

        else:
            error_msg = "Invalid request: must provide either videoPath or action=process_all"
            logger.error(error_msg)
            return (
                json.dumps({"error": error_msg}),
                400,
                {'Content-Type': 'application/json'}
            )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in generate_video_thumbnail: {error_msg}")
        logger.exception("Full error details:")
        return (
            json.dumps({"error": error_msg}),
            500,
            {'Content-Type': 'application/json'}
        )
