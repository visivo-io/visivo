import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { FormInput } from '../../styled/FormComponents';

/**
 * Source types that cannot carry seeds.
 *
 * Mirrors the backend: `seeds` lives on ServerSource, so file-backed sources
 * (which build a throwaway in-memory connection) reject it outright. Keep this
 * in step with the Python model or the form will offer a field the API refuses.
 */
export const SEEDLESS_SOURCE_TYPES = ['csv', 'xls'];

export const sourceTypeSupportsSeeds = sourceType =>
  !!sourceType && !SEEDLESS_SOURCE_TYPES.includes(sourceType);

const emptySeed = () => ({ table_name: '', args: [''] });

const FILE_ONLY_KEYS = ['file', 'format', 'delimiter', 'has_header', 'sheet', 'union_by_name'];

export const isFileSeed = seed => typeof seed?.file === 'string' && !seed?.args;

const withMode = (seed, mode) => {
  const { args, ...rest } = seed;
  if (mode === 'file') return { ...rest, file: '' };
  const commandSeed = { ...rest, args: args?.length ? args : [''] };
  FILE_ONLY_KEYS.forEach(key => delete commandSeed[key]);
  return commandSeed;
};

/**
 * SeedsEditor - edits a source's `seeds` list.
 *
 * Each seed loads a data file, or the CSV output of a command, into `table_name`
 * on the source before any model queries it.
 *
 * Props:
 * - seeds: array of { table_name, args | file, allow_empty, existing_table }
 * - onChange: called with the updated seeds array
 */
const SeedsEditor = ({ seeds, onChange }) => {
  const list = seeds?.length ? seeds : [];

  const updateSeed = (index, patch) =>
    onChange(list.map((seed, i) => (i === index ? { ...seed, ...patch } : seed)));

  const addSeed = () => onChange([...list, emptySeed()]);
  const removeSeed = index => onChange(list.filter((_, i) => i !== index));
  const setMode = (index, mode) =>
    onChange(list.map((seed, i) => (i === index ? withMode(seed, mode) : seed)));

  const updateArg = (seedIndex, argIndex, value) => {
    const args = [...(list[seedIndex].args || [])];
    args[argIndex] = value;
    updateSeed(seedIndex, { args });
  };
  const addArg = seedIndex =>
    updateSeed(seedIndex, { args: [...(list[seedIndex].args || []), ''] });
  const removeArg = (seedIndex, argIndex) =>
    updateSeed(seedIndex, { args: list[seedIndex].args.filter((_, i) => i !== argIndex) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Seeds</label>
        <button
          type="button"
          onClick={addSeed}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
        >
          <AddIcon fontSize="small" />
          Add Seed
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Each seed loads a data file, or the CSV output of a command, into a table on this source
        before any model queries it.
      </p>

      {list.length === 0 && <p className="text-xs text-gray-400 italic">No seeds configured.</p>}

      {list.map((seed, seedIndex) => (
        <div key={seedIndex} className="p-3 border border-gray-200 rounded-md space-y-2">
          <div
            role="group"
            aria-label={`Seed ${seedIndex + 1} loads from`}
            className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs"
          >
            {[
              ['file', 'File'],
              ['command', 'Command'],
            ].map(([mode, label]) => {
              const active = (mode === 'file') === isFileSeed(seed);
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && setMode(seedIndex, mode)}
                  className={`px-3 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    active
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <FormInput
              id={`seed-${seedIndex}-table-name`}
              label={isFileSeed(seed) ? 'Table name (optional)' : 'Table name'}
              aria-label={`Seed ${seedIndex + 1} table name`}
              value={seed.table_name || ''}
              onChange={e => updateSeed(seedIndex, { table_name: e.target.value })}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeSeed(seedIndex)}
              aria-label={`Remove seed ${seedIndex + 1}`}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
            >
              <RemoveIcon fontSize="small" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`seed-${seedIndex}-allow-empty`}
              type="checkbox"
              checked={!!seed.allow_empty}
              onChange={e => updateSeed(seedIndex, { allow_empty: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label
              htmlFor={`seed-${seedIndex}-allow-empty`}
              className="text-xs font-medium text-gray-700"
            >
              {isFileSeed(seed) ? 'Allow no matching file' : 'Allow empty output'}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor={`seed-${seedIndex}-existing-table`}
              className="text-xs font-medium text-gray-700"
            >
              When table exists
            </label>
            <select
              id={`seed-${seedIndex}-existing-table`}
              value={seed.existing_table || 'skip'}
              onChange={e => updateSeed(seedIndex, { existing_table: e.target.value })}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="skip">Skip</option>
              <option value="append">Append</option>
              <option value="overwrite">Overwrite</option>
            </select>
          </div>

          {isFileSeed(seed) && (
            <div className="space-y-1">
              <FormInput
                id={`seed-${seedIndex}-file`}
                label="File path"
                aria-label={`Seed ${seedIndex + 1} file`}
                value={seed.file}
                onChange={e => updateSeed(seedIndex, { file: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                CSV, TSV, Parquet, JSON or .xlsx. A glob such as data/*.csv loads every match.
              </p>
            </div>
          )}

          {!isFileSeed(seed) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Command Arguments</span>
                <button
                  type="button"
                  onClick={() => addArg(seedIndex)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                >
                  <AddIcon fontSize="small" />
                  Add
                </button>
              </div>
              {(seed.args || []).map((arg, argIndex) => (
                <div key={argIndex} className="flex items-start gap-2">
                  {/* textarea (not input) so a multi-line arg — e.g. a CSV piped to
                    echo — keeps its newlines instead of being collapsed onto one
                    line; it auto-sizes to the content and is resizable. */}
                  <textarea
                    aria-label={`Seed ${seedIndex + 1} argument ${argIndex + 1}`}
                    value={arg}
                    onChange={e => updateArg(seedIndex, argIndex, e.target.value)}
                    placeholder={argIndex === 0 ? 'command (e.g. cat, python)' : 'argument'}
                    rows={Math.min(12, Math.max(1, String(arg || '').split('\n').length))}
                    spellCheck={false}
                    className="flex-1 px-2 py-1.5 text-sm font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
                  />
                  {(seed.args || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArg(seedIndex, argIndex)}
                      aria-label={`Remove argument ${argIndex + 1} from seed ${seedIndex + 1}`}
                      className="mt-1 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    >
                      <RemoveIcon fontSize="small" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SeedsEditor;
