import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

  render(<ObjectPill name="test-object" />);
  expect(screen.getByText('test-object')).toBeInTheDocument();
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

  render(<ObjectPill name="test-object" />);
  fireEvent.doubleClick(screen.getByText('test-object'));
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

  render(<ObjectPill name="test-object" />);
  expect(screen.getByText('test-object')).toBeInTheDocument();
}); 