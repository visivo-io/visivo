# Deploy to AWS Amplify

AWS Amplify provides scalable hosting with deep AWS integration, making it ideal for enterprise deployments that need to connect with other AWS services.

## Features

- **Global CDN** via CloudFront
- **Auto-scaling** infrastructure
- **Branch deployments** for staging environments
- **AWS Cognito** integration for authentication
- **CloudWatch** monitoring and logging
- **Lambda functions** for server-side logic
- **S3 storage** for large datasets

## Prerequisites

- AWS Account
- AWS CLI configured (`aws configure`)
- Visivo project with `visivo dist` capability

## Quick Start

### Option 1: Amplify Console

1. Build your dashboard locally:
   ```bash
   visivo run
   visivo dist
   ```

2. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
3. Click "Host web app"
4. Choose "Deploy without Git provider"
5. Drag and drop your `dist` folder
6. Your dashboard is deployed!

### Option 2: Amplify CLI

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Configure AWS credentials
amplify configure

# Initialize Amplify in your project
amplify init

# Add hosting
amplify add hosting

# Build and deploy
visivo run
visivo dist
amplify publish
```

### Option 3: Git Integration

1. Push your project to GitHub/GitLab/Bitbucket/CodeCommit
2. In Amplify Console, click "New app" → "Host web app"
3. Connect your repository
4. Configure build settings (see below)
5. Deploy!

## Build Configuration

Create `amplify.yml` in your project root:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - pip install visivo
        - echo "DB_HOST=$DB_HOST" >> .env
        - echo "DB_USER=$DB_USER" >> .env
        - echo "DB_PASSWORD=$DB_PASSWORD" >> .env
    build:
      commands:
        - visivo run
        - visivo dist
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - ~/.cache/pip/**/*
```

## Environment Variables

Set environment variables in Amplify Console:

1. Go to App Settings → Environment Variables
2. Add your database credentials:
   ```
   DB_HOST=your-database.region.rds.amazonaws.com
   DB_USER=visivo_user
   DB_PASSWORD=<encrypted-password>
   ```
3. Amplify encrypts these values at rest

## Automated Deployment

### GitHub Actions + Amplify

Create `.github/workflows/deploy-amplify.yml`:

{% raw %}
```yaml
name: Deploy to AWS Amplify

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
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
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
      
      - name: Deploy to Amplify
        run: |
          # Upload to S3
          aws s3 sync dist/ s3://${{ secrets.AMPLIFY_BUCKET }}/ --delete
          
          # Trigger Amplify deployment
          aws amplify start-deployment \
            --app-id ${{ secrets.AMPLIFY_APP_ID }} \
            --branch-name main \
            --source-url s3://${{ secrets.AMPLIFY_BUCKET }}/
```
{% endraw %}

### Using AWS CodeBuild

Create `buildspec.yml`:

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.10
    commands:
      - pip install visivo
  
  pre_build:
    commands:
      - echo "Fetching database credentials from Secrets Manager..."
      - export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id prod/visivo/db --query SecretString --output text | jq -r .password)
  
  build:
    commands:
      - visivo run
      - visivo dist
  
  post_build:
    commands:
      - echo "Build completed on `date`"

artifacts:
  files:
    - '**/*'
  base-directory: dist
  name: visivo-dashboard-$(date +%Y%m%d%H%M%S)

cache:
  paths:
    - '/root/.cache/pip/**/*'
```

## Authentication with AWS Cognito

### Basic Setup

1. **Create Cognito User Pool**:
   ```bash
   aws cognito-idp create-user-pool \
     --pool-name visivo-users \
     --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}"
   ```

2. **Configure Amplify Auth**:
   ```bash
   amplify add auth
   # Choose: Default configuration with Social Provider
   # Select: Email
   ```

3. **Add Authentication Check**:
   ```javascript
   // Add to your dashboard
   import { Auth } from 'aws-amplify';
   
   async function checkAuth() {
     try {
       await Auth.currentAuthenticatedUser();
     } catch {
       window.location.href = '/login';
     }
   }
   
   checkAuth();
   ```

### Advanced: Role-Based Access

```javascript
// Lambda function for authorization
exports.handler = async (event) => {
  const { userName, userPoolId } = event;
  
  // Get user groups
  const cognito = new AWS.CognitoIdentityServiceProvider();
  const groups = await cognito.adminListGroupsForUser({
    UserPoolId: userPoolId,
    Username: userName
  }).promise();
  
  // Check permissions
  const hasAccess = groups.Groups.some(g => 
    ['admins', 'viewers'].includes(g.GroupName)
  );
  
  if (!hasAccess) {
    throw new Error('Unauthorized');
  }
  
  return event;
};
```

## Custom Domain

### Setup with Route 53

1. **Register domain** (if needed):
   ```bash
   aws route53domains register-domain \
     --domain-name your-dashboard.com
   ```

2. **Add custom domain in Amplify**:
   ```bash
   aws amplify create-domain-association \
     --app-id YOUR_APP_ID \
     --domain-name your-dashboard.com
   ```

3. **Configure subdomains**:
   ```bash
   aws amplify create-sub-domain \
     --app-id YOUR_APP_ID \
     --domain-name your-dashboard.com \
     --sub-domain-settings prefix=www,branchName=main
   ```

### SSL Certificate

Amplify automatically provisions and manages SSL certificates:
- Auto-renewal
- CloudFront distribution
- HTTP to HTTPS redirect

## Performance Optimization

### CloudFront Caching

Configure caching rules in `amplify.yml`:

```yaml
customHeaders:
  - pattern: '**/*.js'
    headers:
      - key: Cache-Control
        value: 'public, max-age=31536000, immutable'
  - pattern: '**/*.css'
    headers:
      - key: Cache-Control
        value: 'public, max-age=31536000, immutable'
  - pattern: '**/data/*.json'
    headers:
      - key: Cache-Control
        value: 'public, max-age=3600, must-revalidate'
