/**
 * The Sereus `ChatModel`: chat over a party's cadre node — strands are Sereus strands,
 * their data a Quereus database replicated by Optimystic. Semantics:
 * design/specs/domain/ops.md; the mapping to sereus: design/specs/domain/interfaces.md.
 *
 * `createSereusModel(host)` takes the app's running node and its storage slots
 * (`./host.ts`) and returns the model plus `boot`, the start-up sequence the app runs
 * once its data is known to be usable.
 */
import { readOwnerPrivateKey, type StrandInstance } from '@serfab/cadre-core';
import { buildInviteUrl, CHAT_SAPP_ID } from '../protocol/index.js';
import type {
  Attachment, ChatModel, Invitation, InvitationPreview, Member, Message, Prefs,
  SearchBatch, StorageUsage, StrandState, StrandSummary, Visibility,
} from '../model/index.js';
import { fail, INVITATION_VALIDITY, ok, pageMessages } from '../model/index.js';
import { attempt, ChatFailure, explainJoinFailure, withTimeout } from './errors.js';
import type { ChatHost } from './host.js';
import { LocalRecords, OutgoingInvitations, StrandPrefsStore, SummaryCache } from './local-state.js';
import {
  addReaction, insertAttachments, insertMessage, newId, queryAttachments, queryMembers, queryMessages,
  queryReactions, removeMessage, removeReaction, updateMessage,
} from './operations.js';
import { createChatStrand } from './sapp-strands.js';
import { classifyClaimFailure, nodeReach, readNodeCode } from './node-code.js';
import { ownerFingerprint, type CadreMachine, type CadreStatus } from '../model/index.js';
import { StrandRuntime } from './strands.js';

/** How long the strand list waits on one strand's preview or member read before using its cached row. */
const LIST_READ_MS = 3000;
/** How long to wait on a one-off control-network write before failing fast. */
const CONTROL_OP_TIMEOUT_MS = 15_000;
/** Bound on a claim: `claimNode` dials each address in turn (~115 s worst case when none answers). */
const CLAIM_TIMEOUT_MS = 150_000;
/** Bound on the control reads behind the machine list; with no cohort they can hang. */
const CONTROL_READ_MS = 6000;
/** How long an invitation stays good when the caller does not say: story 02's private-strand default. */
const INVITE_EXPIRY_MS = INVITATION_VALIDITY.week;

/** Node events after which a strand's database may have appeared or been replaced. */
const STRAND_UP_EVENTS = ['strand:started', 'strand:writable', 'strand:waking'] as const;
/** Node events after which a strand's database is gone. */
const STRAND_DOWN_EVENTS = ['strand:hibernating', 'strand:stopped'] as const;

export interface SereusModel {
  model: ChatModel;
  /**
   * The start-up sequence: watch for offered strands, start the node, re-attach
   * remembered joins (see `StrandRuntime.boot`). Run once the app knows its data is
   * usable; also what `strands.retryBoot` runs.
   */
  boot(): Promise<void>;
}

/**
 * Retry a strand write that failed only because this node has just restarted. Sereus
 * 1.9: a node that restarts while every other member is offline remembers them, so its
 * first writes can fail for a few seconds (`Failed to get super-majority`). Such a
 * failure committed nothing, so retrying cannot duplicate the message.
 */
async function retryAfterRestart<T>(write: () => Promise<T>, perf: (...a: unknown[]) => void): Promise<T> {
  const attempts = 5;
  for (let i = 1; ; i++) {
    try {
      return await write();
    } catch (e) {
      const transient = /Failed to get super-majority/i.test(e instanceof Error ? e.message : String(e));
      perf('write attempt', i, 'failed:', e instanceof Error ? e.message : String(e));
      if (!transient || i >= attempts) throw e;
      await new Promise<void>(r => setTimeout(r, 3000));
    }
  }
}

function toAttachment(a: {
  Id: string; MessageId: string; Type: string; Uri: string | null; MimeType?: string; Name?: string;
  ByteSize?: number | null; DurationMs?: number | null;
}): Attachment {
  return {
    id: a.Id, messageId: a.MessageId, type: a.Type as Attachment['type'],
    uri: a.Uri, mimeType: a.MimeType, name: a.Name,
    byteSize: a.ByteSize ?? null, durationMs: a.DurationMs ?? null,
    // A row held with no URI is being fetched — a null URI never reads as absent.
    locality: a.Uri ? 'local' : 'fetching',
  };
}

