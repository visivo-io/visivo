import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const HOOK = path.join('hooks', 'useEscapeToClose.js');

// Files with a document or window keydown listener that reads Escape for a
// meaning other than closing a layer. Each entry says why.
const ALLOWLIST = {};

const GLOBAL_KEYDOWN = /\b(document|window)\.addEventListener\(\s*['"]keydown['"]/;
const ESCAPE = /['"]Escape['"]/;

const sourceFiles = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(js|jsx)$/.test(entry.name) || /\.test\.(js|jsx)$/.test(entry.name)) return [];
    return [full];
  });

const findAdHocEscapeListeners = (root = SRC) =>
  sourceFiles(root)
    .map(file => path.relative(root, file))
    .filter(rel => rel !== HOOK && !ALLOWLIST[rel])
    .filter(rel => {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      return GLOBAL_KEYDOWN.test(text) && ESCAPE.test(text);
    });

describe('Escape closes layers only through useEscapeToClose', () => {
  it('no source file adds its own document or window Escape listener', () => {
    expect(findAdHocEscapeListeners()).toEqual([]);
  });

  it('every allowlisted file still exists and still has such a listener', () => {
    Object.keys(ALLOWLIST).forEach(rel => {
      const text = fs.readFileSync(path.join(SRC, rel), 'utf8');
      expect(GLOBAL_KEYDOWN.test(text) && ESCAPE.test(text)).toBe(true);
    });
  });
});
