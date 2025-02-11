#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print usage
print_usage() {
    echo "Usage: $0 [function_names...]"
    echo "Available functions:"
    echo "  health              - Deploy health check function"
    echo "  thumbnail          - Deploy thumbnail generator function"
    echo "  hashtag           - Deploy hashtag generator function"
    echo "  analyze           - Deploy image analysis function"
    echo "  all               - Deploy all functions (default if no arguments provided)"
    echo ""
    echo "Example:"
    echo "  $0 thumbnail hashtag    # Deploy only thumbnail and hashtag functions"
    echo "  $0 all                  # Deploy all functions"
}

# Function to deploy a specific function
deploy_function() {
    local function_type=$1
    local function_name=$2
    local entry_point=$3
    local memory=$4
    local timeout=$5
    local min_instances=$6
    local max_instances=$7

    # Navigate to the correct directory based on function type
    local base_dir="$(dirname "$0")/../functions/python"
    if [ "$function_type" == "hashtag" ]; then
        cd "$base_dir/hashtag_generator" || exit
    elif [ "$function_type" == "analyze" ]; then
        cd "$base_dir/image_analyzer" || exit
    else
        cd "$base_dir/thumbnail_generator" || exit
    fi

    # Check if we're in the right directory
    if [ ! -f "main.py" ]; then
        echo -e "${RED}❌ Could not find main.py in $(pwd). Make sure you're in the right directory.${NC}"
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f ".env" ]; then
        echo -e "${RED}❌ Could not find .env file in $(pwd).${NC}"
        exit 1
    fi

    # Create a temporary virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}📦 Creating virtual environment...${NC}"
        python3 -m venv venv
    fi

    # Activate virtual environment
    source venv/bin/activate

    echo -e "${YELLOW}📦 Installing production dependencies...${NC}"
    pip install --cache-dir .pip_cache -r requirements.prod.txt

    echo -e "${YELLOW}🔐 Loading environment variables...${NC}"
    set -a
    source .env
    set +a

    # Escape newlines in private key for gcloud
    ESCAPED_PRIVATE_KEY=$(echo "$FIREBASE_PRIVATE_KEY" | awk '{printf "%s\\n", $0}')

    # Prepare environment variables string
    ENV_VARS="FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},FIREBASE_PRIVATE_KEY=${ESCAPED_PRIVATE_KEY},OPENAI_API_KEY=${OPENAI_API_KEY}"

    echo -e "${YELLOW}Deploying ${function_name} function...${NC}"
    gcloud functions deploy ${function_name} \
        --gen2 \
        --runtime=python311 \
        --region=us-central1 \
        --source=. \
        --trigger-http \
        --allow-unauthenticated \
        --set-env-vars="$ENV_VARS" \
        --service-account=firebase-adminsdk-fbsvc@reelai-c82fc.iam.gserviceaccount.com \
        --entry-point=${entry_point} \
        --memory=${memory} \
        --timeout=${timeout} \
        --min-instances=${min_instances} \
        --max-instances=${max_instances}
    
    local status=$?
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}✅ ${function_name} deployed successfully!${NC}"
        echo -e "${GREEN}URL: https://us-central1-reelai-c82fc.cloudfunctions.net/${function_name}${NC}"
    else
        echo -e "${RED}❌ ${function_name} deployment failed${NC}"
        exit 1
    fi

    # Deactivate virtual environment
    deactivate
}

# Check if help is requested
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    print_usage
    exit 0
fi

echo -e "${YELLOW}🚀 Preparing for Cloud Functions deployment...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed. Please install it first:${NC}"
    echo "brew install google-cloud-sdk"
    exit 1
fi

# Function configurations
FUNCTION_NAMES=("health" "thumbnail" "hashtag" "analyze")
FUNCTION_CONFIGS=(
    "thumbnail:generate-video-thumbnail-health:health:256MB:30s:0:1"
    "thumbnail:generate-video-thumbnail:generate_video_thumbnail:512MB:540s:0:10"
    "hashtag:generate-video-hashtags:generate_video_hashtags:2048MB:300s:0:10"
    "analyze:analyze-screenshot:analyze_screenshot:512MB:60s:0:10"
)

# Function to get config for a function name
get_function_config() {
    local func_name=$1
    local index=0
    for name in "${FUNCTION_NAMES[@]}"; do
        if [ "$name" == "$func_name" ]; then
            echo "${FUNCTION_CONFIGS[$index]}"
            return 0
        fi
        ((index++))
    done
    return 1
}

# Deploy selected functions or all if no arguments provided
if [ $# -eq 0 ] || [ "$1" == "all" ]; then
    echo -e "${YELLOW}Deploying all functions...${NC}"
    for func in "${FUNCTION_NAMES[@]}"; do
        config=$(get_function_config "$func")
        IFS=: read -r type name entry_point memory timeout min_instances max_instances <<< "$config"
        deploy_function "$type" "$name" "$entry_point" "$memory" "$timeout" "$min_instances" "$max_instances"
    done
else
    # Deploy only specified functions
    for func in "$@"; do
        config=$(get_function_config "$func")
        if [ $? -eq 0 ]; then
            IFS=: read -r type name entry_point memory timeout min_instances max_instances <<< "$config"
            deploy_function "$type" "$name" "$entry_point" "$memory" "$timeout" "$min_instances" "$max_instances"
        else
            echo -e "${RED}❌ Unknown function: $func${NC}"
            print_usage
            exit 1
        fi
    done
fi

echo -e "${GREEN}✅ Deployment completed!${NC}" 