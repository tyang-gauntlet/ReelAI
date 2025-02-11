#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Function URL
FUNCTION_URL="https://us-central1-reelai-c82fc.cloudfunctions.net/video_frame_analyzer"

# Test the endpoint
echo "Testing function endpoint..."
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"test": true}' \
  "${FUNCTION_URL}"

echo -e "\n${GREEN}Test complete${NC}" 