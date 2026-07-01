# Editorial guidelines

These docs describe Visivo 2.0, and they must explain 2.0 on its own terms. This page is the short, enforceable rule set every contributor follows when writing or editing a page. It exists so the docs stay truthful as the product moves, and so the automated guards below have a written standard to point at.

!!! visivo "The one rule"
    Never explain a 2.0 concept by reaching for a 1.0 primitive. Describe what Visivo does today, with today's objects, in today's commands.

## Explain 2.0 with 2.0 objects

Visivo's mental model is the [six core objects](../concepts/index.md): Source, Model, Semantic layer (Metric, Dimension, Relation), Insight, Input, and Dashboard. Write every explanation in those terms.

- **Charts come from Insights.** An [Insight](../concepts/insight.md) binds a Model's columns to plotly props and carries client-side interactions. The [semantic layer](../concepts/semantic-layer.md), made of Metrics, Dimensions, and Relations, feeds reusable definitions into Insights. That pairing is how a chart gets made.
- **Do not reintroduce the removed chart primitive.** The standalone 1.0 chart object was removed in 2.0. Do not document it, and do not use its YAML key (`insights:` is the 2.0 key). The phrase that paired the words "trace" and "types" is likewise out: there is no such taxonomy in 2.0, since charts are produced by Insights plus the semantic layer.
- **Prefer the real command.** Ground instructions in the actual [CLI](../reference/cli.md): `visivo run`, `visivo test`, `visivo serve`, `visivo deploy -s <stage>`. Do not invent flags or workflows.

!!! note "Why the old vocabulary is banned"
    The removed objects do not exist in the running product. A reader who follows 1.0 vocabulary writes YAML that will not compile. Accuracy here is not stylistic; it is the difference between a working project and a confusing error.

## Banned phrases

The following must never appear in **new** hand-authored docs prose. The first is the removed chart object's YAML key; the others name a chart taxonomy that 2.0 does not have.

<div class="grid cards" markdown>

-   :material-close-octagon:{ .lg .middle } **The removed chart key**

    ---

    Do not use the removed chart object's YAML key at the start of a line. The 2.0 key is `insights:`.

-   :material-close-octagon:{ .lg .middle } **A chart-type taxonomy**

    ---

    Do not write the two-word phrase pairing "trace" with "types", nor any "N+" count of them. Charts come from Insights and the semantic layer.

</div>

!!! tip "Legitimate uses are fine"
    Words like *stack trace*, *stacktrace*, *tracing*, and *backtrace* are normal engineering vocabulary and are allowed. The generated [props reference](../reference/configuration/Insight/Props/Scatter/index.md) is built from Plotly itself and is not hand-authored prose, so it is excluded from the scan.

## Always write dbt™

When you mention dbt in any hand-authored page, write **dbt™** with the trademark symbol. This keeps the docs consistent with the rest of Visivo's surfaces.

## How this is enforced

You do not have to remember every rule by heart. Two guards catch the common slips, and both reference this page as the standard.

- **Docs-vs-code parity CI (VIS-874).** `tests/docs/test_docs_parity.py` runs in the docs pipeline (`.rwx/test_docs.yml`). It verifies the committed schema JSON matches a freshly generated schema, that every generated reference page has a non-empty description, and that no banned 2.0 phrase appears in hand-authored docs prose. A violation fails the build.
- **The content guard.** The same banned-phrase list is mirrored in the marketing site's `scripts/check-content-accuracy.cjs`, so the two surfaces stay in lockstep. When you add a banned phrase here, add it in both places.

!!! visivo "When you ship a product change"
    If you remove or rename an object in the CLI, update the docs vocabulary in the same change. The parity CI checks the reference against the code, but the prose is yours to keep honest.

## Quick checklist

Before you open a docs pull request:

1. Every concept is explained with the [six core objects](../concepts/index.md), not a removed 1.0 primitive.
2. No banned phrase appears (no removed chart key, no chart-type taxonomy).
3. Commands match the real [CLI](../reference/cli.md).
4. dbt is written as **dbt™**.
5. `bash scripts/docs_gen.sh` builds and the spellcheck is clean.
</content>
