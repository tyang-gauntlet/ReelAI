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
    
    # Make the request and capture both response and HTTP code
    response=$(curl -s -w "\n%{http_code}" \
        -H "Content-Type: application/json" \
        -d '{"action": "process_all"}' \
        $FUNCTION_URL)
    
    # Extract status code from last line
    http_code=$(echo "$response" | tail -n1)
    # Extract response body (all but last line)
    body=$(echo "$response" | sed \$d)
    
    echo -e "${YELLOW}Response code: $http_code${NC}"
    
    # Check if we got a valid response
    if [ $http_code -ne 200 ]; then
        echo -e "${RED}❌ Error: Server returned code $http_code${NC}"
        echo -e "${RED}Response: $body${NC}"
        exit 1
    fi
    
    # Try to pretty print if it's JSON
    if echo "$body" | jq . >/dev/null 2>&1; then
        echo "$body" | jq .
        # Check if the response contains an error
        if echo "$body" | jq -e 'has("error")' >/dev/null; then
            echo -e "${RED}❌ Error processing videos${NC}"
            exit 1
        else
            echo -e "${GREEN}✅ Processing complete!${NC}"
        fi
    else
        echo -e "${RED}❌ Invalid JSON response:${NC}"
        echo "$body"
        exit 1
    fi
}

# Function to process single video
process_single() {
    local video_path=$1
    if [ -z "$video_path" ]; then
        echo -e "${RED}❌ Video path is required for single mode${NC}"
        show_usage
        exit 1
    fi

    echo -e "${YELLOW}🎬 Processing video: $video_path${NC}"
    
    # Make the request and capture both response and HTTP code
    response=$(curl -s -w "\n%{http_code}" \
        -H "Content-Type: application/json" \
        -d "{\"videoPath\": \"$video_path\"}" \
        $FUNCTION_URL)
    
    # Extract status code from last line
    http_code=$(echo "$response" | tail -n1)
    # Extract response body (all but last line)
    body=$(echo "$response" | sed \$d)
    
    echo -e "${YELLOW}Response code: $http_code${NC}"
    
    # Check if we got a valid response
    if [ $http_code -ne 200 ]; then
        echo -e "${RED}❌ Error: Server returned code $http_code${NC}"
        echo -e "${RED}Response: $body${NC}"
        exit 1
    fi
    
    # Try to pretty print if it's JSON
    if echo "$body" | jq . >/dev/null 2>&1; then
        echo "$body" | jq .
        # Check if the response contains an error
        if echo "$body" | jq -e 'has("error")' >/dev/null; then
            echo -e "${RED}❌ Error processing video${NC}"
            exit 1
        else
            echo -e "${GREEN}✅ Processing complete!${NC}"
        fi
    else
        echo -e "${RED}❌ Invalid JSON response:${NC}"
        echo "$body"
        exit 1
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