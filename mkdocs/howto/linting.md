# Linting `project.visivo.yml`

We publish a json schema file for our [`project.visivo.yml`](https://docs.visivo.io/assets/visivo_schema.json). With this file you can get realtime linting & feedback while developing your project.

## :material-microsoft-visual-studio-code: VSCode Plugin

Install the [YAML plugin](https://github.com/redhat-developer/vscode-yaml) from the good people of redhat-developer. The plugin enables you to lint any yaml file that you associate a schema to.  

### Configuration (Optional)

By default any file with the format `*.visivo.yml` will be linted.  If you have a file that is named differently, you can add it to the local configuration.

1. Install the plugin per the instructions
2. Edit the plugin settings, and click "Edit in settings.json" under the "Yaml: Schemas" section.
3. Edit the "yaml.schemas" to include: 
```
"yaml.schemas": {
    "https://docs.visivo.io/assets/visivo_schema.json": "name_of_file.yml"
},
```

## Gotchas

If you are using `env_var` substitution, surrounding the value with `"` will make the linter happy. For example: `password: "{% raw %}{{ env_var('SECRET_PASSWORD') }}{% endraw %}"`

