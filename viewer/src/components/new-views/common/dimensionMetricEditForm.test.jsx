import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DimensionEditForm from './DimensionEditForm';
import MetricEditForm from './MetricEditForm';

// Dimension and Metric edit forms are structurally identical (name + Expression
// + Description, project-level save path in create mode). One parametrized suite
// covers both at interaction depth.
const mockActions = {
  saveDimension: jest.fn(),
  deleteDimension: jest.fn(),
  saveMetric: jest.fn(),
  deleteMetric: jest.fn(),
  checkCommitStatus: jest.fn(),
};
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: () => mockActions,
}));
jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange, error }) => (
    <>
      <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
      {error && <span>{error}</span>}
    </>
  ),
}));

const CASES = [
  {
    label: 'Dimension',
    Form: DimensionEditForm,
    prop: 'dimension',
    nameLabel: /Dimension Name/,
    save: () => mockActions.saveDimension,
    del: () => mockActions.deleteDimension,
  },
  {
    label: 'Metric',
    Form: MetricEditForm,
    prop: 'metric',
    nameLabel: /Metric Name/,
    save: () => mockActions.saveMetric,
    del: () => mockActions.deleteMetric,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockActions).forEach(fn => fn.mockResolvedValue({ success: true }));
});

describe.each(CASES)('$label EditForm', ({ Form, prop, nameLabel, save, del }) => {
  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(nameLabel), { target: { value: 'x1' } });
    fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'sum(amount)' } });
  };

  it('renders the create form', () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByLabelText(nameLabel)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('validates required name and expression', () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save()).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Expression is required')).toBeInTheDocument();
  });

  it('saves a valid object and closes', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    render(<Form isCreate onClose={onClose} onSave={onSave} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith(
        'x1',
        expect.objectContaining({ name: 'x1', expression: 'sum(amount)' })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces a save failure', async () => {
    save().mockResolvedValueOnce({ success: false, error: 'dup name' });
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('dup name')).toBeInTheDocument();
  });

  it('deletes in edit mode after confirmation', async () => {
    const onClose = jest.fn();
    const obj = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
    render(<Form {...{ [prop]: obj }} onClose={onClose} onSave={jest.fn()} />);
    expect(screen.getByLabelText(nameLabel)).toBeDisabled();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(del()).toHaveBeenCalledWith('x1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
