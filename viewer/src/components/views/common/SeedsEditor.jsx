import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

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

/**
 * SeedsEditor - edits a source's `seeds` list.
 *
 * Each seed runs a command whose CSV output is loaded into `table_name` on the
 * source before any model queries it.
 *
 * Props:
 * - seeds: array of { table_name, args, allow_empty }
 * - onChange: called with the updated seeds array
 */
const SeedsEditor = ({ seeds, onChange }) => {
  const list = seeds?.length ? seeds : [];

  const updateSeed = (index, patch) =>
    onChange(list.map((seed, i) => (i === index ? { ...seed, ...patch } : seed)));

  const addSeed = () => onChange([...list, emptySeed()]);
  const removeSeed = index => onChange(list.filter((_, i) => i !== index));

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
        Each seed runs a command and loads its CSV output into a table on this source, before any
        model queries it.
      </p>

      {list.length === 0 && (
        <p className="text-xs text-gray-400 italic">No seeds configured.</p>
      )}

      {list.map((seed, seedIndex) => (
        <div key={seedIndex} className="p-3 border border-gray-200 rounded-md space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label={`Seed ${seedIndex + 1} table name`}
              value={seed.table_name || ''}
              onChange={e => updateSeed(seedIndex, { table_name: e.target.value })}
              placeholder="table name"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
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
              Allow empty output
            </label>
          </div>

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
              <div key={argIndex} className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label={`Seed ${seedIndex + 1} argument ${argIndex + 1}`}
                  value={arg}
                  onChange={e => updateArg(seedIndex, argIndex, e.target.value)}
                  placeholder={argIndex === 0 ? 'command (e.g. cat, python)' : 'argument'}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                {(seed.args || []).length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeArg(seedIndex, argIndex)}
                    aria-label={`Remove seed ${seedIndex + 1} argument ${argIndex + 1}`}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    <RemoveIcon fontSize="small" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SeedsEditor;
