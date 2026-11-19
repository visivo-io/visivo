# Visivo plugin for Claude Code

This plugin lets Claude Code build and change a [Visivo](https://visivo.io) project.
It gives Claude Code three skills and a connection to the local Visivo MCP server.

## What the plugin contains

| Part | What it does |
| --- | --- |
| `project-files` skill | Edits the project YAML and runs `visivo compile`, `visivo run`, `visivo test` and `visivo serve`. |
| `mcp-drafts` skill | Uses the MCP tools to read the project and write drafts that you review in the browser. |
| `deploy` skill | Runs `visivo authorize` and `visivo deploy`. Claude uses it only when you ask for a deploy. |
| `visivo` MCP server | Connects to the HTTP MCP endpoint of your running `visivo serve`. |

The plugin does not install Visivo. [Install Visivo](https://docs.visivo.io/installation/) first.

## Install

Run these commands in your shell:

```bash
claude plugin marketplace add visivo-io/visivo --sparse .claude-plugin claude-plugin
claude plugin install visivo@visivo
```

`--sparse` downloads only the plugin directories and the files at the top level of the repository, about 3 MB.
Without it, the command downloads all files of the Visivo repository, more than 150 MB.

## Connect the MCP server

1. Run `visivo serve` in your project directory. Keep it running.
2. Start Claude Code in the same directory.
3. Run `/mcp`. The server shows as `plugin:visivo:visivo`.

The plugin connects to `http://localhost:8000/api/mcp/`.
If you start the server with `--port`, run `/plugin configure visivo@visivo` and set the URL to that port.
The local endpoint has no authorization. Keep the server on a machine that you trust.

The skills also work when no server runs. Claude then edits the YAML files and runs the CLI.

## Two ways to change a project

- **Files.** Claude edits your YAML files. You see each change in your editor and in `git diff`.
- **Drafts.** Claude writes through the MCP tools. Each write is a draft that you commit or discard in the workspace at http://localhost:8000.

Tell Claude which way you want. The skills tell Claude not to use the two ways on the same object in one task.

## Deploy and the `source` label

When you ask for a deploy, the `deploy` skill runs `VISIVO_AUTHORIZE_SOURCE=plugin visivo authorize`.
The CLI then adds `source=plugin` to the authorize URL that it opens.
The label says only that the authorization started from this plugin.
Visivo Cloud uses it only to count authorizations. Any tool can set the label, so it gives no access and no benefit.
The CLI sends it only when telemetry is on. Run `visivo telemetry off` to stop it.

## What the plugin does not contain

- **A stdio MCP server.** A `visivo mcp` stdio command is in review and is not in a release. This plugin uses the HTTP endpoint, which is in each current release.
- **A Visivo Cloud MCP server.** This plugin connects only to your local server.

## Develop the plugin

```bash
claude plugin validate --strict ./claude-plugin
claude plugin validate --strict .
claude --plugin-dir ./claude-plugin
uv run pytest tests/test_claude_plugin.py
```

The release workflow writes the Visivo version into `.claude-plugin/plugin.json`.
Claude Code keeps a user on the version that the manifest names, so do not edit the version by hand.

## Links

- [Documentation](https://docs.visivo.io/ai/mcp/)
- [Issues](https://github.com/visivo-io/visivo/issues)
- [Privacy](https://visivo.io/privacy)
- [Terms](https://visivo.io/terms)
