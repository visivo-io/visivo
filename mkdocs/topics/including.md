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

## Directory Inclusion

For larger projects with many YAML files, you can include entire directories instead of listing individual files. By default, Visivo will recursively search through all subdirectories and include all `.yml` and `.yaml` files:

``` yaml
includes:
  - path: ./config/
```

### Controlling Directory Depth

You can control how deep Visivo searches within directories using the `depth` parameter:

``` yaml
includes:
  # Include only files directly in the config directory (no subdirectories)
  - path: ./config/
    depth: 0
  
  # Include files in config directory and one level of subdirectories
  - path: ./models/
    depth: 1
  
  # Fully recursive search (default behavior)
  - path: ./all-files/
    depth: null  # or omit depth entirely
```

- `depth: 0` - Only files in the specified directory (no subdirectories)
- `depth: 1` - Files in the directory and one level of subdirectories
- `depth: null` or omitted - Fully recursive search through all subdirectories (default)

### Excluding Files and Directories

Use the `exclusions` parameter to skip specific files or directories. Exclusions support multiple pattern types:

``` yaml
includes:
  - path: ./config/
    exclusions:
      - "*.backup.yml"        # Exclude all .backup.yml files
      - "temp_config.yml"     # Exclude specific file by name
      - "*/temp/*"           # Exclude anything in temp directories
      - "*/archive/*"        # Exclude anything in archive directories
      - "*.config.yml"       # Exclude configuration template files
```

### Advanced Directory Examples

Combine depth control and exclusions for precise file selection:

``` yaml
includes:
  # Include all YAML files recursively, but skip backup and temp files
  - path: ./project-configs/
    exclusions:
      - "*.backup.yml"
      - "*.temp.yml"
      - "*/backup/*"
      - "*/temp/*"
  
  # Include only top-level model files, skip nested configurations
  - path: ./models/
    depth: 0
    exclusions:
      - "*.config.yml"
  
  # Include specific dashboard subdirectories but exclude test files
  - path: ./dashboards/
    depth: 2
    exclusions:
      - "*test*"
      - "*/drafts/*"
```

### Pattern Matching for Exclusions

Exclusions support several pattern matching approaches:

- **Filename patterns**: `*.backup.yml`, `temp_*`
- **Path patterns**: `*/temp/*`, `config/*/old/*`
- **Exact names**: `old_config.yml`, `deprecated.yml`
- **Regex patterns**: Advanced users can use regex for complex matching

The exclusion patterns are matched against both the filename and the relative path from the include directory.

## External Projects

One of the most powerful aspects of Visivo is the ability to include public GitHub repos that contain Visivo dashboards in your project.  This gives everyone to share a useful dashboard that they may have. 

We have published a series of projects that allow you to quickly build dashboards based on some popular tools.

Those are tagged in GitHub [here](https://github.com/topics/visivo-dashboard).
You can also build and share your own under the same `visivo-dashboard` topic in GitHub.

Here is an example on how to include our dashboard that provides insights into your repositories' pull requests:

``` yaml
includes:
  - path: visivo-io/github-dashboard.git@main
```

Once it is included then you can reference the `traces` and `charts` like you would if they were in your project like:

``` yaml
dashboards:
  - name: Github Metrics
    rows:
      - height: medium
        items:
          - width: 1
            chart:
              name: Pull Requests by Repository
              traces:
                - ${ref(Pull Request by Repository)}
              layout:
                title: "Pull Request by Repository"
```