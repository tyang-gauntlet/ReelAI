"""Module for analyzing video content using OpenAI."""

import os
import cv2
import base64
import logging
import json
from typing import List, Dict, Any
import tempfile
from openai import OpenAI
import firebase_admin
from firebase_admin import storage, firestore
import numpy as np
from .config import firebase_config

logger = logging.getLogger(__name__)

# Constants for optimization
MAX_IMAGE_SIZE = 384
JPEG_QUALITY = 60


def resize_image(frame: np.ndarray) -> np.ndarray:
    """Resize image while maintaining aspect ratio."""
    height, width = frame.shape[:2]
    if height > MAX_IMAGE_SIZE or width > MAX_IMAGE_SIZE:
        scale = MAX_IMAGE_SIZE / max(height, width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        return cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
    return frame


class VideoFrameAnalyzer:
    def __init__(self, video_id: str, video_data: Dict[str, Any]):
        self.video_id = video_id
        self.video_data = video_data
        self.storage_client = storage.bucket(
            os.getenv('FIREBASE_STORAGE_BUCKET'))
        self.openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.db = firestore.client()

    def _download_video(self) -> str:
        """Download video to temporary file."""
        try:
            storage_path = self.video_data.get('videoPath')
            if not storage_path:
                raise ValueError("No storage path provided")

            # Remove leading slash if present
            storage_path = storage_path.lstrip('/')

            logger.info(f"Attempting to download video:")
            logger.info(f"Storage bucket: {self.storage_client.name}")
            logger.info(f"Storage path: {storage_path}")

            # Ensure bucket is initialized
            if not self.storage_client:
                raise ValueError("Storage bucket not initialized")

            blob = self.storage_client.blob(storage_path)
            logger.info(f"Blob exists: {blob.exists()}")
            logger.info(f"Full blob path: {blob.path}")

            if not blob.exists():
                raise ValueError(f"Video not found at path: {storage_path}")

            temp_file = tempfile.NamedTemporaryFile(
                delete=False, suffix='.mp4')
            blob.download_to_filename(temp_file.name)

            logger.info(f"Video downloaded to: {temp_file.name}")
            return temp_file.name

        except Exception as e:
            logger.error(f"Download error: {str(e)}")
            logger.exception("Full error details:")
            raise ValueError(f"Failed to download video: {str(e)}")

    def _extract_frame(self, video_path: str, timestamp: float) -> str:
        """Extract frame from video at specified timestamp."""
        logger.info(f"Extracting frame from {video_path} at {timestamp}s")
        cap = cv2.VideoCapture(video_path)

        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps
        logger.info(
            f"Video properties: FPS={fps}, Total frames={total_frames}, Duration={duration}s")

        # Convert timestamp to frame number
        frame_number = int(timestamp * fps)
        if frame_number >= total_frames:
            frame_number = total_frames - 1
        logger.info(f"Seeking to frame {frame_number}")

        # Seek to frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        logger.info(f"Frame read success: {ret}")
        cap.release()

        if not ret:
            raise ValueError(
                f"Could not extract frame at timestamp {timestamp}")

        # Process frame
        frame = resize_image(frame)
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
        _, buffer = cv2.imencode('.jpg', frame, encode_params)

        # Save frame temporarily
        temp_frame_path = f"temp/{self.video_id}_frame_{timestamp}.jpg"
        logger.info(f"Uploading frame to: {temp_frame_path}")
        frame_blob = self.storage_client.blob(temp_frame_path)
        frame_blob.upload_from_string(
            buffer.tobytes(), content_type='image/jpeg')

        # Get signed URL
        frame_url = frame_blob.generate_signed_url(
            version="v4",
            expiration=3600,
            method="GET"
        )
        logger.info(f"Generated signed URL: {frame_url}")

        return frame_url

    def _analyze_frame(self, frame_url: str) -> Dict[str, Any]:
        """Generate detailed analysis of the frame using OpenAI."""
        try:
            logger.info(f"Starting OpenAI analysis with URL: {frame_url}")
            messages = [
                {
                    "role": "system",
                    "content": """You are an expert wildlife biologist and naturalist with deep knowledge 
                    of animal behavior, ecology, and conservation. Analyze this frame with scientific 
                    precision, considering:
                    
                    1. Species identification and taxonomy
                    2. Behavioral patterns and social structures
                    3. Habitat utilization and environmental adaptation
                    4. Physical characteristics and evolutionary adaptations
                    5. Ecological relationships and ecosystem roles
                    6. Conservation status and environmental threats
                    
                    Format your analysis as detailed JSON with these fields:
                    - description: Comprehensive scientific overview
                    - species: {identification, classification, conservationStatus}
                    - behavior: {activity, socialInteraction, habitatUse}
                    - environment: {habitat, timeOfDay, weatherConditions, ecosystem}
                    - physicalCharacteristics: {appearance, adaptations, lifecycle}
                    - ecology: {dietaryHabits, roleInEcosystem, interactions}
                    - conservation: {threats, protectionStatus, populationTrends}
                    - scientificSignificance: Research and conservation implications
                    """
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Provide a detailed scientific analysis of this frame. Consider:
                            - Taxonomic identification and characteristics
                            - Observable behaviors and their significance
                            - Habitat use and environmental adaptations
                            - Ecological relationships and interactions
                            - Conservation implications
                            - Scientific research relevance
                            """
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": frame_url,
                                "detail": "high"
                            }
                        }
                    ]
                }
            ]

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=1000,  # Increased for more detailed response
                temperature=0.7,
                response_format={"type": "json_object"}
            )

            logger.info("Received OpenAI response")
            analysis = response.choices[0].message.content
            return json.loads(analysis)

        except Exception as e:
            logger.error(f"Error analyzing frame: {str(e)}")
            logger.exception("Full OpenAI error details:")
            return {
                "description": "Analysis failed",
                "species": {
                    "identification": "Unknown",
                    "classification": "Unknown",
                    "conservationStatus": "Unknown"
                },
                "behavior": {
                    "activity": "Unknown",
                    "socialInteraction": "Unknown",
                    "habitatUse": "Unknown"
                },
                "environment": {
                    "habitat": "Unknown",
                    "timeOfDay": "Unknown",
                    "weatherConditions": "Unknown",
                    "ecosystem": "Unknown"
                },
                "physicalCharacteristics": {
                    "appearance": "Unknown",
                    "adaptations": "Unknown",
                    "lifecycle": "Unknown"
                },
                "ecology": {
                    "dietaryHabits": "Unknown",
                    "roleInEcosystem": "Unknown",
                    "interactions": "Unknown"
                },
                "conservation": {
                    "threats": "Unknown",
                    "protectionStatus": "Unknown",
                    "populationTrends": "Unknown"
                },
                "scientificSignificance": "Unknown"
            }

    def _cleanup_temp_files(self):
        """Clean up temporary files from storage."""
        try:
            blobs = self.storage_client.list_blobs(
                prefix=f"temp/{self.video_id}_frame_")
            for blob in blobs:
                blob.delete()
        except Exception as e:
            logger.warning(f"Error cleaning up temp files: {str(e)}")

    def _save_analysis(self, analysis: Dict[str, Any], timestamp: float):
        """Save frame analysis to Firestore."""
        if not analysis:
            return

        video_ref = self.db.collection('videos').document(self.video_id)

        # Create a subcollection for frame analyses
        frame_ref = video_ref.collection(
            'frameAnalyses').document(f"timestamp_{timestamp}")
        frame_ref.set({
            'timestamp': timestamp,
            'analysis': analysis,
            'createdAt': firestore.SERVER_TIMESTAMP
        })

        logger.info(
            f"Saved frame analysis for video {self.video_id} at timestamp {timestamp}")

    def analyze_frame(self, timestamp: float) -> Dict[str, Any]:
        """Process video frame at timestamp and generate analysis."""
        try:
            video_path = self._download_video()
            frame_url = self._extract_frame(video_path, timestamp)
            os.unlink(video_path)

            analysis = self._analyze_frame(frame_url)
            self._save_analysis(analysis, timestamp)

            return {
                "success": True,
                "videoId": self.video_id,
                "timestamp": timestamp,
                "analysis": analysis
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"Error analyzing video frame {self.video_id}: {error_msg}")
            return {
                "success": False,
                "videoId": self.video_id,
                "timestamp": timestamp,
                "error": error_msg
            }
        finally:
            self._cleanup_temp_files()


def analyze_video_frame(video_data: Dict[str, Any], timestamp: float) -> Dict[str, Any]:
    """Analyze a single video frame at the specified timestamp."""
    try:
        logger.info(f"Starting analysis with data: {video_data}")
        logger.info(
            f"Using storage bucket: {os.getenv('FIREBASE_STORAGE_BUCKET')}")

        # Extract video ID from storage path if not provided
        video_id = video_data.get('id')
        if not video_id and 'videoPath' in video_data:
            # Extract ID from path (e.g., "path/to/video-123.mp4" -> "123")
            video_id = video_data['videoPath'].split('/')[-1].split('.')[0]

        if not video_id:
            raise ValueError("No video ID provided")

        logger.info(f"Analyzing video: {video_data}")

        analyzer = VideoFrameAnalyzer(video_id, video_data)
        return analyzer.analyze_frame(timestamp)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in analyze_video_frame: {error_msg}")
        logger.error(f"Video data received: {video_data}")
        return {
            "success": False,
            "error": error_msg,
            "videoData": video_data,  # Include received data for debugging
            "timestamp": timestamp
        }
