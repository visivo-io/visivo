# Telemetry in Visivo

Visivo collects anonymous usage telemetry to help us understand how the tool is being used and improve it over time. This telemetry is privacy-focused and does not collect any personal information, file contents, queries, or sensitive data.

**Note:** Visivo uses PostHog for telemetry collection. You can use your own PostHog instance by setting the `VISIVO_POSTHOG_HOST` and `VISIVO_POSTHOG_API_KEY` environment variables.

## What We Collect

### CLI Commands
- Command name (e.g., `run`, `compile`, `serve`)
- Command arguments (sanitized - paths and values are replaced with placeholders)
  - Sensitive flags like `--token`, `--password` are tracked but their values are redacted
  - File paths are replaced with `<path>`
  - Other values are replaced with `<value>`
- Execution duration
- Success/failure status
- Error type (not the error message)
- High-level metrics:
  - Number of jobs executed (for `run` command)
  - Count of objects by type (for `compile` command)
- Hashed project name (16-character hash, consistent across runs)

### API Requests
- Endpoint path (with IDs replaced by placeholders)
- HTTP method
- Response status code
- Request duration
- Hashed project name (same hash as CLI commands)

### Common Metadata
- Visivo version
- Python version
- Operating system (e.g., darwin, linux, windows)
- Operating system version
- System architecture (e.g., x86_64, arm64)
- Anonymous machine ID (random UUID stored in ~/.visivo/machine_id)
  - In CI/CD environments: Prefixed with "ci-" and regenerated each run
  - In regular environments: Persistent across runs
- Anonymous session ID (regenerated each time Visivo starts)
- CI/CD indicator (is_ci: true/false)

## Example of Command Sanitization

When you run a command like:
```bash
visivo run --dag-filter +my_chart+ --threads 4 --output-dir /home/user/output
```

We collect:
```json
{
  "command": "run",
  "command_args": ["--dag-filter", "<value>", "--threads", "<value>", "--output-dir", "<path>"]
}
```

## What We DO NOT Collect
- Personal information (no emails, usernames, or personal identifiers)
- File contents or file paths (actual paths are replaced with `<path>`)
- SQL queries or query results
- Actual project names (only hashed versions are collected)
- Project data or configurations
- Environment variables (except telemetry settings)
- IP addresses or location data
- Error messages or stack traces
- Actual values of command arguments (replaced with placeholders)

Note: The machine ID is a random UUID generated on first use and contains no information about your system or identity. It simply allows us to count unique installations.

## Project Name Hashing

To help us understand how many unique projects use Visivo while preserving privacy, we hash project names using SHA-256 with a salt. This creates a consistent 16-character identifier that:

- Cannot be reversed to reveal the original project name
- Is the same every time for the same project name
- Allows us to count unique projects and track usage patterns per project
- Does not expose any sensitive information about your project

For example, a project named "my-secret-project" might be hashed to "a7b9c2d4e6f8g1h3" (example only).

## Opting Out

You can disable telemetry using any of these methods (in order of precedence):

### 1. Environment Variable
Set the environment variable to disable telemetry:
```bash
export VISIVO_TELEMETRY_DISABLED=true
```

### 2. Project Configuration
Add to your project's `project.visivo.yml`:
```yaml
defaults:
  telemetry_enabled: false
```

### 3. Global Configuration
Create or edit `~/.visivo/config.yml`:
```yaml
telemetry_enabled: false
```

## Using Your Own PostHog Instance

If you want to use your own PostHog instance for telemetry collection:

```bash
export VISIVO_POSTHOG_HOST=https://your-posthog-instance.com
export VISIVO_POSTHOG_API_KEY=your-project-api-key
```

## Implementation Details

- Telemetry is sent asynchronously using the PostHog SDK
- Events are automatically batched and sent in the background
- If telemetry fails to send, it fails silently without affecting your work
- All telemetry operations respect PostHog's built-in timeouts and error handling
- The telemetry client runs in a separate thread

## CI/CD Environment Detection

Visivo automatically detects when it's running in CI/CD environments to help us understand usage patterns between development and automated workflows. The following CI/CD systems are detected:

- GitHub Actions
- GitLab CI
- CircleCI
- Jenkins
- Travis CI
- Azure DevOps
- AWS CodeBuild
- Bitbucket Pipelines
- Mint (rwx)
- Docker containers
- Kubernetes pods
- Any environment with `CI=true`

In CI/CD environments:
- Machine IDs are prefixed with "ci-" for easy identification
- Machine IDs are not persisted (regenerated each run)
- The `is_ci` property is set to `true` in all events

This helps us:
- Separate CI/CD usage from developer usage
- Understand adoption in automated workflows
- Avoid counting CI runs as unique users

## Open Source

The telemetry implementation is fully open source. You can review the code in the `visivo/telemetry/` directory to see exactly what data is collected and how it's sent.