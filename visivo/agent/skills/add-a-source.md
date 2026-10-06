---
name: add-a-source
summary: Add a source and confirm it actually connects.
---

# Add a source

1. `get_schema('sources')` — fields differ per type, and guessing produces a
   config that validates and cannot connect.
2. `validate_source`, then `write_source`.

## Never put a credential in the project

Project YAML is committed and shared. Reference the environment:

```yaml
password: ${env.WAREHOUSE_PASSWORD}
```

A literal password is a password in someone's git history. You cannot read
environment values and should not try — write the reference and say which
variable the user needs to set.

## A source is not proven until something reads it

Writing a source only records intent. Tell the user it needs a run, and use
`list_runs` / `get_run` afterwards to see whether it connected.
