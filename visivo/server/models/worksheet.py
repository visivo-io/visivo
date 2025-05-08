from .base import Base, Column, String, DateTime, relationship
import uuid
from datetime import datetime


class WorksheetModel(Base):
    __tablename__ = "worksheets"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    query = Column(String)
    selected_source = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_run_at = Column(DateTime)

    session_state = relationship(
        "SessionStateModel", back_populates="worksheet", uselist=False, cascade="all, delete-orphan"
    )
    results = relationship("ResultModel", back_populates="worksheet", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "query": self.query,
            "selected_source": self.selected_source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
        }
