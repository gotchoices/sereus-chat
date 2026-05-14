/**
 * CadreManager — drop-in screen for managing a Sereus cadre.
 *
 * App-agnostic.  Reaches data only through `cadreService` (the cadre engine).
 * No host-app imports.  See ./SPEC.md for the contract this implements.
 *
 * v0: layout and reads are real; add/remove actions are intent-only stubs
 * (action sheets that surface the menu, followed by a "not yet implemented"
 * alert).  Each stub is wired with a TODO marker for the wiring step.
 */

import React, { useCallback } from 'react';
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
import {
  formatPartyId,
  formatPeerId,
  useCadreManager,
  type CadreKeyRow,
  type CadreNodeRow,
} from './useCadreManager';

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
  notImplementedAddKey: 'Key generation will land with the seed/auth flow.',
  notImplementedAddNode: 'Adding nodes requires the cadre-cli (drone) wiring; see chat STATUS.md.',
  notImplementedRemove: 'Remove flow requires the cadre control mutation API.',
};

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export default function CadreManager() {
  const cadre = useCadreManager();
  const hasKeys = cadre.keys.length > 0;

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

  const onAddKey = useCallback(() => {
    Alert.alert(STRINGS.addKey, undefined, [
      {
        text: STRINGS.addKeyVault,
        onPress: () =>
          // TODO(seed-auth): generate Ed25519 keypair, insert via
          // ControlDatabase.insertAuthorityKey(), store private key in
          // device secure storage (Keychain/Keystore).
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedAddKey),
      },
      {
        text: STRINGS.addKeyExternal,
        onPress: () =>
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedAddKey),
      },
      {
        text: STRINGS.addKeyDongle,
        style: 'cancel',
      },
      { text: STRINGS.cancel, style: 'cancel' },
    ]);
  }, []);

  const onAddNode = useCallback(() => {
    Alert.alert(STRINGS.addNode, undefined, [
      {
        text: STRINGS.addNodeDrone,
        onPress: () =>
          // TODO(seed-flow): createSeed() → deliver via provider API → dial.
          // JIT key creation: if `cadre.keys` is empty, create one first.
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedAddNode),
      },
      {
        text: STRINGS.addNodeServerQr,
        onPress: () =>
          // TODO(seed-flow): scan QR/link → parse CadreInvite → dial server.
          Alert.alert(STRINGS.notImplementedTitle, STRINGS.notImplementedAddNode),
      },
      { text: STRINGS.addNodeBrowser, style: 'cancel' },
      { text: STRINGS.addNodePhone, style: 'cancel' },
      { text: STRINGS.cancel, style: 'cancel' },
    ]);
  }, []);

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
        <Ionicons name="finger-print-outline" size={20} />
        <Text style={[styles.cardTitle, { flex: 1, marginLeft: 12 }]}>
          {formatPartyId(cadre.partyId)}
        </Text>
        <Ionicons name="copy-outline" size={18} color="#888" />
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
          <Ionicons name="add-circle-outline" size={22} color="#0066cc" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function KeyRow({ keyRow }: { keyRow: CadreKeyRow }) {
  const icon =
    keyRow.type === 'vault'
      ? 'key-outline'
      : keyRow.type === 'dongle'
        ? 'hardware-chip-outline'
        : 'document-outline';
  return (
    <View style={styles.card}>
      <Ionicons name={icon} size={20} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.cardTitle}>{keyRow.type}</Text>
        <Text style={styles.cardSubtitle}>
          {keyRow.protection} · {formatPeerId(keyRow.publicKey)}
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
    node.status === 'online' ? '#2c8a3f' : node.status === 'unknown' ? '#888' : '#c4392f';
  const statusText =
    node.status === 'online'
      ? STRINGS.statusOnline
      : node.status === 'unknown'
        ? STRINGS.statusUnknown
        : STRINGS.statusUnreachable;

  return (
    <View style={styles.card} testID={`cadre-node-${node.id}`}>
      <Ionicons name={icon} size={20} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{node.name}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.cardSubtitle}>{statusText}</Text>
          <Text style={[styles.cardSubtitle, { marginHorizontal: 6 }]}>·</Text>
          <TouchableOpacity onPress={() => onCopyPeerId(node.peerId)} hitSlop={HIT_SLOP}>
            <Text style={styles.cardSubtitle}>{formatPeerId(node.peerId)}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {!node.isThisDevice && (
        <TouchableOpacity onPress={() => onRemove(node)} hitSlop={HIT_SLOP}>
          <Ionicons name="trash-outline" size={20} color="#c4392f" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#888' },
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
    color: '#666',
    letterSpacing: 0.4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardSubtitle: { fontSize: 12, color: '#666' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  emptyCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d4d4d4',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 14, color: '#444', marginBottom: 2 },
  emptyHint: { fontSize: 12, color: '#888', textAlign: 'center' },
});
