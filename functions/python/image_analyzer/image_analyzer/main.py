"""Main module for video analysis."""

import logging
from typing import Dict, Any
from .analyzer import analyze_video_frame
from .config import firebase_config

logger = logging.getLogger(__name__)


def analyze_video(request) -> Dict[str, Any]:
    """Process video analysis request."""
    # Initialize Firebase if not already initialized
    firebase_config.initialize()

    # Log the incoming request
    logger.info("Received request:")
    logger.info(f"Method: {request.method}")
    logger.info(f"Content-Type: {request.headers.get('Content-Type')}")
    logger.info(f"Is JSON: {request.is_json}")

    data = request.get_json(silent=True) if request.is_json else None
    logger.info(f"Request data: {data}")

    if not data:
        logger.error("No request data provided")
        return {"error": "No request data provided"}

    video_path = data.get('videoPath')
    timestamp = data.get('timestamp', 0.0)

    logger.info(f"Extracted data:")
    logger.info(f"Video path: {video_path}")
    logger.info(f"Timestamp: {timestamp}")

    if not video_path:
        logger.error("videoPath is required")
        return {"error": "videoPath is required"}

    # Create video data with the correct structure
    video_data = {
        'videoPath': video_path,  # Keep the original path
        # Extract ID from filename
        'id': video_path.split('/')[-1].split('.')[0]
    }

    logger.info(f"Constructed video data: {video_data}")

    return analyze_video_frame(video_data, float(timestamp))


def health(request) -> Dict[str, Any]:
    """Health check endpoint."""
    return {"status": "healthy"}
