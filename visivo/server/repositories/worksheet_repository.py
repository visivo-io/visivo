from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from visivo.server.models.worksheet import Base, WorksheetModel
from visivo.server.models.session_state import SessionStateModel
from visivo.server.models.result import ResultModel
from datetime import datetime
import uuid


class WorksheetRepository:
    def __init__(self, db_path: str):
        """Initialize the repository with a database path."""
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(self.engine)
        session_factory = sessionmaker(bind=self.engine)
        self.Session = scoped_session(session_factory)

    def create_worksheet(self, name: str, query: str = "", selected_source: str = None):
        """Create a new worksheet with session state."""
        session = self.Session()
        try:
            # Get max tab order
            max_order = (
                session.query(SessionStateModel.tab_order)
                .order_by(SessionStateModel.tab_order.desc())
                .first()
            )
            next_order = (max_order[0] if max_order else 0) + 1

            # Create worksheet
            worksheet = WorksheetModel(
                id=str(uuid.uuid4()), name=name, query=query, selected_source=selected_source
            )

            # Create session state
            worksheet.session_state = SessionStateModel(tab_order=next_order, is_visible=True)

            session.add(worksheet)
            session.commit()
            return {
                "worksheet": worksheet.to_dict(),
                "session_state": worksheet.session_state.to_dict(),
            }
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def get_worksheet(self, worksheet_id: str):
        """Get a worksheet by ID with its latest result."""
        session = self.Session()
        try:
            worksheet = session.query(WorksheetModel).filter_by(id=worksheet_id).first()
            if not worksheet:
                return None

            latest_result = (
                session.query(ResultModel)
                .filter_by(worksheet_id=worksheet_id)
                .order_by(ResultModel.created_at.desc())
                .first()
            )

            return {
                "worksheet": worksheet.to_dict(),
                "session_state": worksheet.session_state.to_dict(),
                "results": latest_result.to_dict() if latest_result else None,
            }
        finally:
            session.close()

    def list_worksheets(self):
        """List all worksheets ordered by tab order."""
        session = self.Session()
        try:
            worksheets = (
                session.query(WorksheetModel)
                .join(SessionStateModel)
                .order_by(SessionStateModel.tab_order)
                .all()
            )
            return [
                {"worksheet": w.to_dict(), "session_state": w.session_state.to_dict()}
                for w in worksheets
            ]
        finally:
            session.close()

    def update_worksheet(self, worksheet_id: str, updates: dict):
        """Update a worksheet's attributes."""
        session = self.Session()
        try:
            worksheet = session.query(WorksheetModel).filter_by(id=worksheet_id).first()
            if not worksheet:
                return False

            valid_fields = {"name", "query", "selected_source"}
            for key, value in updates.items():
                if key in valid_fields:
                    setattr(worksheet, key, value)

            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def update_session_states(self, states: list):
        """Update multiple session states in a transaction."""
        session = self.Session()
        try:
            for state in states:
                session_state = (
                    session.query(SessionStateModel)
                    .filter_by(worksheet_id=state["worksheet_id"])
                    .first()
                )
                if session_state:
                    session_state.tab_order = state["tab_order"]
                    session_state.is_visible = state["is_visible"]
            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def save_results(self, worksheet_id: str, results_json: str, query_stats_json: str):
        """Save query results for a worksheet."""
        session = self.Session()
        try:
            worksheet = session.query(WorksheetModel).filter_by(id=worksheet_id).first()
            if not worksheet:
                return False

            worksheet.last_run_at = datetime.utcnow()
            result = ResultModel(
                worksheet=worksheet, results_json=results_json, query_stats_json=query_stats_json
            )
            session.add(result)
            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def delete_worksheet(self, worksheet_id: str):
        """Delete a worksheet and its associated data."""
        session = self.Session()
        try:
            worksheet = session.query(WorksheetModel).filter_by(id=worksheet_id).first()
            if not worksheet:
                return False
            session.delete(worksheet)
            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()
