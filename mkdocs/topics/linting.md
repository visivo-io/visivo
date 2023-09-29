# Linting `project.visivo.yml`

We publish a json schema file for our `project.visivo.yml`.  This gives you realtime feedback when creating your project.  Currently is it available at https://docs.visivo.io/assets/visivo_schema.json.

## VSCode Plugin

The YAML plugin by redhat-developer [here](https://github.com/redhat-developer/vscode-yaml)
 can lint yaml with a json schema.

### Configuration

1. Install the plugin per the instructions
2. Edit the plugin settings, and click "Edit in settings.json" under the "Yaml: Schemas" section.
3. Edit the "yaml.schemas" to include: 
```
"yaml.schemas": {
    "https://docs.visivo.io/assets/visivo_schema.json": "project.visivo.yml"
},
```

## Gotchas

If you are using `env_var` substitution, surrounding the value with `"` will make the linter happy. For example: `password: "{% raw %}{{ env_var('SECRET_PASSWORD') }}{% endraw %}"`

