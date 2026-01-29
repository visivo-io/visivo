import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook for managing preview job execution
 *
 * Handles the async workflow:
 * 1. POST config to start job → get job_id
 * 2. Poll GET /status until completed/failed
 * 3. GET /result when completed
 *
 * @returns {Object} Preview job state and control functions
 */
export const usePreviewJob = () => {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // 'queued' | 'running' | 'completed' | 'failed'
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollingIntervalRef = useRef(null);

  /**
   * Start a preview job
   * @param {Object} config - Insight configuration to preview
   * @returns {Promise<string>} job_id
   */
  const startJob = useCallback(async config => {
    try {
      setError(null);
      setStatus(null);
      setProgress(0);
      setProgressMessage('');
      setResult(null);

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
        throw new Error(errorData.message || 'Failed to start preview job');
      }

      const data = await response.json();
      const newJobId = data.job_id;
      setJobId(newJobId);
      setStatus('queued');
      return newJobId;
    } catch (err) {
      const errorMsg = err.message || 'Failed to start preview job';
      setError(errorMsg);
      setStatus('failed');
      throw new Error(errorMsg);
    }
  }, []);

  /**
   * Poll for job status
   */
  const pollStatus = useCallback(async currentJobId => {
    try {
      const response = await fetch(`/api/insight-jobs/${currentJobId}/`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to poll job status');
      }

      const jobData = await response.json();

      setStatus(jobData.status);
      setProgress(jobData.progress || 0);
      setProgressMessage(jobData.progress_message || '');

      if (jobData.status === 'failed') {
        setError(jobData.error || 'Job failed');
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (jobData.status === 'completed') {
        // Result is included in the response when completed
        if (jobData.result) {
          setResult(jobData.result);
        }
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to poll job status';
      setError(errorMsg);
      setStatus('failed');
      // Stop polling on error
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, []);

  /**
   * Start polling when job is started
   */
  useEffect(() => {
    if (!jobId) return;
    if (status === 'completed' || status === 'failed') return;

    // Start polling every 500ms
    pollingIntervalRef.current = setInterval(() => {
      pollStatus(jobId);
    }, 500);

    // Immediate first poll
    pollStatus(jobId);

    // Cleanup on unmount or when job changes
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [jobId, status, pollStatus]);

  /**
   * Cancel/reset current job
   */
  const resetJob = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setJobId(null);
    setStatus(null);
    setProgress(0);
    setProgressMessage('');
    setResult(null);
    setError(null);
  }, []);

  return {
    // State
    jobId,
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
    startJob,
    resetJob,
  };
};
