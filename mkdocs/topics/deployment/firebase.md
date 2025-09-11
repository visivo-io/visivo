# Deploy to Firebase

Firebase Hosting provides fast, secure hosting with Google's global CDN, making it ideal for teams already using Google Cloud Platform or Firebase services.

## Features

- **Global CDN** with automatic SSL
- **GitHub Actions integration** via Firebase CLI
- **Preview channels** for staging deployments
- **Firebase Authentication** integration
- **Cloud Functions** for server-side logic
- **Firestore/Realtime Database** integration
- **Free tier** with generous limits

## Prerequisites

- Google account
- Node.js installed
- Visivo project with `visivo dist` capability

## Quick Start

### 1. Install Firebase CLI

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login
```

### 2. Initialize Firebase Project

```bash
# Initialize Firebase in your project
firebase init

# Select:
# - Hosting: Configure files for Firebase Hosting
# - Use an existing project or create new
# - Public directory: dist
# - Single-page app: Yes
# - Set up automatic builds: No (we'll use custom builds)
```

### 3. Build and Deploy

```bash
# Build your dashboard
visivo run
visivo dist

# Deploy to Firebase
firebase deploy --only hosting
```

Your dashboard is now live at `https://YOUR-PROJECT.web.app`!

## Firebase Configuration

### firebase.json

Configure Firebase hosting in `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/data/**",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=3600, must-revalidate"
          }
        ]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  }
}
```

### .firebaserc

Configure project aliases in `.firebaserc`:

```json
{
  "projects": {
    "default": "your-project-id",
    "staging": "your-project-staging",
    "production": "your-project-prod"
  }
}
```

## Automated Deployment

### GitHub Actions

Create `.github/workflows/deploy-firebase.yml`:

{% raw %}
```yaml
name: Deploy to Firebase

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Build Dashboard
        run: |
          visivo run
          visivo dist
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```
{% endraw %}

### Setting Up Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Navigate to Project Settings → Service Accounts
3. Generate new private key
4. Add the JSON content as `FIREBASE_SERVICE_ACCOUNT` in GitHub secrets

## Preview Deployments

Firebase supports preview channels for pull requests:

### Automatic PR Previews

{% raw %}
```yaml
name: Firebase Preview

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  preview:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
      - name: Install and Build
        run: |
          pip install visivo
          visivo run
          visivo dist
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
      
      - name: Deploy Preview
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          projectId: your-project-id
          expires: 7d
        env:
          FIREBASE_CLI_PREVIEWS: hostingchannels
```
{% endraw %}

### Manual Preview Channels

```bash
# Create a preview channel
firebase hosting:channel:deploy preview --expires 7d

# List all channels
firebase hosting:channel:list

# Delete a channel
firebase hosting:channel:delete preview
```

## Authentication

### Firebase Authentication Setup

1. **Enable Authentication**:
   ```bash
   # In Firebase Console, enable Authentication
   # Or use CLI:
   firebase init auth
   ```

2. **Configure Providers**:
   - Email/Password
   - Google Sign-In
   - GitHub
   - Microsoft
   - Custom providers

3. **Add Authentication Check**:
   ```javascript
   // Add to your dashboard's index.html
   import { initializeApp } from 'firebase/app';
   import { getAuth, onAuthStateChanged } from 'firebase/auth';
   
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID"
   };
   
   const app = initializeApp(firebaseConfig);
   const auth = getAuth(app);
   
   onAuthStateChanged(auth, (user) => {
     if (!user) {
       // Redirect to login
       window.location.href = '/login.html';
     }
   });
   ```

### Custom Claims for Role-Based Access

```javascript
// Cloud Function to set custom claims
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.setUserRole = functions.https.onCall(async (data, context) => {
  // Check if request is made by an admin
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Must be an admin to set roles'
    );
  }
  
  // Set custom user claims
  await admin.auth().setCustomUserClaims(data.uid, {
    role: data.role
  });
  
  return { message: `Role ${data.role} assigned to user ${data.uid}` };
});
```

## Cloud Functions Integration

### Scheduled Data Refresh

Create `functions/index.js`:

```javascript
const functions = require('firebase-functions');
const { exec } = require('child_process');
const admin = require('firebase-admin');
admin.initializeApp();

// Scheduled function to refresh data
exports.refreshDashboard = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    return new Promise((resolve, reject) => {
      exec('visivo run && visivo dist', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error}`);
          reject(error);
          return;
        }
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        // Upload logic here
        
        console.log('Dashboard refreshed successfully');
        resolve();
      });
    });
  });
