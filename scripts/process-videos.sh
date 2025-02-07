#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get project configuration
PROJECT_ID="reelai-c82fc"
REGION="us-central1"

# Function endpoints
FUNCTION_BASE_URL="https://us-central1-reelai-c82fc.cloudfunctions.net"
THUMBNAIL_ENDPOINT="$FUNCTION_BASE_URL/generateVideoThumbnail"
HASHTAG_ENDPOINT="$FUNCTION_BASE_URL/generateVideoHashtags"
HEALTH_ENDPOINT="$FUNCTION_BASE_URL/health"

# Debug mode
DEBUG=false

# Function to check dependencies
check_dependencies() {
    local missing_deps=()
    
    # Check for jq
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}📦 Installing jq...${NC}"
        brew install jq
    fi

    # Check for gcloud
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI is not installed. Please install it first:${NC}"
        echo "brew install google-cloud-sdk"
        exit 1
    fi
}

# Function to print usage
print_usage() {
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./process-videos.sh [options] <command>"
    echo ""
    echo "Commands:"
    echo "  all                Process all videos (both thumbnails and hashtags)"
    echo "  thumbnails         Process only thumbnails"
    echo "  hashtags          Process only hashtags"
    echo "  single            Process a single video (requires --path and --type)"
    echo "  health            Check service health"
    echo ""
    echo "Options:"
    echo "  -v, --verbose     Enable verbose logging"
    echo "  -d, --debug       Enable debug mode"
    echo "  --path           Video path in storage (required for single mode)"
    echo "  --type           Process type for single mode (thumbnails or hashtags)"
    echo ""
    echo "Examples:"
    echo "  ./process-videos.sh all                                    # Process all videos"
    echo "  ./process-videos.sh -v thumbnails                         # Process all thumbnails with verbose logging"
    echo "  ./process-videos.sh single --path video.mp4 --type hashtags  # Generate hashtags for one video"
    echo "  ./process-videos.sh health                                # Check service health"
}

# Function to fetch logs
fetch_logs() {
    local start_time=$1
    local function_name=$2
    local project_id=$(gcloud config get-value project 2>/dev/null)
    
    echo -e "\n${YELLOW}📝 Function Logs:${NC}"
    
    # Temporarily redirect stderr to suppress deprecation warnings
    {
        exec 3>&2
        exec 2>/dev/null
        
        gcloud logging read "resource.type=cloud_function AND \
            resource.labels.function_name=$function_name AND \
            timestamp >= \"$start_time\" AND \
            severity>=DEFAULT" \
            --project=$project_id \
            --format="value(textPayload)" \
            --limit=100 | while read -r line; do
                if [ ! -z "$line" ]; then
                    echo -e "  ${line}"
                fi
            done
        
        exec 2>&3
    }
    
    if [ $? -ne 0 ] || [ -z "$(gcloud logging read "resource.type=cloud_function" --limit=1 2>/dev/null)" ]; then
        echo -e "${YELLOW}No logs found for this execution${NC}"
    fi
}

# Function to check if response is valid JSON
check_response() {
    local response=$1
    local operation=$2
    
    # Check if response is empty
    if [ -z "$response" ]; then
        echo -e "${RED}❌ Error: Empty response from server${NC}"
        return 1
    fi
    
    # Check if response is valid JSON
    if ! echo "$response" | jq '.' &>/dev/null; then
        echo -e "${RED}❌ Error: Invalid JSON response from $operation${NC}"
        echo -e "${YELLOW}Response:${NC}"
        echo "$response"
        return 1
    fi
    
    # Check if response contains error
    if echo "$response" | jq -e 'has("error")' &>/dev/null; then
        local error=$(echo "$response" | jq -r '.error')
        echo -e "${RED}❌ Error: $error${NC}"
        return 1
    fi
    
    return 0
}

# Function to print debug info
debug_info() {
    if [ "$DEBUG" = true ]; then
        echo -e "${YELLOW}🔍 Debug Info:${NC}"
        echo -e "  Project ID: $PROJECT_ID"
        echo -e "  Region: $REGION"
        echo -e "  Base URL: $FUNCTION_BASE_URL"
        echo -e "  Thumbnail Endpoint: $THUMBNAIL_ENDPOINT"
        echo -e "  Hashtag Endpoint: $HASHTAG_ENDPOINT"
        echo -e "  Health Endpoint: $HEALTH_ENDPOINT"
        echo -e "  Verbose Mode: $VERBOSE"
        echo -e "  Command: $COMMAND"
        if [ ! -z "$VIDEO_PATH" ]; then
            echo -e "  Video Path: $VIDEO_PATH"
        fi
        if [ ! -z "$PROCESS_TYPE" ]; then
            echo -e "  Process Type: $PROCESS_TYPE"
        fi
        echo ""
    fi
}

