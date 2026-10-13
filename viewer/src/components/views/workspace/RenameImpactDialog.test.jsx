import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RenameImpactDialog from './RenameImpactDialog';

const impact = {
  target: { type: 'models', name: 'orders', new_name: 'purchases', status: 'published' },
  references: [
    { type: 'insights', name: 'i1', status: 'published' },
    { type: 'metrics', name: 'total', status: 'new' },
  ],
};

const renderDialog = (props = {}) =>
  render(
    <RenameImpactDialog
      impact={impact}
      error={null}
      loading={false}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />
  );

describe('what the rename will change', () => {
  test('it names both ends of the rename', () => {
    renderDialog();

    const dialog = screen.getByTestId('rename-impact-dialog');
    expect(dialog).toHaveTextContent('orders');
    expect(dialog).toHaveTextContent('purchases');
  });

  test('every affected object is listed', () => {
    renderDialog();

    expect(screen.getByTestId('rename-impact-reference-i1')).toBeInTheDocument();
    expect(screen.getByTestId('rename-impact-reference-total')).toBeInTheDocument();
  });

  // The cost of a rename is not the rewrite, it is that clean objects become
  // dirty and have to be committed.
  test('it counts how many were published and are about to become uncommitted', () => {
    renderDialog();

    const dialog = screen.getByTestId('rename-impact-dialog');
    expect(dialog).toHaveTextContent('2 other objects reference it');
    // Only `i1` was published; `total` was already new, so the count is 1 and
    // the sentence has to agree with it.
    expect(dialog).toHaveTextContent('1 of them is currently published');
    expect(dialog).toHaveTextContent('it becomes an uncommitted change');
    // `i1` was published; `total` was already new, so it is not counted.
    expect(screen.getByTestId('rename-impact-reference-i1')).toHaveTextContent(
      'becomes uncommitted'
    );
    expect(screen.getByTestId('rename-impact-reference-total')).toHaveTextContent('new');
  });

  test('the sentence agrees with the count', () => {
    const { unmount } = renderDialog({
      impact: { ...impact, references: [impact.references[0]] },
    });
    expect(screen.getByTestId('rename-impact-dialog')).toHaveTextContent(
      '1 other object references it'
    );
    unmount();

    renderDialog();
    expect(screen.getByTestId('rename-impact-dialog')).toHaveTextContent(
      '2 other objects reference it'
    );
  });

  test('nothing referencing it says so plainly', () => {
    renderDialog({ impact: { ...impact, references: [] } });

    expect(screen.getByTestId('rename-impact-empty')).toHaveTextContent('only this object changes');
  });
});

describe('it cannot be confirmed until the answer is known', () => {
  test('confirm waits while the impact is loading', () => {
    renderDialog({ impact: null, loading: true });

    expect(screen.getByTestId('rename-impact-confirm')).toBeDisabled();
    expect(screen.getByTestId('rename-impact-loading')).toBeInTheDocument();
  });

  test('a rejection is shown and blocks confirming', () => {
    renderDialog({ impact: null, error: "A resource named 'joined' already exists." });

    expect(screen.getByTestId('rename-impact-error')).toHaveTextContent('already exists');
    expect(screen.getByTestId('rename-impact-confirm')).toBeDisabled();
  });
});

describe('dismissal', () => {
  test('Cancel calls back', () => {
    const onCancel = jest.fn();
    renderDialog({ onCancel });

    fireEvent.click(screen.getByTestId('rename-impact-cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  test('Escape cancels — a rename is never the accidental outcome', () => {
    const onCancel = jest.fn();
    renderDialog({ onCancel });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  test('a backdrop click cancels, a click inside does not', () => {
    const onCancel = jest.fn();
    renderDialog({ onCancel });

    fireEvent.pointerDown(screen.getByTestId('rename-impact-dialog'));
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('rename-impact-backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });

  test('focus starts on Cancel, so Enter does not rename', () => {
    renderDialog();

    expect(screen.getByTestId('rename-impact-cancel')).toHaveFocus();
  });
});

test('Confirm calls back once the impact is known', () => {
  const onConfirm = jest.fn();
  renderDialog({ onConfirm });

  fireEvent.click(screen.getByTestId('rename-impact-confirm'));

  expect(onConfirm).toHaveBeenCalled();
});
