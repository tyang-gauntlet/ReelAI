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

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
pip install -r requirements.txt

echo -e "${YELLOW}🔐 Loading environment variables...${NC}"

# Load environment variables from .env file
set -a
source .env
set +a

# Escape newlines in private key for gcloud
ESCAPED_PRIVATE_KEY=$(echo "$FIREBASE_PRIVATE_KEY" | awk '{printf "%s\\n", $0}')

# Prepare environment variables string
ENV_VARS="FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},FIREBASE_PRIVATE_KEY=${ESCAPED_PRIVATE_KEY}"

echo -e "${YELLOW}🚀 Deploying function...${NC}"

# First deploy the health check function
gcloud functions deploy generate-video-thumbnail-health \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=health \
  --trigger-http \
  --memory=256MB \
  --timeout=30s \
  --min-instances=0 \
  --max-instances=1 \
  --allow-unauthenticated

# Then deploy the main function
gcloud functions deploy generate-video-thumbnail \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=generate_video_thumbnail \
  --trigger-http \
  --memory=512MB \
  --timeout=540s \
  --min-instances=0 \
  --max-instances=10 \
  --allow-unauthenticated \
  --set-env-vars="$ENV_VARS" \
  --service-account="firebase-adminsdk-fbsvc@reelai-c82fc.iam.gserviceaccount.com"

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Functions deployed successfully!${NC}"
    echo -e "${GREEN}Main Function URL: https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-thumbnail${NC}"
    echo -e "${GREEN}Health Function URL: https://us-central1-reelai-c82fc.cloudfunctions.net/generate-video-thumbnail-health${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi 