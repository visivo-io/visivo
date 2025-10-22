import pytest
import os
import tempfile
from sqlalchemy import create_engine
from visivo.server.models.base import Base


@pytest.fixture(scope="function")
def db_path():
    """Create a temporary database file for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = os.path.join(temp_dir, "test.db")
        # Create engine and tables
        engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(engine)
        yield db_path
        # Clean up
        if os.path.exists(db_path):
            os.remove(db_path)


@pytest.fixture(scope="function")
def empty_db_path():
    """Create an empty temporary database file for testing (no tables created)."""
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = os.path.join(temp_dir, "test.db")
        # Don't create tables - just provide the path
        yield db_path
        # Clean up
        if os.path.exists(db_path):
            os.remove(db_path)
