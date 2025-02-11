#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function name and configuration
FUNCTION_NAME="analyze_video"
MEMORY="2048MB"
TIMEOUT="300s"
MIN_INSTANCES="0"
MAX_INSTANCES="10"
REGION="us-central1"

echo -e "${YELLOW}🚀 Preparing to deploy ${FUNCTION_NAME} function...${NC}"

# Change to the function directory
FUNCTION_DIR="functions/python/image_analyzer"
cd "$FUNCTION_DIR" || {
    echo -e "${RED}❌ Could not find function directory: ${FUNCTION_DIR}${NC}"
    exit 1
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Could not find .env file in ${FUNCTION_DIR}${NC}"
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}🔐 Loading environment variables...${NC}"
set -a
source .env
set +a

# Verify required environment variables
echo -e "${YELLOW}📦 Verifying environment variables...${NC}"
REQUIRED_VARS=("FIREBASE_PROJECT_ID" "FIREBASE_CLIENT_EMAIL" "FIREBASE_PRIVATE_KEY" "OPENAI_API_KEY" "FIREBASE_STORAGE_BUCKET")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Missing required environment variable: ${var}${NC}"
        exit 1
    fi
    echo "✓ ${var} is set"
done

# Create temporary deployment directory
DEPLOY_DIR=$(mktemp -d)
echo -e "${YELLOW}📦 Creating temporary deployment directory: ${DEPLOY_DIR}${NC}"

# Copy necessary files
cp -r image_analyzer main.py requirements.txt "$DEPLOY_DIR/"

# Move to deployment directory
cd "$DEPLOY_DIR" || exit 1

# Handle the private key specially
ESCAPED_PRIVATE_KEY=$(echo "$FIREBASE_PRIVATE_KEY" | sed 's/\\n/\\\\n/g')

# Build environment variables string
ENV_VARS=""
ENV_VARS+="FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},"
ENV_VARS+="FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},"
ENV_VARS+="FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},"
ENV_VARS+="OPENAI_API_KEY=${OPENAI_API_KEY},"
ENV_VARS+="FIREBASE_PRIVATE_KEY=${ESCAPED_PRIVATE_KEY}"

# Deploy the function
echo -e "${YELLOW}🚀 Deploying function...${NC}"

# Deploy the main function
gcloud functions deploy "$FUNCTION_NAME" \
    --gen2 \
    --runtime=python311 \
    --region="$REGION" \
    --source=. \
    --entry-point=analyze_video_function \
    --trigger-http \
    --allow-unauthenticated \
    --memory="$MEMORY" \
    --timeout="$TIMEOUT" \
    --min-instances="$MIN_INSTANCES" \
    --max-instances="$MAX_INSTANCES" \
    --set-env-vars="$ENV_VARS" \
    --set-build-env-vars="PYTHONPATH=/workspace" \
    --service-account=firebase-adminsdk-fbsvc@reelai-c82fc.iam.gserviceaccount.com

DEPLOY_STATUS=$?

# If main function deployed successfully, deploy health check
if [ $DEPLOY_STATUS -eq 0 ]; then
    echo -e "${YELLOW}🚀 Deploying health check function...${NC}"
    gcloud functions deploy "${FUNCTION_NAME}-health" \
        --gen2 \
        --runtime=python311 \
        --region="$REGION" \
        --source=. \
        --entry-point=health_check \
        --trigger-http \
        --allow-unauthenticated \
        --memory=256MB \
        --timeout=30s \
        --min-instances=0 \
        --max-instances=1 \
        --set-env-vars="$ENV_VARS" \
        --service-account=firebase-adminsdk-fbsvc@reelai-c82fc.iam.gserviceaccount.com
    
    HEALTH_DEPLOY_STATUS=$?
    [ $HEALTH_DEPLOY_STATUS -ne 0 ] && DEPLOY_STATUS=$HEALTH_DEPLOY_STATUS
fi

# Clean up
cd - > /dev/null
rm -rf "$DEPLOY_DIR"

if [ $DEPLOY_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ Function deployed successfully!${NC}"
    echo -e "${GREEN}Function URL: https://${REGION}-reelai-c82fc.cloudfunctions.net/${FUNCTION_NAME}${NC}"
    
    # Verify deployment configuration
    echo -e "${YELLOW}Verifying deployment configuration...${NC}"
    gcloud functions describe "$FUNCTION_NAME" \
        --gen2 \
        --region="$REGION" \
        --format="yaml(serviceConfig.environmentVariables)" \
        | grep -v "FIREBASE_PRIVATE_KEY\|OPENAI_API_KEY"
    
    echo -e "\n${YELLOW}⚠️  Remember to update your frontend configuration with the new function URL${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi 