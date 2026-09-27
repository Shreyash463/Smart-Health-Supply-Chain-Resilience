@echo off
REM ==============================================================================
REM Smart Health & Supply Chain Resilience — Windows GCP & Firebase Deployer
REM ==============================================================================

set PROJECT_ID=%GOOGLE_CLOUD_PROJECT%
if "%PROJECT_ID%"=="" set PROJECT_ID=smart-health-resilience

set REGION=%GOOGLE_CLOUD_REGION%
if "%REGION%"=="" set REGION=asia-south1

set SERVICE_NAME=smart-health-resilience

echo ==========================================================
echo Deploying Smart Health & Supply Chain Resilience to GCP
echo Project: %PROJECT_ID% ^| Region: %REGION%
echo ==========================================================

echo [1/2] Deploying container to Google Cloud Run...
gcloud run deploy %SERVICE_NAME% --source . --project %PROJECT_ID% --region %REGION% --platform managed --allow-unauthenticated --set-env-vars ENVIRONMENT=production,GEMINI_MODEL=gemini-flash-latest

echo [2/2] Deploying static frontend to Firebase Hosting...
cmd /c npx firebase-tools deploy --only hosting --project %PROJECT_ID%

echo ==========================================================
echo Deployment Complete!
echo ==========================================================
