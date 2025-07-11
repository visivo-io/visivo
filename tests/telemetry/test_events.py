"""
Tests for telemetry event definitions.
"""

import os
from unittest import mock
from datetime import datetime

from visivo.telemetry.events import CLIEvent, APIEvent, SESSION_ID
from visivo.version import VISIVO_VERSION


class TestTelemetryEvents:
    """Test telemetry event creation."""
    
    def setup_method(self):
        """Disable telemetry for all tests."""
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"
    
    def test_cli_event_basic(self):
        """Test basic CLI event creation."""
        event = CLIEvent.create(
            command="run",
            duration_ms=1234,
            success=True
        )
        
        assert event.event_type == "cli_command"
        assert event.session_id == SESSION_ID
        assert isinstance(event.timestamp, str)
        assert event.timestamp.endswith("Z")
        
        # Check properties
        assert event.properties["command"] == "run"
        assert event.properties["duration_ms"] == 1234
        assert event.properties["success"] is True
        assert event.properties["visivo_version"] == VISIVO_VERSION
        assert "python_version" in event.properties
        assert "platform" in event.properties
        assert "error_type" not in event.properties
        assert "job_count" not in event.properties
        assert "object_counts" not in event.properties
    
    def test_cli_event_with_error(self):
        """Test CLI event with error information."""
        event = CLIEvent.create(
            command="compile",
            duration_ms=500,
            success=False,
            error_type="ValidationError"
        )
        
        assert event.properties["command"] == "compile"
        assert event.properties["success"] is False
        assert event.properties["error_type"] == "ValidationError"
    
    def test_cli_event_with_job_count(self):
        """Test CLI event with job count."""
        event = CLIEvent.create(
            command="run",
            duration_ms=5000,
            success=True,
            job_count=10
        )
        
        assert event.properties["job_count"] == 10
    
    def test_cli_event_with_object_counts(self):
        """Test CLI event with object counts."""
        object_counts = {
            "sources": 2,
            "models": 5,
            "charts": 3,
            "dashboards": 1
        }
        
        event = CLIEvent.create(
            command="compile",
            duration_ms=2000,
            success=True,
            object_counts=object_counts
        )
        
        assert event.properties["object_counts"] == object_counts
    
    def test_cli_event_to_dict(self):
        """Test CLI event serialization to dictionary."""
        event = CLIEvent.create(
            command="serve",
            duration_ms=100,
            success=True
        )
        
        event_dict = event.to_dict()
        assert isinstance(event_dict, dict)
        assert event_dict["event_type"] == "cli_command"
        assert event_dict["session_id"] == SESSION_ID
        assert "timestamp" in event_dict
        assert "properties" in event_dict
    
    def test_api_event_basic(self):
        """Test basic API event creation."""
        event = APIEvent.create(
            endpoint="/api/query/{project_id}",
            method="POST",
            status_code=200,
            duration_ms=150
        )
        
        assert event.event_type == "api_request"
        assert event.session_id == SESSION_ID
        assert isinstance(event.timestamp, str)
        assert event.timestamp.endswith("Z")
        
        # Check properties
        assert event.properties["endpoint"] == "/api/query/{project_id}"
        assert event.properties["method"] == "POST"
        assert event.properties["status_code"] == 200
        assert event.properties["duration_ms"] == 150
        assert event.properties["visivo_version"] == VISIVO_VERSION
        assert "python_version" in event.properties
        assert "platform" in event.properties
    
    def test_api_event_error_status(self):
        """Test API event with error status code."""
        event = APIEvent.create(
            endpoint="/api/worksheet/{id}",
            method="GET",
            status_code=404,
            duration_ms=50
        )
        
        assert event.properties["status_code"] == 404
    
    def test_api_event_to_dict(self):
        """Test API event serialization to dictionary."""
        event = APIEvent.create(
            endpoint="/data/project.json",
            method="GET",
            status_code=200,
            duration_ms=25
        )
        
        event_dict = event.to_dict()
        assert isinstance(event_dict, dict)
        assert event_dict["event_type"] == "api_request"
        assert event_dict["session_id"] == SESSION_ID
        assert "timestamp" in event_dict
        assert "properties" in event_dict
    
    def test_session_id_format(self):
        """Test that session ID is a valid UUID format."""
        import uuid
        # This should not raise an exception
        uuid.UUID(SESSION_ID)
    
    def test_timestamp_format(self):
        """Test that timestamps are in ISO format with Z suffix."""
        cli_event = CLIEvent.create("test", 100, True)
        api_event = APIEvent.create("/test", "GET", 200, 50)
        
        # Test that timestamps can be parsed
        cli_time = datetime.fromisoformat(cli_event.timestamp.replace("Z", "+00:00"))
        api_time = datetime.fromisoformat(api_event.timestamp.replace("Z", "+00:00"))
        
        assert isinstance(cli_time, datetime)
        assert isinstance(api_time, datetime)