import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttributeComponent from './AttributeComponent';
import useStore from '../../../../stores/store';

// Mock the store
jest.mock('../../../../stores/store');

test('renders attribute with correct label and value', () => {
  useStore.mockImplementation(selector =>
    selector({
      namedChildren: {},
      updateNamedChildAttribute: jest.fn(),
      deleteNamedChildAttribute: jest.fn(),
    })
  );

  render(<AttributeComponent name="testName" value="testValue" path={['test']} />);
  expect(screen.getByText('testName')).toBeInTheDocument();
  expect(screen.getByDisplayValue('testValue')).toBeInTheDocument();
});

test('handles JSON object value display correctly', () => {
  const jsonValue = JSON.stringify({ name: 'testObject', is_inline_defined: false });

  useStore.mockImplementation(selector =>
    selector({
      namedChildren: {},
      updateNamedChildAttribute: jest.fn(),
      deleteNamedChildAttribute: jest.fn(),
    })
  );

  render(<AttributeComponent name="testName" value={jsonValue} path={['test']} />);
  expect(screen.getByText('testObject')).toBeInTheDocument();
});

test('handles query value display correctly', () => {
  const queryValue = 'query(SELECT * FROM table)';

  useStore.mockImplementation(selector =>
    selector({
      namedChildren: {},
      updateNamedChildAttribute: jest.fn(),
      deleteNamedChildAttribute: jest.fn(),
    })
  );

  render(<AttributeComponent name="testName" value={queryValue} path={['test']} />);
  expect(screen.getByText('SELECT * FROM table')).toBeInTheDocument();
});

test('shows dropdown when typing @ symbol', async () => {
  useStore.mockImplementation(selector =>
    selector({
      namedChildren: { testObject: { type: 'test' } },
      updateNamedChildAttribute: jest.fn(),
      deleteNamedChildAttribute: jest.fn(),
    })
  );

  render(<AttributeComponent name="testName" value="" path={['test']} />);
  const input = screen.getByRole('textbox');
  await userEvent.type(input, '@');

  expect(screen.getByText('testObject')).toBeInTheDocument();
});

test('handles context menu correctly', async () => {
  const mockDelete = jest.fn();
  useStore.mockImplementation(selector =>
    selector({
      namedChildren: {},
      updateNamedChildAttribute: jest.fn(),
      deleteNamedChildAttribute: mockDelete,
    })
  );

  render(<AttributeComponent name="testName" value="testValue" path={['test']} />);
  const container = screen.getByLabelText('testName');

  fireEvent.contextMenu(container);
  expect(screen.getByText('Delete')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Delete'));
  expect(mockDelete).toHaveBeenCalled();
});
