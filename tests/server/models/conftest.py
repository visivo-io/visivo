import pytest
import os
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from visivo.server.models import Base

@pytest.fixture(scope="function")
def db_path():
    """Create a temporary database file for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = os.path.join(temp_dir, "test.db")
        yield db_path

@pytest.fixture(scope="function")
def engine(db_path):
    """Create a SQLAlchemy engine for testing."""
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)

@pytest.fixture(scope="function")
def session(engine):
    """Create a new database session for testing."""
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close() 