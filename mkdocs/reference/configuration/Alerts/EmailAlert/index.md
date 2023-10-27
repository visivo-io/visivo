You can configure email alert destinations for any SMTP provider. Here's an example of this configuration looks in your yaml file:
``` yaml
alerts:
  - name: email-destination #any unique name of your choosing
    type: email
    subject: "[ALERT] Your Visivo Tests Have Failed" #can be any message you want
    to: someone@your_company.com
    port: 2525 #is this port by default
    host: your_company_email_server.com
    username: someones_username
    password: {{ env_var('EMAIL_PASSWORD')}} #We'd recommend using environment variables here for security

```
## Attributes
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | string | None | The unique name of the object across the entire project. |
| type | string | None | The type of alert destination. |
| subject | string | Visivo Alert | Subject of the alert email. |
| to | string | None | The email to send the alert to. |
| port | integer | 2525 | The port of the email server that the destination is connecting to. |
| host | string | None | The host of the email server that the destination is connecting to. |
| username | string | None | The username for authenticating the email server. |
| password | string | None | The password for authenticating the email server. |
