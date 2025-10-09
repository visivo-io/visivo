from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from visivo.server.models.worksheet import Base, WorksheetModel
from visivo.server.models.session_state import SessionStateModel
from visivo.server.models.result import ResultModel
from visivo.server.models.query_cell import QueryCellModel
from visivo.server.models.cell_result import CellResultModel
from datetime import datetime
from visivo.utils import get_utc_now
import uuid
import json


class WorksheetRepository:
    def __init__(self, db_path: str):
        """Initialize the repository with a database path."""
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(self.engine)
        session_factory = sessionmaker(bind=self.engine)
        self.Session = scoped_session(session_factory)
        # Run migrations on initialization
        self.migrate_existing_worksheets()

    def create_worksheet(self, name: str, query: str = "", selected_source: str = None):
        """Create a new worksheet with session state and initial cell."""
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

            # Create initial cell with the query
            initial_cell = QueryCellModel(
                id=str(uuid.uuid4()),
                worksheet_id=worksheet.id,
                query_text=query,
                cell_order=0,
                view_mode="table",
            )

            session.add(worksheet)
            session.add(initial_cell)
            session.commit()

            return {
                "worksheet": worksheet.to_dict(),
                "session_state": worksheet.session_state.to_dict(),
                "cells": [initial_cell.to_dict()],
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

            worksheet.last_run_at = get_utc_now()
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

    def migrate_existing_worksheets(self):
        """Migrate existing worksheets to use cells if they don't already have them."""
        session = self.Session()
        try:
            worksheets = session.query(WorksheetModel).all()
            for worksheet in worksheets:
                # Count cells for this worksheet
                cell_count = (
                    session.query(QueryCellModel)
                    .filter_by(worksheet_id=worksheet.id)
                    .count()
                )
                # Check if worksheet has no cells but has a query
                if cell_count == 0 and worksheet.query:
                    # Create a cell with the existing query
                    cell = QueryCellModel(
                        id=str(uuid.uuid4()),
                        worksheet_id=worksheet.id,
                        query_text=worksheet.query,
                        cell_order=0,
                        view_mode="table",
                    )
                    session.add(cell)
            session.commit()
        except:
            session.rollback()
            raise
        finally:
            session.close()

    # Cell CRUD Methods
    def create_cell(self, worksheet_id: str, query_text: str = "", cell_order: int = None) -> dict:
        """Create a new query cell for a worksheet."""
        session = self.Session()
        try:
            worksheet = session.query(WorksheetModel).filter_by(id=worksheet_id).first()
            if not worksheet:
                return None

            # If no order specified, append to end
            if cell_order is None:
                max_order = (
                    session.query(QueryCellModel.cell_order)
                    .filter_by(worksheet_id=worksheet_id)
                    .order_by(QueryCellModel.cell_order.desc())
                    .first()
                )
                cell_order = (max_order[0] if max_order else -1) + 1

            cell = QueryCellModel(
                id=str(uuid.uuid4()),
                worksheet_id=worksheet_id,
                query_text=query_text,
                cell_order=cell_order,
                view_mode="table",
            )

            session.add(cell)
            session.commit()
            return cell.to_dict()
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def get_cell(self, cell_id: str):
        """Get a specific query cell with its latest result."""
        session = self.Session()
        try:
            cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
            if not cell:
                return None

            latest_result = (
                session.query(CellResultModel)
                .filter_by(cell_id=cell_id)
                .order_by(CellResultModel.created_at.desc())
                .first()
            )

            return {
                "cell": cell.to_dict(),
                "result": latest_result.to_dict() if latest_result else None,
            }
        finally:
            session.close()

    def list_cells(self, worksheet_id: str):
        """List all cells for a worksheet, ordered by cell_order."""
        session = self.Session()
        try:
            cells = (
                session.query(QueryCellModel)
                .filter_by(worksheet_id=worksheet_id)
                .order_by(QueryCellModel.cell_order)
                .all()
            )

            result = []
            for cell in cells:
                latest_result = (
                    session.query(CellResultModel)
                    .filter_by(cell_id=cell.id)
                    .order_by(CellResultModel.created_at.desc())
                    .first()
                )
                result.append(
                    {
                        "cell": cell.to_dict(),
                        "result": latest_result.to_dict() if latest_result else None,
                    }
                )

            return result
        finally:
            session.close()

    def update_cell(self, cell_id: str, updates: dict):
        """Update a query cell's attributes."""
        session = self.Session()
        try:
            cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
            if not cell:
                return False

            valid_fields = {"query_text", "view_mode", "cell_order"}
            for key, value in updates.items():
                if key in valid_fields:
                    setattr(cell, key, value)

            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def delete_cell(self, cell_id: str):
        """Delete a query cell and reorder remaining cells."""
        session = self.Session()
        try:
            cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
            if not cell:
                return False

            worksheet_id = cell.worksheet_id
            deleted_order = cell.cell_order

            session.delete(cell)

            # Reorder cells after the deleted one
            cells_to_reorder = (
                session.query(QueryCellModel)
                .filter_by(worksheet_id=worksheet_id)
                .filter(QueryCellModel.cell_order > deleted_order)
                .all()
            )

            for c in cells_to_reorder:
                c.cell_order -= 1

            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def reorder_cells(self, worksheet_id: str, cell_order: list):
        """Reorder cells based on new order list of cell IDs."""
        session = self.Session()
        try:
            for index, cell_id in enumerate(cell_order):
                cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
                if cell and cell.worksheet_id == worksheet_id:
                    cell.cell_order = index

            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def save_cell_result(
        self, cell_id: str, results_json: str, query_stats_json: str, is_truncated: bool = False
    ):
        """Save query results for a specific cell."""
        session = self.Session()
        try:
            cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
            if not cell:
                return False

            result = CellResultModel(
                cell=cell,
                results_json=results_json,
                query_stats_json=query_stats_json,
                is_truncated=is_truncated,
            )
            session.add(result)
            session.commit()
            return True
        except:
            session.rollback()
            raise
        finally:
            session.close()
