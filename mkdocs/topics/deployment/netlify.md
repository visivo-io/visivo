# Deploy to Netlify

Netlify provides free static hosting with automatic deploys from Git, making it one of the easiest ways to host Visivo dashboards.

## Features

- **Free tier** includes 100GB bandwidth/month
- **Automatic deploys** from GitHub/GitLab/Bitbucket  
- **Custom domains** with automatic SSL
- **Preview deployments** for pull requests
- **Built-in CDN** for global performance
- **Identity service** for authentication (paid feature)

## Quick Start

### Option 1: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build your dashboard
visivo run
visivo dist

# Deploy to Netlify
netlify init
netlify deploy --dir=dist --prod
```

### Option 2: Drag and Drop

1. Build your dashboard:
   ```bash
   visivo run
   visivo dist
   ```

2. Visit [app.netlify.com](https://app.netlify.com)
3. Drag your `dist` folder to the deployment area
4. Your dashboard is live!

### Option 3: Git Integration

1. Push your Visivo project to GitHub/GitLab/Bitbucket
2. Connect your repo at [app.netlify.com](https://app.netlify.com)
3. Configure build settings:
   - **Build command**: `pip install visivo && visivo run && visivo dist`
   - **Publish directory**: `dist`
4. Deploy!

## Automated Deployment

### GitHub Actions + Netlify

Create `.github/workflows/deploy-netlify.yml`:

{% raw %}
```yaml
name: Deploy to Netlify

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'  # Update every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  deploy:
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

### Setting Up Secrets

