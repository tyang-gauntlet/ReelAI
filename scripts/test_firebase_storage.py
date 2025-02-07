#!/usr/bin/env python3
"""Test script for Firebase Storage operations."""

import os
import sys
import json
import logging
import firebase_admin
from firebase_admin import credentials, storage

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def init_firebase():
    """Initialize Firebase Admin SDK."""
    try:
        # Initialize Firebase Admin
        if not firebase_admin._apps:
            firebase_admin.initialize_app()

        # Get storage bucket
        bucket = storage.bucket()
        logger.info(
            f"Successfully initialized Firebase Storage. Bucket: {bucket.name}")
        return bucket
    except Exception as e:
        logger.error(f"Error initializing Firebase: {str(e)}")
        raise


def list_storage_videos(bucket):
    """List all videos in storage bucket."""
    try:
        logger.info("Listing videos in storage...")
        # List all blobs in root
        blobs = bucket.list_blobs()

        # Filter for video files
        video_blobs = [blob for blob in blobs if blob.name.endswith('.mp4')]

        logger.info(f"Found {len(video_blobs)} videos:")
        for blob in video_blobs:
            logger.info(f"- {blob.name}")
            logger.info(f"  Size: {blob.size:,} bytes")
            logger.info(f"  Content type: {blob.content_type}")
            logger.info(f"  Updated: {blob.updated}")
            logger.info(f"  URL: gs://{bucket.name}/{blob.name}")

            # Get signed URL for direct access
            try:
                url = blob.generate_signed_url(
                    version='v4',
                    expiration=300,  # 5 minutes
                    method='GET'
                )
                logger.info(f"  Signed URL: {url}")
            except Exception as e:
                logger.warning(f"Could not generate signed URL: {e}")

        return video_blobs
    except Exception as e:
        logger.error(f"Error listing videos: {str(e)}")
        raise


def check_video_metadata(bucket, blob):
    """Check metadata for a video."""
    try:
        logger.info(f"\nChecking metadata for {blob.name}:")
        blob.reload()  # Refresh metadata

        # Log all metadata
        logger.info("Metadata:")
        for key, value in blob.metadata.items() if blob.metadata else {}:
            logger.info(f"  {key}: {value}")

        # Log other properties
        logger.info("Properties:")
        logger.info(f"  Content type: {blob.content_type}")
        logger.info(f"  Size: {blob.size:,} bytes")
        logger.info(f"  Created: {blob.time_created}")
        logger.info(f"  Updated: {blob.updated}")
        logger.info(f"  Storage class: {blob.storage_class}")

        return blob.metadata
    except Exception as e:
        logger.error(f"Error checking metadata: {str(e)}")
        raise


def main():
    """Main function."""
    try:
        # Initialize Firebase
        bucket = init_firebase()

        # List all videos
        logger.info("\n=== Storage Videos ===")
        videos = list_storage_videos(bucket)

        # Check metadata for each video
        for video in videos:
            check_video_metadata(bucket, video)

        return 0
    except Exception as e:
        logger.error(f"Error in main: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
