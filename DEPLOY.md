# Railway Deployment Guide

## Prerequisites
- GitHub account
- Railway account (railway.app) — free

## Step 1: Push to GitHub
```bash
git add .
git commit -m "ready for Railway deployment"
git push
```

## Step 2: Create Railway Project
1. Go to railway.app
2. Click "New Project"
3. Click "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys

## Step 3: Add Persistent Volume
Patient data must survive server restarts.

1. In Railway dashboard → your project → click your service
2. Click "Volumes" tab
3. Click "Add Volume"
4. Mount path: `/data`
5. Click "Add"

## Step 4: Set Environment Variables
1. In Railway dashboard → your service → "Variables" tab
2. Add these variables:

| Variable | Value |
|----------|-------|
| DATA_DIR | /data |
| NODE_ENV | production |

## Step 5: Upload dentists.json to the volume
Railway volumes are not accessible via git. Use the Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Upload your dentists.json to the volume
railway run -- node -e "
const fs = require('fs');
const data = $(cat dentists.json);
fs.writeFileSync('/data/dentists.json', JSON.stringify(data, null, 2));
console.log('dentists.json uploaded');
"
```

OR simpler — add a one-time setup route in server.js (remove after use):
The server auto-creates dentists.json with a default admin if it doesn't exist.
Then use the --add-dentist CLI to add dentists.

## Step 6: Get your URL
Railway gives you a free URL like:
`https://enzymess-dental-production.up.railway.app`

Go to Settings → Networking → Generate Domain

## Step 7: HTTPS
Railway includes free HTTPS automatically on their domain.
For a custom domain (e.g. dental.yourdomain.com):
1. Settings → Networking → Custom Domain
2. Add your domain
3. Add the CNAME record Railway shows you to your DNS provider
4. Free SSL certificate is issued automatically

## Updating the app
Every time you push to GitHub, Railway auto-redeploys:
```bash
git add .
git commit -m "update description"
git push
```

Done — Railway handles the rest.
