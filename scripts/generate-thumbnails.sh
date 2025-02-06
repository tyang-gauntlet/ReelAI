#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

FUNCTION_URL="https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-thumbnail"

# Function to show usage
show_usage() {
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./generate-thumbnails.sh [command]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  all         Process all videos without thumbnails"
    echo "  single      Process a single video (requires --path)"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --path      Video path in storage (required for single mode)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./generate-thumbnails.sh all"
    echo "  ./generate-thumbnails.sh single --path videos/example.mp4"
}

# Function to process all videos
process_all() {
    echo -e "${YELLOW}🎬 Processing all videos without thumbnails...${NC}"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        $FUNCTION_URL)
    
    # Pretty print the JSON response
    echo $response | python3 -m json.tool

    # Check if the response contains an error
    if echo $response | grep -q "error"; then
        echo -e "${RED}❌ Error processing videos${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Processing complete!${NC}"
    fi
}

# Function to process single video
process_single() {
    local video_path=$1
    if [ -z "$video_path" ]; then
        echo -e "${RED}❌ Error: Video path is required for single mode${NC}"
        show_usage
        exit 1
    fi

    echo -e "${YELLOW}🎬 Processing video: $video_path${NC}"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"videoPath\": \"$video_path\"}" \
        $FUNCTION_URL)
    
    # Pretty print the JSON response
    echo $response | python3 -m json.tool

    # Check if the response contains an error
    if echo $response | grep -q "error"; then
        echo -e "${RED}❌ Error processing video${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Processing complete!${NC}"
    fi
}

# Parse command line arguments
COMMAND=$1
shift

case $COMMAND in
    "all")
        process_all
        ;;
    "single")
        VIDEO_PATH=""
        while [[ $# -gt 0 ]]; do
            case $1 in
                --path)
                    VIDEO_PATH="$2"
                    shift 2
                    ;;
                *)
                    echo -e "${RED}❌ Unknown option: $1${NC}"
                    show_usage
                    exit 1
                    ;;
            esac
        done
        process_single "$VIDEO_PATH"
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $COMMAND${NC}"
        show_usage
        exit 1
        ;;
esac 