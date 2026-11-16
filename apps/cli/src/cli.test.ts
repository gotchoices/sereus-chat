import { describe, expect, it } from 'vitest';
import { splitArgv, splitLine } from './lex.js';
import { createOutput, escapeField } from './output.js';
import { RefError, resolveRef } from './refs.js';
import { find } from './commands/index.js';
import { resolveDrivePath } from './commands/drive.js';

describe('command lines', () => {
  it('splits words, quotes, escapes and commands', () => {
    expect(splitLine(`send 1 "hello; there" ; log 1 -n 5`)).toEqual([['send', '1', 'hello; there'], ['log', '1', '-n', '5']]);
    expect(splitLine(`send f8f3 it\\'s 'a "test"'`)).toEqual([['send', 'f8f3', "it's", 'a "test"']]);
    expect(splitLine(`  `)).toEqual([]);
    expect(splitLine(`send 1 ""`)).toEqual([['send', '1', '']]);
    expect(() => splitLine(`send "oops`)).toThrow(/unclosed/);
    expect(splitLine('strands\n# a comment; not run\nsend 1 "a\nb" # note\n')).toEqual([['strands'], ['send', '1', 'a\nb']]);
  });
  it('splits argv on a lone ;', () => {
    expect(splitArgv(['strands', ';', 'log', '1', 'a;b'])).toEqual([['strands'], ['log', '1', 'a;b']]);
  });
});

describe('output', () => {
  it('keeps a record on one line', () => {
    expect(escapeField('a\tb\nc\\d')).toBe('a\\tb\\nc\\\\d');
    expect(escapeField(null)).toBe('');
    expect(escapeField(true)).toBe('yes');
  });
  it('writes tab-separated rows, or JSON lines', () => {
    let out = '';
    createOutput({ json: false, header: true, write: s => { out += s; } }).rows(['row', 'text'], [{ row: 1, text: 'hi\tthere' }]);
    expect(out).toBe('row\ttext\n1\thi\\tthere\n');
    out = '';
    createOutput({ json: true, header: true, write: s => { out += s; } }).rows(['row', 'text'], [{ row: 1 }]);
    expect(out).toBe('{"row":1,"text":null}\n');
  });
});

describe('naming strands', () => {
  const strands = [{ id: 'f8f301bf-aaaa', title: 'Susan' }, { id: 'f8f3ffff-bbbb', title: 'Bob' }, { id: '0c1d2e3f', title: 'bob' }];
  const last = ['0c1d2e3f', 'f8f301bf-aaaa'];
  it('by row of the last listing', () => {
    expect(resolveRef('2', strands, last).title).toBe('Susan');
    expect(resolveRef('#1', strands, last).id).toBe('0c1d2e3f');
    expect(() => resolveRef('3', strands, last)).toThrow(RefError);
  });
  it('by id or unique prefix', () => {
    expect(resolveRef('f8f301', strands, last).title).toBe('Susan');
    expect(() => resolveRef('f8f3', strands, last)).toThrow(/starts 2/);
  });
  it('by unique title', () => {
    expect(resolveRef('susan', strands, last).id).toBe('f8f301bf-aaaa');
    expect(() => resolveRef('BOB', strands, last)).toThrow(/2 strands/);
  });
});

describe('command names', () => {
  it('takes a name, an alias, or a unique beginning', () => {
    expect(find('status').name).toBe('status');
    expect(find('?').name).toBe('help');
    expect(find('ls').name).toBe('strands');
    expect(find('mem').name).toBe('members');
    expect(find('invite').name).toBe('invite'); // exact beats being a prefix of "invites"
  });
  it('refuses an ambiguous or unknown word', () => {
    expect(() => find('s')).toThrow(/could be/);
    expect(() => find('nope')).toThrow(/no command/);
  });
});

describe('naming things in a drive', () => {
  const folder = (id: string, name: string, parentId: string | null) => ({ id, name, parentId, createdBy: 'p', createdByName: 'P', createdAt: '', addPolicy: 'anyone' as const, mine: true, canAdd: true });
  const file = (id: string, name: string, folderId: string | null, fingerprint: string) => ({ id, name, folderId, fingerprint, size: 1, mimeType: null, addedBy: 'p', addedByName: 'P', addedAt: '', expiresAt: '', mine: true, here: true, uri: null });
  const folders = [folder('f1', 'Routes', null), folder('f2', 'Saturday', 'f1')];
  const files = [file('a', 'waiver.pdf', null, 'c8ph4r'), file('b', 'waiver.pdf', null, 'zt6e1b'), file('c', 'summit.jpg', 'f2', 'w2ny5h')];
  const list = async (id: string | null) => ({
    folder: null, path: [], canAdd: true,
    folders: folders.filter(f => f.parentId === id), files: files.filter(f => f.folderId === id),
  });
  it('by path, by name~fingerprint, by id', async () => {
    expect(await resolveDrivePath('/', list)).toEqual({ kind: 'top' });
    expect(await resolveDrivePath('Routes/Saturday', list)).toMatchObject({ kind: 'folder', folder: { id: 'f2' } });
    expect(await resolveDrivePath('Routes/Saturday/summit.jpg', list)).toMatchObject({ kind: 'file', file: { id: 'c' } });
    await expect(resolveDrivePath('waiver.pdf', list)).rejects.toThrow(/~fingerprint/);
    expect(await resolveDrivePath('waiver.pdf~zt6e1b', list)).toMatchObject({ file: { id: 'b' } });
    expect(await resolveDrivePath('c', list)).toMatchObject({ file: { id: 'c' } });
    await expect(resolveDrivePath('Routes/nope', list)).rejects.toThrow(/no "nope"/);
  });
});
