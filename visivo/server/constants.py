import os

DEFAULT_VISIVO_HOST = "https://app.visivo.io"


def resolve_host(explicit=None):
    """Which Visivo deployment this process talks to.

    One answer for everything that reaches cloud — the token to look for, where
    deploys go, where the agent's inference goes — because they are the same
    session. There used to be a second, agent-only host, and the two could
    silently disagree about which deployment you were on.

    Narrowest wins: what the caller was told (`visivo serve --host`), then the
    environment, then the default.
    """
    return (explicit or os.environ.get("VISIVO_HOST") or DEFAULT_VISIVO_HOST).rstrip("/")


# The process-wide default, for callers with no app to ask — `visivo authorize`
# most of all, which must land on the same deployment `serve` will look for a
# token on. Anything running inside a serve should read `app.host` instead,
# since that one can have been overridden by the flag.
VISIVO_HOST = resolve_host()
