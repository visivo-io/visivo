import { useCallback, useState } from 'react';
import useStore from '../stores/store';
import {
  COLLECTION_KEY,
  FETCH_ACTION,
} from '../components/views/workspace/collectionKeys';
import { fetchRenameImpact, renameResource, renameSupported } from '../api/rename';

/**
 * useRenameFlow — the confirm-then-rename cycle, once, for every edit form.
 *
 * The name is the identity key: store collections, the workspace tab
 * (`type:name`), the URL (`?edit=type:name`) and every `${ref()}` are keyed by
 * it. So a changed name is not part of the save — it is its own server
 * operation, and one the user should see the consequences of first.
 *
 * Every edit form needs the same four things, which is why this is a hook
 * rather than copied into each: ask what the rename affects, show it, apply it,
 * then move the tab and refetch what the server rewrote.
 *
 * @param {object} params
 * @param {string} params.type      viewer singular type, e.g. 'metric'
 * @param {string} params.recordName the name as saved
 * @param {string} params.name       the name in the form
 * @returns {{
 *   supported: boolean,
 *   isRenaming: boolean,
 *   nameChanged: boolean,
 *   start: () => void,
 *   dialogProps: {impact, error, loading, onConfirm, onCancel} | null,
 * }}
 */
export default function useRenameFlow({ type, recordName, name }) {
  const store = useStore();
  const [pending, setPending] = useState(null);
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const typeKey = COLLECTION_KEY[type];
  const projectId = store.project?.id;
  const nameChanged = Boolean(recordName && name && name !== recordName);

  const start = useCallback(async () => {
    setPending({ oldName: recordName, newName: name });
    setImpact(null);
    setError(null);
    setLoading(true);
    try {
      setImpact(await fetchRenameImpact(typeKey, recordName, name, { projectId }));
    } catch (caught) {
      setError(caught.message || 'Could not check what this rename affects');
    } finally {
      setLoading(false);
    }
  }, [typeKey, recordName, name, projectId]);

  const cancel = useCallback(() => {
    setPending(null);
    setImpact(null);
    setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { oldName, newName } = pending;
    setLoading(true);
    try {
      const applied = await renameResource(typeKey, oldName, newName, { projectId });
      // The server rewrote refs inside other objects' configs. The client
      // cannot know which without redoing that traversal, so it refetches
      // exactly the collections the server named.
      const singularOf = Object.fromEntries(
        Object.entries(COLLECTION_KEY).map(([singular, plural]) => [plural, singular])
      );
      const touched = new Set([
        type,
        ...(applied.references || []).map(reference => singularOf[reference.type]),
      ]);
      await Promise.all(
        [...touched]
          .map(each => FETCH_ACTION[each])
          .filter(action => typeof store[action] === 'function')
          .map(action => store[action]())
      );
      if (store.closeWorkspaceTab) store.closeWorkspaceTab(`${type}:${oldName}`);
      if (store.openWorkspaceTab) {
        store.openWorkspaceTab({ id: `${type}:${newName}`, type, name: newName });
      }
      if (store.checkCommitStatus) await store.checkCommitStatus();
      cancel();
    } catch (caught) {
      setError(caught.message || `Failed to rename ${type}`);
      setLoading(false);
    }
  }, [pending, typeKey, type, store, cancel, projectId]);

  return {
    supported: renameSupported(),
    isRenaming: Boolean(pending),
    nameChanged,
    start,
    dialogProps: pending
      ? { impact, error, loading, onConfirm: confirm, onCancel: cancel }
      : null,
  };
}
