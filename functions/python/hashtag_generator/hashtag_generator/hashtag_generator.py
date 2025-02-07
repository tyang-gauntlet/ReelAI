"""Module for generating hashtags from video content using OpenAI."""

import os
import cv2
import base64
import logging
from typing import List, Dict, Any
import tempfile
from openai import OpenAI
from datetime import datetime
import firebase_admin
from firebase_admin import storage, firestore
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import json
from .config import firebase_config

logger = logging.getLogger(__name__)

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


def get_videos_without_content(force: bool = False) -> List[Dict[str, Any]]:
    """Get list of videos that need content generation.

    Args:
        force: If True, return all videos regardless of existing content
    """
    try:
        # Initialize Firebase if not already initialized
        if not firebase_admin._apps:
            firebase_config.initialize()

        storage_client = storage.bucket()
        db = firestore.client()

        # List all files in storage root
        logger.info("Listing blobs in storage root")
        blobs = list(storage_client.list_blobs())
        logger.info(f"Found {len(blobs)} total blobs in storage")

        videos_needing_content = []
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
                    'hasContent': False
                })
                logger.info(f"Created new video document for: {video_id}")
                video_doc = video_ref.get()  # Refresh document

            video_data = video_doc.to_dict()

            # If force is True, add all videos
            if force:
                logger.info(
                    f"Force adding video for content generation: {video_id}")
                videos_needing_content.append({
                    'id': video_id,
                    'storagePath': blob.name
                })
                continue

            # Check if video needs content generation
            title = video_data.get('title', '')
            description = video_data.get('description', '')
            has_meaningful_content = (
                title and description and
                not title.startswith('HD Video') and
                not description.startswith('Beautiful HD video')
            )

            if not has_meaningful_content:
                logger.info(
                    f"No meaningful content found for video: {video_id}")
                videos_needing_content.append({
                    'id': video_id,
                    'storagePath': blob.name
                })
            else:
                logger.info(f"Content already exists for video: {video_id}")

        logger.info(
            f"Found {len(videos_needing_content)} videos needing content")
        return videos_needing_content

    except Exception as e:
        logger.error(f"Error getting videos without content: {str(e)}")
        return []


class HashtagGenerator:
    def __init__(self, video_id: str, video_data: Dict[str, Any]):
        self.video_id = video_id
        self.video_data = video_data
        self.storage_client = storage.bucket()
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

    def _generate_content_description(self, frame_urls: List[str]) -> Dict[str, str]:
        """Generate meaningful title and description using OpenAI API."""
        try:
            messages = [
                {
                    "role": "system",
                    "content": "You are a creative content writer specializing in video descriptions. Generate engaging, accurate titles and descriptions for videos. Always respond in JSON format with 'title' and 'description' fields."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Create a title and description for this video frame. The title should be catchy, descriptive, and under 50 characters. The description should be engaging, informative, and under 150 characters. Focus on what makes the video unique and interesting."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": frame_urls[0],
                                "detail": "high"
                            }
                        }
                    ]
                }
            ]

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",  # DO NOT CHANGE THIS MODEL
                messages=messages,
                max_tokens=300,
                temperature=0.7,
                response_format={"type": "json_object"}
            )

            try:
                content = json.loads(response.choices[0].message.content)
                logger.info(f"Raw OpenAI response: {content}")

                if not isinstance(content, dict) or 'title' not in content or 'description' not in content:
                    raise ValueError("Invalid response format from OpenAI")

                title = content['title'].strip()
                description = content['description'].strip()

                if not title or not description:
                    raise ValueError("Empty title or description from OpenAI")

                return {
                    'title': title[:50],
                    'description': description[:150]
                }
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse OpenAI response: {str(e)}")
                raise
            except KeyError as e:
                logger.error(
                    f"Missing required field in OpenAI response: {str(e)}")
                raise
            except ValueError as e:
                logger.error(f"Validation error in OpenAI response: {str(e)}")
                raise

        except Exception as e:
            logger.error(f"Error generating content description: {str(e)}")
            return {
                'title': 'Untitled Video',
                'description': 'No description available'
            }

    def _generate_hashtags(self, frame_urls: List[str]) -> List[str]:
        """Generate hashtags using OpenAI API."""
        try:
            messages = [
                {
                    "role": "system",
                    "content": "You are a social media expert specializing in hashtag generation. Create relevant, trending hashtags for video content."
                },
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
                                "detail": "high"
                            }
                        }
                    ]
                }
            ]

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",  # DO NOT CHANGE THIS MODEL
                messages=messages,
                max_tokens=100,
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

    def _save_content(self, content: Dict[str, Any]):
        """Save content to Firestore."""
        if not content:
            return

        # Update video document in Firestore
        video_ref = self.db.collection('videos').document(self.video_id)
        video_ref.update({
            'title': content.get('title', 'Untitled Video'),
            'description': content.get('description', ''),
            'metadata': {
                'hashtags': content.get('hashtags', [])
            },
            'hasContent': True,
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        logger.info(f"Saved content for video {self.video_id} to Firestore")

    def process(self) -> Dict[str, Any]:
        """Process video and generate content."""
        try:
            # Download video
            video_path = self._download_video()

            # Extract frames
            frame_urls = self._extract_frames(video_path)

            # Cleanup video file early to save memory
            os.unlink(video_path)

            # Generate content description
            content = self._generate_content_description(frame_urls)
            logger.info(f"Generated content: {content}")

            # Generate hashtags
            hashtags = self._generate_hashtags(frame_urls)
            logger.info(f"Generated hashtags: {hashtags}")

            # Combine all content
            result = {
                'title': content.get('title', 'Untitled Video'),
                'description': content.get('description', 'No description available'),
                'hashtags': hashtags
            }

            # Save content
            self._save_content(result)

            return {
                "success": True,
                "videoId": self.video_id,
                "title": result['title'],
                "description": result['description'],
                "metadata": {
                    "hashtags": hashtags
                }
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


def process_all_videos(force: bool = False) -> Dict[str, Any]:
    """Process all videos that need content generation.

    Args:
        force: If True, process all videos regardless of existing content
    """
    try:
        videos = get_videos_without_content(force)
        if not videos:
            return {
                "success": True,
                "message": "No videos found needing content generation",
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
            "message": f"Generated content for {successful} out of {len(results)} videos",
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
