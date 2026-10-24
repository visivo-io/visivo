import { useCallback, useState } from 'react';
import useStore from '../stores/store';
import {
  COLLECTION_KEY,
  FETCH_ACTION,
} from '../components/views/workspace/collectionKeys';
import { fetchRenameImpact, renameResource, renameSupported } from '../api/rename';

const isDraftOnly = impact =>
  impact?.target?.status === 'new' && (impact.references || []).length === 0;

/**
 * useRenameFlow — the save-then-rename cycle, once, for every edit form.
 *
 * The name is the identity key: store collections, the workspace tab
 * (`type:name`), the URL (`?edit=type:name`) and every `${ref()}` are keyed by
 * it. So a changed name is its own server operation, applied after the form's
 * other fields are saved under the current name.
 *
 * `start(saveFields)` runs `saveFields()` first and stops if it answers falsy,
 * so a Save that changes the name and other fields keeps both. A published or
 * referenced object then shows the impact dialog; a draft nothing references is
 * renamed at once, because there is nothing for the user to confirm.
 *
 * @param {object} params
 * @param {string} params.type      viewer singular type, e.g. 'metric'
 * @param {string} params.recordName the name as saved
 * @param {string} params.name       the name in the form
 * @returns {{
 *   supported: boolean,
 *   isRenaming: boolean,
 *   nameChanged: boolean,
 *   start: (saveFields?: () => Promise<boolean>) => Promise<void>,
 *   dialogProps: {impact, error, loading, onConfirm, onCancel} | null,
 * }}
 */
export default function useRenameFlow({ type, recordName, name }) {
  const store = useStore();
  const [pending, setPending] = useState(null);
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const typeKey = COLLECTION_KEY[type];
  const projectId = store.project?.id;
  const nameChanged = Boolean(recordName && name && name !== recordName);

  const cancel = useCallback(() => {
    setPending(null);
    setImpact(null);
    setError(null);
    setLoading(false);
    setDialogOpen(false);
  }, []);

  const apply = useCallback(
    async ({ oldName, newName }) => {
      setLoading(true);
      try {
        const applied = await renameResource(typeKey, oldName, newName, { projectId });
        // The server rewrote refs inside other objects' configs; refetch exactly
        // the collections it named.
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
        setDialogOpen(true);
      }
    },
    [typeKey, type, store, cancel, projectId]
  );

  const start = useCallback(
    async saveFields => {
      const target = { oldName: recordName, newName: name };
      if (saveFields && !(await saveFields())) return;
      setPending(target);
      setImpact(null);
      setError(null);
      setLoading(true);
      let fetched;
      try {
        fetched = await fetchRenameImpact(typeKey, recordName, name, { projectId });
      } catch (caught) {
        setError(caught.message || 'Could not check what this rename affects');
        setLoading(false);
        setDialogOpen(true);
        return;
      }
      setImpact(fetched);
      if (isDraftOnly(fetched)) {
        await apply(target);
        return;
      }
      setLoading(false);
      setDialogOpen(true);
    },
    [typeKey, recordName, name, projectId, apply]
  );

  const confirm = useCallback(() => (pending ? apply(pending) : undefined), [pending, apply]);

  return {
    supported: renameSupported(),
    isRenaming: Boolean(pending),
    nameChanged,
    start,
    dialogProps:
      pending && dialogOpen ? { impact, error, loading, onConfirm: confirm, onCancel: cancel } : null,
  };
}
