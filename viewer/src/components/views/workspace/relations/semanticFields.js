import { parseRefValue } from '../../../../utils/refString';

/**
 * semanticFields — group a project's metrics + dimensions by their owning model
 * (VIS-1014, the Semantic Layer page).
 *
 * Fields live in two shapes (see useFieldParentModel):
 *   - INLINE on a model: `model.config.metrics[]` / `model.config.dimensions[]`,
 *     each `{ name, expression, ... }`. These belong to that model directly.
 *   - TOP-LEVEL project objects: a metric/dimension record that carries
 *     `parentModel` (serialised ownership) or `config.model` (a `${ref(model)}`).
 *
 * `groupFieldsByModel` folds both into a single `{ [modelName]: { metrics:[],
 * dimensions:[] } }` map of field-name lists, so the ERD model card can list its
 * metrics (cyan) and dimensions (teal) beneath its columns. Duplicates (an inline
 * field also surfaced as a top-level record) are de-duped by name.
 */

const ownerOf = record => {
  if (!record) return null;
  const raw = record.parentModel || record.config?.model || null;
  return raw ? parseRefValue(raw) : null;
};

const fieldName = f => (typeof f === 'string' ? f : f?.name || f?.config?.name);

/**
 * @param {object[]} models       project models ({ name, config?: { metrics, dimensions } }).
 * @param {object[]} metrics      top-level metric records.
 * @param {object[]} dimensions   top-level dimension records.
 * @returns {Record<string, { metrics: string[], dimensions: string[] }>}
 */
export const groupFieldsByModel = (models = [], metrics = [], dimensions = []) => {
  const byModel = {};
  const ensure = name => {
    if (!byModel[name]) byModel[name] = { metrics: new Set(), dimensions: new Set() };
    return byModel[name];
  };

  // 1) Inline fields declared directly on each model.
  (models || []).forEach(model => {
    const cfg = model.config || model;
    const bucket = ensure(model.name);
    (cfg?.metrics || []).forEach(m => {
      const n = fieldName(m);
      if (n) bucket.metrics.add(n);
    });
    (cfg?.dimensions || []).forEach(d => {
      const n = fieldName(d);
      if (n) bucket.dimensions.add(n);
    });
  });

  // 2) Top-level fields attributed to a single owning model. (Top-level fields
  //    with no resolvable single owner — e.g. a metric referencing two models —
  //    are skipped here; they don't belong to one card.)
  (metrics || []).forEach(rec => {
    const owner = ownerOf(rec);
    const n = fieldName(rec);
    if (owner && n) ensure(owner).metrics.add(n);
  });
  (dimensions || []).forEach(rec => {
    const owner = ownerOf(rec);
    const n = fieldName(rec);
    if (owner && n) ensure(owner).dimensions.add(n);
  });

  // Freeze the sets into sorted arrays for stable rendering.
  const out = {};
  Object.keys(byModel).forEach(name => {
    out[name] = {
      metrics: [...byModel[name].metrics].sort(),
      dimensions: [...byModel[name].dimensions].sort(),
    };
  });
  return out;
};

export default groupFieldsByModel;
