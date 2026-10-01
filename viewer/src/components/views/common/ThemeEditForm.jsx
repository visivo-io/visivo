import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import useStore from '../../../stores/store';
import { selectProjectTheme } from '../../../stores/themeStore';
import { FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import { BUILTIN_THEMES } from '../../../theme/builtinThemes';
import { resolveTheme, resolveTokens } from '../../../theme/resolveTheme';
import PALETTES from '../../../theme/palettes.json';

const SCOPES = [
  { key: 'shared', label: 'Both modes' },
  { key: 'light', label: 'Light only' },
  { key: 'dark', label: 'Dark only' },
];

const COLOR_TOKENS = [
  ['background', 'Page background'],
  ['surface', 'Card surface'],
  ['text', 'Text'],
  ['muted_text', 'Muted text'],
  ['border', 'Borders'],
  ['grid', 'Gridlines'],
  ['accent', 'Accent'],
];

const CUSTOM_COLORWAY = '__custom__';
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isEmpty = value =>
  value === undefined ||
  value === null ||
  value === '' ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

const compact = obj =>
  Object.fromEntries(
    Object.entries(obj)
      .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? compact(v) : v])
      .filter(([, v]) => !isEmpty(v))
  );

const scopeTokens = (draft, scope) => (scope === 'shared' ? draft : draft[scope] || {});

const withScopeToken = (draft, scope, key, value) => {
  if (scope === 'shared') return { ...draft, [key]: value };
  return { ...draft, [scope]: { ...(draft[scope] || {}), [key]: value } };
};

const previewMode = (draft, scope) => {
  if (scope === 'light' || scope === 'dark') return scope;
  return draft.mode === 'dark' ? 'dark' : 'light';
};

const PREVIEW_TRACES = [
  { type: 'bar', name: 'North', x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [32, 41, 38, 52] },
  { type: 'bar', name: 'South', x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [24, 30, 45, 40] },
  { type: 'scatter', mode: 'lines+markers', name: 'Target', x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [30, 36, 42, 48] },
];

