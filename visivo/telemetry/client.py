"""
Telemetry client for sending events asynchronously with batching.
"""

import json
import threading
import time
import urllib.request
import urllib.error
from queue import Queue, Empty
from typing import List, Optional
from .config import TELEMETRY_ENDPOINT, TELEMETRY_TIMEOUT
from .events import BaseEvent


class TelemetryClient:
    """
    Async telemetry client with batching support.
    
    This client collects events in a queue and sends them in batches
    to minimize performance impact.
    """
    
    def __init__(self, enabled: bool = True):
        """
        Initialize the telemetry client.
        
        Args:
            enabled: Whether telemetry is enabled
        """
        self.enabled = enabled
        self._event_queue: Queue = Queue()
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        
        if self.enabled:
            self._start_worker()
    
    def _start_worker(self):
        """Start the background worker thread for sending events."""
        self._worker_thread = threading.Thread(
            target=self._worker_loop,
            daemon=True,  # Don't block program exit
            name="telemetry-worker"
        )
        self._worker_thread.start()
    
    def _worker_loop(self):
        """Background worker that sends events in batches."""
        batch: List[dict] = []
        last_send_time = time.time()
        
        while not self._stop_event.is_set():
            try:
                # Wait for events with a timeout
                event = self._event_queue.get(timeout=0.1)
                batch.append(event)
                
                # Send batch if it's full or enough time has passed
                current_time = time.time()
                if len(batch) >= 100 or (current_time - last_send_time) >= 10:
                    self._send_batch(batch)
                    batch = []
                    last_send_time = current_time
                    
            except Empty:
                # No events in queue, check if we need to send partial batch
                if batch and (time.time() - last_send_time) >= 10:
                    self._send_batch(batch)
                    batch = []
                    last_send_time = time.time()
        
        # Send any remaining events before shutting down
        if batch:
            self._send_batch(batch)
    
    def _send_batch(self, events: List[dict]):
        """
        Send a batch of events to the telemetry endpoint.
        
        Args:
            events: List of event dictionaries to send
        """
        if not events:
            return
        
        try:
            data = json.dumps({"events": events}).encode("utf-8")
            request = urllib.request.Request(
                TELEMETRY_ENDPOINT,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": f"visivo-cli/{events[0].get('properties', {}).get('visivo_version', 'unknown')}",
                },
                method="POST"
            )
            
            # Send request with timeout
            with urllib.request.urlopen(request, timeout=TELEMETRY_TIMEOUT):
                pass  # We don't need the response
                
        except Exception:
            # Silently ignore all telemetry errors
            pass
    
    def track(self, event: BaseEvent):
        """
        Track an event by adding it to the queue.
        
        Args:
            event: The event to track
        """
        if not self.enabled:
            return
        
        try:
            # Don't block if queue is full (shouldn't happen with our design)
            self._event_queue.put_nowait(event.to_dict())
        except Exception:
            # Silently ignore if we can't queue the event
            pass
    
    def flush(self, timeout: float = 2.0):
        """
        Flush any pending events and wait for them to be sent.
        
        Args:
            timeout: Maximum time to wait for flush to complete
        """
        if not self.enabled or not self._worker_thread:
            return
        
        # Add a sentinel value to know when queue is processed
        sentinel = {"_sentinel": True}
        self._event_queue.put(sentinel)
        
        # Wait for sentinel to be processed (with timeout)
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self._event_queue.empty():
                break
            time.sleep(0.1)
    
    def shutdown(self):
        """Shutdown the telemetry client and send any remaining events."""
        if not self.enabled:
            return
        
        # Signal worker to stop
        self._stop_event.set()
        
        # Wait for worker to finish (with timeout)
        if self._worker_thread:
            self._worker_thread.join(timeout=2.0)


# Global telemetry client instance (created on first use)
_global_client: Optional[TelemetryClient] = None


def get_telemetry_client(enabled: bool = True) -> TelemetryClient:
    """
    Get the global telemetry client instance.
    
    Args:
        enabled: Whether telemetry should be enabled
        
    Returns:
        The global telemetry client
    """
    global _global_client
    if _global_client is None:
        _global_client = TelemetryClient(enabled=enabled)
    return _global_client