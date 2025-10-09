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


class QueryCellModel(Base):
    __tablename__ = "query_cells"

    id = Column(String, primary_key=True)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False)
    query_text = Column(String, default="")
    cell_order = Column(Integer, nullable=False)
    view_mode = Column(String, default="table")  # 'table' or 'dimension_pills'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    worksheet = relationship("WorksheetModel", back_populates="cells")
    results = relationship("CellResultModel", back_populates="cell", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "worksheet_id": self.worksheet_id,
            "query_text": self.query_text,
            "cell_order": self.cell_order,
            "view_mode": self.view_mode,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
