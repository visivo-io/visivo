"""``families.json``: the family taxonomy as the viewer's Type dropdown
wants it (VIS-1425) — one object per family with its trace types and their
one-liners, derived from the trace entries so it cannot drift from them.

``python -m visivo.agent.charting.families_export`` rewrites the file; a
test asserts the committed copy equals the rendered one.
"""

import json
import sys
from pathlib import Path

from visivo.agent.charting.rules import load_traces
from visivo.agent.charting.schema import FAMILIES

FAMILIES_JSON = Path(__file__).parent / "families.json"


def render(entries=None):
    entries = load_traces() if entries is None else entries
    families = []
    for family in FAMILIES:
        members = [e for e in entries if family in e.families()]
        if not members:
            continue
        families.append(
            {
                "name": family,
                "trace_types": [e.type for e in members],
                "types": [
                    {
                        "type": e.type,
                        "one_liner": e.one_liner,
                        "status": e.status,
                        "tier": e.tier,
                    }
                    for e in members
                ],
            }
        )
    return {"families": families}


def dumps(entries=None):
    return json.dumps(render(entries), indent=2, ensure_ascii=False) + "\n"


def main(argv=None, out=sys.stdout):
    FAMILIES_JSON.write_text(dumps())
    out.write(f"wrote {FAMILIES_JSON}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
