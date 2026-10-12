# Build with AI

Visivo includes an Agent tab and an MCP server. Use Visivo's built-in agent or
connect an agent you already use, such as Claude Code, Cursor, or Gemini CLI.
Both work with the same project tools.

## Choose your path

| Path | Where the agent runs | Who supplies inference | Start here |
| --- | --- | --- | --- |
| **Your agent, your machine** | Your external agent connects to local `visivo serve` through MCP | Your agent's provider account or subscription | [Connect with MCP](ai/mcp.md) |
| **Our agent, your machine** | The Agent tab in local `visivo serve` | Your own provider key | [Use your own key](ai/agent-tab.md#local-agent-with-your-own-key) |
| **Our agent, our inference, your machine** | The Agent tab in local `visivo serve` | Visivo, paid from your account's credit | [Authorize local Visivo inference](ai/agent-tab.md#local-agent-with-visivo-inference) |
| **Our agent, our infrastructure** | The Agent tab in Visivo Cloud | Visivo, paid from your account's credit | [Use the agent in Cloud](ai/agent-tab.md#agent-in-visivo-cloud) |

Choose MCP to stay in your existing agent, or the Agent tab to ask for changes
beside Workspace, Runs, and Dashboards. Choose your own key for provider-funded
local inference, or authorize Visivo inference to use your account's credit.
Choose Cloud when the project and its agent should run on Visivo's infrastructure.

!!! warning "Visivo inference spends credit"
    Both Visivo-funded paths spend account credit when the agent calls the model.
    Cloud builds also draw on that balance. Read [AI credit and costs](cloud/ai-credit.md)
    and check Billing **before sending your first prompt**. Your own provider key
    also costs money, billed by that provider.

## You review and commit

**The built-in agent and Visivo's MCP tools cannot write your project YAML files
or commit changes. Every project write lands in the draft tier.** Review drafts
in the viewer, inspect results in Runs and Dashboards, then choose **Commit**
yourself or discard the changes.

The tools do not expose shell execution, filesystem writes, commit, deploy, or
delete operations. Draft edits can still trigger builds under your run settings;
this boundary is not a promise of no queries or no charges.

An external agent may have its own filesystem and shell tools. Visivo's boundary
applies to its MCP tools, not to those independent capabilities. Ask your external
agent to use Visivo tools for project edits and retain its own approval controls.

## Credentials and project guidance

For the local built-in agent, a provider environment key such as
`ANTHROPIC_API_KEY` wins over `agent.api_key` in `~/.visivo/profile.yml`. Both win
over the device token saved by `visivo authorize`. A BYO key therefore continues
to be used even when you are signed in to Visivo. See [credential
precedence](ai/agent-tab.md#credential-precedence) before switching paths.

`visivo init` creates a project `AGENTS.md` for naming conventions, preferred
sources, and metric definitions. Visivo also ships reusable skills. The built-in
loop loads the brief and uses those skills; external agents can read the same
skills over MCP. See [project guidance and skills](ai/mcp.md#project-guidance-and-skills).

## Shared projects and prompt injection

Object names, SQL comments, Markdown, and column names can reach the agent's
context. In a shared project, another contributor can control that text. Text
that tells an agent to ignore your request, reveal credentials, or publish a
change is a **prompt injection attempt**, not a project instruction.

The built-in agent is instructed to treat project content as data. The draft-only
tool boundary limits unwanted edits to changes you can inspect and discard. It
does not make model output trustworthy or prevent context already sent to a
provider from reaching that provider. Review project guidance and drafts, and
provide only context you intend to share with the chosen inference service.

Start with a specific request: “Read the existing revenue Model and Insights.
Draft a monthly revenue view using the project's definition of revenue, and leave
the changes for me to review.”
