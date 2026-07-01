# Visivo Cloud

[Visivo Cloud](https://app.visivo.io) is the hosted home for your Visivo projects. You build
dashboards locally as code, push them with one command, and Cloud hosts the interactive
result at a shareable URL — with versioned history, teams, and roles built in.

Cloud is optional: the [CLI](../reference/cli.md) is fully open source and runs entirely
locally. Cloud adds hosting, sharing, and collaboration on top.

## What Cloud gives you

<div class="grid cards" markdown>

-   :material-cloud-upload:{ .lg .middle } **Deploy & stages**

    ---

    Push a project with `visivo deploy -s <stage>`. Named stages let dev, CI, and
    production versions of a project live side by side. Star the ones you care
    about; archive the ones you don't.

    [:octicons-arrow-right-24: Deploy & stages](deploy-and-stages.md)

-   :material-link-variant:{ .lg .middle } **Hosted, shareable dashboards**

    ---

    Every deploy is live at a clean `/:account/:stage/:project/:dashboard` URL,
    with auto-generated thumbnails and per-dashboard version history you can
    travel back through.

    [:octicons-arrow-right-24: Hosting & sharing](hosting-and-sharing.md)

-   :material-account-group:{ .lg .middle } **Teams & roles**

    ---

    Invite teammates, assign Viewer or Admin roles, and auto-join everyone on
    your email domain.

    [:octicons-arrow-right-24: Teams & roles](teams-and-roles.md)

-   :material-key:{ .lg .middle } **Authentication**

    ---

    Log in with Google, authorize the CLI with a device flow, and create API
    keys for CI/CD.

    [:octicons-arrow-right-24: Authentication](authentication.md)

</div>

## The typical flow

1. Build a [Dashboard](../concepts/dashboard.md) locally and preview it with `visivo serve`.
2. Authorize the CLI once with `visivo authorize` (see [Authentication](authentication.md)).
3. Run `visivo run` to compute your data, then `visivo deploy -s production` to push it.
4. Open the hosted dashboard at `app.visivo.io`, share the URL, and invite your team.

!!! info "You push the data — Visivo doesn't pull it"
    A key difference from traditional BI tools: **you** run `visivo run` and `visivo deploy`
    to push your data and dashboards to Cloud. Cloud never holds credentials to reach back
    into your databases. This keeps your warehouse access entirely under your control.

## Get started

- New to the CLI? Start with [Get Started](../index.md) and [Installation](../installation.md).
- Ready to deploy? Head to [Deploy & stages](deploy-and-stages.md).
- Sign in or sign up at [app.visivo.io](https://app.visivo.io).
