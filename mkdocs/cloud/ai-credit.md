# AI credit and costs

**Visivo-supplied inference spends account credit.** This includes the local
Agent tab after `visivo authorize` and the Agent tab in Cloud. Check your balance
and limits before sending a prompt; running locally does not make inference free.

Your own provider key uses your provider's billing. An external MCP agent pays
through its own account or subscription. These paths can still incur warehouse
query charges, and Cloud builds use Visivo credit regardless of how their
configuration was authored.

## Check before starting

Sign in to [Visivo Cloud](https://app.visivo.io), choose the intended account, and
open **Billing**. It shows your available credit and controls for purchases,
automatic refill, and account spend limits. An account admin manages these
controls. **Usage** shows spend for the current period, split between agent
inference and build compute and by user.

See [current Visivo plan pricing](https://visivo.io/pricing/) for subscriptions
and included credit. Prices and plan discounts can change. Use your account's
**Billing** and **Usage** pages to check available credit, spending controls, and
actual charges. For current metered rates, [contact Visivo](mailto:jared@visivo.io)
before estimating a budget. For a self-hosted deployment, ask its administrator
to confirm the rates it applies.

## What does a turn cost?

There is no fixed charge per prompt. One turn may make several model calls to
read context, call tools, and reason about their results. Each call meters fresh
input, cached input, and output, including reasoning tokens.

Use the current per-million-token prices to make a rough estimate:

```text
inference cost = (fresh input tokens / 1,000,000 × fresh input price)
               + (cached input tokens / 1,000,000 × cached input price)
               + (output and reasoning tokens / 1,000,000 × output price)
```

A call with 5,000 fresh input tokens and 1,000 output/reasoning tokens costs
`0.005 × fresh input price + 0.001 × output price`. Add every call in the turn.
Your prompt is only part of the input: schemas, tool results, and conversation
history also count. Use the current rates; this example is not a price quote.

Cloud runner time is metered separately and draws on the same balance. Review
**Usage** after a small first task to see actual inference and compute charges.
A failed or stopped conversation can still have completed billable calls;
discarding its drafts does not reverse charges.

## Credit and limits are different

Credit is grants and purchased credit minus usage. It does not expire or reset
each billing period. A spend limit is an optional cap within a period. Account
and user limits can stop work even when credit remains; the refusal explains
which limit was reached and when it resets.

If credit runs out, an admin can buy more or configure automatic refill. If a
period limit is reached, ask the admin to review it or wait for its reset. For
local inference, you can instead [use your own provider key](../ai/agent-tab.md#local-agent-with-your-own-key),
with that provider's charges and limits.

The built-in loop's request and tool-call bounds limit one turn; they do not set
a dollar budget for a conversation. Check balance and spend limits before starting,
and review [draft edits](../ai-usage.md#you-review-and-commit) before committing them.
