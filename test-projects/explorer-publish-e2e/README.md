# explorer-publish-e2e

Dedicated test project for Explorer → Save → Publish → YAML-file e2e tests.

## Do NOT edit by hand while tests are running

The `*.visivo.yml` files in this directory are snapshotted before each test
in `viewer/e2e/stories/explorer-publish-to-files.spec.mjs` and restored
after each test. Manual edits during a test run will be overwritten.

If a Playwright run is `SIGKILL`-ed and leaves the files dirty, recover with:

```
git checkout -- test-projects/explorer-publish-e2e/
```

## Sandbox

This project runs on an isolated sandbox:

- Backend: `http://localhost:8002`
- Frontend: `http://localhost:3002`

Start/stop with:

```
bash scripts/sandbox-publish.sh start
bash scripts/sandbox-publish.sh stop
```

The `scripts/sandbox-publish.sh` wrapper sets the env-var overrides consumed by
`scripts/sandbox.sh` and points it at this project directory.
