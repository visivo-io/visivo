# Visivo Cloud

Visivo Cloud is the fastest way to deploy and share your data visualizations. With built-in CI/CD, automatic refreshes, and team collaboration features, you can focus on your data while we handle the infrastructure.

## Getting Started

### 1. Get Your API Key

Sign in to your Visivo account at [app.visivo.io](https://app.visivo.io) to obtain your API key.

### 2. Configure Your API Key

Choose one of these methods to store your API key:

=== "During Init (Recommended)"

    ```bash
    visivo init
    # Follow the prompts to enter your API key
    ```

=== "Environment Variable"

    ```bash
    export VISIVO_TOKEN='your-api-key'
    
    # Create profile.yml in your project
    echo "token: {% raw %}'{{ env_var('VISIVO_TOKEN')}}'{% endraw %}" > profile.yml
    ```

=== "Profile File"

    ```bash
    # Create the Visivo config directory
    mkdir -p ~/.visivo
    
    # Add your token
    echo "token: 'your-api-key'" > ~/.visivo/profile.yml
    ```

### 3. Deploy Your Dashboard

```bash
# Run your queries and generate data
visivo run

# Deploy to production
visivo deploy -s production
```

## CI/CD Integration

Automatically deploy staging environments for pull requests and keep production updated with the latest changes.

### How It Works

<div class="grid cards" markdown>

-   :material-source-pull: __Pull Request Opens__
    
    ---
    
    1. CI pipeline triggers
    2. Runs `visivo run` to generate data
    3. Deploys to staging with PR name
    4. Comments deployment URL on PR

-   :material-sync: __Pull Request Updates__
    
    ---
    
    1. Changes detected
    2. Re-runs queries with latest code
    3. Updates existing staging deployment
    4. Maintains same URL

-   :material-archive: __Pull Request Closes__
    
    ---
    
    1. Merge or close triggers archive
    2. Staging environment archived
    3. Data preserved for audit trail
    4. URL becomes inactive

-   :material-rocket-launch: __Production Deploy__
    
    ---
    
    1. Merge to main branch
    2. Production pipeline runs
    3. Deploys to production stage
    4. Users see updated dashboards

</div>

### Stage Management

Visivo Cloud uses **stages** to organize different versions of your dashboards:

- **Production**: Your main dashboard, typically deployed from the `main` branch
- **Staging**: Temporary deployments for pull requests
- **Custom**: Any named stage for specific purposes (e.g., `demo`, `qa`)

```bash
# Deploy to different stages
visivo deploy -s production
visivo deploy -s feature-new-metrics
visivo deploy -s demo

# Archive stages when no longer needed
visivo archive -s feature-new-metrics
```

!!! tip "Automatic Archiving"
    Configure your CI/CD to automatically archive staging deployments when pull requests are closed. This keeps your dashboard list clean while preserving historical data.

## GitHub Actions Setup

### Basic Deployment

Create `.github/workflows/visivo_deploy.yml`:

{% raw %}
```yaml
name: Deploy Visivo Dashboard

on:
  pull_request:
    types: [opened, reopened, closed, synchronize]

env:
  stage_name: ${{ github.head_ref }}

jobs:
  deploy-dashboard:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Run Visivo
        if: github.event.pull_request.state == 'open'
        run: visivo run
        env:
          # Add your database credentials here
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
      
      - name: Deploy to Staging
        if: github.event.pull_request.state == 'open'
        run: visivo deploy -s ${{ env.stage_name }}
        env:
          VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
      
      - name: Archive Staging
        if: github.event.pull_request.state == 'closed'
        run: visivo archive -s ${{ env.stage_name }}
        env:
          VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
```
{% endraw %}

### Advanced: With PR Comments

Add deployment URLs as comments on pull requests:

{% raw %}
```yaml
name: Deploy with PR Comments

on:
  pull_request:
    types: [opened, reopened, closed, synchronize]

env:
  stage_name: ${{ github.head_ref }}

jobs:
  deploy-dashboard:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Run and Deploy
        if: github.event.pull_request.state == 'open'
        id: deploy
        run: |
          visivo run
          
          # Capture deployment URL
          visivo deploy -s ${{ env.stage_name }} | tee /dev/stderr | grep 'Deployed to: ' > deployed.txt
          deployed=`cat deployed.txt`
          echo "url=$deployed" >> "$GITHUB_OUTPUT"
        env:
          VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
      
      - name: Comment on PR
        if: github.event.pull_request.state == 'open'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          message: |
            ## 📊 Visivo Dashboard Preview
            
            Your dashboard has been deployed!
            
            ${{ steps.deploy.outputs.url }}
            
            This preview will be automatically archived when the PR is closed.
      
      - name: Archive and Update Comment
        if: github.event.pull_request.state == 'closed'
        run: |
          visivo archive -s ${{ env.stage_name }}
        env:
          VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
      
      - name: Final Comment
        if: github.event.pull_request.state == 'closed'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          message: |
            ## 📦 Dashboard Archived
            
            The preview dashboard for this PR has been archived.
```
{% endraw %}

## Production Deployments

### Scheduled Refreshes

Keep your production dashboards updated with scheduled deployments:

{% raw %}
```yaml
name: Production Refresh

on:
  workflow_dispatch:  # Manual trigger
  schedule:
    - cron: "0 */6 * * *"  # Every 6 hours

jobs:
  refresh-production:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Refresh Data and Deploy
        run: |
          visivo run
          visivo deploy -s production
        env:
          VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```
{% endraw %}

### Deploy on Merge

Automatically deploy to production when PRs are merged:

{% raw %}
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Deploy to Production
        run: |
          visivo run
          visivo deploy -s production
        env:
          VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```
{% endraw %}

## Mint CI/CD

Mint offers powerful caching and debugging features for Visivo deployments:

### Pull Request Workflow

{% raw %}
```yaml title=".mint/visivo_ci.yml"
on:
  github:
    pull_request:
      actions: [opened, reopened, synchronize, closed]
      init:
        commit-sha: ${{ event.git.sha }}
        head-ref: ${{ event.git.branch }}
        is-open: ${{ event.github.pull_request.state == 'open' }}
        is-closed: ${{ event.github.pull_request.state == 'closed' }}

tasks:
  - key: code
    call: mint/git-clone 1.1.6
    with:
      repository: ${{ github.repository }}
      ref: ${{ init.commit-sha }}
      github-access-token: ${{ github.token }}
  
  - key: python
    call: mint/install-python 1.1.0
    with:
      python-version: 3.10.0
  
  - key: install-visivo
    use: [python]
    run: pip install visivo
  
  - key: run-and-deploy
    if: ${{ init.is-open }}
    use: [install-visivo, code]
    run: |
      visivo run
      visivo deploy -s ${{ init.head-ref }}
    env:
      VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
      DB_HOST: ${{ secrets.DB_HOST }}
      DB_USER: ${{ secrets.DB_USER }}
      DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
  
  - key: archive-stage
    if: ${{ init.is-closed }}
    use: [install-visivo, code]
    run: visivo archive -s ${{ init.head-ref }}
    env:
      VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
```
{% endraw %}

### Production Refresh

{% raw %}
```yaml title=".mint/production_refresh.yml"
on:
  cron:
    - key: refresh-every-6-hours
      schedule: "0 */6 * * *"

tasks:
  - key: code
    call: mint/git-clone 1.1.6
    with:
      repository: ${{ github.repository }}
      ref: main
      github-access-token: ${{ github.token }}
  
  - key: python
    call: mint/install-python 1.1.0
    with:
      python-version: 3.10.0
  
  - key: install-visivo
    use: [python]
    run: pip install visivo
  
  - key: deploy-production
    use: [install-visivo, code]
    run: |
      visivo run
      visivo deploy -s production
    env:
      VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
      DB_HOST: ${{ secrets.DB_HOST }}
      DB_USER: ${{ secrets.DB_USER }}
      DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```
{% endraw %}

## Working with Cloud SQL & Private Databases

For databases that aren't publicly accessible, you'll need to establish a connection through your CI/CD pipeline:

### Google Cloud SQL Example

{% raw %}
```yaml
- key: gcloud-cli
  call: google-cloud/install-cli 1.0.1

- key: gcloud-auth
  use: [gcloud-cli]
  call: google-cloud/auth-credentials 1.0.1
  with:
    credentials-json: ${{ secrets.GCLOUD_SA_KEY }}

- key: connect-and-deploy
  use: [gcloud-auth, install-visivo, code]
  run: |
    # Start Cloud SQL Proxy
    ./cloud_sql_proxy "project:region:instance" --port 5432 &
    
    # Wait for connection
    sleep 5
    
    # Run Visivo
    visivo run
    visivo deploy -s ${{ init.head-ref }}
  env:
    DB_HOST: localhost
    DB_PORT: 5432
    DB_USER: ${{ secrets.DB_USER }}
    DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
    VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
```
{% endraw %}

## Best Practices

### 1. Use Specific Visivo Versions
```bash
# Pin to a specific version for consistency
pip install visivo==1.0.26
```

### 2. Separate Staging and Production Tokens
Create different API tokens for different environments to improve security and tracking.

### 3. Cache Dependencies
Speed up CI/CD runs by caching Python packages:

{% raw %}
```yaml
- uses: actions/cache@v3
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
```
{% endraw %}

### 4. Monitor Deployment Status
Set up notifications for failed deployments:

{% raw %}
```yaml
- name: Notify on Failure
  if: failure()
  uses: actions/slack@v1
  with:
    status: failure
    message: "Visivo deployment failed for ${{ env.stage_name }}"
```
{% endraw %}

### 5. Clean Up Old Stages
Regularly archive unused stages to keep your dashboard list manageable:

```bash
# List all stages
visivo list-stages

# Archive old feature branches
visivo archive -s old-feature-branch
```

## Troubleshooting

### Authentication Issues
- Verify your API token is correct: `echo $VISIVO_TOKEN`
- Check token permissions at [app.visivo.io](https://app.visivo.io)
- Ensure the token is properly escaped in YAML files

### Deployment Failures
- Check `visivo run` completes successfully before deploying
- Verify all required environment variables are set
- Review CI/CD logs for specific error messages

### Data Not Updating
- Confirm `visivo run` is executed before each deployment
- Check database connectivity in CI/CD environment
- Verify queries are returning expected results

## Next Steps

- [Configure production refresh schedules](#production-deployments)
- [Set up PR preview deployments](#github-actions-setup)
- [Explore static hosting alternatives](static-hosting.md)