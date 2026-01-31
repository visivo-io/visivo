import { renderHook, act, waitFor } from '@testing-library/react';
import { usePreviewJob } from './usePreviewJob';

global.fetch = jest.fn();

describe('usePreviewJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('returns idle state before any run', () => {
      const { result, unmount } = renderHook(() => usePreviewJob());

      expect(result.current.runInstanceId).toBeNull();
      expect(result.current.status).toBeNull();
      expect(result.current.progress).toBe(0);
      expect(result.current.progressMessage).toBe('');
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isRunning).toBe(false);
      expect(result.current.isCompleted).toBe(false);
      expect(result.current.isFailed).toBe(false);

      unmount();
    });
  });

  describe('startRun', () => {
    test('posts config and returns run instance id', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ run_instance_id: 'run-42' }),
        })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'completed' }),
        });

      const { result, unmount } = renderHook(() => usePreviewJob());

      let id;
      await act(async () => {
        id = await result.current.startRun({ name: 'my-insight', props: { x: 1 } });
      });

      expect(id).toBe('run-42');
      expect(fetch).toHaveBeenCalledWith('/api/insight-jobs/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { name: 'my-insight', props: { x: 1 } }, run: true }),
      });
      expect(result.current.runInstanceId).toBe('run-42');

      unmount();
    });

    test('sets failed status on POST error with server message', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Invalid config' }),
      });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await expect(result.current.startRun({})).rejects.toThrow('Invalid config');
      });

      expect(result.current.status).toBe('failed');
      expect(result.current.error).toBe('Invalid config');
      expect(result.current.isFailed).toBe(true);
      expect(result.current.isRunning).toBe(false);

      unmount();
    });

    test('sets generic error when POST body is not parseable', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('not json')),
      });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await expect(result.current.startRun({})).rejects.toThrow(
          'Failed to start preview run'
        );
      });

      expect(result.current.error).toBe('Failed to start preview run');
      expect(result.current.isFailed).toBe(true);

      unmount();
    });
  });

  describe('polling', () => {
    test('transitions to completed with result', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ run_instance_id: 'run-comp' }),
        })
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({ status: 'completed', result: { files: ['a.parquet'] } }),
        });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await result.current.startRun({ name: 'test' });
      });

      await waitFor(() => {
        expect(result.current.isCompleted).toBe(true);
      });

      expect(result.current.result).toEqual({ files: ['a.parquet'] });
      expect(result.current.error).toBeNull();
      expect(result.current.isRunning).toBe(false);

      unmount();
    });

    test('transitions to failed with error message', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ run_instance_id: 'run-fail' }),
        })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'failed', error: 'Query syntax error' }),
        });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await result.current.startRun({ name: 'test' });
      });

      await waitFor(() => {
        expect(result.current.isFailed).toBe(true);
      });

      expect(result.current.error).toBe('Query syntax error');
      expect(result.current.isRunning).toBe(false);
      expect(result.current.isCompleted).toBe(false);

      unmount();
    });

    test('reports progress during running state', async () => {
      const runningResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'running',
            progress: 75,
            progress_message: 'Loading data',
          }),
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ run_instance_id: 'run-prog' }),
        })
        // The useEffect re-fires when status changes (queued → running),
        // triggering another immediate poll. Provide enough running responses
        // so the intermediate state is observable before completion.
        .mockResolvedValueOnce(runningResponse)
        .mockResolvedValueOnce(runningResponse)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'completed' }),
        });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await result.current.startRun({ name: 'test' });
      });

      await waitFor(() => {
        expect(result.current.progress).toBe(75);
      });

      expect(result.current.progressMessage).toBe('Loading data');
      expect(result.current.isRunning).toBe(true);

      await waitFor(() => {
        expect(result.current.isCompleted).toBe(true);
      });

      unmount();
    });

    test('handles poll HTTP error', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ run_instance_id: 'run-http-err' }),
        })
        .mockResolvedValue({
          ok: false,
          json: () => Promise.resolve({ message: 'Server unavailable' }),
        });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await result.current.startRun({ name: 'test' });
      });

      await waitFor(() => {
        expect(result.current.isFailed).toBe(true);
      });

      expect(result.current.error).toBe('Server unavailable');

      unmount();
    });
  });

  describe('resetRun', () => {
    test('clears all state back to initial', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ run_instance_id: 'run-reset' }),
        })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'completed', result: { data: 'x' } }),
        });

      const { result, unmount } = renderHook(() => usePreviewJob());

      await act(async () => {
        await result.current.startRun({ name: 'test' });
      });

      await waitFor(() => {
        expect(result.current.isCompleted).toBe(true);
      });

      act(() => {
        result.current.resetRun();
      });

      expect(result.current.runInstanceId).toBeNull();
      expect(result.current.status).toBeNull();
      expect(result.current.progress).toBe(0);
      expect(result.current.progressMessage).toBe('');
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isRunning).toBe(false);
      expect(result.current.isCompleted).toBe(false);
      expect(result.current.isFailed).toBe(false);

      unmount();
    });
  });
});
