from visivo.server.models.base import (
    Base,
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    relationship,
)
from datetime import datetime


class CellResultModel(Base):
    __tablename__ = "cell_results"

    id = Column(Integer, primary_key=True)
    cell_id = Column(String, ForeignKey("query_cells.id", ondelete="CASCADE"))
    results_json = Column(String)
    query_stats_json = Column(String)
    is_truncated = Column(Boolean, default=False)  # Flag for 100k row limit
    created_at = Column(DateTime, default=datetime.utcnow)

    cell = relationship("QueryCellModel", back_populates="results")

    def to_dict(self):
        return {
            "id": self.id,
            "cell_id": self.cell_id,
            "results_json": self.results_json,
            "query_stats_json": self.query_stats_json,
            "is_truncated": self.is_truncated,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
