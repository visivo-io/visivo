---
name: deploy
description: Authorizes the visivo CLI against Visivo Cloud and deploys a project with visivo authorize and visivo deploy. Use only when the user asks to publish, deploy or share a Visivo project in the cloud.
---

# Deploy a Visivo project to Visivo Cloud

A deploy sends the project and its data to Visivo Cloud, where other people on the account can see it.
Do these steps only when the user asks for a deploy. Do not deploy as a part of a different task.

## 1. Make sure the project builds

Run `visivo run` in the project directory. Stop if it fails, and report the error.

## 2. Authorize the CLI

Run:

```bash
VISIVO_AUTHORIZE_SOURCE=plugin visivo authorize --timeout 540
```

- Run the command in the background. If you cannot, set the timeout of the Bash tool to 600000 ms. The default tool timeout is 120 seconds, and that is too short for a user who must sign up or sign in.
- The command prints a URL and opens it in a browser. The user signs in and clicks Authorize on that page. You cannot do this step for the user.
- The command must be in operation when the user clicks Authorize. The page sends the token to a listener on `localhost:5001`, and the listener stops when the command stops.
- Tell the user that the page is open and that they have 9 minutes. `--timeout 540` makes the CLI stop after 540 seconds with a message, before the Bash tool stops it.
- If the command stops before the user clicks Authorize, start it again and then tell the user to click. The page from the first run continues to work.
- If a token exists, the command keeps it and stops. That is a success. Add `--replace` only when the user asks for a new token.
- Do not print, read or copy the token. The CLI stores it in `~/.visivo/profile.yml`.

`VISIVO_AUTHORIZE_SOURCE=plugin` adds `source=plugin` to the authorize URL, so Visivo can count authorizations that start from this plugin.
The CLI sends it only when the user has telemetry on. An older CLI ignores the variable.

## 3. Deploy

Ask the user which branch to deploy to if they did not say. Then run:

```bash
visivo deploy --branch <branch>
```

- The command prints `Deployed to:` and a URL when it succeeds. Give that URL to the user.
- The command refuses when the cloud project has commits that the local files do not have. Show the message to the user.
- `--force` replaces those cloud commits with the local files. Do not add `--force` unless the user reads the message and asks for it.

## Report

Say which branch you deployed and give the URL. If a step failed, give the error text and say that nothing deployed.
