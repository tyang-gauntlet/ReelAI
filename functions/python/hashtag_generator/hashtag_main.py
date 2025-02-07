"""Module for generating hashtags from video content using OpenAI."""
import os
import cv2
import base64
import logging
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional
import numpy as np
from openai import OpenAI
from . import config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants for optimization
MAX_IMAGE_SIZE = 1024  # Maximum dimension for resized images
JPEG_QUALITY = 85     # JPEG compression quality
MAX_WORKERS = 3       # Maximum number of concurrent workers


def resize_image(frame: np.ndarray) -> np.ndarray:
    """Resize image while maintaining aspect ratio."""
    height, width = frame.shape[:2]
    if max(height, width) > MAX_IMAGE_SIZE:
        scale = MAX_IMAGE_SIZE / max(height, width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        return cv2.resize(frame, (new_width, new_height))
    return frame


def process_single_video(video_path: str, force: bool = False) -> Dict[str, Any]:
    """Process a single video to generate hashtags and content."""
    try:
        # Get Firebase instances
        bucket = config.get_storage_bucket()
        db = config.get_firestore_client()

        # Get video blob
        blob = bucket.blob(video_path)
        if not blob.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        # Get video ID from path
        video_id = os.path.splitext(os.path.basename(video_path))[0]

        # Get video document
        video_ref = db.collection('videos').document(video_id)
        video_doc = video_ref.get()

        if not video_doc.exists:
            raise ValueError(f"Video document not found for ID: {video_id}")

        video_data = video_doc.to_dict()

        # Check if we need to process this video
        if not force:
            title = video_data.get('title', '')
            description = video_data.get('description', '')
            has_meaningful_content = (
                title and description and
                not title.startswith('HD Video') and
                not description.startswith('Beautiful HD video')
            )
            if has_meaningful_content:
                logger.info(
                    f"Video {video_id} already has meaningful content. Skipping.")
                return {"status": "skipped", "video_id": video_id}

        # Download video to temporary file
        with tempfile.NamedTemporaryFile(suffix='.mp4') as temp_video:
            blob.download_to_filename(temp_video.name)

            # Extract frames
            cap = cv2.VideoCapture(temp_video.name)
            frames = []
            frame_count = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_count % 30 == 0:  # Sample every 30 frames
                    frame = resize_image(frame)
                    _, buffer = cv2.imencode(
                        '.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                    frames.append(base64.b64encode(buffer).decode('utf-8'))

                frame_count += 1

            cap.release()

        # Generate content using OpenAI
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

        messages = [
            {"role": "system", "content": "You are a creative content writer specializing in video descriptions and hashtags."},
            {"role": "user",
                "content": f"I have a video with {len(frames)} frames. Please analyze these frames and generate a creative title, engaging description, and relevant hashtags for social media. The content should be optimized for Instagram and TikTok."}
        ]

        for frame in frames:
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image", "image_url": f"data:image/jpeg;base64,{frame}"}
                ]
            })

        response = client.chat.completions.create(
            model="gpt-4-vision-preview",
            messages=messages,
            max_tokens=500
        )

        content = response.choices[0].message.content

        # Parse the response
        lines = content.split('\n')
        title = ''
        description = ''
        hashtags = []

        current_section = None
        for line in lines:
            line = line.strip()
            if line.lower().startswith('title:'):
                current_section = 'title'
                title = line.replace('Title:', '').strip()
            elif line.lower().startswith('description:'):
                current_section = 'description'
                description = line.replace('Description:', '').strip()
            elif line.lower().startswith('hashtags:'):
                current_section = 'hashtags'
                hashtags_text = line.replace('Hashtags:', '').strip()
                hashtags = [tag.strip()
                            for tag in hashtags_text.split('#') if tag.strip()]
            elif line and current_section == 'description':
                description += ' ' + line
            elif line and current_section == 'hashtags':
                hashtags.extend([tag.strip()
                                for tag in line.split('#') if tag.strip()])

        # Update Firestore document
        video_ref.update({
            'title': title,
            'description': description,
            'hashtags': hashtags,
            'hasContent': True
        })

        return {
            "status": "success",
            "video_id": video_id,
            "title": title,
            "description": description,
            "hashtags": hashtags
        }

    except Exception as e:
        logger.error(f"Error processing video {video_path}: {str(e)}")
        return {"status": "error", "video_id": video_id, "error": str(e)}


def get_videos_without_content(force: bool = False) -> List[Dict[str, Any]]:
    """Get list of videos that need content generation."""
    db = config.get_firestore_client()
    videos_ref = db.collection('videos')

    if force:
        # Get all videos if force is True
        docs = videos_ref.stream()
    else:
        # Get only videos without meaningful content
        docs = videos_ref.where('hasContent', '==', False).stream()

    videos = []
    for doc in docs:
        video_data = doc.to_dict()
        video_data['id'] = doc.id
        videos.append(video_data)

    return videos


def process_all_videos(force: bool = False) -> Dict[str, Any]:
    """Process all videos that need content generation."""
    try:
        videos = get_videos_without_content(force)
        logger.info(f"Found {len(videos)} videos to process")

        results = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for video in videos:
                storage_path = video.get('storagePath')
                if storage_path:
                    futures.append(
                        executor.submit(process_single_video,
                                        storage_path, force)
                    )

            for future in futures:
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    logger.error(f"Error in worker thread: {str(e)}")
                    results.append({"status": "error", "error": str(e)})

        return {
            "status": "success",
            "processed_count": len(results),
            "results": results
        }

    except Exception as e:
        logger.error(f"Error in process_all_videos: {str(e)}")
        return {"status": "error", "error": str(e)}
