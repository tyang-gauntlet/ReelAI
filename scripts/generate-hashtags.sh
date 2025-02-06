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
    echo "  ./generate-hashtags.sh [command]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  all         Process all videos without hashtags"
    echo "  single      Process a single video (requires --path)"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --path      Video path in storage (required for single mode)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./generate-hashtags.sh all"
    echo "  ./generate-hashtags.sh single --path example.mp4"
}

# Function to process all videos
process_all() {
    echo -e "${YELLOW}🎬 Processing all videos without hashtags...${NC}"
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{}" \
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
        echo -e "${RED}❌ Error processing videos${NC}"
        exit 1
    else
        # Extract processed and total counts from response
        processed=$(echo $response | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('processed', 0))")
        total=$(echo $response | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('total', 0))")
        
        if [ "$total" -eq 0 ]; then
            echo -e "${GREEN}✅ No videos found without hashtags${NC}"
        else
            echo -e "${GREEN}✅ Successfully processed $processed out of $total videos${NC}"
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
        echo -e "${GREEN}✅ Hashtag generation complete!${NC}"
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