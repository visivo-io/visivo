/**
 * FormShell tests (VIS-991)
 *
 * The thin end-to-end wrapper: it loads an object schema via the (mocked)
 * projectSchema loader, builds the group spec, and renders the grouped form.
 * FieldGroupList is mocked to keep the test focused on FormShell's load/build
 * orchestration and loading/empty states.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { FormShell } from './FormShell';

const mockFieldGroupListSpy = jest.fn();
jest.mock('./FieldGroupList', () => ({
  __esModule: true,
  FieldGroupList: props => {
    mockFieldGroupListSpy(props);
    return (
      <div data-testid="field-group-list-mock">
        {props.groupSpec.map(g => (
          <span key={g.id} data-testid={`grp-${g.id}`}>
            {g.id}
          </span>
        ))}
      </div>
    );
  },
}));

const DIMENSION_SCHEMA = {
  type: 'object',
  required: ['expression'],
  properties: {
    name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    expression: { type: 'string', description: 'SQL' },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  $defs: { 'query-string': {} },
};

let mockGetObjectSchema;
let mockGetObjectSchemaSync;
jest.mock('../../../schemas/projectSchema', () => ({
  __esModule: true,
  getObjectSchema: (...args) => mockGetObjectSchema(...args),
  getObjectSchemaSync: (...args) => mockGetObjectSchemaSync(...args),
}));

describe('FormShell', () => {
  beforeEach(() => {
    mockFieldGroupListSpy.mockClear();
    mockGetObjectSchema = jest.fn().mockResolvedValue(DIMENSION_SCHEMA);
    mockGetObjectSchemaSync = jest.fn().mockReturnValue(null);
  });

  test('shows a loading state while the schema dynamic-imports', async () => {
    let resolve;
    mockGetObjectSchema = jest.fn().mockReturnValue(new Promise(r => (resolve = r)));
    render(<FormShell type="dimension" value={{}} onChange={() => {}} />);
    expect(screen.getByTestId('form-shell-loading')).toBeInTheDocument();
    await act(async () => {
      resolve(DIMENSION_SCHEMA);
    });
    expect(await screen.findByTestId('form-shell')).toBeInTheDocument();
  });

  test('loads the schema, builds groups, and renders FieldGroupList', async () => {
    render(<FormShell type="dimension" value={{ expression: 'sum(x)' }} onChange={() => {}} />);
    expect(await screen.findByTestId('field-group-list-mock')).toBeInTheDocument();
    // Essentials (required expression) must be a built group.
    expect(screen.getByTestId('grp-essentials')).toBeInTheDocument();
    const props = mockFieldGroupListSpy.mock.calls.at(-1)[0];
    expect(Array.isArray(props.groupSpec)).toBe(true);
    expect(props.groupSpec.some(g => g.id === 'essentials')).toBe(true);
    // $defs threaded for ref resolution.
    expect(props.defs).toEqual(DIMENSION_SCHEMA.$defs);
  });

  test('passes value + onChange straight through to FieldGroupList', async () => {
    const onChange = jest.fn();
    const value = { expression: 'x' };
    render(<FormShell type="dimension" value={value} onChange={onChange} />);
    await waitFor(() => expect(mockFieldGroupListSpy).toHaveBeenCalled());
    const props = mockFieldGroupListSpy.mock.calls.at(-1)[0];
    expect(props.value).toBe(value);
    expect(props.onChange).toBe(onChange);
  });

  test('renders the cached schema synchronously without a loading flash', () => {
    mockGetObjectSchemaSync = jest.fn().mockReturnValue(DIMENSION_SCHEMA);
    render(<FormShell type="dimension" value={{}} onChange={() => {}} />);
    expect(screen.queryByTestId('form-shell-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-shell')).toBeInTheDocument();
  });

  test('renders an empty state for an unknown object type', async () => {
    mockGetObjectSchema = jest.fn().mockResolvedValue(null);
    render(<FormShell type="bogus" value={{}} onChange={() => {}} />);
    expect(await screen.findByTestId('form-shell-empty')).toBeInTheDocument();
  });
});
