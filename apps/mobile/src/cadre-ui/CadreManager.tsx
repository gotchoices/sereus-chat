/**
 * CadreManager — drop-in screen for managing a Sereus cadre.
 *
 * App-agnostic.  Reaches data only through `cadreService` (the cadre engine).
 * No host-app imports.  See ./SPEC.md for the contract this implements.
 *
 * Theming: pass `theme={...}` to override any subset of color tokens; missing
 * tokens fall back to `DEFAULT_THEME` in `./theme.ts`.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Clipboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { cadreService } from '../cadre';
import {
  useCadreManager,
  type CadreKeyRow,
  type CadreNodeRow,
} from './useCadreManager';
import SeedDisplayModal from './SeedDisplayModal';
import {
  CadreThemeContext,
  resolveTheme,
  useCadreTheme,
  type CadreManagerTheme,
} from './theme';

// ── i18n-friendly strings (centralised for future override) ────────────────
const STRINGS = {
  title: 'My Devices',
  networkId: 'NETWORK ID',
  myKeys: 'MY KEYS',
  myNodes: 'MY NODES',
  copied: 'Copied',
  loading: 'Loading…',
  noKeys: 'No keys yet',
  noKeysHint: 'One is created automatically when you add your first node.',
  noNodes: 'No remote nodes yet. Tap + to add one.',
  statusOnline: 'online',
  statusUnknown: 'unknown',
  statusUnreachable: 'unreachable',
  addKey: 'Add a key',
  addKeyVault: 'Generate in device vault',
  addKeyExternal: 'Import key file or QR',
  addKeyDongle: 'Hardware dongle (future)',
  addNode: 'Add a node',
  addNodeDrone: 'Drone (server)',
  addNodeServerQr: 'Server (scan QR)',
  addNodeBrowser: 'Browser node (future)',
  addNodePhone: 'Another phone (future)',
  removeNodeTitle: 'Remove node?',
  removeNodeBody: 'This device will be removed from your cadre. It will need to be re-invited to rejoin.',
  cancel: 'Cancel',
  remove: 'Remove',
  notImplementedTitle: 'Not yet implemented',
  notImplementedRemove: 'Remove flow requires the cadre control mutation API.',
  notImplementedQr: 'QR scan flow needs the camera screen wired up; until then use the Drone (server) option which produces a seed for cadre-cli.',
  notImplementedBrowser: 'Browser node (quoomb) wiring is upcoming.',
  notImplementedPhone: 'Phone-to-phone (relay-routed) is upcoming; currently requires a drone or server intermediary.',
  keyCreated: 'Authority key created and stored on this device.',
  keyCreatedFailed: 'Failed to create authority key',
};

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

interface CadreManagerProps {
  theme?: Partial<CadreManagerTheme>;
}

export default function CadreManager({ theme: themeOverrides }: CadreManagerProps = {}) {
  const theme = useMemo(() => resolveTheme(themeOverrides), [themeOverrides]);
  return (
    <CadreThemeContext.Provider value={theme}>
      <CadreManagerInner />
    </CadreThemeContext.Provider>
  );
}

function CadreManagerInner() {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cadre = useCadreManager();
  const hasKeys = cadre.keys.length > 0;
  const [seedModal, setSeedModal] = useState<{ visible: boolean; seed: string | null; error: string | null }>(
    { visible: false, seed: null, error: null },
  );

  const onCopyPartyId = useCallback(() => {
    if (cadre.partyId) {
      Clipboard.setString(cadre.partyId);
      Alert.alert(STRINGS.copied);
    }
  }, [cadre.partyId]);

  const onCopyPeerId = useCallback((peerId: string) => {
    Clipboard.setString(peerId);
    Alert.alert(STRINGS.copied);
  }, []);

  /** Generate (or return existing) authority key, refresh UI. */
  const ensureAuthorityKey = useCallback(async (): Promise<boolean> => {
    try {
      await cadreService.createAuthorityKey();
      await cadre.refresh();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(STRINGS.keyCreatedFailed, msg);
      return false;
    }
  }, [cadre]);

  const onAddKey = useCallback(() => {
    Alert.alert(STRINGS.addKey, undefined, [
      {
        text: STRINGS.addKeyVault,
        onPress: async () => {
          const ok = await ensureAuthorityKey();
          if (ok) Alert.alert(STRINGS.keyCreated);
        },
      },
      {
        text: STRINGS.addKeyExternal,
        onPress: () =>
          Alert.alert(STRINGS.notImplementedTitle, 'External key import (JWK / QR) is upcoming.'),
      },
      { text: STRINGS.addKeyDongle, style: 'cancel' },
      { text: STRINGS.cancel, style: 'cancel' },
    ]);
  }, [ensureAuthorityKey]);

  const onAddDrone = useCallback(async () => {
    // JIT: ensure an authority key exists before creating a seed.
    if (!cadreService.hasAuthorityKey) {
      const ok = await ensureAuthorityKey();
      if (!ok) return;
    }
    setSeedModal({ visible: true, seed: null, error: null });
    try {
      const encoded = await cadreService.createDroneSeed();
      setSeedModal({ visible: true, seed: encoded, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSeedModal({ visible: true, seed: null, error: msg });
    }
  }, [ensureAuthorityKey]);

  const onAddNode = useCallback(() => {
    Alert.alert(STRINGS.addNode, undefined, [
      { text: STRINGS.addNodeDrone, onPress: onAddDrone },
      {
        text: STRINGS.addNodeServerQr,
        onPress: () =>
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedQr),
      },
      {
        text: STRINGS.addNodeBrowser,
        onPress: () =>
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedBrowser),
      },
      {
        text: STRINGS.addNodePhone,
        onPress: () =>
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedPhone),
      },
      { text: STRINGS.cancel, style: 'cancel' },
    ]);
  }, [onAddDrone]);

  const onRemoveNode = useCallback((node: CadreNodeRow) => {
    if (node.isThisDevice) return;
    Alert.alert(STRINGS.removeNodeTitle, STRINGS.removeNodeBody, [
      { text: STRINGS.cancel, style: 'cancel' },
      {
        text: STRINGS.remove,
        style: 'destructive',
        onPress: () =>
          // TODO(seed-flow): remove from CadrePeer; revoke peer identity if owned.
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedRemove),
      },
    ]);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  if (cadre.loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{STRINGS.loading}</Text>
      </View>
    );
  }

  if (cadre.error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{cadre.error}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={cadre.refresh} />}
    >
      {/* Network ID */}
      <SectionHeader label={STRINGS.networkId} />
      <TouchableOpacity style={styles.card} onPress={onCopyPartyId} testID="cadre-partyid">
        <Ionicons name="finger-print-outline" size={20} color={theme.textPrimary} />
        <Text
          style={[styles.cardTitle, styles.monoLike, { flex: 1, marginLeft: 12 }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {cadre.partyId ?? '—'}
        </Text>
        <Ionicons name="copy-outline" size={18} color={theme.textMuted} />
      </TouchableOpacity>

      {/* My Keys */}
      <SectionHeader
        label={`${STRINGS.myKeys} (${cadre.keys.length})`}
        onAdd={onAddKey}
      />
      {hasKeys ? (
        cadre.keys.map(key => <KeyRow key={key.id} keyRow={key} />)
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{STRINGS.noKeys}</Text>
          <Text style={styles.emptyHint}>{STRINGS.noKeysHint}</Text>
        </View>
      )}

      {/* My Nodes */}
      <SectionHeader
        label={`${STRINGS.myNodes} (${cadre.nodes.length})`}
        onAdd={onAddNode}
      />
      {cadre.nodes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyHint}>{STRINGS.noNodes}</Text>
        </View>
      ) : (
        cadre.nodes.map(node => (
          <NodeRow
            key={node.id}
            node={node}
            onCopyPeerId={onCopyPeerId}
            onRemove={onRemoveNode}
          />
        ))
      )}

      <SeedDisplayModal
        visible={seedModal.visible}
        seed={seedModal.seed}
        error={seedModal.error}
        onClose={() => setSeedModal({ visible: false, seed: null, error: null })}
      />
    </ScrollView>
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

