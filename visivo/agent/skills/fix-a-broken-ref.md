---
name: fix-a-broken-ref
summary: Resolve a dangling ${ref(name)}.
---

# Fix a dangling ref

`${ref(name)}` points at another object **by its `name` field** — not by file,
path, or type.

1. `list_<type>s` for the type it should point at, and compare names exactly:
   refs are case- and character-sensitive.
2. If the target does not exist, the fix is usually to create it, not to
   delete the reference.
3. If it exists under a different name, `write_` the referring object with the
   name corrected. Do not rename the target to match the typo — other objects
   may point at it correctly.

A ref that does not resolve fails the whole DAG, so one typo can look like
many broken objects.
