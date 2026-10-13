# Connect your agent with MCP

This is **your agent, your machine**: an external agent drives Visivo's project
tools. Your agent selects the model and pays for inference through its own
provider account or subscription. A provider key in Visivo is not required.

## Start the project server

[Install Visivo](../installation.md), then initialize a new project:

```bash
mkdir my-dashboard
cd my-dashboard
visivo init --bare
visivo serve
```

For an existing project, run `visivo serve` from its directory. Keep the process
running while your agent is connected. Its HTTP MCP endpoint is:

```text
http://localhost:8000/api/mcp/
```

If you start `visivo serve --port 8001`, use port `8001` in the client configuration.
`VISIVO_HOST` selects a Cloud deployment; it does not change this local address.
The local MCP endpoint does not require device authorization. Keep access to the
development server limited to trusted clients.

## Connect a client

### Claude Code

From the project directory, register the HTTP server:

```bash
claude mcp add --transport http visivo http://localhost:8000/api/mcp/
```

Open Claude Code and use `/mcp` to check that `visivo` is connected. See
[Claude Code's MCP setup](https://code.claude.com/docs/en/mcp) for configuration scopes.

### Cursor

Merge this entry into your project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "visivo": {
      "url": "http://localhost:8000/api/mcp/"
    }
  }
}
```

Enable the server in Cursor's MCP settings and confirm its tools are available.
See [Cursor's MCP guide](https://cursor.com/docs/mcp).

### Gemini CLI

Merge this entry into `.gemini/settings.json` in the project. `httpUrl` selects
Streamable HTTP rather than SSE:

```json
{
  "mcpServers": {
    "visivo": {
      "httpUrl": "http://localhost:8000/api/mcp/"
    }
  }
}
```

Start Gemini CLI in the project and use `/mcp` to check the connection. See
[Gemini CLI's MCP guide](https://geminicli.com/docs/tools/mcp-server/) for settings
and tool approvals.

## Discover and use the tools

The server supports `initialize`, `tools/list`, and `tools/call` over JSON-RPC.
Your client handles that exchange. **`tools/list` is the authoritative list for
the Visivo version you are running.**

The registry provides four operations across eleven project object types:
Sources, Models, Metrics, Dimensions, Relations, Insights, charts, Tables,
Markdown, Inputs, and Dashboards.

| Operation | Examples | Behavior |
| --- | --- | --- |
| List | `list_models`, `list_insights` | Read existing objects, including drafts |
| Get | `get_model`, `get_insight` | Read an object's configuration by `name` |
| Validate | `validate_model`, `validate_insight` | Check a full `config` without saving |
| Write | `write_model`, `write_insight` | Create or replace a full object as a draft |

Additional tools include `get_schema`, `read_skill`, `list_runs`, and `get_run`.
Theme tools read, validate, and replace the whole project's theme rather than a
named object.

Ask the agent to read existing objects, call `get_schema` before authoring a new
type, validate non-trivial configuration, then write a draft. For example, the
arguments to `get_schema` are:

```json
{"type": "models"}
```

Singular names such as `model` work too. The response contains fields and required
values for that type, without copying the entire project schema into context.
Large Plotly schemas are omitted; `validate_insight` and `validate_chart` check
rendering properties.

`write_*` accepts `{"config": {...}}` and replaces the object's configuration,
so read it first. Failures return MCP results with `isError: true`; inspect the
message instead of assuming a write succeeded.

Try this request:

> Use Visivo MCP tools to read my Sources and Models. Read the relevant skill
> and schema, then draft an Insight of monthly revenue using the existing revenue
> definition. Validate it and leave the changes for me to review.

Open **Agent** to inspect **External MCP calls**, then review the drafts in
Workspace. If automatic runs are off, start a run yourself. The agent can inspect
`list_runs` and `get_run` for results and errors, but it has no tool to start a run,
commit, deploy, or delete. Review the built result and choose **Commit** or discard
the changes. See [the draft boundary](../ai-usage.md#you-review-and-commit).

## Project guidance and skills

`visivo init --bare` creates `AGENTS.md` alongside the project file. Add naming
rules, preferred sources, and business definitions. An existing brief is
preserved. Ask an external agent to read it with its own file-reading capability.

Skills ship with Visivo; `init` does not copy them into the project. The built-in
loop receives their index and reads relevant skills on demand. External clients
can discover the same packaged guidance with `resources/list` and `resources/read`,
or call `read_skill` with a name such as `build-a-model`. Use your client's
resource browser to discover the available skills. Project guidance is not
permission to bypass [your request or the draft boundary](../ai-usage.md#shared-projects-and-prompt-injection).

## If the connection fails

- Confirm `visivo serve` is running in the intended project and the port matches
  the configuration. Keep the trailing `/api/mcp/` path.
- Use HTTP transport, not a stdio command or an SSE `/sse` URL.
- Reconnect the client after changing settings or restarting the server.
- To check tool discovery directly:

```bash
curl -sS http://localhost:8000/api/mcp/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A successful response contains `result.tools`. Listing tools does not start
inference or change the project.
