class InsightQueryInfo:
    def __init__(
        self,
        pre_query=None,
        post_query=None,
        props_mapping=None,
        split_key=None,
        static_props=None,
        props_slices=None,
        requires_full_source=False,
    ):
        self.pre_query = pre_query
        self.post_query = post_query
        # Explore 2.0 state fix, Phase 3 — classification for the draft preview
        # lane. True iff the insight's query is NOT a pure row-level projection
        # of its model(s): it aggregates, uses a window, splits, or spans
        # multiple models (relation join). A projection can be previewed
        # instantly client-side over the fetched sample rows; an aggregate must
        # execute against the FULL source to be correct (a SUM over a 1,000-row
        # preview sample is not the real total). Computed in
        # InsightQueryBuilder.build() and dialect-independent, so the draft
        # compile (force_dynamic=True) yields it with no extra work.
        self.requires_full_source = requires_full_source
        self.props_mapping = props_mapping if props_mapping is not None else {}
        self.split_key = (
            split_key  # Column alias for split values (for frontend to create multiple traces)
        )
        self.static_props = (
            static_props if static_props is not None else {}
        )  # Non-query props (e.g., marker.color: ["red", "green"])
        # Mapping of prop path -> literal slice suffix ("[0]", "[1:5]", ...)
        # for any prop whose ?{...} value carries a slicing suffix. The
        # viewer applies the slice when binding props_mapping data.
        self.props_slices = props_slices if props_slices is not None else {}
