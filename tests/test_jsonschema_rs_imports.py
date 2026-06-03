"""Guards against jsonschema_rs version drift inside a packaged bundle.

The v2.0.2 release shipped a PyInstaller bundle that merged three different
jsonschema_rs `.so` files into `_internal/jsonschema_rs/`. Python 3.13 picked
the oldest one (which predated `EmailOptions`), but the bundled `__init__.py`
came from the newer 0.46.4 wheel and tried to import it — crashing every
`visivo init` on first run.

A unit-level guard can't catch a bundling regression on its own (the RWX
`binary-init-smoke` task does that against `dist/visivo/visivo`), but pinning
the import surface here means a future jsonschema_rs upgrade that drops a
symbol visivo relies on fails fast in `pytest` instead of in the customer's
terminal.
"""


def test_jsonschema_rs_exports_used_by_visivo():
    from jsonschema_rs import ValidationError, validator_for  # noqa: F401
    from jsonschema_rs import meta  # noqa: F401


def test_jsonschema_rs_email_options_present():
    # The exact symbol whose absence shipped broken in v2.0.2.
    from jsonschema_rs import EmailOptions  # noqa: F401
