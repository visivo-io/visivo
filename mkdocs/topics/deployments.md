# Deployment

Continuous visualization testing in production and deploying dashboards as part of a CI/CD pipeline are critical components of a high quality data stack that stakeholders can depends on. These deployments create opportunities to prevent, discover and fix bugs proactively. 

## Production

## CI/CD
It's highly recommended that you create a staging version of your project anytime that someone on your team creates a pull request. This is beneficial for a few reasons.
<div class="grid cards" markdown> 

-   :popcorn: __Preview your Project__ 

    ---
  
    View how changes impact your project visually _before_ production.

-   :test_tube: __Test Changes__ 

    ---

    Understand how changes to downstream nodes impact upstream nodes.

-   :handshake: __Streamline Collaboration__

    ---

    Improve your peer reviews by relating code changes to visual changes.

-   :man_running: __Increase Development Speed__

    ---

    Gone are the days of data visualizations being built and deployed in production. 

</div>

### :simple-githubactions: Github Actions

We have an [example action](https://github.com/visivo-io/visivo/blob/main/.github/workflows/deploy_dashoard.yml) that is used on the CLI repo.  This action deploys each pull request to a stage, and then archives that stage when the pull request is closed.

#### Configuration

1. Add your deployment token to github action secrets as `VISIVO_TOKEN`
2. Add a workflow similar to the following yml.  

This following can be adapted easily with the `env` variables.

{% raw %}
``` yaml title=".github/workflows/visivo_deploy_archive.yml"
name: Deploy Dashboard

on:
  pull_request:
    types:
      - opened
      - reopened
      - closed
      - synchronize

env:
  yml_location: .
  visivo_version: latest
  stage_name: ${{ github.head_ref }} 

jobs:
  deploy-dashboard:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.10' 

      - name: Deploy
        id: deploy
        if: github.event.pull_request.merged == false && github.event.pull_request.closed_at == null
        run: |
          python -m pip install git+https://github.com/visivo-io/visivo.git@${{ env.visivo_version }}  
          cd ${{ env.yml_location}} 
          visivo run 
          VISIVO_TOKEN=${{ secrets.VISIVO_TOKEN }} visivo deploy -s ${{ env.stage_name }} | tee /dev/stderr | grep 'Deployed to: ' > deployed.txt
          deployed=`cat deployed.txt`
          echo "deployed=$deployed" >> "$GITHUB_OUTPUT"
      - name: Comment
        if: github.event.pull_request.merged == false && github.event.pull_request.closed_at == null
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          message: |
            Visivo Dashboard:
             ${{ steps.deploy.outputs.deployed}}
      - name: Archive 
        if: github.event.pull_request.merged == true || github.event.pull_request.closed_at != null
        run: | # (1)!
          python -m pip install git+https://github.com/visivo-io/visivo.git@${{ github.base_ref }} 
          VISIVO_TOKEN=${{ secrets.VISIVO_TOKEN }} visivo archive -s ${{ github.head_ref }}
```

1.  This is an admonation? 
{% endraw %}

### Mint