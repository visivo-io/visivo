import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import selectEvent from 'react-select-event';
import MarkdownEditForm from './MarkdownEditForm';

// The form destructures `useStore()`; a plain action bag satisfies it.
const mockActions = {
  saveMarkdown: jest.fn(),
  deleteMarkdown: jest.fn(),
  checkCommitStatus: jest.fn(),
};
// Edit mode persists through the useRecordSave backbone (VIS-1018) — mock it
// (the backbone has its own suite) and assert the component's contract.
const mockSaveNow = jest.fn();
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => ({ saveNow: mockSaveNow, status: 'idle' }),
}));
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: selector => (typeof selector === 'function' ? selector(mockActions) : mockActions),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockActions).forEach(fn => fn.mockResolvedValue({ success: true }));
  mockSaveNow.mockResolvedValue({ success: true });
});

const renderForm = (props = {}) =>
  render(
    <MarkdownEditForm
      markdown={null}
      isCreate
      onClose={jest.fn()}
      onSave={jest.fn()}
      {...props}
    />
  );

const fillValid = () => {
  fireEvent.change(screen.getByLabelText(/Markdown Name/), { target: { value: 'doc1' } });
  fireEvent.change(screen.getByLabelText(/Content/), { target: { value: '# Hello' } });
};

// The align/justify selects are the brand react-select; menus portal to body.
const pickOption = async (label, optionText) =>
  selectEvent.select(screen.getByLabelText(label), optionText, { container: document.body });

describe('MarkdownEditForm — create mode validation', () => {
  test('requires a name and content before saving', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockActions.saveMarkdown).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Content is required')).toBeInTheDocument();
  });

  test('rejects an invalid name pattern', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Markdown Name/), { target: { value: 'bad name!' } });
    fireEvent.change(screen.getByLabelText(/Content/), { target: { value: 'text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockActions.saveMarkdown).not.toHaveBeenCalled();
    expect(screen.getByText(/Name must start with a letter or number/)).toBeInTheDocument();
  });
});

describe('MarkdownEditForm — save paths', () => {
  test('saves with the default alignment values and closes', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    renderForm({ onClose, onSave });
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockActions.saveMarkdown).toHaveBeenCalledWith('doc1', {
        name: 'doc1',
        content: '# Hello',
        align: 'left',
        justify: 'start',
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      name: 'doc1',
      content: '# Hello',
      align: 'left',
      justify: 'start',
    });
  });

  test('includes the selected align and justify options in the payload', async () => {
    renderForm();
    fillValid();
    await pickOption('Horizontal Alignment', 'Center');
    await pickOption('Vertical Distribution', 'End');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockActions.saveMarkdown).toHaveBeenCalledWith(
        'doc1',
        expect.objectContaining({ align: 'center', justify: 'end' })
      )
    );
  });

  test('surfaces the backend error and stays open on failure', async () => {
    mockActions.saveMarkdown.mockResolvedValueOnce({ success: false, error: 'nope' });
    const onClose = jest.fn();
    renderForm({ onClose });
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('nope')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // saving flag resets — the button is back to its idle label
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('falls back to a generic message when the result is empty', async () => {
    mockActions.saveMarkdown.mockResolvedValueOnce(undefined);
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save markdown')).toBeInTheDocument();
  });

  test('shows the thrown error message when the save rejects', async () => {
    mockActions.saveMarkdown.mockRejectedValueOnce(new Error('kaboom'));
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('kaboom')).toBeInTheDocument();
  });
});

describe('MarkdownEditForm — edit mode', () => {
  test('initializes from markdown.config, disables the name, and re-saves it', async () => {
    const markdown = {
      name: 'md1',
      status: 'PUBLISHED',
      config: { content: 'Hi there', align: 'right', justify: 'center' },
    };
    renderForm({ markdown, isCreate: false });
    expect(screen.getByLabelText(/Markdown Name/)).toHaveValue('md1');
    expect(screen.getByLabelText(/Markdown Name/)).toBeDisabled();
    expect(screen.getByLabelText(/Content/)).toHaveValue('Hi there');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Edit mode flushes through the useRecordSave backbone (VIS-1018), not a
    // direct saveMarkdown call — create mode keeps the direct call.
    await waitFor(() =>
      expect(mockSaveNow).toHaveBeenCalledWith({
        name: 'md1',
        content: 'Hi there',
        align: 'right',
        justify: 'center',
      })
    );
    expect(mockActions.saveMarkdown).not.toHaveBeenCalled();
  });

  test('falls back to flat fields when the markdown has no config', () => {
    renderForm({
      markdown: { name: 'md2', content: 'Flat text', align: 'center', justify: 'end' },
      isCreate: false,
    });
    expect(screen.getByLabelText(/Content/)).toHaveValue('Flat text');
    expect(screen.getByText('Center')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });
});

describe('MarkdownEditForm — delete flow', () => {
  const published = { name: 'md1', status: 'PUBLISHED', config: { content: 'Hi' } };

  test('deletes after confirmation, refreshes commit status, and closes', async () => {
    const onClose = jest.fn();
    renderForm({ markdown: published, isCreate: false, onClose });
    fireEvent.click(screen.getByTitle('Delete markdown'));
    expect(screen.getByText(/mark it for deletion/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(mockActions.deleteMarkdown).toHaveBeenCalledWith('md1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockActions.checkCommitStatus).toHaveBeenCalled();
  });

  test('shows the delete error and collapses the confirm panel on failure', async () => {
    mockActions.deleteMarkdown.mockResolvedValueOnce({ success: false, error: 'locked' });
    const onClose = jest.fn();
    renderForm({ markdown: published, isCreate: false, onClose });
    fireEvent.click(screen.getByTitle('Delete markdown'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(await screen.findByText('locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('warns about discarding unsaved changes for NEW markdowns and can cancel', () => {
    renderForm({ markdown: { ...published, status: 'NEW' }, isCreate: false });
    fireEvent.click(screen.getByTitle('Delete markdown'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
    // The confirm panel renders above the footer, so its Cancel comes first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockActions.deleteMarkdown).not.toHaveBeenCalled();
    expect(screen.getByTitle('Delete markdown')).toBeInTheDocument();
  });
});
