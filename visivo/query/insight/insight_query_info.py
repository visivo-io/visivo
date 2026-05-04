class InsightQueryInfo:
    def __init__(
        self,
        pre_query=None,
        post_query=None,
        props_mapping=None,
        split_key=None,
        static_props=None,
        props_slices=None,
    ):
        self.pre_query = pre_query
        self.post_query = post_query
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
