import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ColumnVisibilityPicker from './ColumnVisibilityPicker';
import useEscapeToClose from '../../hooks/useEscapeToClose';

const makeTable = () => {
  const columns = ['id', 'name'].map(id => ({
    id,
    getIsVisible: () => true,
    getToggleVisibilityHandler: () => jest.fn(),
  }));
  return {
    getAllLeafColumns: () => columns,
    getVisibleLeafColumns: () => columns,
  };
};

const openPicker = () => {
  fireEvent.click(screen.getByText('Columns (2/2)'));
  expect(screen.getByLabelText('name')).toBeInTheDocument();
};

describe('ColumnVisibilityPicker', () => {
  test('Escape closes the menu and returns focus to the trigger', () => {
    render(<ColumnVisibilityPicker table={makeTable()} />);
    openPicker();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('name')).not.toBeInTheDocument();
    expect(screen.getByText('Columns (2/2)')).toHaveFocus();
  });

  test('inside another layer, the first Escape closes only the menu', () => {
    const onOuterClose = jest.fn();
    const Outer = () => {
      useEscapeToClose(true, onOuterClose);
      return <ColumnVisibilityPicker table={makeTable()} />;
    };
    render(<Outer />);
    openPicker();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('name')).not.toBeInTheDocument();
    expect(onOuterClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });

  test('an outside click closes the menu; a click inside does not', () => {
    render(
      <div>
        <span>outside</span>
        <ColumnVisibilityPicker table={makeTable()} />
      </div>
    );
    openPicker();
    fireEvent.mouseDown(screen.getByLabelText('name'));
    expect(screen.getByLabelText('name')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByLabelText('name')).not.toBeInTheDocument();
  });
});
