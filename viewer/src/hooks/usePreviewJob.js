import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

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

      const response = await axios.post('/api/insight-jobs/', {
        config,
        run: true,
      });

      const newJobId = response.data.job_id;
      setJobId(newJobId);
      setStatus('queued');
      return newJobId;
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to start preview job';
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
      const response = await axios.get(`/api/insight-jobs/${currentJobId}/status`);
      const jobData = response.data;

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
        // Fetch result
        const resultResponse = await axios.get(`/api/insight-jobs/${currentJobId}/result`);
        setResult(resultResponse.data);
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to poll job status';
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
