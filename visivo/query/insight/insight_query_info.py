class InsightQueryInfo:
    def __init__(self, pre_query=None, post_query=None, props_mapping=None):
        self.pre_query = pre_query
        self.post_query = post_query
        self.props_mapping = props_mapping if props_mapping is not None else {}
