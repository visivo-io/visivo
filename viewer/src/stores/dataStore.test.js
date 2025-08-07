/**
 * @jest-environment jsdom
 */

import { create } from 'zustand';
import createDataSlice from './dataStore';

// Mock the data processor
jest.mock('../services/dataProcessor', () => ({
  dataProcessor: {
    processTrace: jest.fn(),
    createTraceObject: jest.fn(),
    duckdb: {
      initialize: jest.fn()
    }
  }
}));

import { dataProcessor } from '../services/dataProcessor';

describe('DataStore', () => {
  let store;

  beforeEach(() => {
    store = create(createDataSlice);
    jest.clearAllMocks();
  });

  describe('processTraces', () => {
    it('should process multiple traces and update store', async () => {
      const tracesConfig = [
        { name: 'trace1', props: { type: 'bar' } },
        { name: 'trace2', props: { type: 'line' } }
      ];
      
      const rawTracesData = {
        trace1: { 'props.x': ['A', 'B'], 'props.y': [1, 2] },
        trace2: { 'props.x': ['C', 'D'], 'props.y': [3, 4] }
      };

      const mockTraceObjects1 = [{ name: 'values', type: 'bar', x: ['A', 'B'], y: [1, 2] }];
      const mockTraceObjects2 = [{ name: 'values', type: 'line', x: ['C', 'D'], y: [3, 4] }];

      dataProcessor.processTrace
        .mockResolvedValueOnce(mockTraceObjects1)
        .mockResolvedValueOnce(mockTraceObjects2);

      await store.getState().processTraces(tracesConfig, rawTracesData);

      expect(dataProcessor.duckdb.initialize).toHaveBeenCalled();
      expect(dataProcessor.processTrace).toHaveBeenCalledWith(tracesConfig[0], rawTracesData.trace1);
      expect(dataProcessor.processTrace).toHaveBeenCalledWith(tracesConfig[1], rawTracesData.trace2);
      
      expect(store.getState().processedTraces.trace1).toEqual(mockTraceObjects1);
      expect(store.getState().processedTraces.trace2).toEqual(mockTraceObjects2);
      expect(store.getState().processingStatus.trace1).toBe('completed');
      expect(store.getState().processingStatus.trace2).toBe('completed');
    });

    it('should handle processing errors', async () => {
      const tracesConfig = [{ name: 'trace1', props: { type: 'bar' } }];
      const rawTracesData = { trace1: { 'props.x': ['A'], 'props.y': [1] } };

      const error = new Error('Processing failed');
      dataProcessor.processTrace.mockRejectedValueOnce(error);
      
      const fallbackTrace = { name: 'values', type: 'bar' };
      dataProcessor.createTraceObject.mockReturnValueOnce(fallbackTrace);

      await store.getState().processTraces(tracesConfig, rawTracesData);

      expect(store.getState().processingStatus.trace1).toBe('completed'); // Should complete with fallback
      expect(store.getState().processedTraces.trace1).toEqual([fallbackTrace]);
    });

    it('should set loading status initially', async () => {
      const tracesConfig = [{ name: 'trace1', props: { type: 'bar' } }];
      const rawTracesData = { trace1: { 'props.x': ['A'], 'props.y': [1] } };

      // Mock a slow processor to test loading state
      let resolveProcessor;
      const processorPromise = new Promise(resolve => {
        resolveProcessor = resolve;
      });
      dataProcessor.processTrace.mockReturnValueOnce(processorPromise);

      const processPromise = store.getState().processTraces(tracesConfig, rawTracesData);

      // Check loading state is set
      expect(store.getState().processingStatus.trace1).toBe('loading');
      expect(store.getState().processingErrors.trace1).toBe(null);

      // Resolve the processing
      resolveProcessor([]);
      await processPromise;

      expect(store.getState().processingStatus.trace1).toBe('completed');
    });

    it('should handle empty inputs gracefully', async () => {
      await store.getState().processTraces(null, null);
      
      expect(dataProcessor.processTrace).not.toHaveBeenCalled();
    });
  });

  // Removed processSingleTrace tests - method removed to eliminate duplication
  // Use processTraces with single-item array instead

  describe('getters', () => {
    beforeEach(() => {
      // Set up test data
      store.setState({
        processedTraces: {
          trace1: [
            { name: 'Product A', type: 'bar', x: ['Jan'], y: [100] },
            { name: 'Product B', type: 'bar', x: ['Jan'], y: [200] }
          ],
          trace2: [
            { name: 'values', type: 'line', x: ['Feb'], y: [150] }
          ]
        },
        processingStatus: {
          trace1: 'completed',
          trace2: 'completed'
        }
      });
    });

    it('should get trace objects for specific trace', () => {
      const result = store.getState().getTraceObjects('trace1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Product A');
      expect(result[1].name).toBe('Product B');
    });

    it('should return empty array for non-existent trace', () => {
      const result = store.getState().getTraceObjects('nonexistent');
      expect(result).toEqual([]);
    });

    it('should get multiple trace objects', () => {
      const result = store.getState().getMultipleTraceObjects(['trace1', 'trace2']);
      expect(result).toHaveLength(3);
    });

    it('should get all trace objects', () => {
      const result = store.getState().getAllTraceObjects();
      expect(result).toHaveLength(3);
    });

    it('should check if trace is ready', () => {
      expect(store.getState().isTraceReady('trace1')).toBe(true);
      expect(store.getState().isTraceReady('nonexistent')).toBe(false);
    });

    it('should check if multiple traces are ready', () => {
      expect(store.getState().areTracesReady(['trace1', 'trace2'])).toBe(true);
      
      store.setState(state => ({
        processingStatus: { ...state.processingStatus, trace2: 'loading' }
      }));
      
      expect(store.getState().areTracesReady(['trace1', 'trace2'])).toBe(false);
    });

    it('should check loading status', () => {
      store.setState(state => ({
        processingStatus: { ...state.processingStatus, trace1: 'loading' }
      }));

      expect(store.getState().isTraceLoading('trace1')).toBe(true);
      expect(store.getState().areAnyTracesLoading(['trace1', 'trace2'])).toBe(true);
    });

    it('should check error status', () => {
      store.setState(state => ({
        processingStatus: { ...state.processingStatus, trace1: 'error' },
        processingErrors: { ...state.processingErrors, trace1: 'Test error' }
      }));

      expect(store.getState().hasTraceError('trace1')).toBe(true);
      expect(store.getState().getTraceError('trace1')).toBe('Test error');
    });

    it('should get trace status', () => {
      expect(store.getState().getTraceStatus('trace1')).toBe('completed');
      expect(store.getState().getTraceStatus('nonexistent')).toBe('idle');
    });
  });

  describe('cohort operations', () => {
    beforeEach(() => {
      store.setState({
        processedTraces: {
          trace1: [
            { name: 'Product A', type: 'bar' },
            { name: 'Product B', type: 'bar' }
          ],
          trace2: [
            { name: 'values', type: 'line' }
          ]
        }
      });
    });

    it('should get cohort names for trace', () => {
      const result = store.getState().getCohortNames('trace1');
      expect(result).toEqual(['Product A', 'Product B']);
    });

    it('should get all cohort names across traces', () => {
      const result = store.getState().getAllCohortNames(['trace1', 'trace2']);
      expect(result).toEqual(['Product A', 'Product B', 'values']);
    });

    it('should filter trace objects by cohorts', () => {
      const result = store.getState().filterTraceObjectsByCohorts(
        ['trace1', 'trace2'], 
        ['Product A', 'values']
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Product A');
      expect(result[1].name).toBe('values');
    });

    it('should return all traces when no cohorts selected', () => {
      const result = store.getState().filterTraceObjectsByCohorts(['trace1', 'trace2'], []);
      expect(result).toHaveLength(3);
    });
  });

  describe('data management', () => {
    beforeEach(() => {
      store.setState({
        processedTraces: { trace1: [], trace2: [] },
        processingStatus: { trace1: 'completed', trace2: 'completed' },
        processingErrors: { trace1: null, trace2: null }
      });
    });

    it('should clear specific trace data', () => {
      store.getState().clearTraceData(['trace1']);

      expect(store.getState().processedTraces.trace1).toBeUndefined();
      expect(store.getState().processingStatus.trace1).toBeUndefined();
      expect(store.getState().processingErrors.trace1).toBeUndefined();
      
      // trace2 should remain
      expect(store.getState().processedTraces.trace2).toBeDefined();
    });

    it('should clear all trace data', () => {
      store.getState().clearAllTraceData();

      expect(store.getState().processedTraces).toEqual({});
      expect(store.getState().processingStatus).toEqual({});
      expect(store.getState().processingErrors).toEqual({});
    });
  });

  describe('processing statistics', () => {
    it('should calculate processing statistics', () => {
      store.setState({
        processingStatus: {
          trace1: 'completed',
          trace2: 'loading',
          trace3: 'error',
          trace4: 'idle'
        }
      });

      const stats = store.getState().getProcessingStats();

      expect(stats).toEqual({
        total: 4,
        completed: 1,
        loading: 1,
        error: 1,
        idle: 1
      });
    });

    it('should handle empty processing status', () => {
      const stats = store.getState().getProcessingStats();

      expect(stats).toEqual({
        total: 0,
        loading: 0,
        completed: 0,
        error: 0,
        idle: 0
      });
    });
  });
});