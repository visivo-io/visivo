import {
  buildModelsSignature,
  buildInsightFreshnessSignature,
} from './insightFreshnessSignature';

// An insight whose props reference ONLY `orders` (never `customers`).
const insightState = {
  type: 'scatter',
  props: {
    x: '?{ ref(orders).created_at }',
    y: '?{ sum(ref(orders).amount) }',
  },
  interactions: [],
};

const modelStates = {
  orders: { sql: 'select * from orders', sourceName: 'db', queryResult: { rows: [{}, {}] } },
  customers: { sql: 'select * from customers', sourceName: 'db', queryResult: { rows: [{}] } },
};

describe('buildModelsSignature — referenced-name scoping', () => {
  it('folds every model when no referenced set is given (back-compat)', () => {
    const sig = buildModelsSignature(modelStates);
    expect(sig.map(m => m.name).sort()).toEqual(['customers', 'orders']);
  });

  it('folds ONLY the models in the referenced set when one is given', () => {
    const sig = buildModelsSignature(modelStates, new Set(['orders']));
    expect(sig.map(m => m.name)).toEqual(['orders']);
  });
});

describe('buildModelsSignature — tracks computed columns + enrichment', () => {
  const base = { sql: 'select * from t', sourceName: 'db', queryResult: { rows: [{}, {}] } };

  it('changes when a computed column is added (so an unenriched drop recompiles)', () => {
    const before = JSON.stringify(buildModelsSignature({ t: base }));
    const after = JSON.stringify(
      buildModelsSignature({
        t: { ...base, computedColumns: [{ name: 'combined', expression: 'a || b' }] },
      })
    );
    // GUARD: drop `computedColumns` from the fold and this equality holds —
    // adding a computed column would not refresh the preview.
    expect(after).not.toBe(before);
  });

  it('changes when a computed column EXPRESSION is edited', () => {
    const withCol = { ...base, computedColumns: [{ name: 'c', expression: 'a + b' }] };
    const edited = { ...base, computedColumns: [{ name: 'c', expression: 'a - b' }] };
    expect(JSON.stringify(buildModelsSignature({ t: edited }))).not.toBe(
      JSON.stringify(buildModelsSignature({ t: withCol }))
    );
  });

  it('changes when async enrichment lands the computed column (the self-heal signal)', () => {
    // The drop compiled against the pre-enrichment result (columns a, b);
    // enrichment then adds `combined`. The signature MUST change so the
    // preview recompiles and resolves ref(model).combined.
    const preEnrich = {
      ...base,
      computedColumns: [{ name: 'combined', expression: 'a || b' }],
      enrichedResult: { columns: ['a', 'b'] },
    };
    const postEnrich = {
      ...preEnrich,
      enrichedResult: { columns: ['a', 'b', 'combined'] },
    };
    // GUARD: drop `enrichedColumns` from the fold and this equality holds —
    // enrichment completion would not recompile, so the transient "column not
    // found" 400 sticks permanently (the reported bug).
    expect(JSON.stringify(buildModelsSignature({ t: postEnrich }))).not.toBe(
      JSON.stringify(buildModelsSignature({ t: preEnrich }))
    );
  });
});

describe('buildInsightFreshnessSignature — scoped to referenced models', () => {
  it('does NOT change when an UNreferenced model is renamed/edited', () => {
    const before = buildInsightFreshnessSignature(insightState, modelStates);
    // Rename `customers` -> `customers_v2` (new key) AND rewrite its SQL — the
    // exact shape of a model rename, which used to move the cache key and flip
    // every insight's signature. `orders` (the only referenced model) is
    // untouched.
    const afterRename = buildInsightFreshnessSignature(insightState, {
      orders: modelStates.orders,
      customers_v2: { ...modelStates.customers, sql: 'select 1' },
    });
    // GUARD: with the scoping removed (buildModelsSignature folding ALL
    // models), this equality FAILS — the renamed/edited `customers` would
    // change the fold and thus the signature. That is the falsification.
    expect(afterRename).toBe(before);
  });

  it('DOES change when a REFERENCED model is edited', () => {
    const before = buildInsightFreshnessSignature(insightState, modelStates);
    const afterOrdersEdit = buildInsightFreshnessSignature(insightState, {
      ...modelStates,
      orders: { ...modelStates.orders, sql: 'select * from orders where 1=1' },
    });
    expect(afterOrdersEdit).not.toBe(before);
  });

  it('DOES change when the insight edits its OWN props (unaffected by scoping)', () => {
    const before = buildInsightFreshnessSignature(insightState, modelStates);
    const afterPropEdit = buildInsightFreshnessSignature(
      { ...insightState, props: { ...insightState.props, y: '?{ avg(ref(orders).amount) }' } },
      modelStates
    );
    expect(afterPropEdit).not.toBe(before);
  });
});
