import { translatePreviewError } from './translatePreviewError';

describe('translatePreviewError', () => {
  it('translates a hashed-table DuckDB catalog error and never repeats the hash in the headline/hint', () => {
    const raw =
      'Catalog Error: Table with name mfiawdybhqqkwzuxbjzfxqbvbaibc does not exist! Did you mean "pg_index"? LINE 3: FROM ...';
    const result = translatePreviewError(raw);

    expect(result.headline).not.toMatch(/mfiawdybhqqkwzuxbjzfxqbvbaibc/);
    expect(result.hint).not.toMatch(/mfiawdybhqqkwzuxbjzfxqbvbaibc/);
    expect(result.headline).not.toMatch(/pg_index/i);
    expect(result.hint).not.toMatch(/pg_index/i);
    expect(result.technical).toBe(raw);
  });

  it('translates "has no dependent models" DAG jargon into a drag-a-column hint', () => {
    const raw = "Insight 'insight' has no dependent models";
    const result = translatePreviewError(raw);

    expect(result.headline).not.toMatch(/dependent models/i);
    expect(result.hint).toMatch(/drag a column/i);
    expect(result.technical).toBe(raw);
  });

  it('falls back to a generic honest headline for an unrecognized message, keeping the raw text as technical', () => {
    const raw = 'some totally novel engine failure';
    const result = translatePreviewError(raw);

    expect(result.headline).toBeTruthy();
    expect(result.hint).toBeTruthy();
    expect(result.technical).toBe(raw);
  });

  it('handles null/undefined without throwing', () => {
    expect(() => translatePreviewError(null)).not.toThrow();
    expect(() => translatePreviewError(undefined)).not.toThrow();
    expect(translatePreviewError(null).technical).toBe('');
  });
});
