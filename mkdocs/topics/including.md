# Including Other Files and Projects

## Local Files

A good organizational tool is to break your `project.visivo.yml` into multiple local files based on organizational needs.  An example of this would be to put all your `models` in one file and reference that file like:

``` yaml
includes:
  - path: models.yml
```

You may wish to organization it along a different axis, for example one file per dashboard like:

``` yaml
includes:
  - path: finance_dashboard.yml
  - path: operation_dashboard.yml
```

Use whatever system best matches your use case. 

Your includes can include other includes, allowing for nesting.  Be wise!

## External Projects

One of the most powerful aspects of Visivo is the ability to include public GitHub repos that contain Visivo dashboards in your project.  This gives everyone to share a useful dashboard that they may have. 

We have published a series of projects that allow you to quickly build dashboards based on some popular tools.

Those are tagged in GitHub [here](https://github.com/topics/visivo-dashboard).
You can also build and share your own under the same `visivo-dashboard` topic in GitHub.

Here is an example on how to include our dashboard that provides insights into your repositories' pull requests:

```
includes:
  - path: visivo-io/github-dashboard.git@main
```

Once it is included then you can reference the `traces` and `charts` like you would if they were in your project like:

```
dashboards:
  - name: Github Metrics
    rows:
      - height: medium
        items:
          - width: 1
            chart:
              name: Pull Requests by Repository
              traces:
                - ref(Pull Request by Repository)
              layout:
                title: "Pull Request by Repository"
```