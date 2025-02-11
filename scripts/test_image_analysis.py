#!/usr/bin/env python3
"""Test the image analysis function with a sample image."""
import os
import sys
import base64
import json
import argparse
import requests
from pathlib import Path


def encode_image(image_path: str) -> str:
    """Encode an image file as base64."""
    with open(image_path, 'rb') as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')


def test_image_analysis(image_path: str, port: int = 8080):
    """Test the image analysis function with the given image."""
    try:
        # Encode the image
        print(f"Reading image from: {image_path}")
        base64_image = encode_image(image_path)

        # Prepare the request
        url = f'http://localhost:{port}'
        headers = {'Content-Type': 'application/json'}
        data = {'imageData': f'data:image/jpeg;base64,{base64_image}'}

        print(f"\nSending request to: {url}")
        response = requests.post(url, headers=headers, json=data)

        # Check the response
        if response.status_code == 200:
            result = response.json()
            print("\nAnalysis Results:")
            print(json.dumps(result, indent=2))
        else:
            print(f"\nError: {response.status_code}")
            print(response.text)

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Test image analysis function')
    parser.add_argument(
        'image_path',
        help='Path to the image file to analyze'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=8080,
        help='Port where the function is running (default: 8080)'
    )

    args = parser.parse_args()

    if not os.path.exists(args.image_path):
        print(f"Error: Image file not found: {args.image_path}")
        sys.exit(1)

    test_image_analysis(args.image_path, args.port)


if __name__ == '__main__':
    main()
