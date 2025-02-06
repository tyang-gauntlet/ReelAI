#!/usr/bin/env python3
import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def test_function_locally():
    """Test the function locally using Functions Framework."""
    print("\n=== Testing generate_video_thumbnail function locally ===")

    # The local function URL when running with Functions Framework
    url = "http://localhost:8080"

    # Test processing all videos
    print("\nTesting processing all videos...")
    response = requests.post(url)

    if response.status_code == 200:
        result = response.json()
        print("\nResponse:")
        print(json.dumps(result, indent=4))
    else:
        print(f"\nError: {response.status_code}")
        print(response.text)


if __name__ == "__main__":
    print("Starting local test...")
    print("Make sure you have the function running locally with:")
    print("functions-framework --target=generate_video_thumbnail --debug")
    print("\nIn a separate terminal, run this script to test the function.")

    test_function_locally()
