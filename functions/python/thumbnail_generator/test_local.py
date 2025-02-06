import logging
import os
from dotenv import load_dotenv
from main import get_videos_without_thumbnails, process_video

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)


def test_list_videos():
    """Test listing videos without thumbnails."""
    print("\n=== Testing get_videos_without_thumbnails ===")
    videos = get_videos_without_thumbnails()
    print(f"Found {len(videos)} videos without thumbnails:")
    for video in videos:
        print(f"\nVideo ID: {video['id']}")
        print(f"Storage URL: {video.get('storageUrl', 'N/A')}")
        print(f"Storage Path: {video.get('storagePath', 'N/A')}")


def test_process_single_video(video_id: str = None):
    """Test processing a single video."""
    print("\n=== Testing process_video ===")
    videos = get_videos_without_thumbnails()

    if not videos:
        print("No videos found without thumbnails")
        return

    # Process specific video if ID provided, otherwise process first video
    test_video = None
    if video_id:
        test_video = next((v for v in videos if v['id'] == video_id), None)
        if not test_video:
            print(f"Video with ID {video_id} not found")
            return
    else:
        test_video = videos[0]

    print(f"\nProcessing video: {test_video['id']}")
    print(f"Storage URL: {test_video.get('storageUrl', 'N/A')}")
    print(f"Storage Path: {test_video.get('storagePath', 'N/A')}")

    result = process_video(test_video)
    print("\nResult:", result)


if __name__ == "__main__":
    import sys

    # Check for credentials
    creds_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if not os.path.exists(creds_path):
        print(f"Error: Service account key file not found at {creds_path}")
        print(
            "Please create a service account key and save it to the path specified in .env")
        sys.exit(1)

    # Test listing videos
    test_list_videos()

    # Test processing a single video
    if len(sys.argv) > 1:
        test_process_single_video(sys.argv[1])
    else:
        test_process_single_video()
