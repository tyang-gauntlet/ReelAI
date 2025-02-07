"""Cloud Functions entry point."""

import functions_framework
from hashtag_generator.main import process_video, process_all_videos
import json
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


@functions_framework.http
def generate_video_hashtags(request) -> Dict[str, Any]:
    """Cloud Function to generate hashtags for videos.

    Handles two cases:
    1. Single video processing when videoPath is provided
    2. Batch processing of all videos without hashtags when no videoPath is provided

    Query Parameters:
        force: If "true", regenerate content for all videos regardless of existing content
        action: If "process_all", process all videos that need content
    """
    try:
        # Get request data
        data = request.get_json(silent=True) if request.is_json else None
        force = request.args.get('force', '').lower() == 'true'

        logger.info(f"Request received - force: {force}")

        # Case 1: Process single video if videoPath is provided
        if data and 'videoPath' in data:
            video_path = data['videoPath']
            force = data.get('force', force)  # Allow force in JSON body too
            logger.info(
                f"Processing single video: {video_path} (force: {force})")
            return process_video(video_path, force=force)

        # Case 2: Process all videos
        elif request.args.get('action') == 'process_all' or not data:
            logger.info(f"Processing all videos (force: {force})")
            return process_all_videos(force=force)

        else:
            return {
                "error": "Invalid request. Must provide either videoPath in body or action=process_all in query"
            }

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in generate_video_hashtags: {error_msg}")
        return {"error": error_msg}


@functions_framework.http
def health(request) -> Dict[str, Any]:
    """Health check endpoint."""
    return {"status": "healthy"}
