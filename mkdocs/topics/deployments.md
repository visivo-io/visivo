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

### Mint
Mint is a great way to deploy Visivo. It's caching functionality, concurrency and debugging can make development of Mint workflows much easier than Git Actions. The workflows below will deploy a stage when the pull request is updated and archive it when the pull request is closed. 

#### Configuration 

1. Add your deployment token as `VISIVO_TOKEN` to your [Mint vault](https://www.rwx.com/docs/mint/vaults#vaults).
2. Add a workflow similar to the following yml. 

!!! note 

    The example below is for a project that runs Visivo against google cloud SQL. You will likely need to pass additional secrets and alter authentication steps to connect to your targets.

{% raw %}
``` yaml title=".mint/manage_ci_gcp_cloud_sql_target.yml"
on:
  github:
    pull_request:
      actions: [opened, reopened, synchronize, closed]
      init:
        commit-sha: ${{ event.github.pull_request.pull_request.head.sha }}
        head-ref: ${{ event.github.pull_request.pull_request.head.ref	}}
        deploy: ${{ event.github.pull_request.pull_request.merged == false && event.github.pull_request.pull_request.state == 'open' }}
        archive: ${{ event.github.pull_request.pull_request.merged == true && event.github.pull_request.pull_request.state == 'closed' }}

tasks:
  - key: code
    call: mint/git-clone 1.1.6
    with:
      repository: https://github.com/visivo-io/analytics.git
      ref: ${{ init.commit-sha }}
      github-access-token: ${{ secrets.VISIVO_IO_CLONE_TOKEN }} #(3)!
  
  - key: python
    call: mint/install-python 1.0.2
    with:
      python-version: 3.10.0
  
  - key: install-visivo
    use: [python]
    run: pip install git+https://github.com/visivo-io/visivo.git@latest #(4)!
  
  - key: gcloud-cli # (1)!
    call: google-cloud/install-cli 1.0.1
  
  - key: gcloud-login # (2)!
    if: ${{ init.deploy }}
    use: [gcloud-cli]
    call: google-cloud/auth-credentials 1.0.1
    with:
      credentials-json: ${{ secrets.GCLOUD_SA_PRODUCTION_KEY }}
  
  - key: cloud-sql-proxy-connect-and-run-visivo
    if: ${{ init.deploy }}
    use: [gcloud-login, install-visivo, code]
    run: |
      cd bin
      ./cloud_sql_proxy "acme-co-production:us-west1:company-database-replica" --port 5432 &>/dev/null & 
      cd ../visivo
      visivo run
    env: 
      DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
      DB_USERNAME: ${{ secrets.DB_USERNAME }} 
      DB_HOST: localhost 
    
  - key: deploy-ci-stage
    if: ${{ init.deploy }}
    use: [cloud-sql-proxy-connect-and-run-visivo]
    run: |
      cd visivo
      visivo deploy -s ${{ init.head-ref }}
    env: 
      VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }} 
  
  - key: archive-ci-stage
    if: ${{ init.archive }}
    use: [install-visivo, code]
    run: | 
      cd visivo 
      visivo archive -s ${{ init.head-ref }}
    env:
      VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
```

1. If connecting with a publicly accessible database you may not need to authentic with your cloud provider credentials.
2. If connecting with a publicly accessible database you may not need to authentic with your cloud provider credentials. 
3. Mint [automatically configures a clone token](https://www.rwx.com/docs/mint/getting-started/github#cloning-repositories) when you connect it to github. You should be able to find it in your mint vault.
4. Specifying a [version of visivo](https://github.com/visivo-io/visivo/releases) can be a good idea. For example- `pip install git+https://github.com/visivo-io/visivo.git@v1.0.9`
{% endraw %}
### :simple-githubactions: Github Actions

We have an [example action](https://github.com/visivo-io/visivo/blob/main/.github/workflows/deploy_dashoard.yml) that is used on the CLI repo. This action deploys each pull request to a stage, and then archives that stage when the pull request is closed.

#### Configuration

1. Add your deployment token to github action secrets as `VISIVO_TOKEN`
2. Add a workflow similar to the following yml.  

This following can be adapted easily with the `env` variables.

{% raw %}
=== "Deploy & Archive"

    ``` yaml title=".github/workflows/visivo_deploy_archive.yml"
    name: Deploy & Archive CI Dashboard

    on:
      pull_request:
        types: [opened, reopened, closed, synchronize]

    env:
      yml_location: . #(1)!
      stage_name: ${{ github.head_ref }}
      deploy: github.event.pull_request.merged == false && github.event.pull_request.closed_at == null
      archive: github.event.pull_request.merged == true || github.event.pull_request.closed_at != null

    jobs:
      deploy-archive-dashboard:
        runs-on: ubuntu-latest
        
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - uses: actions/setup-python@v5
            with:
              python-version: '3.10' 
          
          - name: Install Visivo
            run: pip install git+https://github.com/visivo-io/visivo.git@latest #(2)!
          
          - name: Run Visivo 
            if: ${{ env.deploy }}
            run: cd ${{ env.yml_location}} && visivo run 

          - name: Deploy
            id: deploy
            if: ${{ env.deploy }} 
            run: visivo deploy -s ${{ env.stage_name }}
            env: 
              VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}

          - name: Archive 
            if: ${{ env.archive }}
            run: visivo archive -s ${{ env.stage_name }}
            env: 
              VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
    ```

    1. The relative location of your `project.visivo.yml` file. 
    2. Specifying a [version of visivo](https://github.com/visivo-io/visivo/releases) can be a good idea. For example- `pip install git+https://github.com/visivo-io/visivo.git@v1.0.9`
    3. This step captures the stdout print of the url of the deployment that was created so that it can later be referenced to generate a github comment on the PR. Both of these steps are totally optional!

=== "Deploy + Comment on PR & Archive"

    ``` yaml title=".github/workflows/visivo_deploy_archive.yml"
    name: Deploy & Archive CI Dashboard

    on:
      pull_request:
        types: [opened, reopened, closed, synchronize]

    env:
      yml_location: . #(1)!
      stage_name: ${{ github.head_ref }}
      deploy: github.event.pull_request.merged == false && github.event.pull_request.closed_at == null
      archive: github.event.pull_request.merged == true || github.event.pull_request.closed_at != null

    jobs:
      deploy-archive-dashboard:
        runs-on: ubuntu-latest
        
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - uses: actions/setup-python@v5
            with:
              python-version: '3.10' 
          
          - name: Install Visivo
            run: pip install git+https://github.com/visivo-io/visivo.git@latest #(2)!
          
          - name: Run Visivo 
            if: ${{ env.deploy }}
            run: cd ${{ env.yml_location}} && visivo run 

          - name: Deploy
            id: deploy
            if: ${{ env.deploy }}
            run: | #(3)!
              visivo deploy -s ${{ env.stage_name }} | tee /dev/stderr | grep 'Deployed to: ' > deployed.txt
              deployed=`cat deployed.txt`
              echo "deployed=$deployed" >> "$GITHUB_OUTPUT"
            env: 
              VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}

          - name: Comment
            if: ${{ env.deploy }}
            uses: marocchino/sticky-pull-request-comment@v2
            with:
              message: |
                Visivo Dashboard:
                ${{ steps.deploy.outputs.deployed}}

          - name: Archive 
            if: ${{ env.archive }}
            run: visivo archive -s ${{ env.stage_name }}
            env: 
              VISIVO_TOKEN: ${{ secrets.VISIVO_TOKEN }}
    ```

    1. The relative location of your `project.visivo.yml` file. 
    2. Specifying a [version of visivo](https://github.com/visivo-io/visivo/releases) can be a good idea. For example- `pip install git+https://github.com/visivo-io/visivo.git@v1.0.9`
    3. This step captures the stdout print of the url of the deployment that was created so that it can later be referenced to generate a github comment on the PR. Both of these steps are totally optional!
{% endraw %}