export const ThemePreview = ({ draft, mode }) => {
  const theme = resolveTheme(draft, mode);
  const layout = useMemo(
    () => ({
      template: theme.plotlyTemplate,
      title: { text: 'Revenue by quarter' },
      height: 220,
      margin: { t: 36, r: 12, b: 48, l: 36 },
      legend: { orientation: 'h', y: -0.2, x: 0 },
    }),
    [theme]
  );

  return (
    <div
      data-testid="theme-preview"
      data-theme={theme.mode}
      className="visivo-dashboard-theme rounded-lg p-3 space-y-3"
      style={{ ...theme.cssVars, colorScheme: theme.mode }}
    >
      <div className="rounded-2xl border border-(--vt-border) bg-(--vt-surface) overflow-hidden">
        <Plot
          data={PREVIEW_TRACES}
          layout={layout}
          config={{ displayModeBar: false, staticPlot: true }}
          style={{ width: '100%' }}
          useResizeHandler
        />
      </div>
      <div className="rounded-2xl border border-(--vt-border) bg-(--vt-surface) overflow-hidden text-xs">
        <table className="w-full">
          <thead className="bg-(--vt-table-header)">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold">Region</th>
              <th className="px-3 py-1.5 text-right font-semibold">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['North', '$1.2M'],
              ['South', '$0.9M'],
            ].map(([region, revenue], i) => (
              <tr key={region} className={i % 2 ? 'bg-(--vt-table-stripe)' : ''}>
                <td className="px-3 py-1.5">{region}</td>
                <td className="px-3 py-1.5 text-right text-(--vt-muted)">{revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ColorTokenInput = ({ id, label, value, placeholder, onChange }) => {
  const invalid = value && !HEX_RE.test(value);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={HEX_RE.test(value || '') && value.length === 7 ? value : placeholder}
        onChange={e => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
      />
      <label htmlFor={id} className="w-28 text-xs font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={`w-24 rounded-md border px-2 py-1 font-mono text-xs ${
          invalid ? 'border-highlight-500' : 'border-gray-300'
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs text-gray-500 hover:text-gray-800"
          aria-label={`Reset ${label}`}
        >
          Reset
        </button>
      )}
    </div>
  );
};

const ThemeEditForm = () => {
  const savedTheme = useStore(selectProjectTheme);
  const fetchTheme = useStore(state => state.fetchTheme);
  const saveTheme = useStore(state => state.saveTheme);

  const [draft, setDraft] = useState({});
  const [scope, setScope] = useState('shared');
  const [layoutText, setLayoutText] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchTheme?.();
  }, [fetchTheme]);

  useEffect(() => {
    const next = savedTheme || {};
    setDraft(next);
    setLayoutText(
      Object.fromEntries(
        SCOPES.map(({ key }) => {
          const layout = scopeTokens(next, key).plotly_layout;
          return [key, layout ? JSON.stringify(layout, null, 2) : ''];
        })
      )
    );
  }, [savedTheme]);

  const mode = previewMode(draft, scope);
  const placeholderTokens = useMemo(
    () =>
      scope === 'shared'
        ? BUILTIN_THEMES[mode]
        : resolveTokens({ ...draft, light: undefined, dark: undefined }, mode),
    [draft, scope, mode]
  );

  const current = scopeTokens(draft, scope);
  const setToken = (key, value) => {
    setSaved(false);
    setDraft(d => withScopeToken(d, scope, key, value));
  };

  const colorwayValue = Array.isArray(current.colorway)
    ? CUSTOM_COLORWAY
    : current.colorway || '';

  const handleSave = async () => {
    setError(null);
    let next = draft;
    for (const { key } of SCOPES) {
      const text = (layoutText[key] || '').trim();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        setError(`Plotly layout (${SCOPES.find(s => s.key === key).label}) is not valid JSON`);
        return;
      }
      next = withScopeToken(next, key, 'plotly_layout', parsed);
    }
    setSaving(true);
    const result = await saveTheme(compact(next));
    setSaving(false);
    if (result?.success) setSaved(true);
    else setError(result?.error || 'Failed to save theme');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="theme-edit-form">
      {error && <FormAlert variant="error">{error}</FormAlert>}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-gray-700">
          Default mode
          <select
            value={draft.mode || 'light'}
            onChange={e => {
              setSaved(false);
              setDraft(d => ({ ...d, mode: e.target.value }));
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Match viewer's system</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-1.5 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={draft.allow_viewer_toggle !== false}
            onChange={e => {
              setSaved(false);
              setDraft(d => ({ ...d, allow_viewer_toggle: e.target.checked }));
            }}
            className="h-4 w-4"
          />
          Viewers can switch modes
        </label>
      </div>

      <div role="tablist" aria-label="Theme scope" className="flex gap-1 rounded-md bg-gray-100 p-1">
        {SCOPES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={scope === key}
            onClick={() => setScope(key)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
              scope === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {COLOR_TOKENS.map(([key, label]) => (
          <ColorTokenInput
            key={`${scope}-${key}`}
            id={`theme-${scope}-${key}`}
            label={label}
            value={current[key]}
            placeholder={placeholderTokens[key]}
            onChange={value => setToken(key, value)}
          />
        ))}
      </div>

      <label className="block text-xs font-medium text-gray-700">
        Series colors
        <select
          value={colorwayValue}
          onChange={e => {
            const value = e.target.value;
            if (value === CUSTOM_COLORWAY) setToken('colorway', [...placeholderTokens.colorway]);
            else setToken('colorway', value || undefined);
          }}
          className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">{scope === 'shared' ? 'Built-in' : 'Same as both modes'}</option>
          {Object.keys(PALETTES).map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={CUSTOM_COLORWAY}>Custom…</option>
        </select>
      </label>
      {Array.isArray(current.colorway) && (
        <input
          aria-label="Custom series colors"
          value={current.colorway.join(', ')}
          onChange={e =>
            setToken(
              'colorway',
              e.target.value
                .split(',')
                .map(c => c.trim())
                .filter(Boolean)
            )
          }
          className="block w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs"
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 text-xs font-medium text-gray-700">
          Font family
          <input
            value={current.font_family || ''}
            placeholder={scope === 'shared' ? 'System UI' : 'Same as both modes'}
            onChange={e => setToken('font_family', e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Font size
          <input
            type="number"
            min={8}
            max={32}
            value={current.font_size ?? ''}
            placeholder={String(placeholderTokens.font_size)}
            onChange={e => setToken('font_size', e.target.value ? Number(e.target.value) : undefined)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-gray-700">
        Plotly layout (JSON, applied to every chart)
        <textarea
          rows={4}
          value={layoutText[scope] || ''}
          placeholder='{"hoverlabel": {"font": {"size": 13}}}'
          onChange={e => {
            setSaved(false);
            setLayoutText(t => ({ ...t, [scope]: e.target.value }));
          }}
          className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs"
        />
      </label>

      <ThemePreview draft={draft} mode={mode} />

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <ButtonOutline
          type="button"
          className="text-sm"
          onClick={() => {
            setSaved(false);
            setDraft({});
            setLayoutText({});
          }}
        >
          Reset to built-in
        </ButtonOutline>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-gray-500">Saved as a draft</span>}
          <Button type="button" onClick={handleSave} disabled={saving} className="text-sm">
            {saving ? 'Saving…' : 'Save theme'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ThemeEditForm;
