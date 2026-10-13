# Authentication

Visivo Cloud authenticates you in the browser and authenticates the [CLI](../reference/cli.md)
with API keys. This page covers signing in, connecting the CLI, and creating keys for CI.

## Signing in to the web app

Go to [app.visivo.io](https://app.visivo.io) and sign in with email + password or with
**Google**. New users confirm their email, then land in their account (workspace).

## Authorizing the CLI

To deploy from your machine, the CLI needs an API key tied to your account. The easiest way
to get one is the device-authorize flow:

```bash
visivo authorize
```

This:

1. Opens `app.visivo.io/authorize-device` in your browser.
2. Asks you to name the device, then issues an API key.
3. Hands the key back to the CLI, which saves it under the deployment URL in
   `tokens` in `~/.visivo/profile.yml`.

After this, `visivo deploy` and `visivo archive` are authenticated automatically.

The same device token enables [Visivo-supplied inference in the local Agent
tab](../ai/agent-tab.md#local-agent-with-visivo-inference). Inference spends
[account credit](ai-credit.md); a provider key configured for the local agent
still takes precedence over the device token.

For another deployment, set `VISIVO_HOST` before running `visivo authorize` and
`visivo serve`, or pass the same `--host` to both. Tokens are stored per host.
See [select another Visivo host](../ai/agent-tab.md#select-another-visivo-host).

## API keys for CI/CD

For automated environments (GitHub Actions, RWX/Mint, etc.) you create an API key in the
Cloud UI and provide it to the CLI through the `VISIVO_TOKEN` environment variable:

```bash
export VISIVO_TOKEN=your-visivo-token
visivo deploy -s production
```

The CLI checks `VISIVO_TOKEN` before reading any `profile.yml`, so no file is needed in CI —
store the token as a repository/secret variable and inject it for the deploy step. If
`VISIVO_TOKEN` is unset, the CLI reads the profile token for the selected host.

!!! warning "Treat keys like passwords"
    An API key shown at creation time is only displayed once. Store it securely, and never
    commit it to your repository.

## Learn more

- [Deploy & stages](deploy-and-stages.md) — using your key to deploy.
- [Environment Variables](../topics/environment-variables.md) — how `VISIVO_TOKEN` is read.
- [Teams & roles](teams-and-roles.md) — what your account membership lets you do.
