import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import ObjectPill from './ObjectPill';
import useStore from '../../stores/store';

// Mock the zustand store
jest.mock('../../stores/store');

test('renders ObjectPill with correct name', () => {
  // Mock store values
  useStore.mockImplementation((selector) => 
    selector({
      namedChildren: { 'test-object': { type: 'test-type' } },
      openTab: jest.fn()
    })
  );

  const { getByText } = render(<ObjectPill name="test-object" />);
  expect(getByText('test-object')).toBeInTheDocument();
});

test('calls openTab when double clicked', () => {
  const mockOpenTab = jest.fn();
  
  // Mock store values
  useStore.mockImplementation((selector) => 
    selector({
      namedChildren: { 'test-object': { type: 'test-type' } },
      openTab: mockOpenTab
    })
  );

  const { getByText } = render(<ObjectPill name="test-object" />);
  
  fireEvent.doubleClick(getByText('test-object'));
  expect(mockOpenTab).toHaveBeenCalledWith('test-object', 'test-type');
});

test('handles missing type in namedChildren gracefully', () => {
  // Mock store values with missing object in namedChildren
  useStore.mockImplementation((selector) => 
    selector({
      namedChildren: {},
      openTab: jest.fn()
    })
  );

  const { getByText } = render(<ObjectPill name="test-object" />);
  expect(getByText('test-object')).toBeInTheDocument();
}); 