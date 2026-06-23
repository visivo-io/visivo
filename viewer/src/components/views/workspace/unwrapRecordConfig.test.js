/**
 * unwrapRecordConfig tests (VIS-1018 step 1).
 *
 * The envelope-vs-bare discriminator that every store collection entry can take,
 * consolidated from the ~6 sites that re-implemented it.
 */
import { unwrapConfig, withConfig } from './unwrapRecordConfig';

describe('unwrapConfig', () => {
  test('returns the inner config for an envelope entry', () => {
    const config = { name: 'd1', rows: [] };
    const entry = { name: 'd1', status: 'MODIFIED', config };
    expect(unwrapConfig(entry)).toBe(config);
  });

  test('returns the entry itself for a bare entry', () => {
    const bare = { name: 'd1', rows: [{ height: 'small', items: [] }] };
    expect(unwrapConfig(bare)).toBe(bare);
  });

  test('passes nullish input through (caller handles the no-op)', () => {
    expect(unwrapConfig(null)).toBeNull();
    expect(unwrapConfig(undefined)).toBeUndefined();
  });
});

describe('withConfig', () => {
  test('replaces config and preserves the envelope sidecar', () => {
    const entry = { name: 'd1', status: 'MODIFIED', config: { name: 'd1', rows: [] } };
    const nextConfig = { name: 'd1', rows: [{ height: 'large', items: [] }] };
    const next = withConfig(entry, nextConfig);

    expect(next.config).toBe(nextConfig);
    expect(next.name).toBe('d1');
    expect(next.status).toBe('MODIFIED');
    // Does not mutate the original entry.
    expect(entry.config.rows).toEqual([]);
  });

  test('replaces a bare entry wholesale with the next config', () => {
    const bare = { name: 'd1', rows: [] };
    const nextConfig = { name: 'd1', rows: [{ height: 'large', items: [] }] };
    expect(withConfig(bare, nextConfig)).toBe(nextConfig);
  });

  test('treats nullish entry as bare and returns nextConfig', () => {
    const nextConfig = { name: 'd1', rows: [] };
    expect(withConfig(null, nextConfig)).toBe(nextConfig);
    expect(withConfig(undefined, nextConfig)).toBe(nextConfig);
  });

  test('round-trips with unwrapConfig for both shapes', () => {
    const nextConfig = { name: 'd1', rows: [{ height: 'medium', items: [] }] };

    const envelope = { name: 'd1', status: 'NEW', config: { name: 'd1', rows: [] } };
    expect(unwrapConfig(withConfig(envelope, nextConfig))).toBe(nextConfig);

    const bare = { name: 'd1', rows: [] };
    expect(unwrapConfig(withConfig(bare, nextConfig))).toBe(nextConfig);
  });
});
