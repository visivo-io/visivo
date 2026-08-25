"""Every CLI command must carry real help text.

`visivo --help` and the generated docs page (mkdocs-click renders the same
Click metadata) both showed blank descriptions for `serve` and `aggregate`
in the 2.1 field test (§8 "Actively wrong"). Click derives short_help from
the command docstring, so an undocumented command is blank in both places.
"""

from visivo.command_line import visivo


def test_every_command_has_help_text():
    missing = [
        name
        for name, command in sorted(visivo.commands.items())
        if not (command.help or command.short_help)
    ]
    assert missing == [], f"Commands with blank --help descriptions: {missing}"


def test_every_command_option_has_help_text():
    """Options without help render as bare flags a newcomer can't interpret."""
    missing = []
    for name, command in sorted(visivo.commands.items()):
        for param in command.params:
            if param.param_type_name != "option":
                continue
            if param.name == "help":
                continue
            if not param.help:
                missing.append(f"{name} --{param.name}")
    assert missing == [], f"Options with blank help: {missing}"
