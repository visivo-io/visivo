# CI/CD

Automatically deploying dashboards as part of a CI/CD pipeline is key.

## Github Actions

We have an [example action](https://github.com/visivo-io/visivo/blob/main/.github/workflows/deploy_dashoard.yml) that is used on the CLI repo.  This action deploys each pull request to a stage, and then archives that stage when the pull request is closed.

### Configuration

1. Add your deployment token to github action secrets as `VISIVO_TOKEN`
2. Add a workflow similar to the following yml.  This assumes your Visivo project is at the root directory.

```
name: Deploy Dashboard

on:
  pull_request:
    types:
      - opened
      - reopened
      - closed
      - synchronize

jobs:
  deploy-dashboard:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Python 
        uses: actions/setup-python@v4
        with:
          python-version: '3.10' 

      - name: Install CLI
        run: python -m pip install git+https://github.com/visivo-io/visivo.git@main 

      - name: Deploy
        if: github.event.pull_request.merged == false && github.event.pull_request.closed_at == null
        run: |
          visivo run 
          VISIVO_TOKEN={% raw %}${{ secrets.VISIVO_TOKEN }}{% endraw %} visivo deploy -s {% raw %}${{ github.head_ref }}{% endraw %}

      - name: Archive 
        if: github.event.pull_request.merged == true || github.event.pull_request.closed_at != null
        run: VISIVO_TOKEN={% raw %}${{ secrets.VISIVO_TOKEN }}{% endraw %} visivo archive -s {% raw %}${{ github.head_ref }}{% endraw %}
      
```

