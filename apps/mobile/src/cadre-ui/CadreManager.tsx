/**
 * CadreManager — drop-in screen for managing a Sereus cadre: the machines that act for
 * this person, and the owner key that binds them.
 *
 * App-agnostic: it reaches data only through the `ChatModel` it is given (its `cadre`
 * area and `cadreManagerStore`), so it has no host-app imports. See ./SPEC.md.
 *
 * Adding a machine is sereus's claiming model (1.14): the machine shows a node code
 * (`sereus-join:…`) while it waits; this device reads it, asks, and claims it. The code
 * carries a one-time claim secret, so it is never logged or shown back.
 *
 * Theming: pass `theme={...}` to override any subset of color tokens; missing tokens
 * fall back to `DEFAULT_THEME` in `./theme.ts`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  cadreManagerStore,
  shortPeerId,
  type CadreMachine,
  type CadreStatus,
  type ChatModel,
  type NodeCodePreview,
} from '@chat/core';
import SecretDisplayModal from './SecretDisplayModal';
import NodeCodeModal from './NodeCodeModal';
import {
  CadreThemeContext,
  resolveTheme,
  useCadreTheme,
  type CadreManagerTheme,
} from './theme';

// ── i18n-friendly strings (centralised for future override) ────────────────
const STRINGS = {
  networkId: 'NETWORK ID',
  ownerKey: 'OWNER KEY',
  machines: 'MY MACHINES',
  copied: 'Copied',
  loading: 'Loading…',
  retry: 'Try again',
  statusRunning: 'Running',
  statusStopped: 'Not running',
  statusOwner: 'owner key on file',
  statusNoOwner: 'owner key not ready',
  statusMachines: (n: number) => (n === 0 ? 'no other machines' : `${n} other machine${n === 1 ? '' : 's'}`),
  ownerHint: 'Machines you add are bound to this key. Back it up to keep control of them if you lose this device.',
  ownerNotReady: 'Not ready yet — this device is still setting up its network.',
  backUp: 'Back up',
  backUpConfirmTitle: 'Show your owner key?',
  backUpConfirmBody: 'Anyone who sees this key can take control of your machines. Show it only somewhere private.',
  show: 'Show',
  exportTitle: 'Owner key',
  exportHint: 'This is your owner private key. Anyone with it controls your machines. Write it down or store it somewhere secure and offline.',
  thisDevice: 'This device',
  machine: 'Machine',
  noMachines: 'Only this device so far. Add a machine that stays on, so your messages keep moving while your phone sleeps.',
  addMachine: 'Add a machine',
  addScan: 'Scan its code',
  addPaste: 'Paste its code',
  confirmTitle: 'Add this machine?',
  confirmBody: (p: NodeCodePreview, fingerprint: string | null) =>
    `Machine ${shortPeerId(p.peerId)} will join your network`
    + (fingerprint ? `, owned by your key ${fingerprint}` : '')
    + '.\n\n'
    + (p.reach === 'home-network'
      ? 'It can only be reached on its own network: be on the same Wi-Fi as it.'
      : 'It can be reached from anywhere.'),
  add: 'Add',
  adding: (peerId: string) => `Adding ${shortPeerId(peerId)}… this can take a minute.`,
  added: 'Machine added',
  addedBody: (peerId: string) => `${shortPeerId(peerId)} is now one of your machines.`,
  addFailed: 'Could not add the machine',
  removeTitle: 'Remove this machine?',
  removeBody: 'It will no longer act for you. To bring it back, it will need a new code.',
  removeFailed: 'Could not remove the machine',
  cancel: 'Cancel',
  remove: 'Remove',
  badCode: 'That code cannot be used',
};

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export interface CadreManagerProps {
  model: ChatModel;
  theme?: Partial<CadreManagerTheme>;
  /** A node code that arrived from outside (the host's scanner, a link): reviewed when it changes. */
  nodeCode?: string;
  /** Called once `nodeCode` has been taken, so the host can clear it. */
  onNodeCodeHandled?: () => void;
  /** Opens the host app's scanner; "Scan its code" is offered only when given. */
  onScan?: () => void;
}

export default function CadreManager({ theme: themeOverrides, ...props }: CadreManagerProps) {
  const theme = useMemo(() => resolveTheme(themeOverrides), [themeOverrides]);
  return (
    <CadreThemeContext.Provider value={theme}>
      <CadreManagerInner {...props} />
    </CadreThemeContext.Provider>
  );
}

