import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceNode from './SourceNode';
import { TreeProvider } from '../TreeContext';
import useStore from '../../../stores/store';

// Mock the store
jest.mock('../../../stores/store');

// Mock MUI components
jest.mock('@mui/x-tree-view/TreeItem', () => ({
  TreeItem: ({ children, itemId, label }) => (
    <div data-testid={`tree-item-${itemId}`} role="treeitem" aria-selected="false">
      <div data-testid={`tree-label-${itemId}`}>{label}</div>
      <div data-testid={`tree-children-${itemId}`}>{children}</div>
    </div>
  ),
}));

// Mock Flowbite Tooltip
jest.mock('flowbite-react', () => ({
  Tooltip: ({ children, content }) => (
    <>
      <div aria-label={content}>{children}</div>
    </>
  ),
}));

// Mock child components
jest.mock('./DatabaseNode', () => ({
  __esModule: true,
  default: ({ database, sourceName }) => (
    <div data-testid={`database-${database.name}`}>
      Database: {database.name} (Source: {sourceName})
    </div>
  ),
}));

describe('SourceNode', () => {
  let mockStoreData;

  beforeEach(() => {
    mockStoreData = {
      sourcesMetadata: {
        loadedDatabases: {},
      },
      loadingStates: {
        databases: {},
        connections: {},
      },
    };

    useStore.mockImplementation(selector => selector(mockStoreData));
  });

  test('should render source name', () => {
    const source = { name: 'test_source', status: 'unknown' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByText('test_source')).toBeInTheDocument();
  });

  test('should show connected status with check icon', () => {
    const source = { name: 'test_source', status: 'connected' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
  });

  test('should show connection failed status with error icon', () => {
    const source = {
      name: 'test_source',
      status: 'connection_failed',
      error: 'Connection timeout',
    };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByTestId('CancelIcon')).toBeInTheDocument();
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  test('should show unknown status with help icon', () => {
    const source = { name: 'test_source', status: 'unknown' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByTestId('HelpOutlineIcon')).toBeInTheDocument();
  });

  test('should show loading spinner when testing connection', () => {
    mockStoreData.loadingStates.connections = { test_source: true };

    const source = { name: 'test_source', status: 'unknown' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('should render database nodes when databases are loaded', () => {
    mockStoreData.sourcesMetadata.loadedDatabases = {
      test_source: [{ name: 'db1' }, { name: 'db2' }],
    };

    const source = { name: 'test_source', status: 'connected' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByTestId('database-db1')).toBeInTheDocument();
    expect(screen.getByTestId('database-db2')).toBeInTheDocument();
  });

  test('should show loading spinner when loading databases', () => {
    mockStoreData.loadingStates.databases = { test_source: true };

    const source = { name: 'test_source', status: 'connected' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('should show placeholder when no databases loaded', () => {
    const source = { name: 'test_source', status: 'connected' };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.getByText('Click to load databases')).toBeInTheDocument();
  });

  test('should not render databases for failed connections', () => {
    mockStoreData.sourcesMetadata.loadedDatabases = {
      test_source: [{ name: 'db1' }],
    };

    const source = {
      name: 'test_source',
      status: 'connection_failed',
      error: 'Failed',
    };

    render(
      <TreeProvider>
        <SourceNode source={source} />
      </TreeProvider>
    );

    expect(screen.queryByTestId('database-db1')).not.toBeInTheDocument();
  });
});
