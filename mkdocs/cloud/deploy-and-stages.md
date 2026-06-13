# Deploy & stages

Deploying sends the current version of your project — and the data computed by
`visivo run` — to [Visivo Cloud](https://app.visivo.io), where your team can open it in a
browser. Every deploy targets a **stage**.

## Deploying

```bash
visivo run                       # compute your project's data locally
visivo deploy -s production      # push it to the "production" stage
```

The `-s` / `--stage` flag is required — it names the stage you are deploying to. You will
need an API key first; see [Authentication](authentication.md).

## Stages

A **stage** is a named slot that holds one running version of your project. Stages let
multiple versions of the same project exist in Cloud at once — which is exactly what you
want for separate dev, CI, and production environments:

```bash
visivo deploy -s production            # the version everyone looks at
visivo deploy -s my-feature-branch     # an isolated preview of a change
```

Because the stage name is just a string, a common CI pattern is to deploy every pull
request to a stage named after its branch, then clean it up when the PR closes.

### Starring and archiving stages

In the Cloud UI you can:

- **Star** the stages you use most so they surface at the top of your account.
- **Archive** a stage you no longer need to keep your account tidy. Archiving from the CLI:

```bash
visivo archive -s my-feature-branch
```

Archiving a stage is the natural cleanup step when a feature branch merges or a PR closes.

## Continuous deployment

Deploys are designed to run in CI/CD. The recommended pattern is:

- **On pull request** — `visivo run` then `visivo deploy -s <branch>` to publish a preview
  stage your reviewers can open alongside the code diff.
- **On merge / close** — `visivo archive -s <branch>` to tear the preview down.
- **On a schedule** — `visivo deploy -s production` on a cron to keep production data fresh.

Store your token as a `VISIVO_TOKEN` secret in your CI provider. Full, copy-pasteable
GitHub Actions and RWX (Mint) workflows live in the
[Deployment guide](../topics/deployments.md).

## Learn more

- [Deployment guide](../topics/deployments.md) — complete CI/CD workflows.
- [Authentication](authentication.md) — getting an API key for deploys.
- [Hosting & sharing](hosting-and-sharing.md) — the URLs and version history a deploy produces.
- [CLI reference](../reference/cli.md) — every flag of `visivo deploy` and `visivo archive`.
