import pytest
import os
import tempfile
from sqlalchemy import create_engine
from visivo.server.models import Base

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