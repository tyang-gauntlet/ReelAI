#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

FUNCTION_URL="https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-hashtags"

# Function to show usage
show_usage() {
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./generate-hashtags.sh <command> [options]"
    echo ""
    echo "Commands:"
    echo "  all                Process all videos"
    echo "  single            Process a single video"
    echo ""
    echo "Options:"
    echo "  --path           Video path (required for single mode)"
    echo "  --force          Force regenerate content for all videos"
    echo ""
    echo "Examples:"
    echo "  ./generate-hashtags.sh all                     # Process all videos"
    echo "  ./generate-hashtags.sh all --force            # Force regenerate all videos"
    echo "  ./generate-hashtags.sh single --path video.mp4 # Process single video"
}

# Function to process all videos
process_all() {
    local force=$1
    local endpoint_url="$FUNCTION_URL"
    
    if [ "$force" = true ]; then
        endpoint_url="${endpoint_url}?force=true"
        echo -e "${YELLOW}🎬 Force processing all videos...${NC}"
    else
        echo -e "${YELLOW}🎬 Processing all videos without hashtags...${NC}"
    fi
    
    response=$(curl -s -X POST "$endpoint_url")
    
    # Check if response is empty
    if [ -z "$response" ]; then
        echo -e "${RED}❌ Error: Empty response from server${NC}"
        exit 1
    fi
    
    # Pretty print the JSON response
    echo $response | python3 -m json.tool

    # Check if the response contains an error
    if echo $response | grep -q "error"; then
        echo -e "${RED}❌ Error processing videos${NC}"
        exit 1
    else
        if [ "$force" = true ]; then
            echo -e "${GREEN}✅ Force processed all videos${NC}"
        else
            echo -e "${GREEN}✅ No videos found without hashtags${NC}"
        fi
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

    echo -e "${YELLOW}🎬 Generating hashtags for video: $video_path${NC}"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"videoPath\": \"$video_path\"}" \
        $FUNCTION_URL)
    
    # Check if response is empty
    if [ -z "$response" ]; then
        echo -e "${RED}❌ Error: Empty response from server${NC}"
        exit 1
    fi
    
    # Pretty print the JSON response
    echo $response | python3 -m json.tool

    # Check if the response contains an error
    if echo $response | grep -q "error"; then
        echo -e "${RED}❌ Error generating hashtags${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Content generation complete!${NC}"
    fi
}

# Parse command line arguments
COMMAND=$1
shift

case $COMMAND in
    "all")
        FORCE=false
        while [[ $# -gt 0 ]]; do
            case $1 in
                --force)
                    FORCE=true
                    shift
                    ;;
                *)
                    echo -e "${RED}❌ Unknown option: $1${NC}"
                    show_usage
                    exit 1
                    ;;
            esac
        done
        process_all $FORCE
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