import os
import tempfile
import imageio
import numpy as np
from PIL import Image
from firebase_functions import storage_fn, options
from firebase_admin import initialize_app, storage, firestore
import logging
import json

# Initialize Firebase Admin
initialize_app()
db = firestore.client()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def generate_thumbnail(video_path, output_path, timestamp_s=0):
    """Generate a thumbnail from a video at the specified timestamp."""
    try:
        # Read the video file
        reader = imageio.get_reader(video_path)

        # Get the first frame
        frame = reader.get_data(0)

        # Convert to PIL Image
        image = Image.fromarray(frame)

        # Resize maintaining aspect ratio
        max_size = (720, 720)
        image.thumbnail(max_size, Image.Resampling.LANCZOS)

        # Save as JPEG
        image.save(output_path, "JPEG", quality=85)

        # Clean up
        reader.close()

        return True
    except Exception as e:
        logger.error(f"Error generating thumbnail: {str(e)}")
        return False


@storage_fn.on_object_finalized()
def generate_video_thumbnail(event: storage_fn.CloudEvent) -> None:
    """Triggered by a change to a Cloud Storage bucket."""
    try:
        # Get file data
        file_data = storage_fn.CloudStorageObjectData.from_json(event.data)
        file_path = file_data.name

        # Only process video files in the videos directory
        if not file_path.startswith('videos/') or not file_path.lower().endswith(('.mp4', '.mov')):
            logger.info(f"Skipping non-video file: {file_path}")
            return

        logger.info(f"Processing video: {file_path}")

        # Create temporary files for processing
        with tempfile.NamedTemporaryFile(suffix='.mp4') as video_temp:
            with tempfile.NamedTemporaryFile(suffix='.jpg') as thumb_temp:
                # Download video file
                bucket = storage.bucket()
                blob = bucket.blob(file_path)
                blob.download_to_filename(video_temp.name)

                # Generate thumbnail
                if not generate_thumbnail(video_temp.name, thumb_temp.name):
                    raise Exception("Failed to generate thumbnail")

                # Upload thumbnail
                thumbnail_path = f"thumbnails/{os.path.splitext(os.path.basename(file_path))[0]}.jpg"
                thumb_blob = bucket.blob(thumbnail_path)
                thumb_blob.upload_from_filename(thumb_temp.name)

                # Get the thumbnail URL
                thumbnail_url = thumb_blob.generate_signed_url(
                    version="v4",
                    expiration=3600 * 24 * 365 * 10,  # 10 years
                    method="GET"
                )

                # Update Firestore
                video_id = os.path.splitext(os.path.basename(file_path))[0]
                videos_ref = db.collection('videos')
                query = videos_ref.where(
                    'storagePath', '==', file_path).limit(1)
                docs = query.get()

                for doc in docs:
                    doc.reference.update({
                        'thumbnailPath': thumbnail_path,
                        'thumbnailUrl': thumbnail_url,
                        'processingStatus': 'completed'
                    })
                    logger.info(f"Updated Firestore document: {doc.id}")

        logger.info(f"Successfully processed video: {file_path}")

    except Exception as e:
        logger.error(f"Error processing video: {str(e)}")
        raise e
