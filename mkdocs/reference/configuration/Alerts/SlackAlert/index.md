You can configure slack alerts by setting up an incoming message slack webhook. Once you do that, the set up in Visivo is super simple:
``` yaml
alerts:
  - name: slack-destination #any name you choose
    type: slack
    webhook_url: {{ env_var("SLACK_WEBHOOK")}}
```
## Attributes
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | string | None | The unique name of the object across the entire project. |
| webhook_url | string | None | An incoming message slack webhook url. You can set one of those up by following <a href='https://api.slack.com/messaging/webhooks'>these instructions</a>. |
| type | string | None | The type of Alert Destination. Needs to be `slack` to configure a slack destination |
