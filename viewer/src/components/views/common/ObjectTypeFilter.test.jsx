/**
 * Tests for ObjectTypeFilter — the multiselect dropdown for filtering
 * objects by type. Covers real filtering behavior: toggling types on/off,
 * select-all/clear-all, counts, disabled (coming soon) types, and the
 * outside-click dismissal.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ObjectTypeFilter from './ObjectTypeFilter';
import { OBJECT_TYPES } from './objectTypeConfigs';

const enabledValues = OBJECT_TYPES.filter(t => t.enabled).map(t => t.value);
const disabledTypes = OBJECT_TYPES.filter(t => !t.enabled);

const openDropdown = () => {
  // The trigger is the only button before the menu opens.
  fireEvent.click(screen.getAllByRole('button')[0]);
};

describe('ObjectTypeFilter — trigger button text', () => {
  it('shows "All Types" when nothing is selected', () => {
    render(<ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} />);
    expect(screen.getByText('All Types')).toBeInTheDocument();
  });

  it('shows the type label when exactly one type is selected', () => {
    render(<ObjectTypeFilter selectedTypes={['source']} onChange={jest.fn()} />);
    expect(screen.getByText('Sources')).toBeInTheDocument();
  });

  it('falls back to the raw value for an unknown selected type', () => {
    render(<ObjectTypeFilter selectedTypes={['mystery']} onChange={jest.fn()} />);
    expect(screen.getByText('mystery')).toBeInTheDocument();
  });

  it('shows a count when multiple types are selected', () => {
    render(<ObjectTypeFilter selectedTypes={['source', 'model']} onChange={jest.fn()} />);
    expect(screen.getByText('2 types selected')).toBeInTheDocument();
  });
});

describe('ObjectTypeFilter — toggling types', () => {
  it('adds an unselected type to the selection', () => {
    const onChange = jest.fn();
    render(<ObjectTypeFilter selectedTypes={['source']} onChange={onChange} />);
    openDropdown();

    fireEvent.click(screen.getByText('Models'));
    expect(onChange).toHaveBeenCalledWith(['source', 'model']);
  });

  it('removes an already-selected type from the selection', () => {
    const onChange = jest.fn();
    render(<ObjectTypeFilter selectedTypes={['source', 'model']} onChange={onChange} />);
    openDropdown();

    // The trigger shows "2 types selected", so 'Sources' only appears as a menu option.
    fireEvent.click(screen.getByText('Sources'));
    expect(onChange).toHaveBeenCalledWith(['model']);
  });

  it('Select all selects every enabled type', () => {
    const onChange = jest.fn();
    render(<ObjectTypeFilter selectedTypes={[]} onChange={onChange} />);
    openDropdown();

    fireEvent.click(screen.getByText('Select all'));
    expect(onChange).toHaveBeenCalledWith(enabledValues);
  });

  it('Clear all empties the selection', () => {
    const onChange = jest.fn();
    render(<ObjectTypeFilter selectedTypes={['source', 'model']} onChange={onChange} />);
    openDropdown();

    fireEvent.click(screen.getByText('Clear all'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('ObjectTypeFilter — counts', () => {
  it('shows count badges for types that have counts', () => {
    render(
      <ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} counts={{ source: 5, model: 3 }} />
    );
    openDropdown();

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('ObjectTypeFilter — disabled (coming soon) types', () => {
  it('hides disabled types by default', () => {
    render(<ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} />);
    openDropdown();

    disabledTypes.forEach(type => {
      expect(screen.queryByText(type.label)).not.toBeInTheDocument();
    });
  });

  it('shows disabled types with a "Soon" badge when showDisabled is set', () => {
    render(<ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} showDisabled />);
    openDropdown();

    expect(disabledTypes.length).toBeGreaterThan(0);
    expect(screen.getByText(disabledTypes[0].label)).toBeInTheDocument();
    // One "Soon" badge per disabled type (Explore 2.0 Phase 0 added the three
    // workspace-destination entries alongside the pre-existing `defaults`).
    expect(screen.getAllByText('Soon')).toHaveLength(disabledTypes.length);
  });

  it('clicking a disabled type does not change the selection', () => {
    const onChange = jest.fn();
    render(<ObjectTypeFilter selectedTypes={[]} onChange={onChange} showDisabled />);
    openDropdown();

    fireEvent.click(screen.getByText(disabledTypes[0].label));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Select all never includes disabled types even when they are shown', () => {
    const onChange = jest.fn();
    render(<ObjectTypeFilter selectedTypes={[]} onChange={onChange} showDisabled />);
    openDropdown();

    fireEvent.click(screen.getByText('Select all'));
    const selected = onChange.mock.calls[0][0];
    disabledTypes.forEach(type => {
      expect(selected).not.toContain(type.value);
    });
  });
});

describe('ObjectTypeFilter — open/close behavior', () => {
  it('opens the menu on trigger click and closes it on a second click', () => {
    render(<ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} />);

    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
    openDropdown();
    expect(screen.getByText('Select all')).toBeInTheDocument();
    openDropdown();
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside', () => {
    render(
      <div>
        <span data-testid="outside">outside</span>
        <ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} />
      </div>
    );

    openDropdown();
    expect(screen.getByText('Select all')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
  });

  it('stays open when clicking inside the menu', () => {
    render(<ObjectTypeFilter selectedTypes={[]} onChange={jest.fn()} />);
    openDropdown();

    fireEvent.mouseDown(screen.getByText('Select all'));
    expect(screen.getByText('Select all')).toBeInTheDocument();
  });
});
