import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from './FilterBar';

// Mock the store
const mockSetSearchTerm = jest.fn();
const mockSetSelectedTags = jest.fn();

// Create mock store data
let mockStoreData = {
  searchTerm: '',
  setSearchTerm: mockSetSearchTerm,
  selectedTags: [],
  setSelectedTags: mockSetSelectedTags,
  availableTags: ['tag1', 'tag2', 'tag3'],
  filteredDashboards: [
    { name: 'Dashboard 1', tags: ['tag1'] },
    { name: 'Dashboard 2', tags: ['tag2'] },
  ],
};

jest.mock('../../stores/store', () => {
  return {
    __esModule: true,
    default: () => mockStoreData,
  };
});

describe('FilterBar Component', () => {
  beforeEach(() => {
    mockSetSearchTerm.mockClear();
    mockSetSelectedTags.mockClear();
  });

  test('renders search input', () => {
    render(<FilterBar />);
    
    const searchInput = screen.getByPlaceholderText('Search dashboards...');
    expect(searchInput).toBeInTheDocument();
  });

  test('renders available tags', () => {
    render(<FilterBar />);
    
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
    expect(screen.getByText('tag3')).toBeInTheDocument();
  });

  test('calls setSearchTerm when typing in search input', () => {
    render(<FilterBar />);
    
    const searchInput = screen.getByPlaceholderText('Search dashboards...');
    fireEvent.change(searchInput, { target: { value: 'test search' } });
    
    expect(mockSetSearchTerm).toHaveBeenCalledWith('test search');
  });

  test('calls setSelectedTags when clicking on a tag', () => {
    render(<FilterBar />);
    
    const tag1Button = screen.getByText('tag1');
    fireEvent.click(tag1Button);
    
    expect(mockSetSelectedTags).toHaveBeenCalledWith(['tag1']);
  });

  test('removes tag when clicking on already selected tag', () => {
    // Update mock store data with tag1 already selected
    mockStoreData.selectedTags = ['tag1'];
    
    render(<FilterBar />);
    
    const tag1Button = screen.getByText('tag1');
    fireEvent.click(tag1Button);
    
    expect(mockSetSelectedTags).toHaveBeenCalledWith([]);
    
    // Reset for other tests
    mockStoreData.selectedTags = [];
  });

  test('displays correct dashboard count', () => {
    render(<FilterBar />);
    
    expect(screen.getByText('2 dashboards')).toBeInTheDocument();
  });

  test('displays singular dashboard text when count is 1', () => {
    // Update mock store data with only 1 dashboard
    mockStoreData.filteredDashboards = [{ name: 'Dashboard 1', tags: ['tag1'] }];
    
    render(<FilterBar />);
    
    expect(screen.getByText('1 dashboard')).toBeInTheDocument();
    
    // Reset for other tests
    mockStoreData.filteredDashboards = [
      { name: 'Dashboard 1', tags: ['tag1'] },
      { name: 'Dashboard 2', tags: ['tag2'] },
    ];
  });

  test('does not render tags section when no tags available', () => {
    // Update mock store data with no available tags
    mockStoreData.availableTags = [];
    mockStoreData.filteredDashboards = [];
    
    render(<FilterBar />);
    
    expect(screen.queryByText('Filter by tags')).not.toBeInTheDocument();
    
    // Reset for other tests
    mockStoreData.availableTags = ['tag1', 'tag2', 'tag3'];
    mockStoreData.filteredDashboards = [
      { name: 'Dashboard 1', tags: ['tag1'] },
      { name: 'Dashboard 2', tags: ['tag2'] },
    ];
  });
});