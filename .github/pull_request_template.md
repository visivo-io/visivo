## What

## Why

## Cross-surface checklist

The viewer is served by both `visivo serve` (Flask) and Visivo Cloud. Tick what applies.

- [ ] This PR does not touch `viewer/src/config/urls.js`, `viewer/src/api/`, or `visivo/server/views/`.
- [ ] It does, and `api-contract.yml` is updated. Every new or changed key says which surfaces serve it (`studio`, `cloud`, `dist`).
- [ ] Every entry claiming `cloud` has its route in the cloud app. Linked cloud PR: <!-- link -->
- [ ] A studio-only entry has a `cloud_equivalent` or a `reason`.
- [ ] Pydantic models changed: `python -m visivo.generate_project_schema_json` ran and the schema is committed.
- [ ] Marketing claims: this change ships, removes or gates a user-visible capability. Label: `claims:changed` / `claims:unchanged`.

## Test evidence

<!-- tests run, screenshots for UI changes -->
