from visivo.server.models.base import (
    Base,
    Column,
    String,
    Integer,
    DateTime,
    ForeignKey,
    relationship,
)
from datetime import datetime


class ResultModel(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True)
    worksheet_id = Column(String, ForeignKey("worksheets.id", ondelete="CASCADE"))
    results_json = Column(String)
    query_stats_json = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    worksheet = relationship("WorksheetModel", back_populates="results")

    def to_dict(self):
        return {
            "results_json": self.results_json,
            "query_stats_json": self.query_stats_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
