// Render smoke tests for the edit forms. They all live in this dir, so the heavy
// leaf imports (RefTextArea, RefSelector, SchemaEditor, monaco, SourceTypeSelector)
// and the store share one set of mocks. A Proxy-backed store satisfies both the
// `useStore()` destructure and the `useStore(s => s.x)` selector styles, returning
// async action stubs and empty collections. The goal is to exercise each form's
// create-mode render + effects (was ~1% covered), not its full interaction matrix
// (SchemaLeafForm.test.jsx covers dimension/metric/relation at interaction depth;
// this file smoke-covers the bespoke forms that have NOT yet migrated.)
import React from 'react';
import { render, screen } from '@testing-library/react';
import MarkdownEditForm from './MarkdownEditForm';
import ProjectDefaultsEditForm from './ProjectDefaultsEditForm';
import SourceEditForm from './SourceEditForm';
import ChartEditForm from './ChartEditForm';
import DashboardEditForm from './DashboardEditForm';
import ModelEditForm from './ModelEditForm';
import InputEditForm from './InputEditForm';
import TableEditForm from './TableEditForm';
import InsightEditForm from './InsightEditForm';

jest.mock('../../../stores/store', () => {
  const listKeys = new Set([
    'charts', 'insights', 'sources', 'models', 'dimensions', 'metrics', 'relations',
    'tables', 'inputs', 'markdowns', 'dashboards', 'pendingChanges', 'selectedTags',
    'allDashboards',
  ]);
  const actionRe = /^(save|delete|fetch|check|update|set|open|close|run|test|clear|initialize|get|add|remove)/;
  const STATE = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'connectionStatus') return {}; // keyed by source name
        if (listKeys.has(prop)) return [];
        if (actionRe.test(prop)) return jest.fn(() => Promise.resolve({ success: true }));
        return undefined;
      },
    }
  );
  return {
    __esModule: true,
    ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
    default: selector => (typeof selector === 'function' ? selector(STATE) : STATE),
  };
});

jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange }) => (
    <textarea aria-label={label || 'ref'} value={value || ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));
jest.mock('./RefSelector', () => ({
  __esModule: true,
  default: ({ label }) => <div data-testid="ref-selector">{label}</div>,
}));
jest.mock('./SchemaEditor', () => ({
  __esModule: true,
  SchemaEditor: () => <div data-testid="schema-editor" />,
}));
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea aria-label="code" value={value || ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));
jest.mock('../../sources/SourceTypeSelector', () => ({
  __esModule: true,
  default: ({ onSelect }) => <button onClick={() => onSelect?.('postgresql')}>pick-type</button>,
}));

const FORMS = [
  ['MarkdownEditForm', MarkdownEditForm],
  ['ProjectDefaultsEditForm', ProjectDefaultsEditForm],
  ['SourceEditForm', SourceEditForm],
  ['ChartEditForm', ChartEditForm],
  ['DashboardEditForm', DashboardEditForm],
  ['ModelEditForm', ModelEditForm],
  ['InputEditForm', InputEditForm],
  ['TableEditForm', TableEditForm],
  ['InsightEditForm', InsightEditForm],
];

describe.each(FORMS)('%s', (name, Form) => {
  it('renders in create mode without crashing', async () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} onCancel={jest.fn()} />);
    // findAllByRole waits out the on-mount effects (fetchSources/fetchInsights →
    // setState) inside act, and asserts the form rendered its action buttons.
    expect((await screen.findAllByRole('button')).length).toBeGreaterThan(0);
  });
});
