from visivo.server.models.base import (
    Base,
    Column,
    String,
    Integer,
    Boolean,
    ForeignKey,
    relationship,
)


class SessionStateModel(Base):
    __tablename__ = "session_state"

    worksheet_id = Column(String, ForeignKey("worksheets.id", ondelete="CASCADE"), primary_key=True)
    tab_order = Column(Integer, nullable=False)
    is_visible = Column(Boolean, default=True)

    worksheet = relationship("WorksheetModel", back_populates="session_state")

    def to_dict(self):
        return {
            "worksheet_id": self.worksheet_id,
            "tab_order": self.tab_order,
            "is_visible": self.is_visible,
        }
