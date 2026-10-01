/**
 * StrandDetail — who is in a strand, what it is, and what you can do about it.
 * Spec: design/specs/mobile/screens/strand-detail.md
 *
 * There is NO delete-strand action here and none may be added.  A strand cannot
 * be deleted, only left (design/stories/mobile/STATUS.md Appendix).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Share, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  getStrandState, listMembers, listAttachments, setStrandMuted, setStrandArchived,
  leaveStrand, resignManager, removeMember, listOutstandingInvitations, cancelInvitation,
} from '../data/adapter';
import type { StrandState, Member, Attachment, Invitation } from '../data/types';
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
  /**
   * The invitations THIS user has out for this strand. A strand is a box holding
   * its members and its outstanding invitations (stories 31 1a, 05, 02), but an
   * invitation is known only to the party that made it — it lives in that
   * party's control database, and the strand learns of one only when it is
   * redeemed. So these are the user's own, and the screen says others' are not
   * shown rather than letting an empty list imply there are none.
   */
  const [invites, setInvites] = useState<Invitation[]>([]);
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
    listOutstandingInvitations()
      .then(all => setInvites(all.filter(i => i.strandId === strandId && i.direction !== 'incoming')))
      .catch(() => {});
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

  const invitationActions = (inv: Invitation) => {
    Alert.alert(
      t('screens.strand.invitationTitle', 'Invitation'),
      // Honest about what removing it does: cadre-core cannot withdraw an
      // invitation yet (see data/outgoing-invitations.ts).
      t('screens.invite.forgetNote',
        'Taking it off this list does not cancel it: whoever holds it can still use it until it runs out.'),
      [
        { text: t('common.shareAgain', 'Share again'), onPress: () => { void Share.share({ message: inv.url }); } },
        { text: t('screens.invite.forget', 'Take it off the list'), style: 'destructive',
          onPress: () => { cancelInvitation(inv.id).then(load).catch(() => {}); } },
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      ],
    );
  };

  const nobodyElse = members.length > 0 && members.every(m => m.isMe);
  /** Invitations exist only for a strand that can still grow: private and not settled (story 05). */
  const canGrow = !!state && state.visibility === 'private' && !state.settled;

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
      {state ? <StrandStatus state={state} variant="full" testID="strand-status" />
        // Reading a strand's state and members can take tens of seconds on a slow
        // phone while it syncs; bare headings with nothing under them read as empty.
        : !error ? <ActivityIndicator style={styles.loading} color={theme.textMuted} /> : null}

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
        {nobodyElse ? (
          <Text style={[typography.small, { color: theme.textMuted }]}>
            {t('screens.strand.nobodyYet', 'Nobody else has joined yet.')}
          </Text>
        ) : null}
      </View>

      {canGrow ? (
        <>
          <SectionHeader label={t('screens.strand.invitationsOut', 'Invitations you have out ({{n}})')
            .replace('{{n}}', String(invites.length))} />
          <View style={styles.rows}>
            {invites.map(inv => {
              const made = (inv as { createdAt?: string }).createdAt;
              return (
                <ListRow
                  key={inv.id}
                  testID={`invitation-${inv.id}`}
                  title={made
                    ? t('screens.strand.invitationMade', 'Made {{when}}').replace('{{when}}', new Date(made).toLocaleString())
                    : t('screens.strand.invitationTitle', 'Invitation')}
                  subtitle={inv.expiresAt
                    ? t('screens.invite.expires', 'Runs out {{when}}').replace('{{when}}', new Date(inv.expiresAt).toLocaleDateString())
                    : undefined}
                  onPress={() => navigation.navigate('InvitationGenerator', { strandId, token: inv.token })}
                  onLongPress={() => invitationActions(inv)}
                />
              );
            })}
            {state?.canIManage ? (
              <ListRow title={t('screens.strand.makeInvitation', 'Make an invitation')}
                onPress={() => navigation.navigate('InvitationGenerator', { strandId })} />
            ) : null}
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {t('screens.strand.othersInvitations',
                'Invitations other members have out are not shown: an invitation is known only to whoever made it.')}
            </Text>
          </View>
        </>
      ) : null}

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
  loading: { paddingVertical: spacing[3] },
});
