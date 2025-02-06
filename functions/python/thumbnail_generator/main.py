"""Cloud Functions entry point."""

import functions_framework
from thumbnail_generator.main import generate_video_thumbnail, health
from thumbnail_generator.hashtag_generator import HashtagGenerator, process_all_videos
import json
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

# Export the existing functions
generate_video_thumbnail = functions_framework.http(generate_video_thumbnail)
health = functions_framework.http(health)


@functions_framework.http
def generate_video_hashtags(request) -> Dict[str, Any]:
    """Cloud Function to generate hashtags for videos.

    Handles two cases:
    1. Single video processing when videoPath is provided
    2. Batch processing of all videos without hashtags when no videoPath is provided
    """
    try:
        # Get request data
        data = request.get_json(silent=True) if request.is_json else None

        # Case 1: Process single video if videoPath is provided
        if data and 'videoPath' in data:
            video_path = data['videoPath']
            video_id = video_path.split('/')[-1].split('.')[0]

            # Create video data structure
            video_data = {
                'id': video_id,
                'storagePath': video_path
            }

            # Process video
            with HashtagGenerator(video_id, video_data) as generator:
                return generator.process()

        # Case 2: Process all videos without hashtags
        else:
            return process_all_videos()

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in generate_video_hashtags: {error_msg}")
        return {"error": error_msg}


# Export the new function
generate_video_hashtags = functions_framework.http(generate_video_hashtags)
