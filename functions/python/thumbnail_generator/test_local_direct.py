#!/usr/bin/env python3
import os
import json
from dotenv import load_dotenv
from main import initialize_firebase, get_videos_without_thumbnails, process_video

# Load environment variables
load_dotenv()


def test_list_videos():
    """Test listing videos without thumbnails."""
    print("\n=== Testing get_videos_without_thumbnails ===")

    # Initialize Firebase first
    initialize_firebase()

    videos = get_videos_without_thumbnails()
    print(f"\nFound {len(videos)} videos without thumbnails:")
    for video in videos:
        print(f"\nVideo ID: {video['id']}")
        print(f"Storage URL: {video.get('storageUrl', 'N/A')}")
        print(f"Storage Path: {video.get('storagePath', 'N/A')}")
        print(f"Full Video Data: {json.dumps(video, indent=2)}")
    return videos


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
    print("\nResult:", json.dumps(result, indent=4))


def test_process_all_videos():
    """Test processing all videos."""
    print("\n=== Testing process_all_videos ===")
    videos = get_videos_without_thumbnails()

    if not videos:
        print("No videos found without thumbnails")
        return

    results = []
    for video in videos:
        result = process_video(video)
        results.append(result)

    summary = {
        "total": len(results),
        "successful": len([r for r in results if 'success' in r]),
        "failed": len([r for r in results if 'error' in r]),
        "results": results
    }

    print("\nSummary:", json.dumps(summary, indent=4))


if __name__ == "__main__":
    import sys

    # Initialize Firebase
    initialize_firebase()

    if len(sys.argv) > 1:
        command = sys.argv[1]
        if command == "list":
            test_list_videos()
        elif command == "process":
            if len(sys.argv) > 2:
                test_process_single_video(sys.argv[2])
            else:
                test_process_single_video()
        elif command == "all":
            test_process_all_videos()
        else:
            print("Unknown command. Use: list, process [video_id], or all")
    else:
        print("Please specify a command: list, process [video_id], or all")
