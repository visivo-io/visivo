import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dropdown from './Dropdown';

const setup = props =>
  render(
    <Dropdown trigger={<button>Open menu</button>} {...props}>
      {close => <button onClick={close}>Item</button>}
    </Dropdown>
  );

describe('common Dropdown', () => {
  it('closes on Escape and returns focus to the trigger', () => {
    const onToggle = jest.fn();
    setup({ onToggle });
    const trigger = screen.getByText('Open menu');
    fireEvent.click(trigger);
    expect(screen.getByText('Item')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Item')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('closes on Escape in portal mode', () => {
    setup({ portal: true });
    fireEvent.click(screen.getByText('Open menu'));
    expect(screen.getByText('Item')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Item')).not.toBeInTheDocument();
  });

  it('ignores other keys', () => {
    setup();
    fireEvent.click(screen.getByText('Open menu'));
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByText('Item')).toBeInTheDocument();
  });

  it('still closes via the backdrop, the trigger and a menu item', () => {
    setup();
    fireEvent.click(screen.getByText('Open menu'));
    fireEvent.click(screen.getByText('Item'));
    expect(screen.queryByText('Item')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Open menu'));
    fireEvent.click(screen.getByTestId('dropdown-backdrop'));
    expect(screen.queryByText('Item')).not.toBeInTheDocument();
  });

  it('in portal mode a click in the panel keeps it open and the backdrop closes it', () => {
    render(
      <Dropdown trigger={<button>Open menu</button>} portal>
        <div>Body</div>
      </Dropdown>
    );
    fireEvent.click(screen.getByText('Open menu'));
    fireEvent.click(screen.getByText('Body'));
    expect(screen.getByText('Body')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dropdown-backdrop'));
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });

  it('does not throw on Escape when the trigger has nothing focusable', () => {
    render(
      <Dropdown trigger={<span>plain</span>}>
        <div>Body</div>
      </Dropdown>
    );
    fireEvent.click(screen.getByText('plain'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });
});
