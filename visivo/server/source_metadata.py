from visivo.models.sources.sqlalchemy_source import SqlalchemySource


def gather_source_metadata(sources):
    """Return metadata for all provided sources."""
    data = {"sources": []}
    for src in sources:
        if isinstance(src, SqlalchemySource):
            try:
                data["sources"].append(src.introspect())
            except Exception:
                continue
    return data
