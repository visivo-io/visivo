import logging
import re

_TOKEN_PARAM = re.compile(r"([?&]token=)[^&\s\"]+")
REDACTED = "[redacted]"


def redact_token(text: str) -> str:
    return _TOKEN_PARAM.sub(rf"\g<1>{REDACTED}", text)


class TokenRedactingFilter(logging.Filter):
    """Removes the `token` query value from request log lines.

    The device callback receives the API token as `?token=...`, and werkzeug
    writes each request line, query string included, to its logger.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        redacted = redact_token(message)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def install_request_log_redaction(logger_name: str = "werkzeug") -> None:
    logger = logging.getLogger(logger_name)
    if not any(isinstance(f, TokenRedactingFilter) for f in logger.filters):
        logger.addFilter(TokenRedactingFilter())
