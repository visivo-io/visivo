# Hosting & sharing

Once you [deploy](deploy-and-stages.md), Visivo Cloud hosts your interactive dashboards and
gives every team member a stable URL to open them. This page covers what that hosted
surface looks like.

## Shareable dashboard URLs

Every deployed dashboard lives at a clean, predictable URL:

```text
https://app.visivo.io/:account/:stage/:project/:dashboard
```

- **account** — your account (workspace) slug.
- **stage** — the [stage](deploy-and-stages.md) you deployed to (e.g. `production`).
- **project** — the project name.
- **dashboard** — the dashboard name.

Share the URL with anyone on your account and they will see the fully interactive
dashboard — [Inputs](../concepts/input.md), filters, and all — rendered in the browser.

## Auto-generated thumbnails

Cloud automatically captures a thumbnail image of each dashboard after a deploy, so your
account's project and stage listings show a visual preview rather than a wall of names.

## Version history & time travel

Each `visivo deploy` to a stage creates a new, timestamped version of your project rather
than overwriting the last one. In the Cloud UI you can:

- Browse the **deploy history** for a stage.
- **Travel back** to a previous version on a per-dashboard basis — useful for comparing how
  a dashboard looked before and after a change, or recovering a view after an unintended
  deploy.

## Editing in the browser

In-browser visual editing and a drag-and-drop **dashboard builder** are Cloud's newest
capability. They let you adjust and assemble dashboards directly in Cloud, complementing the
code-first CLI workflow. As with everything in Visivo, the CLI remains the source of truth
for projects you manage as code.

!!! note
    The fastest, fully-supported path today is the code-first loop: build locally, preview
    with `visivo serve`, then `visivo deploy`. See [Deploy & stages](deploy-and-stages.md).

## Learn more

- [Deploy & stages](deploy-and-stages.md) — how versions and stages are created.
- [Teams & roles](teams-and-roles.md) — who can open these URLs.
- [Dashboard](../concepts/dashboard.md) — the object behind every hosted page.
