# Telemetry in Visivo

Visivo collects anonymous usage telemetry to help us understand how the tool is being used and improve it over time. This telemetry is privacy-focused and does not collect any personal information, file contents, queries, or sensitive data.

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

### API Requests
- Endpoint path (with IDs replaced by placeholders)
- HTTP method
- Response status code
- Request duration

### Common Metadata
- Visivo version
- Python version
- Operating system (e.g., darwin, linux, windows)
- Operating system version
- System architecture (e.g., x86_64, arm64)
- Anonymous session ID (regenerated each time Visivo starts)

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
- Personal information or user identifiers
- File contents or file paths (actual paths are replaced with `<path>`)
- SQL queries or query results
- Project names or data
- Environment variables (except telemetry settings)
- IP addresses or location data
- Error messages or stack traces
- Actual values of command arguments (replaced with placeholders)

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

## Implementation Details

- Telemetry is sent asynchronously and will not impact performance
- Events are batched and sent in the background
- If telemetry fails to send, it fails silently without affecting your work
- All telemetry operations have a 1-second timeout
- The telemetry client runs in a separate thread

## Open Source

The telemetry implementation is fully open source. You can review the code in the `visivo/telemetry/` directory to see exactly what data is collected and how it's sent.