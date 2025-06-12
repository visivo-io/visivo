import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ObjectsPanel from './ObjectsPanel';
import useStore from '../../stores/store';

// Mock the store
jest.mock('../../stores/store', () => ({
  __esModule: true,
  default: jest.fn(),
}));

test('renders loading state correctly', () => {
  useStore.mockImplementation(selector =>
    selector({
      isLoading: true,
      error: null,
      namedChildren: {},
    })
  );

  render(<ObjectsPanel />);
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('renders error state correctly', () => {
  const errorMessage = 'Test error message';
  useStore.mockImplementation(selector =>
    selector({
      isLoading: false,
      error: errorMessage,
      namedChildren: {},
    })
  );

  render(<ObjectsPanel />);
  expect(screen.getByText(errorMessage)).toBeInTheDocument();
});

test('filters objects based on search input', async () => {
  const mockNamedChildren = {
    object1: { type_key: 'type1' },
    object2: { type_key: 'type2' },
    test3: { type_key: 'type1' },
  };

  useStore.mockImplementation(selector =>
    selector({
      isLoading: false,
      error: null,
      namedChildren: mockNamedChildren,
    })
  );

  render(<ObjectsPanel />);

  const searchInput = screen.getByPlaceholderText('Search objects...');
  await userEvent.type(searchInput, 'object');

  expect(screen.getByText('object1')).toBeInTheDocument();
  expect(screen.getByText('object2')).toBeInTheDocument();
  expect(screen.queryByText('test3')).not.toBeInTheDocument();
});

test('filters objects based on type selection', async () => {
  const mockNamedChildren = {
    object1: { type_key: 'type1' },
    object2: { type_key: 'type2' },
    object3: { type_key: 'type1' },
  };

  useStore.mockImplementation(selector =>
    selector({
      isLoading: false,
      error: null,
      namedChildren: mockNamedChildren,
    })
  );

  render(<ObjectsPanel />);

  const typeSelect = screen.getByRole('combobox');
  await userEvent.selectOptions(typeSelect, 'type1');

  expect(screen.getByText('object1')).toBeInTheDocument();
  expect(screen.getByText('object3')).toBeInTheDocument();
  expect(screen.queryByText('object2')).not.toBeInTheDocument();
});

test('opens create modal when create button is clicked', async () => {
  const mockOnOpenCreateModal = jest.fn();

  useStore.mockImplementation(selector =>
    selector({
      isLoading: false,
      error: null,
      namedChildren: {},
    })
  );

  render(<ObjectsPanel onOpenCreateModal={mockOnOpenCreateModal} />);

  const createButton = screen.getByRole('button', {
    name: /\+ Create New Object/i,
  });
  await userEvent.click(createButton);

  expect(mockOnOpenCreateModal).toHaveBeenCalled();
});

test('displays "No objects found" when filter returns no results', async () => {
  const mockNamedChildren = {
    object1: { type_key: 'type1' },
    object2: { type_key: 'type2' },
  };

  useStore.mockImplementation(selector =>
    selector({
      isLoading: false,
      error: null,
      namedChildren: mockNamedChildren,
    })
  );

  render(<ObjectsPanel />);

  const searchInput = screen.getByPlaceholderText('Search objects...');
  await userEvent.type(searchInput, 'nonexistent');

  expect(screen.getByText('No objects found')).toBeInTheDocument();
});
