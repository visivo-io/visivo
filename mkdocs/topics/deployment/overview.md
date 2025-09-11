# Deployment Overview

Visivo provides flexible deployment options to fit your team's needs. Whether you're looking for a managed cloud solution or prefer to self-host your dashboards, we've got you covered.

## Deployment Options

<div class="grid cards" markdown>

-   :material-cloud-upload: __[Visivo Cloud](visivo-cloud.md)__ 
    
    ---
    
    The easiest way to deploy and share your dashboards. Features automatic updates, collaboration tools, and built-in CI/CD integration.
    
    [:octicons-arrow-right-24: Deploy to Visivo Cloud](visivo-cloud.md)

-   :material-server: __[Static Hosting](static-hosting.md)__
    
    ---
    
    Deploy your dashboards as static sites to any web hosting platform. Full control over your infrastructure and data.
    
    [:octicons-arrow-right-24: Explore static hosting options](static-hosting.md)

</div>

## Quick Comparison

| Feature | Visivo Cloud | Static Hosting |
|---------|--------------|----------------|
| **Setup Time** | < 5 minutes | 15-30 minutes |
| **Automatic Updates** | ✅ Continuous refresh | ❌ Manual rebuild required |
| **Collaboration** | ✅ Built-in sharing & permissions | ❌ DIY access control |
| **CI/CD Integration** | ✅ Native support | ⚙️ Custom setup required |
| **Data Privacy** | Hosted on Visivo servers | Complete control |
| **Cost** | Free tier available | Depends on hosting provider |
| **Custom Domain** | ✅ Available | ✅ Full control |

## Which Should You Choose?

### Choose Visivo Cloud if you want:
- **Zero infrastructure management** - Focus on your data, not deployment
- **Automatic data refreshes** - Schedule updates without managing cron jobs
- **Team collaboration** - Share dashboards with built-in access controls
- **CI/CD integration** - Deploy staging environments for every PR automatically
- **Quick setup** - Get running in minutes with `visivo deploy`

### Choose Static Hosting if you need:
- **Complete data control** - Keep everything within your infrastructure
- **Custom authentication** - Integrate with your existing auth system
- **Air-gapped environments** - Deploy without external dependencies
- **Cost optimization** - Use existing hosting infrastructure
- **Compliance requirements** - Meet specific regulatory needs

## Getting Started

### For Visivo Cloud
```bash
# Get your API key from app.visivo.io
visivo init

# Deploy to production
visivo deploy -s production
```

### For Static Hosting
```bash
# Build static files
visivo dist

# Deploy to your platform of choice
# See platform-specific guides for details
```

## Next Steps

- **[Visivo Cloud Guide](visivo-cloud.md)** - Set up cloud deployment with CI/CD
- **[Static Hosting Guide](static-hosting.md)** - Deploy to Netlify, AWS, Firebase, and more
- **[CI/CD Best Practices](ci-cd.md)** - Automate your deployment pipeline