```

### Lambda@Edge Functions

Optimize performance with edge functions:

```javascript
// lambda-edge-compress.js
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  
  // Enable Brotli compression
  if (headers['accept-encoding']) {
    headers['accept-encoding'][0].value = 'br';
  }
  
  return request;
};
```

### S3 Integration for Large Datasets

For dashboards with large data files:

```bash
# Upload data to S3
aws s3 cp data/ s3://your-bucket/data/ --recursive

# Reference in dashboard
fetch('https://your-bucket.s3.amazonaws.com/data/dataset.json')
```

## Monitoring and Logging

### CloudWatch Metrics

Monitor your dashboard automatically:

```bash
# View access logs
aws logs tail /aws/amplify/YOUR_APP_ID --follow

# Get metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Amplify \
  --metric-name Requests \
  --dimensions Name=App,Value=YOUR_APP_ID \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

### Set Up Alarms

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name high-error-rate \
  --alarm-description "Alert when error rate is high" \
  --metric-name 4xxErrors \
  --namespace AWS/Amplify \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

## Branch Deployments

### Automatic Branch Deployments

Configure in Amplify Console or via CLI:

```bash
# Create branch deployment
aws amplify create-branch \
  --app-id YOUR_APP_ID \
  --branch-name staging \
  --enable-auto-build

# Set branch-specific environment variables
aws amplify update-branch \
  --app-id YOUR_APP_ID \
  --branch-name staging \
  --environment-variables DB_HOST=staging-db.amazonaws.com
```

### Preview URLs

Each branch gets a unique URL:
- Main: `https://main.YOUR_APP_ID.amplifyapp.com`
- Staging: `https://staging.YOUR_APP_ID.amplifyapp.com`
- Feature: `https://feature-x.YOUR_APP_ID.amplifyapp.com`

## Cost Optimization

### Free Tier Limits
- 1000 build minutes/month
- 15 GB served/month
- 5 GB stored/month

### Cost Reduction Strategies

1. **Optimize build frequency**:
   ```yaml
   # Only build on main branch
   on:
     push:
       branches: [main]
   ```

2. **Use S3 for large files**:
   ```bash
   # Store data in S3, not in Amplify
   aws s3 cp large-data.json s3://your-bucket/
   ```

3. **Enable CloudFront compression**:
   ```yaml
   customHeaders:
     - pattern: '**/*'
       headers:
         - key: Content-Encoding
           value: gzip
   ```

4. **Set appropriate cache headers**:
   ```yaml
   customHeaders:
     - pattern: '**/assets/**'
       headers:
         - key: Cache-Control
           value: 'public, max-age=31536000'
   ```

## Troubleshooting

### Build Failures

1. **Python version issues**:
   ```yaml
   phases:
     preBuild:
       commands:
         - python3 -m pip install --upgrade pip
         - python3 -m pip install visivo
   ```

2. **Memory limits**:
   ```yaml
   build:
     commands:
       - export NODE_OPTIONS="--max-old-space-size=4096"
       - visivo run
   ```

3. **Timeout issues**:
   ```yaml
   settings:
     buildTimeout: 30  # minutes
   ```

### Database Connection Issues

1. **VPC Configuration**:
   ```bash
   # Add Amplify to VPC
   aws amplify update-app \
     --app-id YOUR_APP_ID \
     --enable-branch-auto-build \
     --custom-rules Source=/api/<*>,Target=https://api.example.com/<*>,Status=200
   ```

2. **Security Group Rules**:
   ```bash
   # Allow Amplify build servers
   aws ec2 authorize-security-group-ingress \
     --group-id sg-xxxxxx \
     --protocol tcp \
     --port 5432 \
     --cidr 0.0.0.0/0  # Consider restricting this
   ```

### Large File Issues

For files over 25MB:

1. **Use S3 for data files**:
   ```javascript
   // Load from S3 instead of bundling
   fetch('https://your-bucket.s3.amazonaws.com/data/large.json')
   ```

2. **Stream large datasets**:
   ```javascript
   // Use pagination or streaming
   fetch('/api/data?page=1&limit=1000')
   ```

## Migration Guide

### From Visivo Cloud

1. Export your configuration
2. Set up AWS account and Amplify app
3. Configure environment variables
4. Update CI/CD pipelines
5. Update DNS records

### From Other AWS Services

**From S3 + CloudFront**:
```bash
# Import existing site
amplify import
```

**From Elastic Beanstalk**:
1. Export static files
2. Create Amplify app
3. Deploy with `amplify publish`

## Security Best Practices

1. **Use AWS Secrets Manager**:
   ```bash
   aws secretsmanager create-secret \
     --name visivo/db-credentials \
     --secret-string '{"username":"user","password":"pass"}'
   ```

2. **Enable Web Application Firewall (WAF)**:
   ```bash
   aws wafv2 create-web-acl \
     --name visivo-waf \
     --scope CLOUDFRONT
   ```

3. **Implement least privilege IAM**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "amplify:CreateDeployment",
         "amplify:UpdateApp"
       ],
       "Resource": "arn:aws:amplify:*:*:apps/YOUR_APP_ID/*"
     }]
   }
   ```

## Next Steps

- [Configure authentication](#authentication-with-aws-cognito)
- [Set up monitoring](#monitoring-and-logging)
- [Optimize costs](#cost-optimization)
- [Return to static hosting overview](static-hosting.md)