1. **Get Netlify Auth Token**:
   - Go to [User Settings → Applications](https://app.netlify.com/user/applications)
   - Create new personal access token
   - Add as `NETLIFY_AUTH_TOKEN` in GitHub secrets

2. **Get Site ID**:
   - Go to your site settings in Netlify
   - Copy the Site ID
   - Add as `NETLIFY_SITE_ID` in GitHub secrets

3. **Add Database Credentials**:
   - Add your database connection details as GitHub secrets
   - Reference them in the workflow file

## Netlify Configuration

### netlify.toml

Create a `netlify.toml` file in your project root for build configuration:

```toml
[build]
  command = "pip install visivo && visivo run && visivo dist"
  publish = "dist"

[build.environment]
  PYTHON_VERSION = "3.10"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/data/*"
  [headers.values]
    Cache-Control = "public, max-age=3600"

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### Environment Variables

Set environment variables in Netlify UI:
1. Go to Site Settings → Environment Variables
2. Add your database credentials:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`
3. Save and trigger a new deploy

## Preview Deployments

Netlify automatically creates preview deployments for pull requests:

### Setup

1. Enable preview deploys in Netlify settings
2. Add this to your `netlify.toml`:

```toml
[context.deploy-preview]
  command = "pip install visivo && visivo run && visivo dist"

[context.branch-deploy]
  command = "pip install visivo && visivo run && visivo dist"
```

### GitHub Status Checks

Netlify will automatically comment on PRs with preview URLs:
- Each PR gets a unique URL
- Updates automatically on new commits
- Deleted when PR is closed

## Authentication

### Basic Password Protection

For simple password protection (Pro plan required):

1. Go to Site Settings → Access Control
2. Enable password protection
3. Set a password

### Netlify Identity

For user-based authentication (free tier available):

1. Enable Identity in Site Settings
2. Configure registration settings
3. Add authentication to your dashboard:

```javascript
// Add to your dashboard's index.html
if (window.netlifyIdentity) {
  window.netlifyIdentity.on("init", user => {
    if (!user) {
      window.netlifyIdentity.on("login", () => {
        document.location.href = "/";
      });
    }
  });
}
```

### Role-Based Access

Configure role-based access with Netlify Functions:

```javascript
// netlify/functions/auth-check.js
exports.handler = async (event, context) => {
  const { user } = context.clientContext;
  
  if (!user || !user.app_metadata.roles.includes('viewer')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ authorized: true })
  };
};
```

## Custom Domain

### Setup

1. Go to Domain Settings in Netlify
2. Add your custom domain
3. Configure DNS:
   - **Option A**: Use Netlify DNS (recommended)
   - **Option B**: Point your domain's DNS to Netlify

### SSL Certificate

Netlify automatically provisions and renews SSL certificates:
- Automatic HTTPS redirect
- HTTP/2 support
- A+ SSL rating

## Performance Optimization

### Enable Prerendering

```toml
[build]
  command = "pip install visivo && visivo run && visivo dist"
  publish = "dist"

[build.processing]
  skip_processing = false

[build.processing.css]
  bundle = true
  minify = true

[build.processing.js]
  bundle = true
  minify = true

[build.processing.images]
  compress = true
```

### Asset Optimization

```toml
[[plugins]]
  package = "@netlify/plugin-lighthouse"
  
  [plugins.inputs]
    output_path = "reports/lighthouse.html"

[[plugins]]
  package = "netlify-plugin-checklinks"
  
  [plugins.inputs]
    skipPatterns = ["data/*.json"]
```

### CDN Caching

```toml
[[headers]]
  for = "/data/*"
  [headers.values]
    Cache-Control = "public, max-age=3600, must-revalidate"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

## Monitoring

### Deploy Notifications

Set up deploy notifications in Site Settings → Deploy Notifications:
- **Email**: On deploy success/failure
- **Slack**: Webhook integration
- **GitHub**: Commit status updates

### Analytics

Enable Analytics in Site Settings (Pro feature):
- Page views
- Unique visitors
- Top pages
- Bandwidth usage

## Troubleshooting

### Build Failures

Common issues and solutions:

1. **Python version mismatch**:
   ```toml
   [build.environment]
     PYTHON_VERSION = "3.10"
   ```

2. **Missing dependencies**:
   ```toml
   [build]
     command = "pip install --upgrade pip && pip install visivo && visivo run && visivo dist"
   ```

3. **Memory limits**:
   ```toml
   [build.environment]
     NODE_OPTIONS = "--max-old-space-size=4096"
   ```

### Large Deployments

For dashboards with lots of data:

1. **Optimize data queries**:
   ```yaml
   traces:
     - name: large_dataset
       where: "date > current_date - 30"  # Limit data
   ```

2. **Use Netlify Large Media**:
   ```bash
   netlify lm:setup
   netlify lm:track "data/*.json"
   ```

3. **Split deployments**:
   - Deploy framework code to Netlify
   - Serve data from external CDN

### Connection Issues

Database connection problems:

1. **Whitelist Netlify IPs**: Netlify build IPs change, consider:
   - Using a database proxy
   - Allowing all IPs during builds
   - Using connection pooling

2. **Use Build Hooks**: Trigger builds from your database:
   ```bash
   curl -X POST https://api.netlify.com/build_hooks/YOUR_HOOK_ID
   ```

## Cost Optimization

### Free Tier Limits
- 100 GB bandwidth/month
- 300 build minutes/month
- 1 concurrent build

### Optimization Tips

1. **Reduce build frequency**:
   ```yaml
   schedule:
     - cron: '0 0 * * *'  # Once daily instead of hourly
   ```

2. **Cache dependencies**:
   ```toml
   [build]
     command = "pip install --cache-dir .pip visivo && visivo run && visivo dist"
   
   [[plugins]]
     package = "netlify-plugin-cache"
     [plugins.inputs]
       paths = [".pip"]
   ```

3. **Optimize images and assets**:
   ```toml
   [[plugins]]
     package = "netlify-plugin-image-optim"
   ```

## Migration to Netlify

### From Visivo Cloud

1. Export your project configuration
2. Set up GitHub repository
3. Configure Netlify deployment
4. Update CI/CD pipelines
5. Redirect old URLs

### From Other Platforms

1. Build locally: `visivo dist`
2. Deploy with Netlify CLI: `netlify deploy --dir=dist`
3. Configure custom domain
4. Set up automated builds

## Next Steps

- [Configure authentication](#authentication)
- [Set up custom domain](#custom-domain)
- [Optimize performance](#performance-optimization)
- [Return to static hosting overview](static-hosting.md)