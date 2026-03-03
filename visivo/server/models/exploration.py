from visivo.server.models.base import Base, Column, String, Integer, Boolean, DateTime
from datetime import datetime


class ExplorationModel(Base):
    __tablename__ = "explorations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="Untitled")
    source_name = Column(String, nullable=True)
    sql = Column(String, default="")
    insight_config_json = Column(String, nullable=True)
    left_panel_tab = Column(String, default="sources")
    active_result_tab = Column(String, default="data")
    is_editor_collapsed = Column(Boolean, default=False)
    tab_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        import json

        return {
            "id": self.id,
            "name": self.name,
            "source_name": self.source_name,
            "sql": self.sql,
            "insight_config": (
                json.loads(self.insight_config_json) if self.insight_config_json else None
            ),
            "left_panel_tab": self.left_panel_tab,
            "active_result_tab": self.active_result_tab,
            "is_editor_collapsed": self.is_editor_collapsed,
            "tab_order": self.tab_order,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
