/**
 * private-store.ts — chat's PRIVATE data: tables in the cadre's control database, which reaches
 * only this party's own machines (never a strand, so no other member ever holds a copy or sees
 * it change).
 *
 * Kept in a schema of chat's own, `private_org_sereus_chat` (purpose, then the sApp id), never
 * inside `CadreControl`: every start applies `CadreControl` as a diff that drops tables it does
 * not declare. Writes go through `ControlDatabase.execWrite`, which serializes them with
 * cadre-core's own control writes on the one shared `Database`. Each machine applies the schema
 * itself once its node is up (a machine that has not applies reads "Table not found").
 * Tested in test/stack/control-db-app-tables.mjs; done with upstream's agreement (sereus#24).
 *
 * NICKNAMES (story 30): the user's own name for a member of a strand, keyed by strand and member,
 * so it holds however members are identified. The app never decides that two members are the
 * same person: giving the same name in two strands is the user's own filing.
 *
 * STRAND NOTES: the user's own note on a strand (what it is for, who they invited), so a strand
 * nobody has joined yet is not a row of identical "Waiting for someone to join".
 *
 * The schema only ever GROWS (Quereus migration.md: a shared basis is additive), so a machine
 * on an older build keeps working beside a newer one.
 */
import type { CadreNode } from '@serfab/cadre-core';
import type { NodeHost } from './host.js';

export const PRIVATE_SCHEMA = 'private_org_sereus_chat';

const SCHEMA_DDL = `declare schema ${PRIVATE_SCHEMA} {
  table Nickname (
    StrandId text not null,
    MemberId text not null,
    Name text not null check (length(Name) between 1 and 100),
    primary key (StrandId, MemberId)
  );
  table StrandNote (
    StrandId text primary key,
    Text text not null check (length(Text) between 1 and 500),
    UpdatedAt text not null
  );
};
apply schema ${PRIVATE_SCHEMA};`;

const key = (strandId: string, memberId: string) => `${strandId}\n${memberId}`;

export class PrivateStore {
  /** The node the schema was last applied on (a rebuilt node applies it again). */
  private appliedOn: CadreNode | null = null;
  private applying: Promise<void> | null = null;

  constructor(private readonly node: NodeHost) {}

  /** Apply the private schema on this node, once. A no-op diff after the first time. */
  private async ready(): Promise<CadreNode> {
    await this.node.ensureStarted();
    const node = this.node.node;
    if (!node) throw new Error('Cadre is not running.');
    if (this.appliedOn !== node) {
      const t0 = Date.now();
      this.applying ??= node.getControlDatabase()!.execWrite(SCHEMA_DDL, undefined, 'chat private schema')
        .then(() => { this.appliedOn = node; console.info(`[private-store] schema applied in ${Date.now() - t0} ms`); })
        .finally(() => { this.applying = null; });
      await this.applying;
    }
    return node;
  }

  /** Every nickname: `strandId\nmemberId` → name. */
  async nicknames(): Promise<Map<string, string>> {
    const node = await this.ready();
    const out = new Map<string, string>();
    for await (const r of node.getControlDatabase()!.getDatabase().eval(
      `select StrandId, MemberId, Name from ${PRIVATE_SCHEMA}.Nickname`)) {
      out.set(key(r.StrandId as string, r.MemberId as string), r.Name as string);
    }
    return out;
  }

  /** This strand's nicknames: memberId → name. */
  async strandNicknames(strandId: string): Promise<Map<string, string>> {
    const all = await this.nicknames();
    const prefix = key(strandId, '');
    return new Map([...all].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  }

  /** The distinct names in use, for choosing one again. */
  async names(): Promise<string[]> {
    return [...new Set((await this.nicknames()).values())].sort((a, b) => a.localeCompare(b));
  }

  /** How many members carry this name. */
  async nicknameUses(name: string): Promise<number> {
    let n = 0;
    for (const v of (await this.nicknames()).values()) if (v === name) n++;
    return n;
  }

  /**
   * Give a member a name, or (`null`) remove it. `everywhere`: the member's CURRENT name is
   * changed (or removed) on every member that carries it, not only this one (story 30).
   */
  async setNickname(strandId: string, memberId: string, name: string | null, everywhere = false): Promise<void> {
    const node = await this.ready();
    const control = node.getControlDatabase()!;
    const trimmed = name?.trim() ?? '';
    const t0 = Date.now();
    const previous = everywhere ? (await this.nicknames()).get(key(strandId, memberId)) : undefined;
    if (previous !== undefined) {
      await control.execWrite(trimmed
        ? `update ${PRIVATE_SCHEMA}.Nickname set Name = ? where Name = ?`
        : `delete from ${PRIVATE_SCHEMA}.Nickname where Name = ?`,
        trimmed ? [trimmed, previous] : [previous], 'rename nickname everywhere');
      console.info(`[private-store] nickname "${previous}" ${trimmed ? 'renamed' : 'cleared'} everywhere in ${Date.now() - t0} ms`);
      return;
    }
    if (trimmed) {
      await control.execWrite(`insert or replace into ${PRIVATE_SCHEMA}.Nickname (StrandId, MemberId, Name) values (?, ?, ?)`,
        [strandId, memberId, trimmed], 'set nickname');
    } else {
      await control.execWrite(`delete from ${PRIVATE_SCHEMA}.Nickname where StrandId = ? and MemberId = ?`,
        [strandId, memberId], 'clear nickname');
    }
    // A control-database write, which every machine of the party takes part in: timed for the log.
    console.info(`[private-store] nickname ${trimmed ? 'set' : 'cleared'} in ${Date.now() - t0} ms`);
  }

  /** Every strand note: strandId → text. */
  async notes(): Promise<Map<string, string>> {
    const node = await this.ready();
    const out = new Map<string, string>();
    for await (const r of node.getControlDatabase()!.getDatabase().eval(`select StrandId, Text from ${PRIVATE_SCHEMA}.StrandNote`)) {
      out.set(r.StrandId as string, r.Text as string);
    }
    return out;
  }

  /** Set a strand's note, or (`null` or blank) remove it. */
  async setNote(strandId: string, text: string | null): Promise<void> {
    const node = await this.ready();
    const control = node.getControlDatabase()!;
    const trimmed = text?.trim() ?? '';
    if (trimmed) {
      await control.execWrite(`insert or replace into ${PRIVATE_SCHEMA}.StrandNote (StrandId, Text, UpdatedAt) values (?, ?, ?)`,
        [strandId, trimmed.slice(0, 500), new Date().toISOString()], 'set strand note');
    } else {
      await control.execWrite(`delete from ${PRIVATE_SCHEMA}.StrandNote where StrandId = ?`, [strandId], 'clear strand note');
    }
  }
}