function KeyRow({ keyRow }: { keyRow: CadreKeyRow }) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const icon =
    keyRow.type === 'vault'
      ? 'key-outline'
      : keyRow.type === 'dongle'
        ? 'hardware-chip-outline'
        : 'document-outline';
  return (
    <View style={styles.card}>
      <Ionicons name={icon} size={20} color={theme.textPrimary} />
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <Text style={styles.cardTitle}>
          {keyRow.type} · <Text style={styles.cardSubtitle}>{keyRow.protection}</Text>
        </Text>
        <Text
          style={[styles.cardSubtitle, styles.monoLike]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {keyRow.publicKey}
        </Text>
      </View>
    </View>
  );
}

function NodeRow({
  node,
  onCopyPeerId,
  onRemove,
}: {
  node: CadreNodeRow;
  onCopyPeerId: (peerId: string) => void;
  onRemove: (node: CadreNodeRow) => void;
}) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const icon =
    node.deviceType === 'phone'
      ? 'phone-portrait-outline'
      : node.deviceType === 'desktop'
        ? 'desktop-outline'
        : node.deviceType === 'server'
          ? 'server-outline'
          : node.deviceType === 'browser'
            ? 'globe-outline'
            : 'hardware-chip-outline';

  const statusColor =
    node.status === 'online' ? theme.online : node.status === 'unknown' ? theme.textMuted : theme.danger;
  const statusText =
    node.status === 'online'
      ? STRINGS.statusOnline
      : node.status === 'unknown'
        ? STRINGS.statusUnknown
        : STRINGS.statusUnreachable;

  return (
    <View style={styles.card} testID={`cadre-node-${node.id}`}>
      <Ionicons name={icon} size={20} color={theme.textPrimary} />
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{node.name}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.cardSubtitle}>{statusText}</Text>
          <Text style={[styles.cardSubtitle, { marginHorizontal: 6 }]}>·</Text>
          <TouchableOpacity
            onPress={() => onCopyPeerId(node.peerId)}
            hitSlop={HIT_SLOP}
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text
              style={[styles.cardSubtitle, styles.monoLike]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {node.peerId}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {!node.isThisDevice && (
        <TouchableOpacity onPress={() => onRemove(node)} hitSlop={HIT_SLOP}>
          <Ionicons name="trash-outline" size={20} color={theme.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles (theme-driven) ─────────────────────────────────────────────────

function makeStyles(theme: CadreManagerTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
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
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    emptyCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
      alignItems: 'center',
    },
    emptyTitle: { fontSize: 14, color: theme.textSecondary, marginBottom: 2 },
    emptyHint: { fontSize: 12, color: theme.textMuted, textAlign: 'center' },
  });
}
