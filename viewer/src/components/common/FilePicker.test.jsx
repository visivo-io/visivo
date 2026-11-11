import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilePicker from './FilePicker';
import { listProjectFiles, ProjectFileError } from '../../api/projectFiles';
import useStore from '../../stores/store';

jest.mock('../../api/projectFiles', () => {
  const actual = jest.requireActual('../../api/projectFiles');
  return { ...actual, listProjectFiles: jest.fn() };
});

const files = [
  { path: 'files/sales.csv', filename: 'sales.csv', size: 48213 },
  { path: 'data/budget.csv', filename: 'budget.csv', size: 512 },
];

const renderPicker = (props = {}) => {
  const onSelect = jest.fn();
  render(<FilePicker extensions={['csv']} label="CSV File" onSelect={onSelect} {...props} />);
  return { onSelect };
};

beforeEach(() => {
  listProjectFiles.mockReset();
  useStore.setState({ project: null });
});

test('lists matching project files and returns the chosen path', async () => {
  listProjectFiles.mockResolvedValue({ files, formats: [], max_bytes: 1 });
  const { onSelect } = renderPicker();

  await userEvent.click(screen.getByRole('button', { name: 'Browse project files' }));

  expect(listProjectFiles).toHaveBeenCalledWith({ extensions: ['csv'], projectId: undefined });
  const options = await screen.findAllByTestId('file-picker-option');
  expect(options.map(o => o.textContent)).toEqual([
    'files/sales.csv47.1 KB',
    'data/budget.csv512 B',
  ]);

  await userEvent.click(options[0]);

  expect(onSelect).toHaveBeenCalledWith('files/sales.csv');
  expect(screen.queryByTestId('file-picker-panel')).not.toBeInTheDocument();
  expect(screen.getByTestId('file-picker-browse')).toHaveFocus();
});

test('scopes the listing to the current project', async () => {
  useStore.setState({ project: { id: 'p-42' } });
  listProjectFiles.mockResolvedValue({ files: [], formats: [], max_bytes: 1 });
  renderPicker();

  await userEvent.click(screen.getByTestId('file-picker-browse'));

  await waitFor(() =>
    expect(listProjectFiles).toHaveBeenCalledWith({ extensions: ['csv'], projectId: 'p-42' })
  );
});

test('says so when the project has no matching files', async () => {
  listProjectFiles.mockResolvedValue({ files: [], formats: [], max_bytes: 1 });
  renderPicker({ extensions: ['csv', 'tsv'] });

  await userEvent.click(screen.getByTestId('file-picker-browse'));

  expect(await screen.findByText('No .csv, .tsv files in this project yet.')).toBeInTheDocument();
});

test('tells the user to type the path where the server cannot list files', async () => {
  listProjectFiles.mockRejectedValue(
    new ProjectFileError('Not available yet (VIS-1755).', { code: 'not_implemented', status: 501 })
  );
  renderPicker();

  await userEvent.click(screen.getByTestId('file-picker-browse'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Browsing project files is not available here yet. Type the path instead.'
  );
});

test('shows the server error otherwise', async () => {
  listProjectFiles.mockRejectedValue(new ProjectFileError('Disk on fire', { code: 'x' }));
  renderPicker();

  await userEvent.click(screen.getByTestId('file-picker-browse'));

  expect(await screen.findByRole('alert')).toHaveTextContent('Disk on fire');
});

test('Escape closes the list and returns focus to Browse', async () => {
  listProjectFiles.mockResolvedValue({ files, formats: [], max_bytes: 1 });
  renderPicker();

  await userEvent.click(screen.getByTestId('file-picker-browse'));
  await screen.findAllByTestId('file-picker-option');
  await userEvent.keyboard('{Escape}');

  expect(screen.queryByTestId('file-picker-panel')).not.toBeInTheDocument();
  expect(screen.getByTestId('file-picker-browse')).toHaveFocus();
});

test('a click outside closes the list', async () => {
  listProjectFiles.mockResolvedValue({ files, formats: [], max_bytes: 1 });
  render(
    <>
      <FilePicker extensions={['csv']} onSelect={jest.fn()} />
      <p>outside</p>
    </>
  );

  await userEvent.click(screen.getByTestId('file-picker-browse'));
  await screen.findAllByTestId('file-picker-option');
  await userEvent.click(screen.getByText('outside'));

  expect(screen.queryByTestId('file-picker-panel')).not.toBeInTheDocument();
});
