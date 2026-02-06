import { useState, useCallback, useEffect, useRef } from 'react';
import {
  startModelQueryJob,
  getModelQueryJobStatus,
  cancelModelQueryJob,
} from '../api/modelQueryJobs';

/**
 * Hook for managing model query job execution
 *
 * Handles the async workflow:
 * 1. POST source_name and sql to start job -> get job_id
 * 2. Poll GET /status until completed/failed
 * 3. Result is included in completed response
 *
 * @returns {Object} Query job state and control functions
 */
export const useModelQueryJob = () => {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollingIntervalRef = useRef(null);
  const currentJobIdRef = useRef(null);

  /**
   * Execute a SQL query against a source
   * @param {string} sourceName - Name of the source to query
   * @param {string} sql - SQL query to execute
   * @returns {Promise<string>} job_id
   */
  const executeQuery = useCallback(async (sourceName, sql) => {
    try {
      setError(null);
      setStatus(null);
      setProgress(0);
      setProgressMessage('');
      setResult(null);
      setJobId(null);

      const response = await startModelQueryJob(sourceName, sql);

      const newJobId = response.job_id;
      currentJobIdRef.current = newJobId;
      setJobId(newJobId);
      setStatus('queued');
      return newJobId;
    } catch (err) {
      const errorMsg = err.message || 'Failed to start query job';
      setError(errorMsg);
      setStatus('failed');
      throw new Error(errorMsg);
    }
  }, []);

  /**
   * Poll for job status.
   * Ignores responses from stale jobs (where the job ID no longer matches
   * the current job) to prevent old 404s from contaminating state.
   */
  const pollStatus = useCallback(async currentJobId => {
    try {
      const jobData = await getModelQueryJobStatus(currentJobId);

      // Ignore stale responses from previous jobs
      if (currentJobIdRef.current !== currentJobId) return;

      setStatus(jobData.status);
      setProgress(jobData.progress || 0);
      setProgressMessage(jobData.progress_message || '');

      if (jobData.status === 'failed') {
        setError(jobData.error || 'Query failed');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (jobData.status === 'completed') {
        setError(null);
        if (jobData.result) {
          setResult(jobData.result);
        }
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (jobData.status === 'cancelled') {
        setError('Query cancelled');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      // Ignore errors from stale jobs
      if (currentJobIdRef.current !== currentJobId) return;

      const errorMsg = err.message || 'Failed to poll job status';
      setError(errorMsg);
      setStatus('failed');
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
    if (status === 'completed' || status === 'failed' || status === 'cancelled') return;

    pollingIntervalRef.current = setInterval(() => {
      pollStatus(jobId);
    }, 500);

    // Immediate first poll
    pollStatus(jobId);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [jobId, status, pollStatus]);

  /**
   * Cancel the current query job
   */
  const cancel = useCallback(async () => {
    if (!jobId) return;

    try {
      await cancelModelQueryJob(jobId);
      setStatus('cancelled');
      setError('Query cancelled');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  }, [jobId]);

  /**
   * Reset/clear current job state
   */
  const reset = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    currentJobIdRef.current = null;
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
    isCancelled: status === 'cancelled',
    // Actions
    executeQuery,
    cancel,
    reset,
  };
};
