/**
 * bind.ts — how this app's screens reach the core: `useStore` binds a core store to
 * React, `useModel` gives the `ChatModel` interface for actions, and `useLoader` makes a
 * screen's own loader store.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { loader, type ChatModel, type Loader, type LoaderOptions, type Readable } from '@chat/core';
import { useDataRevision } from '../mock/VariantContext';
import { chatModel } from './model';

const idle = () => () => {};

/**
 * The store's current value; re-renders when it changes. Subscribing starts the store's
 * work, so pass `active: false` (an unfocused screen) to stop it while keeping the last
 * value on screen.
 */
export function useStore<T>(store: Readable<T>, active = true): T {
  const subscribe = useMemo(
    () => (active ? (store.subscribe as (cb: () => void) => () => void) : idle),
    [store, active],
  );
  return useSyncExternalStore(subscribe, store.get, store.get);
}

export function useModel(): ChatModel {
  return chatModel;
}

/**
 * A loader store for this screen, made from the model. Remade when `deps` change; read
 * again when the mock variant changes beneath the UI.
 */
export function useLoader<T>(make: (model: ChatModel) => LoaderOptions<T>, deps: unknown[]): Loader<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => loader(make(chatModel)), deps);
  const revision = useDataRevision();
  useEffect(() => { if (revision) store.reload(); }, [revision, store]);
  return store;
}


export { orThrow } from './or-throw';
