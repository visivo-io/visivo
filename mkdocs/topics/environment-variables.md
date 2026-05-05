# Environment Variables

Visivo lets you reference environment variables anywhere a source or destination accepts a string-typed connection field. The substitution is **lazy** — the variable is resolved at the moment Visivo opens the connection, not at YAML load time — so secrets stay out of compiled artifacts and the explorer UI keeps the original `${env.VAR_NAME}` token visible.

## Syntax

```text
${env.VAR_NAME}
```

The variable name follows the standard shell convention: it must start with a letter or underscore and may contain letters, digits, and underscores.

```yaml
sources:
  - name: domain_source
    type: postgresql
    host: ${env.APP_HOST}
    port: 5432
    database: app_db
    username: ${env.APP_DATABASE_USERNAME}
    password: ${env.APP_DATABASE_PASSWORD}
```

No quoting is required — `${env.VAR}` parses cleanly as a YAML scalar because it begins with `$`, which has no special meaning in YAML.

## Where it works

`${env.VAR_NAME}` is recognised on **source** and **destination** connection fields — anything declared internally as `StringOrEnvVar` or `SecretStrOrEnvVar`. In practice that covers the credentials and connection details for every supported source and every alert destination:

- Source fields: `host`, `username`, `password`, `account`, `database`, `db_schema`, `private_key_path`, `private_key_passphrase`, `credentials_base64`, etc.
- Destination fields: `webhook_url`, `password`, `host`, etc.

It is **not** processed in arbitrary string fields like a model's `name` or a chart's `title.text` — those are stored verbatim. If you need values to vary by environment in those places, drive them with [includes](including.md) instead.

## Embedded references

You can mix env-var references into a longer string:

```yaml
sources:
  - name: warehouse
    type: snowflake
    account: ${env.SNOWFLAKE_REGION}.${env.SNOWFLAKE_ACCOUNT_ID}
    username: ${env.SNOWFLAKE_USER}
    password: ${env.SNOWFLAKE_PASSWORD}
```

Each reference is resolved independently. If any referenced variable is missing at connect time, Visivo raises a `MissingEnvVarError` naming the variable and (when known) the source it was referenced from.

## Loading variables from a `.env` file

Visivo reads a `.env` file from the project root automatically when present:

```bash title=".env"
APP_HOST=db.staging.example.com
APP_DATABASE_USERNAME=visivo_reader
APP_DATABASE_PASSWORD=...
```

You can also point to a different file with `visivo --env-file path/to/file.env <command>`.

!!! warning
    Add `.env` to `.gitignore`. Visivo's `init` command does this automatically; if you set the project up by hand, add it yourself.

## Deployment token

Your Visivo deployment token (`visivo deploy`, `visivo archive`) is read from the `VISIVO_TOKEN` environment variable directly — it does **not** go through the `${env.X}` substitution path because the token is consumed by the CLI itself, not a connection field.

```bash
export VISIVO_TOKEN=your-visivo-token
visivo deploy -s my-stage
```

If `VISIVO_TOKEN` is unset, Visivo falls back to reading `~/.visivo/profile.yml` for a literal `token:` value.
