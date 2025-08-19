from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class TokenizedInsight(BaseModel):
    """
    Represents a tokenized insight with separated server-side (pre) and client-side (post) queries.
    This is the output of the InsightTokenizer and contains all the information needed to
    generate insight data and enable client-side interactivity.
    """

    # Basic metadata
    name: str
    source: str
    source_type: str
    description: Optional[str] = None

    # Server-side query (executed on backend database)
    pre_query: str

    # Client-side query template (executed in DuckDB WASM)
    post_query: str

    # Data structure mapping
    select_items: Dict[
        str, str
    ]  # prop_path -> sql_expression (e.g. "props.x" -> "date_trunc('month', created_at)")
    column_items: Dict[
        str, str
    ]  # column_name -> sql_expression (e.g. "columns.region" -> "region")

    # Interaction metadata for client-side execution
    interactions: List[Dict[str, Any]]  # List of interaction definitions
    input_dependencies: List[str]  # List of input names this insight depends on

    # SQL execution metadata
    requires_groupby: bool = False
    groupby_statements: Optional[List[str]] = None

    # Additional metadata for client processing
    split_column: Optional[str] = None  # Column used for splitting data into multiple traces
    sort_expressions: Optional[List[str]] = None  # Sort expressions for client-side ordering
