# Static Hosting

Visivo can generate static sites that you can host anywhere. This gives you complete control over your infrastructure, data privacy, and deployment process.

## How It Works

The `visivo dist` command creates a self-contained build folder with:
- Pre-rendered HTML pages
- Bundled JavaScript and CSS
- Generated data files
- All assets needed for deployment

```bash
# Generate static build
visivo dist

# Output structure
dist/
├── index.html
├── assets/
│   ├── js/
│   └── css/
└── data/
    └── *.json
```

## Deployment Platforms

<div class="grid cards" markdown>

-   :simple-netlify: __[Netlify](netlify.md)__
    
    ---
    
    Free tier with automatic deploys from Git. Perfect for public dashboards and proof-of-concepts.
    
    [:octicons-arrow-right-24: Deploy to Netlify](netlify.md)

-   :simple-amazonaws: __[AWS Amplify](aws-amplify.md)__
    
    ---
    
    Scalable hosting with AWS integration. Ideal for enterprise deployments with existing AWS infrastructure.
    
    [:octicons-arrow-right-24: Deploy to AWS](aws-amplify.md)

-   :simple-firebase: __[Firebase](firebase.md)__
    
    ---
    
    Google's hosting platform with CDN. Great for teams already using Google Cloud Platform.
    
    [:octicons-arrow-right-24: Deploy to Firebase](firebase.md)

</div>

### Other Platforms

Visivo's static output works with any static hosting service:

- **Vercel** - `vercel deploy dist/`
- **GitHub Pages** - Push to `gh-pages` branch
- **Cloudflare Pages** - Connect repo and set build output
- **Azure Static Web Apps** - Deploy with Azure CLI
- **Amazon S3 + CloudFront** - Upload to S3 bucket
- **Nginx/Apache** - Copy files to web root

## Basic Deployment Process

### 1. Build Your Dashboard

```bash
# Run queries and generate data
visivo run

# Create static build
visivo dist
```

### 2. Deploy Files

The exact deployment method depends on your platform, but the general process is:

```bash
# Example: Deploy to Netlify
netlify deploy --dir=dist --prod

# Example: Deploy to S3
aws s3 sync dist/ s3://your-bucket-name

# Example: Deploy to Firebase
firebase deploy --only hosting
```

### 3. Set Up Automatic Updates

Since static sites don't automatically refresh data, you'll need to rebuild and redeploy when data changes:

{% raw %}
```yaml
# GitHub Actions example
name: Update Dashboard

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
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
      
      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        with:
          args: deploy --dir=dist --prod
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```
{% endraw %}

## Authentication & Access Control

Static sites don't include built-in authentication. Here are common approaches:

### Platform Authentication
Many hosting platforms offer authentication features:
- **Netlify**: Identity service with role-based access
- **AWS Amplify**: Cognito integration
- **Firebase**: Firebase Auth
- **Vercel**: Password protection (Pro plan)

### CDN/Edge Authentication
Use CDN features to add authentication:
- **Cloudflare Access**: Zero-trust authentication
- **AWS CloudFront + Lambda@Edge**: Custom auth logic
- **Fastly**: Edge authentication

### Application-Level Authentication
Implement authentication in your dashboard:
```javascript
// Example: Check for auth token
if (!localStorage.getItem('auth_token')) {
  window.location.href = '/login';
}
```

## Advantages of Static Hosting

✅ **Complete Control**: Your infrastructure, your rules
✅ **Data Privacy**: No data leaves your environment  
✅ **Cost Effective**: Leverage existing hosting  
✅ **Performance**: Serve from CDN edge locations  
✅ **Compliance**: Meet regulatory requirements  
✅ **Customization**: Full control over deployment

## Limitations to Consider

❌ **Manual Updates**: Requires rebuild for data changes  
❌ **No Collaboration**: Built-in sharing features unavailable  
❌ **DIY Authentication**: Must implement access control  
❌ **No Automatic CI/CD**: Requires custom pipeline setup  
❌ **Larger File Sizes**: All data bundled in deployment

## Best Practices

### 1. Optimize Build Size
```yaml
# Exclude unnecessary data
traces:
  - name: large_dataset
    where: "date > current_date - 30"  # Limit data range
```

### 2. Implement Caching
```nginx
# Nginx example
location /data/ {
  expires 1h;
  add_header Cache-Control "public";
}
```

### 3. Use CDN
Deploy to platforms with built-in CDN or add one:
- CloudFlare
- AWS CloudFront
- Fastly
- Akamai

### 4. Monitor Deployments
Track deployment success and data freshness:
```bash
# Add deployment notifications
curl -X POST $SLACK_WEBHOOK -d '{"text":"Dashboard deployed successfully"}'
```

### 5. Version Control Builds
Tag deployments for rollback capability:
```bash
git tag -a "deploy-$(date +%Y%m%d-%H%M%S)" -m "Deployment"
git push origin --tags
```

## Migration from Visivo Cloud

Moving from Visivo Cloud to static hosting:

1. **Export your configuration**
   ```bash
   # Your project.visivo.yml already contains everything
   ```

2. **Set up build pipeline**
   ```bash
   # Same commands, different deployment
   visivo run
   visivo dist  # Instead of visivo deploy
   ```

3. **Configure hosting platform**
   - Choose platform
   - Set up authentication if needed
   - Configure custom domain

4. **Update CI/CD**
   - Replace `visivo deploy` with platform-specific deployment
   - Add build artifacts handling

## Next Steps

Choose your hosting platform:
- **[Netlify Guide](netlify.md)** - Quick setup with Git integration
- **[AWS Amplify Guide](aws-amplify.md)** - Enterprise-scale deployment
- **[Firebase Guide](firebase.md)** - Google Cloud integration

Or return to the [deployment overview](overview.md) to compare options.