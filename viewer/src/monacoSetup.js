import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

/**
 * Point `@monaco-editor/react` at the Monaco we already bundle.
 *
 * `monaco-editor` has been a direct dependency all along, but without this the
 * loader keeps its default and the browser re-fetches the whole editor from
 * `cdn.jsdelivr.net` at runtime. Offline, or behind a proxy that blocks it, the
 * SQL editor and the model edit form sat in a permanent loading state with no
 * error.
 *
 * Imported for its side effect from `LocalProviders` only: `visivo dist` has no
 * editor, and pulling Monaco into that bundle would grow every static build for
 * a feature it does not ship.
 *
 * `editor.api` plus the SQL contribution rather than all of `monaco-editor` —
 * the only APIs used are `KeyCode`/`KeyMod`, `languages.CompletionItemKind` and
 * `languages.registerCompletionItemProvider`, and the only language is SQL.
 */
// `window`, not `self`: this only ever runs on the main thread, where they
// are the same object, and `self` is a restricted global here.
window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

loader.config({ monaco });
