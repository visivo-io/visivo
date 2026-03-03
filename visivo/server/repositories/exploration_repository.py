from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, scoped_session
from visivo.server.models.exploration import ExplorationModel
from visivo.server.models.base import Base
from datetime import datetime
import uuid
import json


class ExplorationRepository:
    EXPECTED_COLUMNS = {
        "id",
        "name",
        "source_name",
        "sql",
        "insight_config_json",
        "left_panel_tab",
        "active_result_tab",
        "is_editor_collapsed",
        "tab_order",
        "is_active",
        "created_at",
        "updated_at",
    }

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(self.engine)
        session_factory = sessionmaker(bind=self.engine)
        self.Session = scoped_session(session_factory)
        self._validate_and_migrate_schema()

    def _validate_and_migrate_schema(self):
        inspector = inspect(self.engine)
        if "explorations" not in inspector.get_table_names():
            return

        existing_columns = {col["name"] for col in inspector.get_columns("explorations")}
        if existing_columns != self.EXPECTED_COLUMNS:
            Base.metadata.drop_all(self.engine)
            Base.metadata.create_all(self.engine)

    def create_exploration(self, name: str = "Untitled"):
        session = self.Session()
        try:
            max_order = (
                session.query(ExplorationModel.tab_order)
                .order_by(ExplorationModel.tab_order.desc())
                .first()
            )
            next_order = (max_order[0] if max_order else 0) + 1

            exploration = ExplorationModel(
                id=str(uuid.uuid4()),
                name=name,
                tab_order=next_order,
            )
            session.add(exploration)
            session.commit()
            return exploration.to_dict()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def list_explorations(self):
        session = self.Session()
        try:
            explorations = (
                session.query(ExplorationModel).order_by(ExplorationModel.tab_order).all()
            )
            return [e.to_dict() for e in explorations]
        finally:
            session.close()

    def get_exploration(self, exploration_id: str):
        session = self.Session()
        try:
            exploration = session.query(ExplorationModel).filter_by(id=exploration_id).first()
            if not exploration:
                return None
            return exploration.to_dict()
        finally:
            session.close()

    def update_exploration(self, exploration_id: str, updates: dict):
        session = self.Session()
        try:
            exploration = session.query(ExplorationModel).filter_by(id=exploration_id).first()
            if not exploration:
                return None

            for key, value in updates.items():
                if key == "insight_config":
                    exploration.insight_config_json = json.dumps(value) if value else None
                elif hasattr(exploration, key):
                    setattr(exploration, key, value)

            exploration.updated_at = datetime.utcnow()
            session.commit()
            return exploration.to_dict()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def delete_exploration(self, exploration_id: str):
        session = self.Session()
        try:
            exploration = session.query(ExplorationModel).filter_by(id=exploration_id).first()
            if not exploration:
                return False
            session.delete(exploration)
            session.commit()
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
