# Use the Agent tab

**Agent** sits beside **Workspace**, **Runs**, and **Dashboards** in the project
viewer. Ask Visivo's built-in agent for a change, follow its tool calls, and
continue the conversation. The tab also shows [external MCP calls](mcp.md).

All three built-in paths share the [draft-only boundary](../ai-usage.md#you-review-and-commit).
Choose your inference credentials before sending a prompt.

## Local agent with your own key

[Install Visivo](../installation.md) and open a project. For a new one:

```bash
mkdir my-dashboard
cd my-dashboard
visivo init --bare
```

Export your Anthropic key in the terminal that will run the server:

```bash
export ANTHROPIC_API_KEY='your-provider-key'
visivo serve
```

Open `http://localhost:8000` and select **Agent**. You do not need
`visivo authorize` for provider-funded inference. The default local model uses
Anthropic; requests are billed by your provider.

Alternatively, add this section to `~/.visivo/profile.yml`, preserving existing
device tokens and other settings:

<!-- visivo-example: skip - User profile credentials, not project configuration. -->
```yaml
agent:
  api_key: your-provider-key
```

Restart `visivo serve` after changing provider credentials. Keep keys in your
environment or user profile, never in project YAML, `AGENTS.md`, or a prompt.
Visivo does not read agent keys from project configuration.

### Choose a provider model

Set `VISIVO_AGENT_MODEL`, or `agent.model` in the profile, to a model string
supported by the installed provider integration. For example:

```bash
export VISIVO_AGENT_MODEL='anthropic:claude-sonnet-4-5'
visivo serve
```

Google/Gemini models use `GOOGLE_API_KEY` or `GEMINI_API_KEY` with a `google:` or
`google-gla:` model string. OpenAI models use `OPENAI_API_KEY` with an `openai:`
model string. Model availability and billing belong to your provider. The profile's
`agent.api_key` supplies the selected provider's key when its environment key is absent.

## Local agent with Visivo inference

!!! warning "Check credit before sending"
    This path spends Visivo account credit even though the project and agent loop
    run on your machine. Read [AI credit and costs](../cloud/ai-credit.md) and check
    your account's balance and limits in Cloud before starting.

Leave `agent.api_key`, provider keys for the selected model, `agent.model`, and
`VISIVO_AGENT_MODEL` unset when choosing Visivo-supplied inference. Then:

```bash
visivo authorize
visivo serve
```

`authorize` opens the device authorization page. Sign in to the account you want
to use and approve the device. The CLI stores its device token under that
deployment's URL in `tokens` in `~/.visivo/profile.yml`. This token authenticates
to Visivo; it is not an Anthropic or Google API key.

Select **Agent** and send a request. The local loop calls Visivo's inference
service with the model that deployment supplies. It currently uses Gemini;
requesting a different model does not switch Visivo's service to that provider.
The response reports `model_source: visivo_cloud`, rather than `byo_key`.

### Credential precedence

For the local built-in agent, the order is:

1. A provider environment key for the selected model, such as `ANTHROPIC_API_KEY`.
2. `agent.api_key` in `~/.visivo/profile.yml`.
3. A Visivo device token for the selected host, when no model was explicitly
   selected and that deployment offers inference.

**A BYO provider key wins even when a Visivo device token is present.**
An explicitly selected model without its own credentials returns an error rather
than silently spending Visivo credit on a different model. Remove the explicit
model setting to use Visivo-supplied inference.

### Select another Visivo host

The default host is `https://app.visivo.io`. Use the same host when authorizing
and serving against a development or self-hosted deployment:

```bash
export VISIVO_HOST='https://app.development.visivo.io'
visivo authorize
visivo serve
```

The CLI resolves an explicit `--host` first, then `VISIVO_HOST`, then the default.
Alternatively, use `visivo authorize --host <url>` and `visivo serve --host <url>`
with the same URL. Tokens are stored per host; a production login does not
authorize a different deployment. This setting also selects where CLI deployments
go. It does not move your local project to Cloud or change the viewer port.

If the host does not offer inference, use your own key or a deployment that does.
The old `agent.host` setting is not the host selector.

## Agent in Visivo Cloud

1. [Sign in](../cloud/authentication.md), select your account, and open **Billing**
   to check credit and spend limits. [Cloud usage](../cloud/ai-credit.md) includes
   inference and build compute.
2. Open your project and select **Agent** beside Workspace, Runs, and Dashboards.
3. Send a request, review the resulting drafts, then commit or discard them.

Cloud stores conversations and runs the loop on its runner infrastructure. It
uses the same Visivo tool registry and project-scoped agent URLs as the local
viewer. You do not export a provider key or run `visivo authorize` for this
browser-based path. Your browser login supplies the account context; the local
`agent.api_key` profile is not a Cloud configuration.

## Work through a turn

Ask for a bounded change: “Read the orders Model and revenue Metric. Draft a
monthly revenue Insight on the sales Dashboard.” Press **Send** or Enter;
Shift+Enter inserts a newline.

The transcript shows replies and tool calls with links to affected objects.
Follow up in the same conversation to refine the result. Press **Stop** to cancel
active work. Stopping does not undo drafts or refund completed calls. Local
conversations are held by the server and lost when it restarts; Cloud stores them
with the project.

Review changes in Workspace and results in Runs and Dashboards. Draft edits may
build automatically under your run setting; otherwise start a run yourself. The
agent can read run status and errors but cannot commit, deploy, delete, or directly
start a run. Choose **Commit** yourself after reviewing results. See
[project guidance](mcp.md#project-guidance-and-skills) for `AGENTS.md` and skills.

A turn is bounded to 25 model requests and 60 tool calls. Follow-up turns have
their own bounds. Account credit and spend limits are separate controls; inspect
any drafts already created when a turn stops at a limit.

## Agent HTTP interface

The viewer starts a turn with `POST /api/agent/` locally, or
`POST /api/projects/<project_id>/agent/` locally and in Cloud:

```json
{"prompt": "Draft a monthly revenue Insight using the existing revenue Metric."}
```

The response contains a session ID and state; it does not wait for the whole
loop. Include `session_id` with the next prompt to continue the conversation.
Poll `GET /api/projects/<project_id>/agent/<session_id>/`, or stop with
`POST /api/projects/<project_id>/agent/<session_id>/cancel/`. Local endpoints also
have the shorter `/api/agent/<session_id>/` and `/cancel/` forms. Cloud requests
require authentication and account context. The Agent tab handles this exchange
for browser users.
