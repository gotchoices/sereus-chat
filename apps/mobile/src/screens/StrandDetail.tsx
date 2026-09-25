/**
 * StrandDetail — who is in a strand, what it is, and what you can do about it.
 * Spec: design/specs/mobile/screens/strand-detail.md
 *
 * There is NO delete-strand action here and none may be added.  A strand cannot
 * be deleted, only left (design/stories/mobile/STATUS.md Appendix).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  getStrandState, listMembers, listAttachments, setStrandMuted, setStrandArchived,
  leaveStrand, resignManager, removeMember,
} from '../data/adapter';
import type { StrandState, Member, Attachment } from '../data/types';
import { useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { Avatar, ListRow, Banner, SectionHeader, StrandStatus } from '../components';
import { useTheme, typography, spacing } from '../theme';
import { getStrandPrefs } from '../data/strand-prefs';

export default function StrandDetail() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const { strandId, title } = route.params ?? {};
  const t = useT();
  const rev = useDataRevision();
  const theme = useTheme();

  const [state, setState] = useState<StrandState | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [media, setMedia] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Device-local, per story 33 — neither reaches the other members. */
  const [muted, setMuted] = useState<'none' | 'soft' | 'hard'>('none');
  const [archived, setArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([getStrandState(strandId), listMembers(strandId)]);
      setState(s);
      // Members: me first, then managers, then everyone else.
      setMembers([...m].sort((a, b) =>
        Number(b.isMe) - Number(a.isMe) || Number(b.isManager) - Number(a.isManager) || a.name.localeCompare(b.name)));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load members');
    }
    listAttachments(strandId).then(setMedia).catch(() => {});
    // Device-local settings, read straight from storage — never a reason to fail
    // the screen, so they are fetched apart from the strand's own data.
    getStrandPrefs(strandId)
      .then(p => { setMuted(p.muted); setArchived(p.archived); })
      .catch(() => {});
  }, [strandId]);

  useEffect(() => { void load(); }, [load, rev]);

  const memberActions = (m: Member) => {
    if (m.isMe) return;
    // Exactly two options.  There is deliberately NO "message" action: no
    // private conversation with this person exists, and none can be started
    // from here — they are a member of this strand, not an address.
    Alert.alert(m.name, undefined, [
      {
        text: t('screens.strand.startStrand', 'Start a strand with them'),
        onPress: () => navigation.navigate('InvitationGenerator'),
      },
      { text: t('screens.strand.rename', 'Rename for myself') },
      ...(state?.canIManage
        ? [{
            text: t('screens.strand.remove', 'Remove from this strand'),
            style: 'destructive' as const,
            onPress: () => confirmRemove(m),
          }]
        : []),
      { text: t('common.cancel', 'Cancel'), style: 'cancel' as const },
    ]);
  };

  const confirmRemove = (m: Member) => {
    Alert.alert(
      t('screens.strand.removeTitle', 'Remove {{name}}?').replace('{{name}}', m.name),
      t('screens.strand.removeBody',
        'Nothing further reaches them. It does not undo anything they have already read.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('screens.strand.removeConfirm', 'Remove'), style: 'destructive',
          onPress: () => removeMember(strandId, m.id).then(load).catch(e => setError(e.message)) },
      ],
    );
  };

  const confirmResign = () => {
    const others = (state?.managerCount ?? 1) - 1;
    Alert.alert(
      t('screens.strand.resignTitle', 'Give up adding and removing people?'),
      others > 0
        // The exposure warning belongs in this body, not in a second dialog.
        ? t('screens.strand.resignExposed',
            'This cannot be undone. Afterwards you will not be able to remove anyone — and the others who still can will be able to remove you.')
        : t('screens.strand.resignFinal',
            'This cannot be undone. Nobody will be able to add or remove anyone, ever. This is who the strand will always be.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('screens.strand.resignConfirm', 'Give it up'), style: 'destructive',
          onPress: () => resignManager(strandId).then(load).catch(e => setError(e.message)) },
      ],
    );
  };

  const confirmLeave = () => {
    Alert.alert(
      t('screens.strand.leaveTitle', 'Leave this strand?'),
      t('screens.strand.leaveBody',
        'It carries on without you and nothing more reaches you. You keep what identifies you here, so if you are invited back you return as yourself.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('actions.leave', 'Leave'), style: 'destructive',
          onPress: () => leaveStrand(strandId, { keepIdentity: true }).then(() => navigation.popToTop()) },
      ],
    );
  };

  const confirmForget = () => {
    Alert.alert(
      t('screens.strand.forgetTitle', 'Forget this strand entirely?'),
      // HONEST ABOUT WHAT IT CANNOT DO. Story 33 describes forgetting as
      // "discarding what identifies him and what he holds of the strand", and we
      // deliver the first half only: cadre-core's `unpublishStrand` is documented
      // as control-plane only — "the strand's local durable storage is retained ...
      // that is a separate purge step" — and no purge step exists. So the copy
      // promises the identity discard, which is real, and says plainly that the
      // messages stay on the device, rather than claiming an erasure that does not
      // happen. Restore the stronger wording when upstream can back it.
      t('screens.strand.forgetBody',
        'Permanent. What identifies you here is discarded, so if you are ever invited back you arrive as a stranger and what you said before stays under who you used to be. The messages themselves remain stored on this device.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.continue', 'Continue'), style: 'destructive', onPress: () =>
          Alert.alert(
            t('screens.strand.forgetConfirm', 'This cannot be undone.'),
            undefined,
            [
              { text: t('common.cancel', 'Cancel'), style: 'cancel' },
              { text: t('screens.strand.forgetIt', 'Forget it'), style: 'destructive',
                onPress: () => leaveStrand(strandId, { keepIdentity: false }).then(() => navigation.popToTop()) },
            ],
          ) },
      ],
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: load }} /> : null}

      <SectionHeader label={t('screens.strand.whatThisIs', 'What this is')} />
      {state ? <StrandStatus state={state} variant="full" testID="strand-status" /> : null}

      <SectionHeader label={t('screens.strand.members', 'Members')} />
      <View style={styles.rows}>
        {members.map(m => (
          <ListRow
            key={m.id}
            testID={`member-${m.id}`}
            title={m.name}
            subtitle={[m.isMe ? t('screens.strand.you', 'you') : null,
                       m.isManager ? t('screens.strand.manager', 'can add and remove people') : null]
              .filter(Boolean).join(' · ') || undefined}
            leading={<Avatar name={m.name} uri={m.avatarUri} size="sm" />}
            onPress={() => memberActions(m)}
          />
        ))}
      </View>

      <SectionHeader label={t('screens.strand.sharedHere', 'Shared here')} />
      <ListRow
        title={t('screens.strand.mediaCount', '{{n}} things shared').replace('{{n}}', String(media.length))}
        onPress={() => navigation.navigate('StrandMedia', { strandId, title })}
      />

      <SectionHeader label={t('screens.strand.thisConversation', 'This conversation')} />
      <View style={styles.rows}>
        {/* Story 33 offers mute in two depths, and says which you are in — "He
            chooses how quiet: silent unless somebody names him, or silent whatever
            happens." Tapping cycles none → soft → hard → none, and the subtitle
            reports the state rather than making the user open something to find
            out. Both settings are device-local and reversible, which is why they
            sit above Leave. */}
        <ListRow
          title={t('actions.mute', 'Mute')}
          subtitle={
            muted === 'soft' ? t('screens.strand.muteSoftOn', 'Quiet, unless somebody names you')
            : muted === 'hard' ? t('screens.strand.muteHardOn', 'Silent, whatever happens')
            : t('screens.strand.muteHint', 'Quiet, unless somebody names you')
          }
          onPress={() => {
            const next = muted === 'none' ? 'soft' : muted === 'soft' ? 'hard' : 'none';
            setMuted(next);
            setStrandMuted(strandId, next).catch((e: any) => {
              setMuted(muted);   // put the switch back; it did not take
              setError(e?.message ?? 'That setting could not be saved');
            });
          }}
        />
        <ListRow
          title={archived ? t('actions.unhide', 'Unhide') : t('actions.hide', 'Hide')}
          subtitle={t('screens.strand.hideHint', 'Out of your list until you look for it; nothing changes for anyone else')}
          onPress={() => {
            const next = !archived;
            setArchived(next);
            setStrandArchived(strandId, next).catch((e: any) => {
              setArchived(!next);
              setError(e?.message ?? 'That setting could not be saved');
            });
          }}
        />
        <ListRow title={t('actions.leave', 'Leave')} onPress={confirmLeave} />
        <ListRow title={t('screens.strand.forget', 'Forget entirely')} onPress={confirmForget} />
      </View>

      {state?.canIManage ? (
        <>
          <SectionHeader label={t('screens.strand.managing', 'Because you can add and remove people')} />
          <View style={styles.rows}>
            <ListRow title={t('screens.strand.addSomeone', 'Add someone')}
              onPress={() => navigation.navigate('InvitationGenerator', { strandId })} />
            <ListRow title={t('screens.strand.resign', 'Give up adding and removing')} onPress={confirmResign} />
          </View>
        </>
      ) : null}

      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('screens.strand.noDelete', 'A strand cannot be deleted. Leaving is what you can do; it carries on for everyone else.')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[1], paddingBottom: spacing[5] },
  rows: { gap: spacing[1] },
  note: { lineHeight: 18, paddingTop: spacing[3] },
});
