from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from visivo.server.models.worksheet import Base, WorksheetModel
from visivo.server.models.session_state import SessionStateModel
from visivo.server.models.query_cell import QueryCellModel
from visivo.server.models.cell_result import CellResultModel
from visivo.logger.logger import Logger
from datetime import datetime
import uuid
import json


class WorksheetRepository:
    def __init__(self, db_path: str):
        """Initialize the repository with a database path."""
        self.db_path = db_path
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(self.engine)
        session_factory = sessionmaker(bind=self.engine)
        self.Session = scoped_session(session_factory)

        # Validate schema and recreate if outdated
        self._validate_and_migrate_schema()

    def _validate_and_migrate_schema(self):
        """Validate database schema and recreate if outdated."""
        session = self.Session()
        try:
            # Try to query with selected_source and associated_model columns to validate schema
            session.query(QueryCellModel).first()
        except Exception as e:
            error_msg = str(e)
            if (
                "no such column: query_cells.selected_source" in error_msg
                or "no such column: query_cells.associated_model" in error_msg
            ):
                Logger.instance().info(
                    "Detected outdated database schema (missing query_cells columns). "
                    "Recreating database with new schema..."
                )
                session.close()
                # Drop all tables and recreate with new schema
                Base.metadata.drop_all(self.engine)
                Base.metadata.create_all(self.engine)
                Logger.instance().success("Database schema updated successfully")
            else:
                # Re-raise if it's a different error
                raise
        finally:
            # Ensure session is closed
            try:
                session.close()
            except:
                pass

    def create_worksheet(self, name: str):
        """Create a new worksheet with session state and initial empty cell."""
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
            worksheet = WorksheetModel(id=str(uuid.uuid4()), name=name)

            # Create session state
            worksheet.session_state = SessionStateModel(tab_order=next_order, is_visible=True)

            # Create initial empty cell
            initial_cell = QueryCellModel(
                id=str(uuid.uuid4()),
                worksheet_id=worksheet.id,
                query_text="",
                selected_source=None,
                associated_model=None,
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
        """Get a worksheet by ID."""
        session = self.Session()
        try:
            worksheet = session.query(WorksheetModel).filter_by(id=worksheet_id).first()
            if not worksheet:
                return None

            return {
                "worksheet": worksheet.to_dict(),
                "session_state": worksheet.session_state.to_dict(),
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

            # Handle cell reordering if cell_order is provided
            if "cell_order" in updates:
                cell_order = updates["cell_order"]
                for index, cell_id in enumerate(cell_order):
                    cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
                    if cell and cell.worksheet_id == worksheet_id:
                        cell.cell_order = index

            # Update other worksheet fields
            valid_fields = {"name"}
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

    # Cell CRUD Methods
    def create_cell(
        self,
        worksheet_id: str,
        query_text: str = "",
        cell_order: int = None,
        selected_source: str = None,
        associated_model: str = None,
    ) -> dict:
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
                selected_source=selected_source,
                associated_model=associated_model,
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

            # Log what we're reading
            Logger.instance().info(
                f"[get_cell] Reading cell {cell_id}: selected_source = {cell.selected_source}"
            )

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
            self.Session.remove()  # Properly remove session from scoped registry

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

            Logger.instance().info(
                f"[list_cells] Loading {len(cells)} cells for worksheet {worksheet_id}"
            )

            result = []
            for cell in cells:
                # Log cell details for debugging
                Logger.instance().info(
                    f"[list_cells] Cell {cell.id}: "
                    f"selected_source={cell.selected_source}, "
                    f"associated_model={cell.associated_model}"
                )

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
                Logger.instance().warning(f"[update_cell] Cell {cell_id} not found")
                return False

            # Log the updates being applied
            Logger.instance().info(f"[update_cell] Applying updates to cell {cell_id}: {updates}")

            valid_fields = {
                "query_text",
                "view_mode",
                "cell_order",
                "selected_source",
                "associated_model",
            }

            # Track which fields were actually updated
            updated_fields = {}
            for key, value in updates.items():
                if key in valid_fields:
                    old_value = getattr(cell, key)
                    setattr(cell, key, value)
                    updated_fields[key] = {"old": old_value, "new": value}

            Logger.instance().info(f"[update_cell] Fields updated: {updated_fields}")

            session.commit()
            session.flush()  # Ensure changes are written to DB
            session.expire_all()  # Clear all cached objects

            # Verify the update by reading back from database
            verification_cell = session.query(QueryCellModel).filter_by(id=cell_id).first()
            Logger.instance().info(
                f"[update_cell] Verification after commit - cell {cell_id}: "
                f"selected_source={verification_cell.selected_source}, "
                f"associated_model={verification_cell.associated_model}, "
                f"query_text_length={len(verification_cell.query_text) if verification_cell.query_text else 0}"
            )

            return True
        except Exception as e:
            Logger.instance().error(f"[update_cell] Error updating cell {cell_id}: {str(e)}")
            session.rollback()
            raise
        finally:
            self.Session.remove()  # Properly remove session from scoped registry

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
