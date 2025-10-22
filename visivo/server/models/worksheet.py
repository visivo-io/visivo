from visivo.server.models.base import Base, Column, String, DateTime, relationship
from datetime import datetime


class WorksheetModel(Base):
    __tablename__ = "worksheets"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session_state = relationship(
        "SessionStateModel", back_populates="worksheet", uselist=False, cascade="all, delete-orphan"
    )
    cells = relationship(
        "QueryCellModel",
        back_populates="worksheet",
        cascade="all, delete-orphan",
        order_by="QueryCellModel.cell_order",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