function CadreManagerInner({ model, nodeCode, onNodeCodeHandled, onScan }: Omit<CadreManagerProps, 'theme'>) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const store = useMemo(() => cadreManagerStore(model), [model]);
  const load = useSyncExternalStore(store.subscribe as (cb: () => void) => () => void, store.get, store.get);
  const status: CadreStatus | undefined = load.value;

  const [pasteVisible, setPasteVisible] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [exportModal, setExportModal] = useState<{ visible: boolean; value: string | null; error: string | null }>(
    { visible: false, value: null, error: null },
  );

  const copy = useCallback((text: string) => {
    Clipboard.setString(text);
    Alert.alert(STRINGS.copied);
  }, []);

  const claim = useCallback(async (code: string, peerId: string) => {
    setClaiming(peerId);
    const result = await model.cadre.claimNode(code);
    setClaiming(null);
    store.reload();
    if (result.ok) {
      Alert.alert(STRINGS.added, STRINGS.addedBody(peerId));
      return;
    }
    const { message, retryable } = result.error;
    Alert.alert(STRINGS.addFailed, message, retryable
      ? [{ text: STRINGS.cancel, style: 'cancel' }, { text: STRINGS.retry, onPress: () => { void claim(code, peerId); } }]
      : undefined);
  }, [model, store]);

  /** Read a code and ask before claiming: `null` when it was usable, else what is wrong with it. */
  const review = useCallback(async (code: string): Promise<string | null> => {
    const read = await model.cadre.inspectNodeCode(code);
    if (!read.ok) return read.error.message;
    const preview = read.value;
    Alert.alert(STRINGS.confirmTitle, STRINGS.confirmBody(preview, store.get().value?.ownerFingerprint ?? null), [
      { text: STRINGS.cancel, style: 'cancel' },
      { text: STRINGS.add, onPress: () => { void claim(code, preview.peerId); } },
    ]);
    return null;
  }, [model, store, claim]);

  // A code handed in by the host (scanner or link): review it once.
  const handledCode = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!nodeCode || handledCode.current === nodeCode) return;
    handledCode.current = nodeCode;
    onNodeCodeHandled?.();
    void review(nodeCode).then(problem => { if (problem) Alert.alert(STRINGS.badCode, problem); });
  }, [nodeCode, onNodeCodeHandled, review]);

  const onAddMachine = useCallback(() => {
    if (!onScan) { setPasteVisible(true); return; }
    Alert.alert(STRINGS.addMachine, undefined, [
      { text: STRINGS.addScan, onPress: onScan },
      { text: STRINGS.addPaste, onPress: () => setPasteVisible(true) },
      { text: STRINGS.cancel, style: 'cancel' },
    ]);
  }, [onScan]);

  const onRemove = useCallback((machine: CadreMachine) => {
    Alert.alert(STRINGS.removeTitle, STRINGS.removeBody, [
      { text: STRINGS.cancel, style: 'cancel' },
      {
        text: STRINGS.remove,
        style: 'destructive',
        onPress: async () => {
          const result = await model.cadre.removeMachine(machine.peerId);
          store.reload();
          if (!result.ok) Alert.alert(STRINGS.removeFailed, result.error.message);
        },
      },
    ]);
  }, [model, store]);

  const onBackUp = useCallback(() => {
    Alert.alert(STRINGS.backUpConfirmTitle, STRINGS.backUpConfirmBody, [
      { text: STRINGS.cancel, style: 'cancel' },
      {
        text: STRINGS.show,
        onPress: async () => {
          setExportModal({ visible: true, value: null, error: null });
          const result = await model.cadre.exportOwnerKey();
          setExportModal(result.ok
            ? { visible: true, value: result.value, error: null }
            : { visible: true, value: null, error: result.error.message });
        },
      },
    ]);
  }, [model]);

  // ─────────────────────────────────────────────────────────────────────────

  if (!status) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{load.state === 'failed' ? load.error.message : STRINGS.loading}</Text>
        {load.state === 'failed' && (
          <TouchableOpacity onPress={() => store.reload()} hitSlop={HIT_SLOP}>
            <Text style={[styles.link, { marginTop: 8 }]}>{STRINGS.retry}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const others = status.machines.filter(m => !m.thisDevice).length;

  return (
    <View style={styles.container}>
      {/* Status strip */}
      <View style={styles.statusStrip}>
        <View style={[styles.dot, { backgroundColor: status.running ? theme.online : theme.danger }]} />
        <Text style={styles.statusText} numberOfLines={1}>
          {(status.running ? STRINGS.statusRunning : STRINGS.statusStopped)
            + ' · ' + (status.ownerEnrolled ? STRINGS.statusOwner : STRINGS.statusNoOwner)
            + ' · ' + STRINGS.statusMachines(others)}
        </Text>
      </View>

      {/* Network ID */}
      <SectionHeader label={STRINGS.networkId} />
      <TouchableOpacity
        style={styles.card}
        onPress={() => status.partyId && copy(status.partyId)}
        testID="cadre-partyid"
      >
        <Ionicons name="finger-print-outline" size={20} color={theme.textPrimary} />
        <Text style={[styles.cardTitle, styles.monoLike, styles.grow]} numberOfLines={1} ellipsizeMode="middle">
          {status.partyId ?? '—'}
        </Text>
        <Ionicons name="copy-outline" size={18} color={theme.textMuted} />
      </TouchableOpacity>

      {/* Owner key */}
      <SectionHeader label={STRINGS.ownerKey} />
      <View style={styles.card} testID="cadre-owner-key">
        <Ionicons name="key-outline" size={20} color={theme.textPrimary} />
        <View style={styles.grow}>
          {status.ownerEnrolled && status.ownerFingerprint ? (
            <>
              <Text style={[styles.cardTitle, styles.monoLike]}>{status.ownerFingerprint}</Text>
              <Text style={styles.cardSubtitle}>{STRINGS.ownerHint}</Text>
            </>
          ) : (
            <Text style={styles.cardSubtitle}>{STRINGS.ownerNotReady}</Text>
          )}
        </View>
        {status.ownerEnrolled && (
          <TouchableOpacity onPress={onBackUp} hitSlop={HIT_SLOP} testID="cadre-owner-backup">
            <Text style={styles.link}>{STRINGS.backUp}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Machines */}
      <SectionHeader
        label={`${STRINGS.machines} (${status.machines.length})`}
        onAdd={onAddMachine}
        addDisabled={!status.ownerEnrolled || claiming !== null}
      />
      {status.machines.map(machine => (
        <MachineRow key={machine.peerId} machine={machine} onCopy={copy} onRemove={onRemove} />
      ))}
      {others === 0 && claiming === null && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyHint}>{STRINGS.noMachines}</Text>
        </View>
      )}
      {claiming !== null && (
        <View style={styles.card} testID="cadre-claiming">
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.cardSubtitle, styles.grow]}>{STRINGS.adding(claiming)}</Text>
        </View>
      )}

      <SecretDisplayModal
        visible={exportModal.visible}
        title={STRINGS.exportTitle}
        hint={STRINGS.exportHint}
        value={exportModal.value}
        error={exportModal.error}
        emphasis="sensitive"
        onClose={() => setExportModal({ visible: false, value: null, error: null })}
      />

      <NodeCodeModal visible={pasteVisible} onClose={() => setPasteVisible(false)} onSubmit={review} />
    </View>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function SectionHeader({
  label,
  onAdd,
  addDisabled,
}: {
  label: string;
  onAdd?: () => void;
  addDisabled?: boolean;
}) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{label}</Text>
      {onAdd && (
        <TouchableOpacity
          onPress={onAdd}
          disabled={addDisabled}
          hitSlop={HIT_SLOP}
          style={{ opacity: addDisabled ? 0.4 : 1 }}
          testID={`cadre-add-${label.toLowerCase().replace(/\s+\(\d+\)$/, '').replace(/\s+/g, '-')}`}
        >
          <Ionicons name="add-circle-outline" size={22} color={theme.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function MachineRow({
  machine,
  onCopy,
  onRemove,
}: {
  machine: CadreMachine;
  onCopy: (peerId: string) => void;
  onRemove: (machine: CadreMachine) => void;
}) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card} testID={`cadre-machine-${machine.peerId}`}>
      <Ionicons
        name={machine.thisDevice ? 'phone-portrait-outline' : 'server-outline'}
        size={20}
        color={theme.textPrimary}
      />
      <View style={styles.grow}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {machine.thisDevice ? STRINGS.thisDevice : `${STRINGS.machine} ${shortPeerId(machine.peerId)}`}
        </Text>
        <TouchableOpacity onPress={() => onCopy(machine.peerId)} hitSlop={HIT_SLOP}>
          <Text style={[styles.cardSubtitle, styles.monoLike]} numberOfLines={1} ellipsizeMode="middle">
            {machine.peerId}
          </Text>
        </TouchableOpacity>
      </View>
      {!machine.thisDevice && (
        <TouchableOpacity onPress={() => onRemove(machine)} hitSlop={HIT_SLOP} testID="cadre-machine-remove">
          <Ionicons name="trash-outline" size={20} color={theme.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles (theme-driven) ─────────────────────────────────────────────────

function makeStyles(theme: CadreManagerTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, padding: 16 },
    grow: { flex: 1, marginLeft: 12, minWidth: 0 },
    link: { color: theme.accent, fontWeight: '600' },
    center: { alignItems: 'center', justifyContent: 'center' },
    muted: { color: theme.textMuted },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 8,
    },
    sectionHeaderText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: theme.sectionLabel,
      letterSpacing: 0.4,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      backgroundColor: theme.surface,
    },
    cardTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
    cardSubtitle: { fontSize: 12, color: theme.textSecondary },
    // Slight tracking + monospace-leaning family for IDs/keys so the
    // ellipsizeMode='middle' truncation reads as intended.
    monoLike: { fontFamily: 'monospace', letterSpacing: 0.2 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    statusStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    statusText: { flex: 1, fontSize: 12, color: theme.textSecondary },
    emptyCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
      alignItems: 'center',
    },
    emptyHint: { fontSize: 12, color: theme.textMuted, textAlign: 'center' },
  });
}
