import { renderHook } from '@testing-library/react';
import { useViewerNavigate } from './useViewerNavigate';
import { setViewerBase } from '../contexts/viewerBase';

// `mock`-prefixed: jest hoists the factory above this declaration.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

beforeEach(() => mockNavigate.mockClear());
afterEach(() => setViewerBase(''));

const run = () => renderHook(() => useViewerNavigate()).result.current;

describe('useViewerNavigate', () => {
  test('is plain useNavigate at a root mount', () => {
    run()('/explorer');
    expect(mockNavigate).toHaveBeenCalledWith('/explorer');
  });

  test('keeps a root-absolute viewer path inside the mount', () => {
    // The whole point: without this the cloud app had to let the navigation
    // escape to its router root and redirect it back, costing two navigations
    // and a remount of the project subtree.
    setViewerBase('/acme/production/analytics');
    run()('/explorer');
    expect(mockNavigate).toHaveBeenCalledWith('/acme/production/analytics/explorer');
  });

  test('forwards navigate options, and passes only the args it was given', () => {
    setViewerBase('/acme');
    run()('/workspace', { replace: true });
    expect(mockNavigate).toHaveBeenCalledWith('/acme/workspace', { replace: true });
  });

  test('passes a history delta straight through', () => {
    setViewerBase('/acme');
    run()(-1);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  test('rebases the pathname of a location object, preserving the rest', () => {
    setViewerBase('/acme');
    run()({ pathname: '/workspace', search: '?view=lineage' });
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/acme/workspace', search: '?view=lineage' });
  });

  test('leaves a relative path to the router', () => {
    setViewerBase('/acme');
    run()('dashboard/Sales');
    expect(mockNavigate).toHaveBeenCalledWith('dashboard/Sales');
  });
});
