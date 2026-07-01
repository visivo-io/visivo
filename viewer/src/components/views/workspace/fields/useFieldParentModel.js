import { useEffect, useMemo } from 'react';
import useStore from '../../../../stores/store';
import { parseRefValue } from '../../../../utils/refString';

/**
 * useFieldParentModel — resolve the owning model of a dimension / metric record
 * (VIS-1009, the Field Lens).
 *
 * Dimensions and metrics are embedded under a model (`models[].dimensions` /
 * `models[].metrics`). The backend serialises that ownership onto the record as
 * `parentModel`; an explicitly-scoped field may instead carry `config.model`
 * (a `${ref(model)}` string). This mirrors the resolution the Explorer store
 * already uses: `item.parentModel || item.config?.model` (explorerNewStore).
 *
 * Given the field record (a dimension/metric collection entry with `config`),
 * this hook resolves the parent model NAME and the full model RECORD from the
 * `models` collection (fetched if empty), plus the model's `sql` + resolved
 * `source` name — everything the Field Lens needs to run / profile the field's
 * expression as a derived column of its parent model.
 *
 * @param {object|null} fieldRecord - the dimension/metric record ({ name, config,
 *   parentModel? } — the unwrapped collection entry, not the `config` alone).
 * @returns {{
 *   parentModelName: string|null,
 *   model: object|null,           // the owning model record from `models`
 *   modelConfig: object|null,     // unwrapped model config ({ sql, source, ... })
 *   sourceName: string|null,      // resolved source name (model.source ref or default)
 *   status: 'resolved'|'no-parent'|'model-not-found'|'loading',
 * }}
 */
export function useFieldParentModel(fieldRecord) {
  const models = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);
  const sources = useStore(s => s.sources);
  const fetchSources = useStore(s => s.fetchSources);
  const defaults = useStore(s => s.defaults);
  const fetchDefaults = useStore(s => s.fetchDefaults);

  useEffect(() => {
    if ((!models || models.length === 0) && typeof fetchModels === 'function') fetchModels();
    if ((!sources || sources.length === 0) && typeof fetchSources === 'function') fetchSources();
    if (!defaults && typeof fetchDefaults === 'function') fetchDefaults();
  }, [models, fetchModels, sources, fetchSources, defaults, fetchDefaults]);

  // Owning model NAME: prefer the serialised `parentModel`, else a `${ref(model)}`
  // on the field config. parseRefValue unwraps either bare or context-string refs.
  const parentModelName = useMemo(() => {
    if (!fieldRecord) return null;
    const raw = fieldRecord.parentModel || fieldRecord.config?.model || null;
    return raw ? parseRefValue(raw) : null;
  }, [fieldRecord]);

  const model = useMemo(() => {
    if (!parentModelName || !Array.isArray(models)) return null;
    return models.find(m => m.name === parentModelName) || null;
  }, [models, parentModelName]);

  const modelConfig = useMemo(() => {
    if (!model) return null;
    return model.config || model;
  }, [model]);

  // Source name: the model's `source` ref, else the project default, else the
  // first available source — the same convention ModelPreview uses.
  const sourceName = useMemo(() => {
    if (modelConfig?.source && typeof modelConfig.source === 'string') {
      return parseRefValue(modelConfig.source);
    }
    const list = Array.isArray(sources) ? sources : [];
    return defaults?.source_name || list[0]?.name || null;
  }, [modelConfig, sources, defaults]);

  const status = useMemo(() => {
    if (!fieldRecord) return 'loading';
    if (!parentModelName) return 'no-parent';
    if (!Array.isArray(models)) return 'loading';
    if (model) return 'resolved';
    return models.length === 0 ? 'loading' : 'model-not-found';
  }, [fieldRecord, parentModelName, models, model]);

  return { parentModelName, model, modelConfig, sourceName, status };
}

export default useFieldParentModel;
