/**
 * legacy-adapter.ts — the `DataAdapter` screens call today, over a core `ChatModel`.
 *
 * TRANSITIONAL (docs/STATUS.md, Phase 4): screens still call throwing, flat functions,
 * while the core's model returns `Result`s by namespace. This turns one into the other:
 * an error result becomes a thrown `Error` carrying the model's message, its `kind` and
 * `retryable`, and the `unreachable` kind becomes the `UnreachableError` the invitation
 * screen tells apart. Deleted in Phase 6, when screens bind to core stores.
 */
import type { ChatError, ChatModel, Result } from '@chat/core';
import type { DataAdapter } from './adapter';
import { UnreachableError } from './errors';

export type ChatErrorThrown = Error & { kind: ChatError['kind']; retryable: boolean };

export function toThrown(error: ChatError): Error {
  const thrown: Error = error.kind === 'unreachable' ? new UnreachableError(error.message) : new Error(error.message);
  return Object.assign(thrown, { kind: error.kind, retryable: error.retryable, cause: error.cause });
}

async function unwrap<T>(pending: Promise<Result<T>>): Promise<T> {
  const result = await pending;
  if (!result.ok) throw toThrown(result.error);
  return result.value;
}

export function adapterFromModel(model: ChatModel): DataAdapter {
  return {
    listStrands: () => unwrap(model.strands.list()),
    strandsSettling: () => model.strands.settling(),
    strandsBootError: () => model.strands.bootError(),
    retryBoot: () => unwrap(model.strands.retryBoot()),
    setStrandMuted: (id, muted) => unwrap(model.strands.setMuted(id, muted)),
    setStrandArchived: (id, archived) => unwrap(model.strands.setArchived(id, archived)),
    getStrandState: id => unwrap(model.strands.state(id)),
    leaveStrand: (id, opts) => unwrap(model.strands.leave(id, opts)),
    listMembers: id => unwrap(model.members.list(id)),
    removeMember: (id, memberId) => unwrap(model.members.remove(id, memberId)),
    resignManager: id => unwrap(model.members.resignManager(id)),
    listMessages: (id, opts) => unwrap(model.messages.list(id, opts)),
    send: (id, input) => unwrap(model.messages.send(id, input)),
    editMessage: (id, messageId, content) => unwrap(model.messages.edit(id, messageId, content)),
    deleteMessage: (id, messageId) => unwrap(model.messages.delete(id, messageId)),
    react: (id, messageId, symbol) => unwrap(model.messages.react(id, messageId, symbol)),
    unreact: (id, messageId, symbol) => unwrap(model.messages.unreact(id, messageId, symbol)),
    listAttachments: (id, opts) => unwrap(model.media.list(id, opts)),
    storageUsage: () => unwrap(model.media.storageUsage()),
    trimStorage: (id, criteria) => unwrap(model.media.trim(id, criteria)),
    async *search(query, opts) {
      for await (const batch of model.search.run(query, opts)) {
        if (!batch.ok) throw toThrown(batch.error);
        yield batch.value;
      }
    },
    createInvitation: input => unwrap(model.invitations.create(input)),
    listOutstandingInvitations: () => unwrap(model.invitations.listOutstanding()),
    cancelInvitation: id => unwrap(model.invitations.cancel(id)),
    inspectInvitation: token => unwrap(model.invitations.inspect(token)),
    acceptInvitation: token => unwrap(model.invitations.accept(token)),
    reachability: () => model.reachability.get(),
    watchStrand: (id, onChange) => model.changes.strand(id, onChange),
    getProfile: () => unwrap(model.profile.get()),
    saveProfile: profile => unwrap(model.profile.save(profile)),
    getPrefs: () => unwrap(model.prefs.get()),
    setPrefs: patch => unwrap(model.prefs.set(patch)),
  };
}
