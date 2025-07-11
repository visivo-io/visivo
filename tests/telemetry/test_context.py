"""
Tests for telemetry context.
"""

import os
import threading
import time

from visivo.telemetry.context import TelemetryContext, get_telemetry_context


class TestTelemetryContext:
    """Test telemetry context functionality."""

    def setup_method(self):
        """Disable telemetry and clear context for all tests."""
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"
        get_telemetry_context().clear()

    def test_set_and_get(self):
        """Test basic set and get operations."""
        context = TelemetryContext()

        context.set("key1", "value1")
        context.set("key2", 42)
        context.set("key3", {"nested": "dict"})

        assert context.get("key1") == "value1"
        assert context.get("key2") == 42
        assert context.get("key3") == {"nested": "dict"}

    def test_get_with_default(self):
        """Test get with default value."""
        context = TelemetryContext()

        assert context.get("nonexistent") is None
        assert context.get("nonexistent", "default") == "default"

    def test_update(self):
        """Test updating multiple values at once."""
        context = TelemetryContext()

        context.set("key1", "old_value")
        context.update({"key1": "new_value", "key2": "value2", "key3": "value3"})

        assert context.get("key1") == "new_value"
        assert context.get("key2") == "value2"
        assert context.get("key3") == "value3"

    def test_get_all(self):
        """Test getting all context data."""
        context = TelemetryContext()

        context.set("key1", "value1")
        context.set("key2", "value2")

        all_data = context.get_all()
        assert all_data == {"key1": "value1", "key2": "value2"}

        # Ensure it's a copy, not the original
        all_data["key3"] = "value3"
        assert context.get("key3") is None

    def test_clear(self):
        """Test clearing all context data."""
        context = TelemetryContext()

        context.set("key1", "value1")
        context.set("key2", "value2")
        assert len(context.get_all()) == 2

        context.clear()
        assert len(context.get_all()) == 0
        assert context.get("key1") is None

    def test_thread_safety(self):
        """Test that context is thread-safe."""
        context = TelemetryContext()
        results = []
        errors = []

        def writer_thread(thread_id):
            try:
                for i in range(100):
                    context.set(f"thread_{thread_id}_key_{i}", i)
                    time.sleep(0.0001)  # Small delay to increase contention
            except Exception as e:
                errors.append(e)

        def reader_thread():
            try:
                for _ in range(100):
                    all_data = context.get_all()
                    results.append(len(all_data))
                    time.sleep(0.0001)
            except Exception as e:
                errors.append(e)

        # Start multiple threads
        threads = []
        for i in range(3):
            t = threading.Thread(target=writer_thread, args=(i,))
            threads.append(t)
            t.start()

        reader = threading.Thread(target=reader_thread)
        threads.append(reader)
        reader.start()

        # Wait for all threads to complete
        for t in threads:
            t.join()

        # Check no errors occurred
        assert len(errors) == 0

        # Check all writes succeeded
        final_data = context.get_all()
        assert len(final_data) == 300  # 3 threads * 100 keys each

    def test_global_context_singleton(self):
        """Test that get_telemetry_context returns singleton."""
        context1 = get_telemetry_context()
        context2 = get_telemetry_context()

        assert context1 is context2

        # Test that changes are reflected in both references
        context1.set("test", "value")
        assert context2.get("test") == "value"

    def test_context_with_complex_data(self):
        """Test context with various data types."""
        context = TelemetryContext()

        # Test various data types
        context.set("string", "test string")
        context.set("int", 42)
        context.set("float", 3.14)
        context.set("bool", True)
        context.set("list", [1, 2, 3])
        context.set("dict", {"a": 1, "b": 2})
        context.set("none", None)

        # Verify all types are preserved
        assert context.get("string") == "test string"
        assert context.get("int") == 42
        assert context.get("float") == 3.14
        assert context.get("bool") is True
        assert context.get("list") == [1, 2, 3]
        assert context.get("dict") == {"a": 1, "b": 2}
        assert context.get("none") is None
