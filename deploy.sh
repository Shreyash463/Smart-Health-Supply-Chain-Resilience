#!/usr/bin/env bash
# ==============================================================================
# Smart Health & Supply Chain Resilience — Google Cloud Run & Firebase Deployer
# Track 3: Resilience (Build with AI: Code for Communities)
# ==============================================================================

set -e

PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"smart-health-resilience"}
REGION=${GOOGLE_CLOUD_REGION:-"asia-south1"}
SERVICE_NAME="smart-health-resilience"

echo "=========================================================="
echo "Deploying Smart Health & Supply Chain Resilience to GCP"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "=========================================================="

# 1. Build and Deploy Backend to Google Cloud Run
echo "[1/3] Building container and deploying to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "ENVIRONMENT=production,GEMINI_MODEL=gemini-flash-latest" \
  --min-instances 0 \
  --max-instances 5 \
  --memory 512Mi \
  --cpu 1

CLOUD_RUN_URL=$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')
echo "Cloud Run Backend deployed successfully at: $CLOUD_RUN_URL"

# 2. Deploy Frontend to Firebase Hosting
echo "[2/3] Deploying static frontend to Firebase Hosting..."
if command -v firebase &> /dev/null; then
  firebase deploy --only hosting --project "$PROJECT_ID"
else
  echo "Firebase CLI not found in PATH. Run: npx firebase-tools deploy --only hosting"
fi

echo "=========================================================="
echo "Deployment Complete!"
echo "Backend URL: $CLOUD_RUN_URL"
echo "Frontend URL: https://$PROJECT_ID.web.app"
echo "=========================================================="