export function createSereusModel(host: ChatHost): SereusModel {
  const runtime = new StrandRuntime(host);
  const records = new LocalRecords(host);
  const strandPrefs = new StrandPrefsStore(host);
  const summaries = new SummaryCache(host);
  const outgoing = new OutgoingInvitations(host);

  /** Development-build step timings for the message path, tagged `[perf]`. */
  const perf = (...a: unknown[]) => { if (host.dev) console.info('[perf]', ...a); };
  const seenMessageIds = new Map<string, Set<string>>();
  /** Strands whose list reads are still running (see `strands.list`). */
  const listReadsInFlight = new Set<string>();

  const requireNode = () => {
    const node = host.node.node;
    if (!node) throw new ChatFailure('unavailable', 'Cadre is not running.');
    return node;
  };
  /**
   * The node, waiting for it to start. For what a link can open in an app that the same
   * link just launched: the invitation is read and accepted while the node is still
   * coming up, which must not read as "could not get through".
   */
  const startedNode = async () => {
    await runtime.ensureUp();
    return requireNode();
  };
  const requirePeerId = () => {
    const peerId = runtime.peerId;
    if (!peerId) throw new ChatFailure('unavailable', 'Peer ID not available; cadre may not be running');
    return peerId;
  };

  /**
   * The strand a strand-scoped call is about. THERE IS NO FALLBACK: a missing or
   * unattached id fails rather than quietly opening some other conversation. A strand
   * hibernated while the app was in the background is woken first (15–20 s on a
   * phone) rather than failing with "database not available"; cadre-core coalesces this
   * wake with any other wake of the same strand, such as the app's return sweep.
   * Measured: without joining a wake already under way (status `starting`), a send 3 s
   * after returning failed exactly that way.
   */
  async function strandFor(strandId: string): Promise<StrandInstance> {
    if (!strandId) throw new ChatFailure('not-attached', 'No strand was named.');
    const node = requireNode();
    const strand = node.getStrands().get(strandId);
    if (!strand) throw new ChatFailure('not-attached', `Strand ${strandId} is not attached on this device.`);
    // Hibernating, or already being woken (`starting` with no database yet — the app's
    // return sweep got there first): `wakeStrand` joins a wake or build in progress.
    if (!strand.database && (strand.status === 'hibernating' || strand.status === 'starting')) {
      await node.wakeStrand(strandId);
    }
    return strand;
  }

  /** An attached strand, without waking it (inviting into an existing conversation). */
  function attachedStrand(strandId: string): StrandInstance {
    const strand = requireNode().getStrands().get(strandId);
    if (!strand) throw new ChatFailure('not-attached', `Strand ${strandId} is not attached on this device.`);
    return strand;
  }

  /**
   * CONVERSATIONS FOUNDED AHEAD OF THEIR FIRST INVITATION (`invitations.prepare`). Founding
   * is the slow part of making an invitation (a strand node, its database, its relay
   * reservation: ~5 s on a Galaxy S7, ~2.5 s on an S21), and it needs nothing the person
   * is still choosing except the kind. So the invitation screen starts it on opening, and
   * `createInvitation` takes the result. At most one per kind, remembered across restarts
   * (slot `preparedStrands`) and left out of the strand list until it is taken: a spare
   * that is never used is reused by the next invitation, not left behind as a conversation.
   *
   * A WORKAROUND for slow founding in the stack, not a design: when `foundStrand` returns
   * after the commitment (sereus#49), re-measure and likely remove this, its slot and the
   * list filter (docs/STATUS.md, "Local workarounds to retire").
   */
  const preparedSlot = host.slot('preparedStrands');
  const preparing = new Map<Visibility, Promise<string | null>>();
  async function readPrepared(): Promise<Partial<Record<Visibility, string>>> {
    try { return JSON.parse((await preparedSlot.load()) ?? '{}') as Partial<Record<Visibility, string>>; } catch { return {}; }
  }
  function prepareStrand(visibility: Visibility): Promise<string | null> {
    const running = preparing.get(visibility);
    if (running) return running;
    const job = (async () => {
      const already = (await readPrepared())[visibility];
      if (already) return already;
      await runtime.ensureUp();
      const { instance } = await createChatStrand(requireNode(), newId(), visibility);
      await runtime.registerSelf(instance);
      await preparedSlot.save(JSON.stringify({ ...(await readPrepared()), [visibility]: instance.strandId }));
      return instance.strandId;
    })()
      .catch(err => {
        console.warn('[sereus-model] preparing a conversation failed:', err instanceof Error ? err.message : err);
        return null;
      })
      .finally(() => preparing.delete(visibility));
    preparing.set(visibility, job);
    return job;
  }
  /**
   * The prepared conversation of this kind, taken (no longer prepared), or null. Waits for
   * one still being founded: it started earlier than a fresh one would. One remembered from
   * before a restart but not open yet stays prepared, for the next time.
   */
  async function takePrepared(visibility: Visibility): Promise<StrandInstance | null> {
    await preparing.get(visibility);
    const prepared = await readPrepared();
    const id = prepared[visibility];
    const strand = id ? host.node.node?.getStrands().get(id) : undefined;
    if (!id || !strand?.database) return null;
    delete prepared[visibility];
    await preparedSlot.save(JSON.stringify(prepared));
    return strand;
  }

  async function prefs(): Promise<Prefs> {
    return { ...(await records.prefs()), relayAddrs: await host.node.getRelayAddrs() };
  }

  async function listMessages(strandId: string): Promise<Message[]> {
    const t0 = Date.now();
    const strand = await strandFor(strandId);
    const [rows, reactions, atts] = await Promise.all([
      queryMessages(strand),
      queryReactions(strand).catch(() => []),
      queryAttachments(strand).catch(() => []),
    ]);
    if (host.dev) {
      const seen = seenMessageIds.get(strandId);
      if (seen) for (const r of rows.filter(r => !seen.has(r.Id))) perf('first seen', r.Content.slice(0, 24), 'sent', r.Timestamp, 'UTC');
      seenMessageIds.set(strandId, new Set(rows.map(r => r.Id)));
      perf('listMessages', rows.length, 'rows in', Date.now() - t0, 'ms');
    }
    const attByMessage = new Map<string, Attachment[]>();
    for (const a of atts) {
      const list = attByMessage.get(a.MessageId) ?? [];
      list.push(toAttachment(a));
      attByMessage.set(a.MessageId, list);
    }
    const byMessage = new Map<string, Array<{ memberId: string; symbol: string }>>();
    for (const r of reactions) {
      const list = byMessage.get(r.MessageId) ?? [];
      list.push({ memberId: r.MemberId, symbol: r.Symbol });
      byMessage.set(r.MessageId, list);
    }
    // No status is read: none is tracked (design/specs/domain/schema.md).
    return rows.map(r => ({
      id: r.Id,
      memberId: r.MemberId,
      content: r.Content,
      timestamp: r.Timestamp,
      replyToId: r.ReplyToId ?? null,
      editedAt: r.EditedAt ?? null,
      attachments: attByMessage.get(r.Id) ?? [],
      reactions: byMessage.get(r.Id) ?? [],
    }));
  }

  async function listStrands(): Promise<StrandSummary[]> {
    // Bring the node up in the BACKGROUND — never block the list on it, so an empty or
    // partial list renders at once and fills in as strands open.
    void runtime.ensureUp().catch(err =>
      console.warn('[sereus-model] cadre bring-up deferred:', err instanceof Error ? err.message : err),
    );
    // A prepared conversation is not one yet (`prepareStrand`): nobody has been invited.
    const hidden = new Set(Object.values(await readPrepared()));
    const strands = new Map([...(host.node.node?.getStrands() ?? new Map<string, StrandInstance>())].filter(([id]) => !hidden.has(id)));
    const prefsById = await strandPrefs.all();
    const cached = await summaries.read();
    const me = runtime.peerId ?? '';

    // EACH STRAND READ IN PARALLEL, AND BOUNDED. A read can wait on a slow member
    // (Optimystic#25); on the S7 one took 61 s. Past LIST_READ_MS a strand's row falls
    // back to what this device last showed for it.
    const rows = await Promise.all([...strands].map(async ([id, strand]): Promise<StrandSummary | null> => {
      if (!strand.database) return null;
      const last = cached[id];
      const local = {
        avatarUri: null, unreadCount: 0, mentioned: false, draftPreview: null, pending: false,
        muted: prefsById[id]?.muted ?? 'none', archived: prefsById[id]?.archived ?? false,
      } as const;
      // A timed-out read keeps running; while it does, do not start another.
      if (listReadsInFlight.has(id) && last) return { ...last, ...local };
      const messagesRead = queryMessages(strand, 1);
      const membersRead = queryMembers(strand);
      listReadsInFlight.add(id);
      void Promise.allSettled([messagesRead, membersRead]).then(() => listReadsInFlight.delete(id));
      let preview: StrandSummary['lastMessage'] = last?.lastMessage ?? null;
      try {
        const msgs = await withTimeout(messagesRead, LIST_READ_MS, 'last-message preview');
        const newest = msgs[msgs.length - 1];
        preview = newest ? { previewText: newest.Content, senderName: null, timestamp: newest.Timestamp } : null;
      } catch (err) {
        console.warn('[sereus-model] last-message preview unavailable for', id, err instanceof Error ? err.message : err);
      }
      // WHO ELSE IS IN IT is the title (ops.md: no strand-title slot exists upstream).
      let members: Awaited<ReturnType<typeof queryMembers>> | null = null;
      try {
        members = await withTimeout(membersRead, LIST_READ_MS, 'member names');
      } catch (err) {
        console.warn('[sereus-model] member names unavailable for', id, err instanceof Error ? err.message : err);
      }
      let title: string, isGroup: boolean, memberCount: number;
      if (members) {
        const others = members.filter(m => m.Id !== me);
        const nameOf = (m: { Id: string; Name?: string }) => m.Name?.trim() || m.Id.slice(0, 8);
        // Until the other side's Member row arrives there is nothing truthful to call it
        // (story 30, path F).
        title = others.length === 0 ? 'Waiting for someone to join'
          : others.length === 1 ? nameOf(others[0])
          : others.map(nameOf).join(', ');
        isGroup = others.length > 1;
        memberCount = Math.max(members.length, 1);
      } else {
        title = last?.title ?? 'Waiting for someone to join';
        isGroup = last?.isGroup ?? false;
        memberCount = last?.memberCount ?? 1;
      }
      return { id, title, isGroup, memberCount, lastMessage: preview, ...local };
    }));
    const listed = rows.filter((r): r is StrandSummary => r !== null);

    // Strands known but not open yet, from the last list shown, so a cold start does
    // not read as "No strands yet".
    await summaries.save(listed);
    const open = new Set(listed.map(s => s.id));
    for (const known of Object.values(cached)) {
      if (open.has(known.id) || hidden.has(known.id)) continue;
      listed.push({
        ...known, unreadCount: 0, mentioned: false, draftPreview: null, pending: false, opening: true,
        muted: prefsById[known.id]?.muted ?? 'none', archived: prefsById[known.id]?.archived ?? false,
      });
    }
    return listed;
  }

  async function send(strandId: string, input: { content: string; attachments?: Attachment[]; replyToId?: string | null }): Promise<Message> {
    const t0 = Date.now();
    let t = t0;
    const step = (name: string) => { const n = Date.now(); perf('send', name, n - t, 'ms'); t = n; };
    const strand = await strandFor(strandId);
    step('strandFor');
    const peerId = requirePeerId();

    // MEMBERSHIP FIRST: `App.Message.MemberId` references `App.Member`, so this device
    // must hold its own Member row before it can say anything. Registration is an
    // idempotent upsert, so this repairs a registration that failed at attach time at
    // the moment it matters.
    const registered = await runtime.registerSelf(strand);
    step('registerSelf');
    // …and SAY SO if it still did not take — but only then: the read costs 0.7–1.6 s
    // on a phone, and after the first send it would only re-confirm what is known.
    if (!registered) {
      const members = await queryMembers(strand);
      step('queryMembers');
      if (!members.some(m => m.Id === peerId)) {
        throw new ChatFailure('not-a-member',
          'Could not register you in this conversation yet — no other member was reachable. Try again in a moment.');
      }
    }
    const row = await retryAfterRestart(() => insertMessage(strand, peerId, input.content, input.replyToId), perf);
    step('insertMessage');
    const saved = await insertAttachments(strand, row.Id, input.attachments ?? []);
    step('insertAttachments');
    perf('send total', Date.now() - t0, 'ms for', input.content.slice(0, 24));
    return {
      id: row.Id,
      memberId: peerId,
      content: row.Content,
      timestamp: row.Timestamp,
      replyToId: row.ReplyToId ?? null,
      editedAt: null,
      attachments: saved.map(toAttachment),
      reactions: [],
    };
  }

  /**
   * Mint an invitation (sereus reference-app-rn `createClosedStrandWithInvite`):
   * `createOpenInvitation` mints the envelope, `publishFormationInvite` writes the
   * signed row that makes the token redeemable for OUR strand, `encodeInvitation` makes
   * the code handed out. The returned token is the ENCODED invitation.
   */
  async function createInvitation(input: {
    strandId?: string; visibility?: 'public' | 'private'; grantsInviteRight: boolean;
    singleUse?: boolean; validForMs?: number;
  }): Promise<Invitation> {
    const t0 = Date.now();
    let t = t0;
    const step = (name: string) => { const n = Date.now(); perf('invite', name, n - t, 'ms'); t = n; };
    const node = requireNode();
    // Precondition FIRST: with no dialable address nobody could ever answer. Story 02
    // Alt A presents this as the ordinary starting position, never as a failure.
    if (node.getMultiaddrs().length === 0) {
      throw new ChatFailure('unreachable', 'There is nowhere for them to answer yet.');
    }
    // With a `strandId` the conversation exists and its type was fixed at founding;
    // without one, the Private/Open choice is the point of the screen.
    const kind = input.visibility ?? 'private';
    const picked = input.strandId ? attachedStrand(input.strandId) : await takePrepared(kind);
    step(picked ? 'strand (existing or prepared)' : 'nothing prepared');
    // Founded in the FOREGROUND. sereus 1.17's background form (`foundStrand(…, { background:
    // true })`, sereus#49) left serchat's inviter unreachable to joiners ("could not reach
    // the person who invited you") in our scenarios, though bare cadre-core joins fine;
    // cause not isolated yet (docs/STATUS.md). The prepared path covers the latency meanwhile.
    const strand = picked ?? (await createChatStrand(node, newId(), kind)).instance;
    step('founded');
    // THE FOUNDER HAS TO BE A MEMBER OF ITS OWN STRAND, and founding does not make it
    // one. Idempotent, so inviting a second person re-runs it harmlessly.
    await runtime.registerSelf(strand);
    const strandId = strand.strandId;
    step('registerSelf');

    // THE TERMS (story 02). `totalUses` is counted against FormationUsage rows and
    // refused as `token-spent` once reached; absent means unlimited until it expires.
    const singleUse = input.singleUse ?? true;
    const invitation = await node.createOpenInvitation(CHAT_SAPP_ID, input.validForMs ?? INVITE_EXPIRY_MS);
    step('createOpenInvitation');
    await withTimeout(
      node.publishFormationInvite(invitation.token, CHAT_SAPP_ID, {
        expiresAtMs: invitation.expiration.getTime(),
        strandId,
        ...(singleUse ? { totalUses: 1 } : {}),
      }),
      CONTROL_OP_TIMEOUT_MS,
      'publishFormationInvite',
    );
    step('publishFormationInvite');
    const token = node.encodeInvitation(invitation);
    const minted: Invitation = {
      // The RAW token, which is unique (the encoded one's prefix is the same for all).
      id: invitation.token,
      token,
      // The https App Link for the QR too: the person scanning may not have the app.
      url: buildInviteUrl(token),
      qrPayload: buildInviteUrl(token),
      strandId,
      expiresAt: invitation.expiration.toISOString(),
      grantsInviteRight: input.grantsInviteRight,
      singleUse,
      spent: false,
      direction: 'outgoing',
    };
    // Kept so it can be listed and shared again; a failure to remember it must not cost
    // the user the invitation they are looking at.
    const membersAtMint = await queryMembers(strand).then(m => m.length).catch(() => 1);
    await outgoing.remember({ ...minted, membersAtMint, createdAt: new Date().toISOString() })
      .catch(err => console.warn('[sereus-model] could not remember invitation:', err));
    step('remembered');
    perf('invite', 'total', Date.now() - t0, 'ms');
    return minted;
  }

  /**
   * Redeem an encoded invitation. Attach with `FormStrandResult.memberPrivateKey`, NOT
   * the invitation's key — a different key, and the wrong one yields a strand nobody can
   * read.
   */
  async function acceptInvitation(token: string): Promise<{ strandId: string }> {
    const node = await startedNode();
    const invitation = node.decodeInvitation(token);
    const profile = await records.profile();
    // Disclosure: only the display name, in `metadata`, the sanctioned app slot.
    let result: Awaited<ReturnType<typeof node.formStrand>>;
    try {
      result = await node.formStrand(invitation, {
        ...(profile.name ? { metadata: { name: profile.name } } : {}),
      });
    } catch (err) {
      throw explainJoinFailure(err);
    }
    const { strandId, memberPrivateKey } = result;
    if (host.dev) {
      // THE CROSS-PARTY DISCOVERY SEED: if empty, the joiner has nowhere to dial, and
      // that surfaces much later as `StrandAwaitingFirstSyncError`.
      const seed = (result as { strandAddrs?: string[] }).strandAddrs ?? [];
      console.info(`[accept] formation seed: ${seed.length} strand addr(s), memberKey=${!!memberPrivateKey}`);
      for (const addr of seed) console.info('[accept]   seed:', addr);
    }
    // THE HOST STRAND'S TYPE DECIDES THIS: formation returns `memberPrivateKey` only for
    // a closed strand. `FounderOwnerKey: null` is correct for a consent-seated row.
    const joinedRow = memberPrivateKey
      ? { Id: strandId, MemberPrivateKey: memberPrivateKey, Type: 'c' as const, FounderOwnerKey: null, FounderPeerId: null }
      : { Id: strandId, MemberPrivateKey: null, Type: 'o' as const, FounderOwnerKey: null, FounderPeerId: null };
    // REMEMBER FIRST, ATTACH SECOND: `memberPrivateKey` is delivered exactly once.
    await runtime.joined.remember(joinedRow);

    const t0 = Date.now();
    const tick = host.dev ? setInterval(() => {
      const inst = node.getStrands().get(strandId);
      console.info(
        `[accept] +${Math.round((Date.now() - t0) / 1000)}s attaching — status=${inst?.status ?? 'not-tracked'} ` +
          `database=${!!inst?.database} peers=${inst?.connectedPeers ?? '?'} myAddrs=${node.getMultiaddrs().length}`,
      );
    }, 5000) : null;
    try {
      const instance = await runtime.attachAndAwaitWritable(node, joinedRow);
      // In App.Member before the join is declared done.
      await runtime.registerSelf(instance);
      if (host.dev) console.info(`[accept] ✓ attached in ${Date.now() - t0}ms`);
    } finally {
      if (tick) clearInterval(tick);
    }
    return { strandId };
  }

  /** One claim at a time. */
  let claiming = false;

  const model: ChatModel = {
    strands: {
      list: () => attempt(listStrands),
      // Settled once the node is up AND its first sweep has run. "Some strand is still
      // opening" would never stop being true if one of them cannot open.
      async settling() { return !runtime.hasSwept(); },
      async bootError() { return runtime.bootError(); },
      retryBoot: () => attempt(() => runtime.boot()),
      settings: id => attempt(() => strandPrefs.get(id)),
      setMuted: (id, muted) => attempt(() => strandPrefs.patch(id, { muted })),
      setArchived: (id, archived) => attempt(() => strandPrefs.patch(id, { archived })),
      state: id => attempt(async (): Promise<StrandState> => {
        // Membership and manager rows are sereus's and no production path writes them
        // yet (domain/sereus.md); the honest answer for now: private, and I can act.
        const strand = await strandFor(id);
        return {
          visibility: (strand as { type?: string }).type === 'o' ? 'public' : 'private',
          managerCount: 1,
          settled: false,
          canIManage: true,
        };
      }),
      leave: (id, opts) => attempt(async () => { await runtime.leave(id, opts); }),
    },

    messages: {
      list: (id, opts) => attempt(async () => pageMessages(await listMessages(id), opts)),
      send: (id, input) => attempt(() => send(id, input)),
      edit: (id, messageId, content) => attempt(async () => updateMessage(await strandFor(id), messageId, content)),
      delete: (id, messageId) => attempt(async () => removeMessage(await strandFor(id), messageId)),
      react: (id, messageId, symbol) =>
        attempt(async () => addReaction(await strandFor(id), messageId, requirePeerId(), symbol)),
      unreact: (id, messageId, symbol) =>
        attempt(async () => removeReaction(await strandFor(id), messageId, requirePeerId(), symbol)),
      draft: id => attempt(() => records.draft(id)),
      saveDraft: (id, text) => attempt(() => records.saveDraft(id, text)),
      readCursor: id => attempt(() => records.readCursor(id)),
      saveReadCursor: (id, messageId) => attempt(() => records.saveReadCursor(id, messageId)),
    },

    members: {
      list: id => attempt(async (): Promise<Member[]> => {
        const strand = await strandFor(id);
        const me = runtime.peerId ?? '';
        return (await queryMembers(strand)).map(r => ({
          id: r.Id,
          name: r.Name,
          avatarUri: r.AvatarUri ?? null,
          isManager: r.Id === me, // not readable yet; see strands.state
          isMe: r.Id === me,
        }));
      }),
      remove: async () => fail('not-supported', 'Removing a member is not supported yet.'),
      resignManager: async () => fail('not-supported', 'Resigning as manager is not supported yet.'),
    },

    invitations: {
      create: input => attempt(() => createInvitation(input)),
      listOutstanding: () => attempt(async (): Promise<Invitation[]> => {
        const node = host.node.node;
        const control = node?.getControlDatabase();
        return outgoing.list(async inv => {
          // FormationUsage is keyed by the RAW token inside the shared, encoded one.
          if (!node || !control) return null;
          try {
            // Time-boxed: a control read with no reachable cohort can hang.
            return await withTimeout(control.countFormationUsage(node.decodeInvitation(inv.token).token), 3000, 'countFormationUsage');
          } catch {
            return null;
          }
        }, async strandId => {
          const strand = node?.getStrands().get(strandId);
          if (!strand?.database) return null;
          return queryMembers(strand).then(m => m.length).catch(() => null);
        });
      }),
      /** Stops LISTING it; does not withdraw it. */
      cancel: id => attempt(() => outgoing.forget(id)),
      prepare: visibility => { void prepareStrand(visibility); },
      /**
       * Read an invitation without redeeming it — PURELY LOCAL: the token carries
       * `{ token, sAppId, expiration, bootstrap }` and nothing else, and whether it is
       * spent or cancelled is a host-side fact an invitee cannot read before joining.
       * So `spent`/`cancelled` are not knowable here; inviter and strand state are not
       * in the token either and are reported conservatively. (Story 03 partly unmet.)
       */
      inspect: token => attempt(async (): Promise<InvitationPreview> => {
        const node = await startedNode();
        const unknownState: StrandState = { visibility: 'private', managerCount: 1, settled: false, canIManage: false };
        let expiration: Date;
        try {
          ({ expiration } = node.decodeInvitation(token));
        } catch {
          return { inviterName: '', inviterAvatarUri: null, strandState: unknownState, grantsInviteRight: false, status: 'invalid' };
        }
        return {
          inviterName: '', inviterAvatarUri: null, strandState: unknownState, grantsInviteRight: false,
          status: expiration.getTime() <= Date.now() ? 'expired' : 'live',
        };
      }),
      accept: token => attempt(() => acceptInvitation(token)),
    },

    media: {
      list: (id, opts) => attempt(async () => {
        const rows = await queryAttachments(await strandFor(id));
        return rows.filter(r => !opts?.kind || r.Type === opts.kind).map(toAttachment);
      }),
      storageUsage: () => attempt(async (): Promise<StorageUsage> => {
        // Attachment byte sizes are what can be accounted for; block storage is not exposed.
        const byStrand: StorageUsage['byStrand'] = [];
        for (const [id, strand] of host.node.node?.getStrands() ?? []) {
          if (!strand.database) continue;
          try {
            const rows = await queryAttachments(strand);
            byStrand.push({ strandId: id, title: `Strand ${id.slice(0, 8)}`, bytes: rows.reduce((n, r) => n + (r.ByteSize ?? 0), 0) });
          } catch { /* a strand that cannot be read now contributes nothing */ }
        }
        byStrand.sort((a, b) => b.bytes - a.bytes);
        return { totalBytes: byStrand.reduce((n, s) => n + s.bytes, 0), byStrand };
      }),
      // Dropping local copies without weakening what the strand can serve is an open
      // platform question (domain/sereus.md).
      trim: async () => fail('not-supported', 'Trimming storage is not supported yet.'),
    },

    search: {
      /**
       * Over attached strands, one batch per strand, reporting what could not be read:
       * there is no cross-strand index, and hibernating strands are not woken here.
       */
      async *run(query, opts) {
        void runtime.ensureUp().catch(() => {});
        const q = query.trim().toLowerCase();
        const entries = [...(host.node.node?.getStrands() ?? [])].filter(([id]) => !opts?.strandId || id === opts.strandId);
        const total = entries.length;
        let searched = 0;
        let skipped = 0;
        for (const [id, strand] of entries) {
          if (opts?.signal?.aborted) return;
          searched++;
          if (!strand.database) { skipped++; continue; }
          let results: SearchBatch['results'] = [];
          try {
            const msgs = await queryMessages(strand);
            results = msgs
              .filter(m => q !== '' && m.Content.toLowerCase().includes(q))
              .map(m => {
                const at = m.Content.toLowerCase().indexOf(q);
                return {
                  strandId: id,
                  strandTitle: `Strand ${id.slice(0, 8)}`,
                  messageId: m.Id,
                  senderName: m.MemberName ?? m.MemberId.slice(0, 12),
                  snippet: m.Content,
                  matchRange: [at, at + q.length] as [number, number],
                  timestamp: m.Timestamp,
                };
              });
          } catch {
            skipped++;
          }
          yield ok({ results, strandsSearched: searched, strandsTotal: total, strandsSkipped: skipped });
        }
      },
    },

    profile: {
      get: () => attempt(() => records.profile()),
      save: profile => attempt(async () => {
        await records.saveProfile(profile);
        // Best-effort propagation of the name; the profile is saved regardless.
        try {
          await runtime.syncProfileName();
        } catch (err) {
          console.warn('[sereus-model] profile name sync failed:', err);
        }
      }),
    },

    prefs: {
      get: () => attempt(prefs),
      set: patch => attempt(async () => {
        const { relayAddrs, ...rest } = patch;
        const { relayAddrs: _current, ...stored } = { ...(await prefs()), ...rest };
        await records.savePrefs(stored);
        // Relays are the node's start options; applying them can REBUILD the node, so
        // it is not awaited: the UI returns at once and reconnects behind it.
        if (relayAddrs) {
          void host.node.applyRelays(relayAddrs).catch(err => console.warn('[prefs] applying relays failed:', err));
        }
        return prefs();
      }),
    },

    reachability: {
      async get() {
        const node = host.node.node;
        const reachable = !!node && node.getMultiaddrs().length > 0;
        const relays = await host.node.getRelayAddrs().catch(() => [] as string[]);
        return { reachable, relayPending: !reachable && relays.length > 0, relays, relayStatus: host.node.relayStatus() };
      },
    },

    cadre: {
      status: () => attempt(async (): Promise<CadreStatus> => {
        const node = host.node.node;
        const peerId = node?.peerId?.toString() ?? null;
        let fingerprint: string | null = null;
        // The owner key this node signs with (sereus 1.17: separate from the machine's identity).
        const ownerKey = node?.getOwnerSigner()?.publicKey;
        if (ownerKey) fingerprint = ownerFingerprint(ownerKey);
        const machines: CadreMachine[] = peerId ? [{ peerId, thisDevice: true, addresses: [] }] : [];
        if (node) {
          // Best effort and bounded: the list fills in when the control network answers.
          const members = await withTimeout(node.listMembers(), CONTROL_READ_MS, 'listMembers').catch(() => []);
          for (const m of members) {
            if (m.peerId === peerId) continue;
            machines.push({ peerId: m.peerId, thisDevice: false, addresses: m.multiaddr ? [m.multiaddr] : [] });
          }
        }
        return {
          running: !!node,
          partyId: host.node.partyId(),
          peerId,
          ownerEnrolled: host.node.ownerEnrolled(),
          ownerFingerprint: fingerprint,
          machines,
        };
      }),
      async inspectNodeCode(text) {
        const reading = readNodeCode(text);
        if (!reading.ok) {
          return fail('invalid-node-code', reading.problem === 'newer-version'
            ? 'This code comes from a newer version of the node software; update the app to use it.'
            : reading.problem === 'damaged' ? 'This code is incomplete or damaged.' : 'This is not a node code.',
          { reason: reading.problem });
        }
        const { peerId, multiaddrs } = reading.payload;
        return ok({ peerId, addresses: multiaddrs, reach: nodeReach(multiaddrs) });
      },
      async claimNode(text) {
        const reading = readNodeCode(text);
        if (!reading.ok) return fail('invalid-node-code', 'This is not a usable node code.', { reason: reading.problem });
        if (claiming) return fail('claim-failed', 'A machine is already being added.', { retryable: true, reason: 'busy' });
        claiming = true;
        try {
          const node = requireNode();
          if (!host.node.ownerEnrolled()) {
            return fail('unavailable', 'This device is not yet an owner of its cadre; try again in a moment.', { reason: 'owner-not-ready' });
          }
          // The code carries the claim secret: log the peer id only.
          console.info('[sereus-model] claiming node', reading.payload.peerId);
          try {
            await withTimeout(node.claimNode(reading.payload), CLAIM_TIMEOUT_MS, 'claimNode');
          } catch (err) {
            const failure = classifyClaimFailure(err, reading.payload);
            const message = failure.kind === 'node-unreachable'
              ? (failure.reach === 'home-network'
                ? 'Could not reach that machine. It is only reachable on its own network: join that Wi-Fi and try again.'
                : 'Could not reach that machine. Check that it is running and try again.')
              : failure.kind === 'claim-refused'
                ? `The machine refused: ${failure.detail}`
                : `Adding the machine did not finish: ${failure.detail}`;
            return fail(failure.kind, message, {
              retryable: failure.retryable,
              reason: failure.kind === 'node-unreachable' ? failure.reach : failure.kind === 'claim-refused' ? failure.refusal : undefined,
              cause: err,
            });
          }
          console.info('[sereus-model] ✓ node accepted the claim:', reading.payload.peerId);
          return ok();
        } finally {
          claiming = false;
        }
      },
      removeMachine: peerId => attempt(async () => {
        await withTimeout(requireNode().removePeer(peerId), CONTROL_OP_TIMEOUT_MS, 'removePeer');
      }),
      exportOwnerKey: () => attempt(async () => {
        // The owner key lives in the host's key store (its owner slot), not in the node.
        const key = host.ownerKeyStore ? await readOwnerPrivateKey(host.ownerKeyStore) : undefined;
        if (!key) throw new ChatFailure('not-supported', 'This device holds no owner key to export.');
        return key;
      }),
    },

    changes: {
      cadre(onChange) {
        const unsubscribe = [
          host.node.on('control:connected', () => onChange()),
          host.node.on('control:disconnected', () => onChange()),
        ];
        return () => unsubscribe.forEach(u => u());
      },
      reachability: onChange => host.node.onReachabilityChange(onChange),
      strands(onChange) {
        const events = [...STRAND_UP_EVENTS, ...STRAND_DOWN_EVENTS, 'strand:discovered'] as const;
        const unsubscribe = events.map(event => host.node.on(event, () => onChange()));
        return () => unsubscribe.forEach(u => u());
      },
      /**
       * `Database.watch` over the four chat tables. It wakes on commits this device's
       * storage applies: its own writes and, in a two-person strand, the other's too.
       * The watch FOLLOWS THE STRAND: a strand that opens later, hibernates, or wakes
       * with a new database is re-attached, and a change is reported on re-attach since
       * anything may have arrived meanwhile.
       */
      strand(strandId, onChange) {
        let subs: Array<{ unsubscribe(): void }> = [];
        let attachedTo: unknown = null;
        const detach = () => { subs.forEach(sub => sub.unsubscribe()); subs = []; attachedTo = null; };
        const attach = (): boolean => {
          const strand = host.node.node?.getStrands().get(strandId);
          const database = strand?.database;
          if (!database) { detach(); return false; }
          if (database === attachedTo) return true;
          detach();
          const db = database.getDatabase();
          try {
            for (const table of ['Message', 'Reaction', 'Attachment', 'Member']) {
              const stmt = db.prepare(`select * from App.${table}`); // only for its scope
              const scope = stmt.getChangeScope();
              void stmt.finalize().catch(() => {});
              subs.push(db.watch(scope, () => { onChange(); }));
            }
            attachedTo = database;
            return true;
          } catch (err) {
            detach();
            console.warn('[sereus-model] watch unavailable for', strandId, err instanceof Error ? err.message : err);
            return false;
          }
        };
        attach();
        const unsubscribe = [
          ...STRAND_UP_EVENTS.map(event => host.node.on(event, ({ strandId: id }) => {
            if (id !== strandId) return;
            const before = attachedTo;
            if (attach() && attachedTo !== before) onChange();
          })),
          ...STRAND_DOWN_EVENTS.map(event => host.node.on(event, ({ strandId: id }) => {
            if (id === strandId) detach();
          })),
        ];
        return () => {
          detach();
          unsubscribe.forEach(u => u());
        };
      },
    },
  };

  return { model, boot: () => runtime.boot() };
}