# Function to make API call
make_api_call() {
    local endpoint=$1
    local data=$2
    local operation=$3
    
    if [ "$DEBUG" = true ]; then
        echo -e "${YELLOW}🔍 Making API call:${NC}"
        echo -e "  Endpoint: $endpoint"
        echo -e "  Data: $data"
        echo -e "  Operation: $operation"
        echo ""
        
        # Make curl call with full output
        response=$(curl -v -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$endpoint" 2>&1)
        echo -e "${YELLOW}🔍 Raw Response:${NC}"
        echo "$response"
        echo ""
        
        # Extract just the response body for processing
        response=$(echo "$response" | grep -v "^*" | grep -v "^>" | grep -v "^<" | grep -v "^}" | tail -n 1)
    else
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$endpoint")
    fi
    
    echo "$response"
}

# Function to process thumbnails
process_thumbnails() {
    echo -e "${YELLOW}🎬 Processing videos for thumbnail generation...${NC}"
    local start_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    response=$(make_api_call "$THUMBNAIL_ENDPOINT" "{\"data\":{}}" "thumbnail generation")
        
    if ! check_response "$response" "thumbnail generation"; then
        return 1
    fi
    
    echo "$response" | jq '.'
    
    if [ "$VERBOSE" = true ]; then
        echo -e "${YELLOW}Waiting for logs to be available...${NC}"
        sleep 10
        fetch_logs "$start_time" "generateVideoThumbnail"
    fi
}

# Function to process hashtags
process_hashtags() {
    echo -e "${YELLOW}🏷️  Processing videos for hashtag generation...${NC}"
    local start_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    response=$(make_api_call "$HASHTAG_ENDPOINT" "{\"data\":{}}" "hashtag generation")
        
    if ! check_response "$response" "hashtag generation"; then
        return 1
    fi
    
    echo "$response" | jq '.'
    
    if [ "$VERBOSE" = true ]; then
        echo -e "${YELLOW}Waiting for logs to be available...${NC}"
        sleep 10
        fetch_logs "$start_time" "generateVideoHashtags"
    fi
}

# Function to process single video
process_single() {
    local video_path=$1
    local process_type=$2
    
    if [ -z "$video_path" ] || [ -z "$process_type" ]; then
        echo -e "${RED}❌ Error: Both video path and process type are required for single mode${NC}"
        print_usage
        exit 1
    fi
    
    local endpoint=""
    local function_name=""
    case $process_type in
        thumbnails)
            endpoint=$THUMBNAIL_ENDPOINT
            function_name="generateVideoThumbnail"
            echo -e "${YELLOW}🎬 Generating thumbnail for video: $video_path${NC}"
            ;;
        hashtags)
            endpoint=$HASHTAG_ENDPOINT
            function_name="generateVideoHashtags"
            echo -e "${YELLOW}🏷️  Generating hashtags for video: $video_path${NC}"
            ;;
        *)
            echo -e "${RED}❌ Invalid process type: $process_type${NC}"
            print_usage
            exit 1
            ;;
    esac
    
    local start_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    response=$(make_api_call "$endpoint" "{\"data\":{\"videoPath\":\"$video_path\"}}" "$process_type processing")
        
    if ! check_response "$response" "$process_type processing"; then
        return 1
    fi
    
    echo "$response" | jq '.'
    
    if [ "$VERBOSE" = true ]; then
        echo -e "${YELLOW}Waiting for logs to be available...${NC}"
        sleep 10
        fetch_logs "$start_time" "$function_name"
    fi
}

# Parse arguments
VERBOSE=false
DEBUG=false
COMMAND=""
VIDEO_PATH=""
PROCESS_TYPE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--debug)
            DEBUG=true
            shift
            ;;
        --path)
            VIDEO_PATH="$2"
            shift 2
            ;;
        --type)
            PROCESS_TYPE="$2"
            shift 2
            ;;
        all|thumbnails|hashtags|single|health)
            COMMAND=$1
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

if [ -z "$COMMAND" ]; then
    echo -e "${RED}Error: No command specified${NC}"
    print_usage
    exit 1
fi

# Check dependencies
check_dependencies

# Set up logging
if [ "$VERBOSE" = true ]; then
    echo -e "${YELLOW}🔍 Verbose logging enabled${NC}"
    export PYTHONWARNINGS="default"
    export LOGGING_LEVEL="DEBUG"
else
    export PYTHONWARNINGS="ignore"
    export LOGGING_LEVEL="INFO"
fi

# Process command
debug_info

case $COMMAND in
    health)
        echo -e "${YELLOW}🏥 Checking service health...${NC}"
        response=$(make_api_call "$HEALTH_ENDPOINT" "{}" "health check")
        if ! check_response "$response" "health check"; then
            exit 1
        fi
        echo "$response" | jq '.'
        ;;
    all)
        process_thumbnails || exit 1
        process_hashtags || exit 1
        ;;
    thumbnails)
        process_thumbnails || exit 1
        ;;
    hashtags)
        process_hashtags || exit 1
        ;;
    single)
        process_single "$VIDEO_PATH" "$PROCESS_TYPE" || exit 1
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $COMMAND${NC}"
        print_usage
        exit 1
        ;;
esac

exit_code=$?
if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ Processing complete!${NC}"
else
    echo -e "${RED}❌ Processing failed with exit code: $exit_code${NC}"
    exit 1
fi 