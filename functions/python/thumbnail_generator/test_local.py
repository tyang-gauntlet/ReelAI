#!/usr/bin/env python3
"""Test script for local thumbnail generation."""

import os
import json
import logging
import sys
import argparse
from typing import Optional

from thumbnail_generator.config import firebase_config
from thumbnail_generator.video import VideoProcessor, get_videos_without_thumbnails

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def test_list_videos() -> None:
    """Test listing videos without thumbnails."""
    print("\n=== Testing get_videos_without_thumbnails ===")
    videos = get_videos_without_thumbnails()
    print(f"\nFound {len(videos)} videos without thumbnails:")
    for video in videos:
        print(f"\nVideo ID: {video['id']}")
        print(f"Storage URL: {video.get('storageUrl', 'N/A')}")
        print(f"Storage Path: {video.get('storagePath', 'N/A')}")
        print(f"Full Video Data: {json.dumps(video, indent=2)}")


def test_process_single_video(video_id: Optional[str] = None) -> None:
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

    with VideoProcessor(test_video['id'], test_video) as processor:
        result = processor.process()
        print("\nResult:", json.dumps(result, indent=4))


def test_process_all_videos() -> None:
    """Test processing all videos without thumbnails."""
    print("\n=== Testing process_all_videos ===")
    videos = get_videos_without_thumbnails()

    if not videos:
        print("No videos found without thumbnails")
        return

    results = []
    for video in videos:
        with VideoProcessor(video['id'], video) as processor:
            result = processor.process()
            results.append(result)

    summary = {
        "total": len(results),
        "successful": len([r for r in results if r.get('success', False)]),
        "failed": len([r for r in results if 'error' in r]),
        "results": results
    }

    print("\nSummary:", json.dumps(summary, indent=4))


def main() -> None:
    """Main entry point for the test script."""
    parser = argparse.ArgumentParser(
        description='Test video thumbnail generation')
    parser.add_argument('command', choices=['list', 'process', 'all'],
                        help='Command to execute (list, process, or all)')
    parser.add_argument(
        '--video-id', help='Video ID to process (for process command)')
    args = parser.parse_args()

    try:
        # Initialize Firebase
        firebase_config.initialize()

        if args.command == 'list':
            test_list_videos()
        elif args.command == 'process':
            test_process_single_video(args.video_id)
        elif args.command == 'all':
            test_process_all_videos()

    except Exception as e:
        print(f"\nError: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
