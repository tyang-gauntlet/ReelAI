#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Preparing to deploy analyze-screenshot function...${NC}"

# Check if .env file exists and is readable
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Could not find .env file${NC}"
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}🔐 Loading environment variables...${NC}"
set -a  # automatically export all variables
source .env
set +a

# Debug: Print environment variables (without exposing sensitive values)
echo -e "${YELLOW}📦 Verifying environment variables...${NC}"
[ -n "$FIREBASE_PROJECT_ID" ] && echo "✓ FIREBASE_PROJECT_ID is set" || echo "❌ FIREBASE_PROJECT_ID is missing"
[ -n "$FIREBASE_CLIENT_EMAIL" ] && echo "✓ FIREBASE_CLIENT_EMAIL is set" || echo "❌ FIREBASE_CLIENT_EMAIL is missing"
[ -n "$FIREBASE_PRIVATE_KEY" ] && echo "✓ FIREBASE_PRIVATE_KEY is set" || echo "❌ FIREBASE_PRIVATE_KEY is missing"
[ -n "$OPENAI_API_KEY" ] && echo "✓ OPENAI_API_KEY is set" || echo "❌ OPENAI_API_KEY is missing"

# Build the environment variables string for deployment
ENV_VARS=""
ENV_VARS+="FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},"
ENV_VARS+="FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},"
ENV_VARS+="OPENAI_API_KEY=${OPENAI_API_KEY},"

# Handle the private key specially due to its format
# Remove existing quotes and newlines, then add proper escaping
CLEANED_KEY=$(echo "$FIREBASE_PRIVATE_KEY" | tr -d '\n' | sed 's/"/\\"/g')
ENV_VARS+="FIREBASE_PRIVATE_KEY=${CLEANED_KEY}"

# Create a temporary deployment directory
DEPLOY_DIR=$(mktemp -d)
echo -e "${YELLOW}📦 Creating temporary deployment directory: ${DEPLOY_DIR}${NC}"

# Copy necessary files
cp -r image_analyzer main.py requirements.txt "$DEPLOY_DIR/"
cd "$DEPLOY_DIR"

# Deploy the function
echo -e "${YELLOW}🚀 Deploying function...${NC}"
gcloud functions deploy analyze_screenshot \
    --gen2 \
    --runtime python311 \
    --region=us-central1 \
    --source=. \
    --entry-point=analyze_screenshot \
    --trigger-http \
    --allow-unauthenticated \
    --memory=1024Mi \
    --timeout=300s \
    --min-instances=0 \
    --max-instances=10 \
    --set-env-vars="$ENV_VARS" \
    --service-account=firebase-adminsdk-fbsvc@reelai-c82fc.iam.gserviceaccount.com

DEPLOY_STATUS=$?

# Clean up
cd - > /dev/null
rm -rf "$DEPLOY_DIR"

if [ $DEPLOY_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ Function deployed successfully!${NC}"
    
    # Verify deployment environment variables
    echo -e "${YELLOW}Verifying deployment configuration...${NC}"
    gcloud functions describe analyze_screenshot \
        --gen2 \
        --region=us-central1 \
        --format="yaml(serviceConfig.environmentVariables)" \
        | grep -v "FIREBASE_PRIVATE_KEY\|OPENAI_API_KEY"
    
    echo -e "${GREEN}URL: https://us-central1-reelai-c82fc.cloudfunctions.net/analyze_screenshot${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Deploy both functions
gcloud functions deploy video_frame_analyzer --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=analyze_screenshot \
  --trigger-http \
  --allow-unauthenticated

gcloud functions deploy analyze_stored_image --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=analyze_stored_image \
  --trigger-http \
  --allow-unauthenticated 