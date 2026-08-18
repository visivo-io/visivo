/**
 * Soft-delete predicates.
 *
 * Delete is a SOFT delete everywhere: the server marks the object
 * `status: "deleted"` and the list endpoints keep returning it until a commit
 * removes it from YAML. So the tombstone is on the wire, and every surface that
 * renders objects has to drop it.
 *
 * This lived inline in `useLibraryData.js`, which is why the Library was the
 * ONLY surface that hid deleted objects — the lineage read the same store
 * arrays raw and drew tombstones as live nodes, complete with their edges. A
 * user who deleted a model watched the row vanish from the Library and stay in
 * the graph, which reads as a delete that half-worked (VIS-1234).
 *
 * Nothing is lost by hiding them: the commit panel lists every staged change
 * with a DELETED badge, which is where "what will this commit do" belongs.
 */

/** True for objects that are NOT marked for deletion. */
export const notDeleted = o => o?.status !== 'deleted';

/** True for objects that ARE marked for deletion. */
export const isDeleted = o => o?.status === 'deleted';

/**
 * Drop tombstones from a store collection, tolerating null/undefined — the
 * store seeds most collections as `null` before their first fetch.
 */
export const withoutDeleted = list => (Array.isArray(list) ? list.filter(notDeleted) : []);
