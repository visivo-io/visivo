"""``python -m visivo.agent.charting.report``: the trace entries by author
and review state (VIS-1419).

The research split is Fable for the core tier and Opus subagents for the
extended tier, with Jared as the reviewer of record for core. This table is
how a reviewer sees what is still pending without opening 48 files, and what
the approval test reads when the package ships.
"""

import sys
from collections import Counter

from visivo.agent.charting.rules import load_traces

COLUMNS = ("type", "family", "tier", "status", "author", "review", "confidence")


def rows(entries):
    for entry in entries:
        yield (
            entry.type,
            entry.family,
            entry.tier,
            entry.status,
            entry.author,
            entry.review.state + (f" by {entry.review.by}" if entry.review.by else ""),
            "" if entry.confidence is None else f"{entry.confidence:.2f}",
        )


def render(entries):
    table = [COLUMNS, *rows(entries)]
    widths = [max(len(str(row[i])) for row in table) for i in range(len(COLUMNS))]
    lines = ["  ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row)) for row in table]
    lines.insert(1, "  ".join("-" * w for w in widths))
    by_author = Counter(e.author for e in entries)
    by_state = Counter((e.tier, e.review.state) for e in entries)
    lines.append("")
    lines.append(f"{len(entries)} entries")
    lines.append(
        "by author: "
        + ", ".join(f"{author} {count}" for author, count in sorted(by_author.items()))
    )
    lines.append(
        "by review: "
        + ", ".join(f"{tier} {state} {count}" for (tier, state), count in sorted(by_state.items()))
    )
    return "\n".join(lines)


def main(argv=None, out=sys.stdout):
    out.write(render(load_traces()) + "\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