```

Deploy functions:
```bash
firebase deploy --only functions
```

### API Endpoints

```javascript
// Serve dashboard data via API
exports.getDashboardData = functions.https.onRequest(async (req, res) => {
  // Check authentication
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  if (!idToken) {
    res.status(401).send('Unauthorized');
    return;
  }
  
  try {
    await admin.auth().verifyIdToken(idToken);
    
    // Fetch and return data
    const data = await fetchDashboardData();
    res.json(data);
  } catch (error) {
    res.status(403).send('Forbidden');
  }
});
```

## Custom Domain

### Setup Custom Domain

1. **In Firebase Console**:
   - Go to Hosting → Custom domain
   - Click "Add custom domain"
   - Enter your domain: `dashboard.yourdomain.com`

2. **Configure DNS**:
   ```
   Type: A
   Host: @
   Value: Firebase IP addresses (provided in console)
   
   Type: TXT
   Host: _acme-challenge
   Value: Verification token (provided in console)
   ```

3. **SSL Certificate**:
   - Firebase automatically provisions SSL
   - Zero-downtime certificate renewal
   - Enforces HTTPS by default

## Performance Optimization

### Enable HTTP/2 Push

```json
{
  "hosting": {
    "headers": [
      {
        "source": "/",
        "headers": [
          {
            "key": "Link",
            "value": "</js/app.js>; rel=preload; as=script"
          }
        ]
      }
    ]
  }
}
```

### Configure Caching

```json
{
  "hosting": {
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|ico)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000"
          }
        ]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        "source": "/data/**",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=3600, s-maxage=600"
          }
        ]
      }
    ]
  }
}
```

### Use Firebase CDN

```javascript
// Serve large files from Firebase Storage
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

const storage = getStorage();
const dataRef = ref(storage, 'data/large-dataset.json');
const url = await getDownloadURL(dataRef);
```

## Monitoring and Analytics

### Firebase Performance Monitoring

```javascript
import { getPerformance } from 'firebase/performance';

const perf = getPerformance();
// Automatic monitoring of page load, network requests
```

### Google Analytics Integration

```javascript
import { getAnalytics, logEvent } from 'firebase/analytics';

const analytics = getAnalytics();
logEvent(analytics, 'dashboard_viewed', {
  dashboard_name: 'sales_overview'
});
```

### Cloud Logging

```bash
# View logs
firebase functions:log

# View hosting logs
gcloud logging read "resource.type=firebase_hosting"
```

## Security Rules

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can read
    match /dashboards/{dashboard} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;
    }
  }
}
```

### Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /data/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;
    }
  }
}
```

## Cost Optimization

### Free Tier Limits
- 10 GB hosting storage
- 360 MB/day data transfer
- 20K function invocations/month
- Custom domain SSL included

### Optimization Strategies

1. **Use Firebase CDN effectively**:
   ```json
   {
     "hosting": {
       "trailingSlash": false,
       "cleanUrls": true
     }
   }
   ```

2. **Compress assets**:
   ```bash
   # Before deployment
   gzip -9 dist/**/*.{js,css,json}
   ```

3. **Lazy load data**:
   ```javascript
   // Load data on demand
   const loadData = async (dataset) => {
     const response = await fetch(`/data/${dataset}.json`);
     return response.json();
   };
   ```

4. **Use Firestore for dynamic data**:
   ```javascript
   // Store frequently changing data in Firestore
   const db = getFirestore();
   const snapshot = await getDocs(collection(db, 'metrics'));
   ```

## Troubleshooting

### Build Issues

1. **Python not found**:
   ```yaml
   - name: Setup Python
     uses: actions/setup-python@v5
     with:
       python-version: '3.10'
   ```

2. **Firebase CLI issues**:
   ```bash
   # Clear cache
   firebase logout
   firebase login:ci
   ```

3. **Large file uploads**:
   ```bash
   # Increase timeout
   firebase deploy --only hosting --timeout 1200
   ```

### Authentication Problems

1. **Check Firebase config**:
   ```javascript
   console.log('Firebase Config:', firebaseConfig);
   ```

2. **Verify API keys**:
   - Check restrictions in Google Cloud Console
   - Ensure domains are whitelisted

3. **Token expiration**:
   ```javascript
   // Force token refresh
   await user.getIdToken(true);
   ```

### Performance Issues

1. **Enable CDN compression**:
   ```json
   {
     "hosting": {
       "headers": [
         {
           "source": "**",
           "headers": [
             {
               "key": "Content-Encoding",
               "value": "gzip"
             }
           ]
         }
       ]
     }
   }
   ```

2. **Optimize images**:
   ```bash
   # Use WebP format
   convert image.png -quality 80 image.webp
   ```

## Migration Guide

### From Visivo Cloud

1. Export configuration
2. Create Firebase project
3. Set up GitHub Actions
4. Configure custom domain
5. Update DNS records

### From Other Platforms

**From Netlify**:
```bash
# Build locally
visivo dist

# Deploy to Firebase
firebase deploy --only hosting
```

**From AWS**:
1. Export static files from S3
2. Initialize Firebase project
3. Deploy with `firebase deploy`

## Multi-Environment Setup

### Development, Staging, Production

```json
// .firebaserc
{
  "projects": {
    "dev": "visivo-dev",
    "staging": "visivo-staging",
    "prod": "visivo-prod"
  }
}
```

Deploy to specific environment:
```bash
# Deploy to staging
firebase use staging
firebase deploy

# Deploy to production
firebase use prod
firebase deploy
```

### Environment-Specific Config

```javascript
// Load config based on environment
const env = window.location.hostname.includes('staging') 
  ? 'staging' 
  : 'production';

const config = {
  staging: {
    apiUrl: 'https://api-staging.example.com',
    debug: true
  },
  production: {
    apiUrl: 'https://api.example.com',
    debug: false
  }
}[env];
```

## Next Steps

- [Set up authentication](#authentication)
- [Configure custom domain](#custom-domain)
- [Add Cloud Functions](#cloud-functions-integration)
- [Return to static hosting overview](static-hosting.md)