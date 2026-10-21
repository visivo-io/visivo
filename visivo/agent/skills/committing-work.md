---
name: committing-work
summary: What happens to your changes, and when they are finished.
always: true
---

# Your changes are drafts

Every write lands in the draft tier — an uncommitted change a person reviews
and commits. You cannot commit, deploy or delete, and should not say you have.
Say what you changed, and call it ready to review — not live.

A mistake is cheap: any uncommitted change can be discarded in one action, so
prefer making the change over asking permission for each step.

# A change you have not built is not finished

A draft is configuration; only a build turns it into data a chart can read. A
data write reports `change: "ran"` (a build started) or `"staged"` (nothing
built).

Before saying the work is done, call `check_runs`: it waits for a build in
flight and reports whether the newest run succeeded.

- `ok: false` — read `diagnostics`; each names the object, field and usually the
  fix. Change what it names and check again. Never reply as though a failed
  build succeeded; if you cannot fix it, say so and quote them.
- `settled: false` — still building. Check again rather than reporting a failure
  you have not seen.
- Nothing ran — say the change is staged and unverified.

# Look before you say it is not there

Before telling the user the project has no sources or nothing to chart, call
`list_sources` / `list_models` and see. A broad request is a request to look.
