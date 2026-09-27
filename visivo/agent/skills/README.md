# Skills

Task-shaped instructions for the operations agents get wrong unaided.

Tools say what an agent *can* do. `validate_<type>` catches invalid. Skills are
for the third category: **valid but wrong** — configuration Visivo accepts and
then behaves unexpectedly about, which is where hard-won product knowledge
lives.

One copy, two readers. `visivo/agent/skills.py` loads these for the built-in
loop's prompt, and `/api/mcp/` serves the same text to an external client. If
the built-in agent ends up better instructed than an external one, the split
has failed.

Each file is one task. Keep them short — they are read every turn.
