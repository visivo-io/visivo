import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook for managing preview run execution
 *
 * Handles the async workflow:
 * 1. POST config to start run → get run_instance_id
 * 2. Poll GET /status until completed/failed
 * 3. Result is included in completed response
 *
 * @returns {Object} Preview run state and control functions
 */
export const usePreviewJob = () => {
  const [runInstanceId, setRunInstanceId] = useState(null);
  const [status, setStatus] = useState(null); // 'queued' | 'running' | 'completed' | 'failed'
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollingIntervalRef = useRef(null);
  const currentRunIdRef = useRef(null);

  /**
   * Start a preview run
   * @param {Object} config - Insight configuration to preview
   * @returns {Promise<string>} run_instance_id
   */
  const startRun = useCallback(async config => {
    try {
      setError(null);
      setStatus(null);
      setProgress(0);
      setProgressMessage('');
      setResult(null);
      setRunInstanceId(null);

      const response = await fetch('/api/insight-jobs/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config,
          run: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to start preview run');
      }

      const data = await response.json();
      const newRunInstanceId = data.run_instance_id;
      currentRunIdRef.current = newRunInstanceId;
      setRunInstanceId(newRunInstanceId);
      setStatus('queued');
      return newRunInstanceId;
    } catch (err) {
      const errorMsg = err.message || 'Failed to start preview run';
      setError(errorMsg);
      setStatus('failed');
      throw new Error(errorMsg);
    }
  }, []);

  /**
   * Poll for run status.
   * Ignores responses from stale runs (where the run ID no longer matches
   * the current run) to prevent old 404s from contaminating state.
   */
  const pollStatus = useCallback(async currentRunInstanceId => {
    try {
      const response = await fetch(`/api/insight-jobs/${currentRunInstanceId}/`);

      // Ignore stale responses from previous runs
      if (currentRunIdRef.current !== currentRunInstanceId) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to poll run status');
      }

      const runData = await response.json();

      setStatus(runData.status);
      setProgress(runData.progress || 0);
      setProgressMessage(runData.progress_message || '');

      if (runData.status === 'failed') {
        setError(runData.error || 'Run failed');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (runData.status === 'completed') {
        setError(null);
        if (runData.result) {
          setResult(runData.result);
        }
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      // Ignore errors from stale runs
      if (currentRunIdRef.current !== currentRunInstanceId) return;

      const errorMsg = err.message || 'Failed to poll run status';
      setError(errorMsg);
      setStatus('failed');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, []);

  /**
   * Start polling when run is started
   */
  useEffect(() => {
    if (!runInstanceId) return;
    if (status === 'completed' || status === 'failed') return;

    pollingIntervalRef.current = setInterval(() => {
      pollStatus(runInstanceId);
    }, 500);

    // Immediate first poll
    pollStatus(runInstanceId);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [runInstanceId, status, pollStatus]);

  /**
   * Cancel/reset current run
   */
  const resetRun = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setRunInstanceId(null);
    setStatus(null);
    setProgress(0);
    setProgressMessage('');
    setResult(null);
    setError(null);
  }, []);

  return {
    // State
    runInstanceId,
    status,
    progress,
    progressMessage,
    result,
    error,
    // Computed
    isRunning: status === 'queued' || status === 'running',
    isCompleted: status === 'completed',
    isFailed: status === 'failed',
    // Actions
    startRun,
    resetRun,
  };
};
