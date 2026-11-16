/**
 * Drive — a strand's shared drive (story 23): folders and files every member sees alike, apart
 * from the conversation. Each file is kept as long as its author chose, then gone for everyone.
 * Spec: design/specs/mobile/screens/drive.md · consolidation: design/generated/mobile/screens/Drive.md
 *
 * One folder per screen: opening a folder pushes Drive again, so Back walks up the tree.
 * A file not on this phone yet is normal (`here` false); only a failed open says it is still
 * arriving, never that it is missing (Alt F).
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, Modal, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, keepLocalCopy } from '@react-native-documents/picker';
import { FileSystem } from 'react-native-file-access';
import type { DriveFile, DriveFolder, DriveListing, KeepFor } from '@chat/core';
import { orThrow, useModel } from '../data/bind';
import { useErrorText, useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { ActionSheet, Banner, EmptyState, IconButton, ListRow, PrivateTextSheet, type ActionSheetOption } from '../components';
import { showToast } from '../ui/toast';
import { useTheme, typography, spacing } from '../theme';

const KEEP: KeepFor[] = ['month', 'day', 'week', 'year'];
const KB = 1024;
const MB = KB * 1024;
const size = (b: number) => (b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / KB))} KB`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const isImage = (f: DriveFile) => (f.mimeType ?? '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name);

type Picked = { uri: string; name: string; mimeType?: string };
type Sheet = { title?: string; options: ActionSheetOption[] } | null;
type Prompt = { title: string; note: string; current: string | null; onSave: (text: string) => void } | null;

export default function Drive() {
  const model = useModel();
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const { strandId, folderId = null } = route.params ?? {};
  const t = useT();
  const errorText = useErrorText();
  const rev = useDataRevision();
  const theme = useTheme();

  const [listing, setListing] = useState<DriveListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [viewing, setViewing] = useState<{ uri: string; file: DriveFile } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [arriving, setArriving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try { setListing(orThrow(await model.drive.list(strandId, folderId))); setError(null); }
    catch (e: any) { setError(errorText(e, 'Could not read the drive')); }
  }, [model, strandId, folderId, errorText]);

  useEffect(() => { void load(); }, [load, rev]);
  // The drive's rows are the strand's: another member's change arrives as a strand change.
  useEffect(() => model.changes.strand(strandId, () => { void load(); }), [model, strandId, load]);

  /** Run a write; on failure, say why (the catalog's words for not-allowed, too-large, …). */
  const act = useCallback(async (run: () => Promise<{ ok: boolean; error?: any }>) => {
    const r = await run();
    if (!r.ok) showToast(errorText(r.error));
    await load();
    return r.ok;
  }, [errorText, load]);

  const title = listing?.folder?.name ?? t('drive.title');
  const canAdd = listing?.canAdd ?? false;

  // ------------------------------------------------------------------ adding

  const addPicked = useCallback(async (files: Picked[]) => {
    if (!files.length) return;
    setSheet({
      title: t('drive.keepFor'),
      options: KEEP.map(keepFor => ({
        label: t(`drive.keep.${keepFor}`),
        testID: `drive-keep-${keepFor}`,
        onPress: async () => {
          setBusy(t('drive.adding').replace('{{n}}', String(files.length)));
          let added = 0;
          for (const f of files) {
            const r = await model.drive.addFile(strandId, folderId, { ...f, keepFor });
            if (r.ok) added++; else showToast(`${f.name}: ${errorText(r.error)}`);
          }
          setBusy(null);
          if (added) showToast(t('drive.added').replace('{{n}}', String(added)));
          await load();
        },
      })),
    });
  }, [t, model, strandId, folderId, errorText, load]);

  const pickPhotos = async () => {
    const res = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 0 });
    await addPicked((res.assets ?? []).filter(a => a.uri).map(a => ({
      uri: a.uri!, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.type ?? undefined,
    })));
  };

  const pickFiles = async () => {
    try {
      const files = await pick({ mode: 'import', allowMultiSelection: true });
      // A picked document's URI may not outlive the picker: copy it into the app first.
      const local = await keepLocalCopy({
        files: files.map(f => ({ uri: f.uri, fileName: f.name ?? 'file' })) as [any, ...any[]],
        destination: 'cachesDirectory',
      });
      await addPicked(files.map((f, i) => ({
        uri: local[i]?.status === 'success' ? (local[i] as any).localUri : f.uri,
        name: f.name ?? 'file',
        mimeType: f.type ?? undefined,
      })));
    } catch { /* cancelled */ }
  };

  const newFolder = () => setPrompt({
    title: t('drive.newFolder'), note: t('drive.folderNote'), current: null,
    onSave: name => setSheet({
      title: name,
      options: (['anyone', 'creator'] as const).map(addPolicy => ({
        label: t(addPolicy === 'anyone' ? 'drive.anyoneAdds' : 'drive.onlyMeAdds'),
        testID: `drive-policy-${addPolicy}`,
        onPress: () => { void act(() => model.drive.addFolder(strandId, folderId, name, { addPolicy })); },
      })),
    }),
  });

  const add = useCallback(() => setSheet({
    title: t('drive.addTitle'),
    options: [
      { label: t('drive.addPhotos'), onPress: pickPhotos, testID: 'drive-add-photos' },
      { label: t('drive.addFiles'), onPress: pickFiles, testID: 'drive-add-files' },
      { label: t('drive.newFolder'), onPress: newFolder, testID: 'drive-add-folder' },
    ],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t, addPicked]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (canAdd
        ? <IconButton name="add-outline" size={24} accessibilityLabel={t('drive.add')} onPress={add} testID="drive-add" />
        : null),
    });
  }, [navigation, title, canAdd, add, t]);

  // ------------------------------------------------------------------ opening

  const open = async (f: DriveFile) => {
    const r = await model.drive.open(strandId, f.id);
    if (!r.ok) {
      if (r.error.reason === 'still-arriving') {
        setArriving(prev => new Set(prev).add(f.id));
        showToast(t('drive.stillArriving'));
      } else showToast(errorText(r.error));
      return null;
    }
    setArriving(prev => { const next = new Set(prev); next.delete(f.id); return next; });
    return r.value.uri;
  };

  const saveOut = async (f: DriveFile, uri?: string | null) => {
    const at = uri ?? await open(f);
    if (!at) return;
    try {
      await FileSystem.cpExternal(at.replace(/^file:\/\//, ''), f.name, 'downloads');
      showToast(t('drive.saved'));
    } catch (e) { showToast(errorText(e)); }
  };

  const tapFile = async (f: DriveFile) => {
    const uri = await open(f);
    if (!uri) return;
    if (isImage(f)) setViewing({ uri, file: f });
    else await saveOut(f, uri);
    if (!f.here) void load();
  };

  // ------------------------------------------------------------------ changing

  const moveTargets = async (kind: 'folder' | 'file', id: string, from: string | null): Promise<ActionSheetOption[]> => {
    // The top, the folders at the top, and those here, that the user may add to (never itself).
    const top = await model.drive.list(strandId, null);
    const seen = new Map<string, DriveFolder>();
    for (const f of [...(top.ok ? top.value.folders : []), ...(listing?.folders ?? []), ...(listing?.path ?? [])]) seen.set(f.id, f);
    const targets: Array<{ id: string | null; name: string }> = [
      ...(from !== null ? [{ id: null, name: t('drive.top') }] : []),
      ...[...seen.values()].filter(f => f.canAdd && f.id !== id && f.id !== from).map(f => ({ id: f.id, name: f.name })),
    ];
    return targets.map(to => ({ label: to.name, onPress: () => { void act(() => model.drive.move(strandId, kind, id, to.id)); } }));
  };

  const fileMenu = (f: DriveFile) => setSheet({
    title: f.name,
    options: [
      {
        label: t('drive.keepLonger'), hint: t('drive.keepLongerNote'), testID: 'drive-keep-longer',
        onPress: () => setSheet({
          title: t('drive.keepFor'),
          options: KEEP.filter(k => k !== 'day').map(keepFor => ({ label: t(`drive.keep.${keepFor}`), onPress: () => { void act(() => model.drive.keep(strandId, f.id, keepFor)); } })),
        }),
      },
      { label: t('drive.saveDownloads'), onPress: () => { void saveOut(f); } },
      ...(f.mine ? [
        { label: t('drive.rename'), onPress: () => setPrompt({ title: t('drive.rename'), note: '', current: f.name, onSave: name => { void act(() => model.drive.rename(strandId, 'file', f.id, name)); } }) },
        { label: t('drive.move'), onPress: async () => setSheet({ title: t('drive.moveTo'), options: await moveTargets('file', f.id, f.folderId) }) },
        { label: t('drive.remove'), destructive: true, hint: t('drive.removeNote'), testID: 'drive-remove', onPress: () => { void act(() => model.drive.remove(strandId, 'file', f.id)); } },
      ] : []),
    ],
  });

  const folderMenu = (f: DriveFolder) => {
    if (!f.mine) return;
    setSheet({
      title: f.name,
      options: [
        { label: t('drive.rename'), onPress: () => setPrompt({ title: t('drive.rename'), note: '', current: f.name, onSave: name => { void act(() => model.drive.rename(strandId, 'folder', f.id, name)); } }) },
        { label: t('drive.move'), onPress: async () => setSheet({ title: t('drive.moveTo'), options: await moveTargets('folder', f.id, f.parentId) }) },
        f.addPolicy === 'creator'
          ? { label: t('drive.anyoneAdds'), onPress: () => { void act(() => model.drive.setAddPolicy(strandId, f.id, 'anyone')); } }
          : { label: t('drive.onlyMeAdds'), onPress: () => { void act(() => model.drive.setAddPolicy(strandId, f.id, 'creator')); } },
        { label: t('drive.remove'), destructive: true, hint: t('drive.removeNote'), onPress: () => { void act(() => model.drive.remove(strandId, 'folder', f.id)); } },
      ],
    });
  };

  // ------------------------------------------------------------------ rows

  // Same names coexist (Alt B): where a name repeats here, the fingerprint tells them apart.
  const repeated = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of listing?.files ?? []) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [listing]);

  type Row = { kind: 'folder'; folder: DriveFolder } | { kind: 'file'; file: DriveFile };
  const rows: Row[] = useMemo(() => [
    ...(listing?.folders ?? []).map(folder => ({ kind: 'folder' as const, folder })),
    ...(listing?.files ?? []).map(file => ({ kind: 'file' as const, file })),
  ], [listing]);

  const icon = (name: string) => <Ionicons name={name} size={22} color={theme.accent} />;

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'folder') {
      const f = item.folder;
      return (
        <ListRow
          testID={`drive-folder-${f.name}`}
          leading={icon('folder-outline')}
          title={f.name}
          subtitle={t('drive.by').replace('{{name}}', f.mine ? t('drive.you') : f.createdByName)}
          trailing={f.addPolicy === 'creator' ? <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} /> : undefined}
          onPress={() => navigation.push('Drive', { strandId, folderId: f.id })}
          onLongPress={() => folderMenu(f)}
        />
      );
    }
    const f = item.file;
    const parts = [
      size(f.size),
      f.mine ? t('drive.you') : f.addedByName,
      day(f.addedAt),
      t('drive.keptUntil').replace('{{date}}', day(f.expiresAt)),
      repeated.has(f.name) ? `#${f.fingerprint}` : null,
      arriving.has(f.id) ? t('drive.stillArriving') : null,
    ];
    return (
      <ListRow
        testID={`drive-file-${f.name}`}
        leading={icon(isImage(f) ? 'image-outline' : 'document-outline')}
        title={f.name}
        subtitle={parts.filter(Boolean).join(' · ')}
        onPress={() => { void tapFile(f); }}
        onLongPress={() => fileMenu(f)}
      />
    );
  };

  const creatorOnly = listing?.folder && !listing.canAdd
    ? t('drive.creatorOnly').replace('{{name}}', listing.folder.createdByName)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]} testID="drive">
      {listing?.path.length ? (
        <Text style={[typography.small, styles.path, { color: theme.textMuted }]} numberOfLines={1}>
          {[t('drive.title'), ...listing.path.map(p => p.name)].join(' › ')}
        </Text>
      ) : null}
      {creatorOnly ? (
        <Text style={[typography.small, styles.path, { color: theme.textMuted }]} testID="drive-creator-only">{creatorOnly}</Text>
      ) : null}
      {busy ? <Banner message={busy} variant="info" /> : null}

      {error ? (
        <Banner message={error} action={{ label: t('common.retry'), onPress: load }} />
      ) : listing && rows.length === 0 ? (
        folderId
          ? <EmptyState icon="folder-open-outline" title={t('drive.emptyFolder')}
              cta={canAdd ? { label: t('drive.add'), onPress: add, testID: 'drive-empty-add' } : undefined} />
          : <EmptyState icon="folder-open-outline" title={t('drive.emptyTitle')} hint={t('drive.empty')}
              cta={{ label: t('drive.add'), onPress: add, testID: 'drive-empty-add' }} />
      ) : (
        <FlatList
          testID="drive-list"
          data={rows}
          keyExtractor={r => (r.kind === 'folder' ? `d-${r.folder.id}` : `f-${r.file.id}`)}
          renderItem={renderRow}
        />
      )}

      <ActionSheet
        visible={!!sheet}
        title={sheet?.title}
        options={sheet?.options ?? []}
        cancelLabel={t('common.cancel')}
        onDismiss={() => setSheet(null)}
        testID="drive-sheet"
      />
      <PrivateTextSheet
        visible={!!prompt}
        current={prompt?.current ?? null}
        removable={false}
        autoCapitalize="none"
        maxLength={200}
        labels={{
          title: prompt?.title ?? '', note: prompt?.note ?? '', placeholder: t('drive.name'), used: '',
          save: t('common.save'), remove: '', cancel: t('common.cancel'),
        }}
        onSave={text => { if (text?.trim()) prompt?.onSave(text.trim()); }}
        onDismiss={() => setPrompt(null)}
      />
      <Modal visible={!!viewing} transparent={false} animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing ? <Image source={{ uri: viewing.uri }} style={styles.image} resizeMode="contain" testID="drive-image" /> : null}
          <View style={styles.viewerBar}>
            <IconButton name="close-outline" size={28} color="#fff" accessibilityLabel={t('common.close')} onPress={() => setViewing(null)} />
            <Text style={[typography.body, styles.viewerTitle]} numberOfLines={1}>{viewing?.file.name}</Text>
            <IconButton name="download-outline" size={24} color="#fff" accessibilityLabel={t('drive.saveDownloads')}
              onPress={() => { if (viewing) void saveOut(viewing.file, viewing.uri); }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  path: { paddingHorizontal: spacing[3], paddingTop: spacing[2] },
  viewer: { flex: 1, backgroundColor: '#000' },
  image: { flex: 1 },
  viewerBar: { position: 'absolute', top: spacing[3], left: spacing[2], right: spacing[2], flexDirection: 'row', alignItems: 'center' },
  viewerTitle: { flex: 1, color: '#fff', marginHorizontal: spacing[2] },
});
