There's a few things that you will need to get configured to get started with your visivo project. We will walk through those together in this article to help get you up and running fast! 
![type:video](https://www.youtube.com/embed/BWiwYpDCuek?si=jEFhQKq9kPEoFycl)

_Still have questions after reading? Reach out to [jared@visivo.io](mailto:jared@visiov.io) and we'd be happy to help._

### Install Visivo Python Package
You can easily install visivo via `pip`:
```
pip install visivo
```

or a specific version:

```
pip install visivo==1.0.26
```
Now you have access to the `visivo` CLI! 
!!! note
    Visivo requires Python 3.10+ You may need to create a virtual environment using Python 3.10+ to run visivo.

## Get a Visivo API Key
If you want to deploy your Visivo project to the Visivo cloud (recommended), you will need an API key. Here's how you can get one: 

1. Visit [app.visivo.io](https://app.visivo.io/accounts/register/) and register or login. There's a free trial with no credit card required. 
2. On login you will be routed to [the profile page](https://app.visivo.io/profile). 
3. Create a new token & copy the value down! You will need that value in the next section. 

## Setup using `visivo init`

To quickly get up and running, you can run `visivo init` and that will create a `project folder`, `project.visivo.yml`, and `profile.yml` with a project skeleton. 

When prompted enter in the API key value that you jotted down.

You can manually edit everything that Visivo created _(more on that in the Manual Setup section)_. 

{% raw %}
??? tip

    Want to get started quickly with dummy data? 
    
    Run `visivo init` and choose `sqlite` when prompted:

    >? Database type (postgresql, sqlite, snowflake, mysql): sqlite
    
    Then you're good to go! 
    
    Run `visivo serve`, checkout your dashboard and start playing around with it. 
    
    You can always add a source with another connection later.

{% endraw %}


## Run Your Project Locally With `visivo serve`
Visivo gives you the ability to run your project locally and view dashboards on local host using the command `visivo serve`. 

Once you run that command you should see something similar to this:
![](assets/visivo_serve_example.png)

Click through the the link after `Serving project at`, which in the example above was `http://localhost:8000`

every time you change your configurations in your project, Visivo will automatically update impacted items with a live reload. 


## Deploy your Project to Remote With `visivo deploy`
Now that you have a project that you are happy with, you can push it to a deployment where you will be able to share these insights with your team. 

We recommend setting up a CI process that performs production deploys after your transformations run and performs deploys for pull requests. However you can also deploy from local if you want to share development version of your work.

To deploy all you have to do is run `visivo deploy -s a-name-of-your-choice`. 

The `-s` flag tells Visivo which stage you want to deploy to. You can think of stages like environments where you house different versions of your project remotely. 


## Manual setup 

### Create a `project.visivo.yml` file
The `project.visivo.yml` is a special file that visivo uses for your project configurations. You will want to put the file at the root directory where you want your project to live. If you are using dbt, this will likely in the same folder as the `dbt_project.yml` file. 

The `project.visivo.yml` only requires that the name attribute is filled out however below is a taste of where we are heading to get a full project set up. Don't worry we will walk through all of these configurations one by one.
``` yaml title="project_dir/project.visivo.yml"
name: awesome-project
defaults:
  source_name: local-sqlite
  alert_name: slack

alerts:
  - name: slack
    type: slack
    webhook_url: https://hooks.slack.com/services/your-slack-webhook-key

sources:
  - name: local-sqlite
    database: target/local.db
    type: sqlite
  - name: local-postgres
    database: postgres
    type: postgresql
    username: postgres
    password: postgres
    port: 5434
  - name: remote-snowflake
    type: snowflake
    database: {% raw %}{{ env_var('DEV_DB') }}{% endraw %}
    account: {% raw %}{{ env_var('SNOWFLAKE_ACCOUNT') }}{% endraw %}
    db_schema: DEFAULT
    username: {% raw %}{{ env_var('SNOWFLAKE_USER') }}{% endraw %}
    warehouse: DEV
    password: {% raw %}{{ env_var('SNOWFLAKE_PASSWORD') }}{% endraw %}

models:
  - name: widget_sales
    sql: select * from widget_fact_table
traces:
  - name: simple_trace
    model: ${ref(widget_sales)}
    cohort_on: widget
    props:
      x: ?{ date_trunc('week', completed_at) }
      y: ?{ sum(amount) }
      marker: 
        color: ?{ case sum(amount) > 200 then 'green' else 'blue' end }
        shape: square
      mode: 'lines'
charts:
  - name: simple_chart
    traces:
      - ${ref(simple_trace)}
    layout:
      - title: Widget Sales by Week

dashboards:
  - name: simple_dashboard
    rows:
      - height: medium
        items:
          - width: 5
            chart: ${ref(simple_chart)}
          - width: 2
            markdown: |
              # Here is the first
              1. Numbered
              1. List
```

### Set up a Source & store secrets safely
Sources are connections to your data warehouses and databases that Visivo will run queries against. You can set up sources by configuring them in your `project.visivo.yml`. 
``` yaml title="project_dir/project.visivo.yml"
sources:
  - name: local-sqlite
    database: target/local.db
    type: sqlite
  - name: local-postgres
    database: postgres
    type: postgresql
    username: postgres
    password: postgres
    host: localhost
    port: 5434
  - name: remote-snowflake
    type: snowflake
    database: {% raw %}{{ env_var('DEV_DB') }}{% endraw %}
    account: {% raw %}{{ env_var('SNOWFLAKE_ACCOUNT') }}{% endraw %}
    db_schema: DEFAULT
    username: {% raw %}{{ env_var('SNOWFLAKE_USER') }}{% endraw %}
    warehouse: DEV
    password: {% raw %}{{ env_var('SNOWFLAKE_PASSWORD') }}{% endraw %}
```
For some sources like the `local-sqlite` and `local-postgres` you may not need to store any secrets since they are just running locally. However remote connections like the `remote-snowflake` target, you will definitely want to make sure that you are not storing these attributes in plain text. 

This is where the `env_var()` jinja function comes in handy. You can use this jinja function to reference environment variables that are either stored on your machine or in a `.env` file. 

### Configure Defaults
Defaults are also optional, but highly recommended configurations to run Visivo. 

Without defaults you would need to specify the source and / or alert whenever you needed to use them. For example to run the `test` command you would need to pass the source and alert flag: `visivo test -t remote-snowflake -a slack`

However, if you have defaults set like this: 
``` yaml title="project_dir/project.visivo.yml"
defaults:
  source_name: remote-snowflake
  alert_name: slack
```
Then you can just run `visivo test` and Visivo will default to remote-snowflake for the source and slack for the destination. 

### Create a Trace
You can think of traces like lines on a chart with specific configurations. With Visivo you can configure pretty much anything from the curve of a line, to if data should be represented as a bar, line or area. Additionally you can set these configurations based on attributes of your underlying data. 

Here's a simple example of a trace:
``` yaml title="project_dir/project.visivo.yml"
traces:
  - name: simple_trace
    model: ${ref(widget_sales)}
    cohort_on: widget
    props:
      type: scatter
      x: ?{ date_trunc('week', completed_at) }
      y: ?{ sum(amount) }
      marker: 
        color: ?{ case sum(amount) > 200 then 'green' else 'blue' end }
        shape: square
      mode: 'lines'
```
We won't go into all of the details of the trace here, but a few things to note: 

* **`type`** tells Visivo how to plot the data. Visivo utilizes plotly.js and you can use most plotly trace types for this attribute. 
* **`cohort_on`** let's Visivo know that you would like cut your chart by the `widget` column from the `widget_sales` table. Thus you will get as many lines as you have distinct `widget` types in the table from this trace. 
* **`?{ }`** is a special function that lets Visivo know that the statement contained within the function should be passed as part of the select statement to a query against your source. Visivo will compile the full query so you don't have to worry about building and maintaining boilerplate sql. 
* When **`?{}`** is not used, Visivo knows that you are simply passing static configuration to trace. This might make more sense for configurations that you would want to stay consistent across the whole trace like font. 

Traces are able to be sourced from different sources. You can set the default source at the trace level by specifying a source name in the `source_name` attribute of the source. 

### Create a Chart 
Charts are objects that can contain one to many traces and traces can be present on many charts. This allows both modularity, the ability to connect traces of different grains on the same chart, and the ability to connect traces from different data sources on the same chart. 

Here's a simple example of the chart configuration:
``` yaml title="project_dir/project.visivo.yml"
charts:
  - name: simple_chart
    traces:
      - ${ref(simple_trace)}
    layout:
      - title: Widget Sales by Week
```

### Create a Dashboard
Dashboards house `charts`, `tables` and `markdown`. They help you set up a highly flexible grid so that you can put all of your information exactly where you need it. 

You can structure the grid by specifying rows that house many items. Items have a particular width that is evaluated relative to the other item widths in the row. So if for example you had 3 items in a row with widths of 5, 2 and 3. The first item would take up 50% of the row, the second 20% and the third 30%. 
```
Dashboard --> row --> item --> chart/table/markdown
                 |        |
                 |         --> width
                  --> height 
```
Here's how that looks in yaml:
``` yaml title="project_dir/project.visivo.yml"
dashboards:
  - name: simple_dashboard
    rows:
      - height: medium
        items:
          - width: 5
            chart: ${ref(simple_chart)}
          - width: 2
            markdown: |
              # Here is the first
              1. Numbered
              1. List
```

### Set up Alerts - Optional
When you run `visivo test` you are able to validate assumptions that you have about your charts and traces. Sometimes you might want a notification about testing failures. This is where alerts come in! You can set up slack alerts using webhooks or email alerts. 

To set up a slack alert destination you will first need to configure an incoming webhook in slack. You can follow [this guide](https://api.slack.com/messaging/webhooks) to get started there

Once you have your webhook key you can set up the alert like this:
```  yaml title="project_dir/project.visivo.yml"
alerts:
  - name: slack
    type: slack
    webhook_url: https://hooks.slack.com/services/your-slack-webhook-key
```    