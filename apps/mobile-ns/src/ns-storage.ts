/**
 * ns-storage.ts — each storage scope's stores for NativeScript strands: one SQLite database per
 * scope, with the blocks, the node-local records and the blob pieces over it
 * (`sqliteNodeStorage`), as sereus 1.25's `storage.open` takes them.
 *
 * Until 1.25 the storage factory was synchronous, and `openOptimysticNSDb` is not, so this file
 * held a lazy `IRawStorage` proxy that opened the database on first use. `open` is asynchronous
 * now, so the opener is awaited directly and the proxy is gone.
 */

import type { OpenNodeStorage } from '@optimystic/db-p2p';
import { openOptimysticNSDb, sqliteNodeStorage } from '@optimystic/db-p2p-storage-ns';
import { dbPath } from './db-path';

/**
 * One open per database name for the life of the process. cadre-core asks for a scope once per
 * runtime, and again after that scope's runtime stops; it may be handed the same storage both
 * times, which keeps one SQLite connection (and its prepared statements) per strand. A rejected
 * open is forgotten, so the next ask retries.
 *
 * NOTE: `openOptimysticNSDb` opens the native handle and then applies the schema, and does not
 * close the handle if applying the schema throws; a retry then opens a second handle on the same
 * file. Fine while schema application does not fail in practice; if retried opens are ever seen
 * blocking on a leaked handle, the fix belongs in the upstream opener.
 */
const openByDbName = new Map<string, Promise<OpenNodeStorage>>();

/**
 * The storage for one scope: pass as `storage: { open: openNsStorage }`.
 *
 * `scope` is cadre-core's storage scope key — a strand id, or the party's control key from
 * `controlStorageScope`. Every key it mints is already within `[a-z0-9._-]`, so it goes straight
 * into the database name unescaped.
 *
 * NOTE: a dev device that ran a build predating the party scoping still has an unscoped
 * `sereus-control` database on disk. Nothing opens or deletes it — its rows belong to whichever
 * party was configured when they were written and nothing recorded which, so adopting them into
 * a party's store would reintroduce exactly the cross-party bleed the scoping fixed. Dev builds
 * only; it simply sits there.
 */
export function openNsStorage(scope: string): Promise<OpenNodeStorage> {
	const dbName = `sereus-${scope}`;
	const cached = openByDbName.get(dbName);
	if (cached) return cached;
	const opening = openOptimysticNSDb(dbPath(dbName)).then((db) => sqliteNodeStorage(db));
	openByDbName.set(dbName, opening);
	// The rejection itself reaches every caller awaiting `opening`; this only forgets it.
	void opening.catch(() => {
		if (openByDbName.get(dbName) === opening) openByDbName.delete(dbName);
	});
	return opening;
}
