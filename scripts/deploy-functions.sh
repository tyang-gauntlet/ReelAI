#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Deploying Cloud Functions...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed. Please install it first:${NC}"
    echo "brew install google-cloud-sdk"
    exit 1
fi

# Navigate to the functions directory
cd "$(dirname "$0")/../functions/python/thumbnail_generator" || exit

# Check if we're in the right directory
if [ ! -f "main.py" ]; then
    echo -e "${RED}❌ Could not find main.py. Make sure you're in the right directory.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Could not find .env file. Make sure it exists in the thumbnail_generator directory.${NC}"
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
# Use pip's cache and only install production requirements
pip install --cache-dir .pip_cache -r requirements.prod.txt

echo -e "${YELLOW}🔐 Loading environment variables...${NC}"

# Load environment variables from .env file
set -a
source .env
set +a

# Escape newlines in private key for gcloud
ESCAPED_PRIVATE_KEY=$(echo "$FIREBASE_PRIVATE_KEY" | awk '{printf "%s\\n", $0}')

# Prepare environment variables string
ENV_VARS="FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},FIREBASE_PRIVATE_KEY=${ESCAPED_PRIVATE_KEY},OPENAI_API_KEY=${OPENAI_API_KEY}"

echo -e "${YELLOW}🚀 Deploying functions...${NC}"

# Common deployment options
COMMON_OPTS="--gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars=$ENV_VARS \
  --service-account=firebase-adminsdk-fbsvc@reelai-c82fc.iam.gserviceaccount.com"

# Deploy all functions in parallel
echo -e "${YELLOW}Deploying health check function...${NC}"
gcloud functions deploy generate-video-thumbnail-health \
  $COMMON_OPTS \
  --entry-point=health \
  --memory=256MB \
  --timeout=30s \
  --min-instances=0 \
  --max-instances=1 &

echo -e "${YELLOW}Deploying thumbnail generator function...${NC}"
gcloud functions deploy generate-video-thumbnail \
  $COMMON_OPTS \
  --entry-point=generate_video_thumbnail \
  --memory=512MB \
  --timeout=540s \
  --min-instances=0 \
  --max-instances=10 &

echo -e "${YELLOW}Deploying hashtag generator function...${NC}"
gcloud functions deploy generate-video-hashtags \
  $COMMON_OPTS \
  --entry-point=generate_video_hashtags \
  --memory=2048MB \
  --timeout=300s \
  --min-instances=0 \
  --max-instances=10 &

# Wait for all deployments to finish
wait

# Check if any deployment failed
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Functions deployed successfully!${NC}"
    echo -e "${GREEN}Main Function URLs:${NC}"
    echo -e "${GREEN}Thumbnail Generator: https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-thumbnail${NC}"
    echo -e "${GREEN}Hashtag Generator: https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-hashtags${NC}"
    echo -e "${GREEN}Health Check: https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-thumbnail-health${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Deactivate virtual environment
deactivate 