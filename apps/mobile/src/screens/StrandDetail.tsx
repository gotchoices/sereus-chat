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
import type { StrandState, Member, Attachment, Invitation } from '@chat/core';
import { useModel } from '../data/bind';
import { useErrorText, useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { Avatar, ListRow, Banner, SectionHeader, StrandStatus } from '../components';
import { useTheme, typography, spacing } from '../theme';

export default function StrandDetail() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const { strandId, title } = route.params ?? {};
  const t = useT();
  const errorText = useErrorText();
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

  const model = useModel();
  const load = useCallback(async () => {
    const [s, m] = await Promise.all([model.strands.state(strandId), model.members.list(strandId)]);
    if (s.ok && m.ok) {
      setState(s.value);
      // Members: me first, then managers, then everyone else.
      setMembers([...m.value].sort((a, b) =>
        Number(b.isMe) - Number(a.isMe) || Number(b.isManager) - Number(a.isManager) || a.name.localeCompare(b.name)));
      setError(null);
    } else {
      setError((!s.ok ? s.error : !m.ok ? m.error : null)?.message ?? 'Could not load members');
    }
    void model.media.list(strandId).then(r => { if (r.ok) setMedia(r.value); });
    void model.invitations.listOutstanding().then(r => {
      if (r.ok) setInvites(r.value.filter(i => i.strandId === strandId && i.direction !== 'incoming'));
    });
    // Device-local settings — never a reason to fail the screen, so they are fetched
    // apart from the strand's own data.
    void model.strands.settings(strandId).then(r => {
      if (r.ok) { setMuted(r.value.muted); setArchived(r.value.archived); }
    });
  }, [model, strandId]);

  useEffect(() => { void load(); }, [load, rev]);

  const memberActions = (m: Member) => {
    if (m.isMe) return;
    // Exactly two options.  There is deliberately NO "message" action: no
    // private conversation with this person exists, and none can be started
    // from here — they are a member of this strand, not an address.
    Alert.alert(m.name, undefined, [
      {
        text: t('strand.startStrand'),
        onPress: () => navigation.navigate('InvitationGenerator'),
      },
      { text: t('strand.rename') },
      ...(state?.canIManage
        ? [{
            text: t('strand.remove'),
            style: 'destructive' as const,
            onPress: () => confirmRemove(m),
          }]
        : []),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  const confirmRemove = (m: Member) => {
    Alert.alert(
      t('strand.removeTitle').replace('{{name}}', m.name),
      t('strand.removeBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('strand.removeConfirm'), style: 'destructive',
          onPress: () => { void model.members.remove(strandId, m.id).then(r => (r.ok ? load() : setError(errorText(r.error)))); } },
      ],
    );
  };

  const invitationActions = (inv: Invitation) => {
    Alert.alert(
      t('strand.invitationTitle'),
      // Honest about what removing it does: cadre-core cannot withdraw an
      // invitation yet (see data/outgoing-invitations.ts).
      t('invite.forgetNote'),
      [
        { text: t('common.shareAgain'), onPress: () => { void Share.share({ message: inv.url }); } },
        { text: t('invite.forget'), style: 'destructive',
          onPress: () => { void model.invitations.cancel(inv.id).then(() => load()); } },
        { text: t('common.cancel'), style: 'cancel' },
      ],
    );
  };

  const nobodyElse = members.length > 0 && members.every(m => m.isMe);
  /** Invitations exist only for a strand that can still grow: private and not settled (story 05). */
  const canGrow = !!state && state.visibility === 'private' && !state.settled;

  const confirmResign = () => {
    const others = (state?.managerCount ?? 1) - 1;
    Alert.alert(
      t('strand.resignTitle'),
      others > 0
        // The exposure warning belongs in this body, not in a second dialog.
        ? t('strand.resignExposed')
        : t('strand.resignFinal'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('strand.resignConfirm'), style: 'destructive',
          onPress: () => { void model.members.resignManager(strandId).then(r => (r.ok ? load() : setError(errorText(r.error)))); } },
      ],
    );
  };

  const confirmLeave = () => {
    Alert.alert(
      t('strand.leaveTitle'),
      t('strand.leaveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('actions.leave'), style: 'destructive',
          onPress: () => { void model.strands.leave(strandId, { keepIdentity: true }).then(r => (r.ok ? navigation.popToTop() : setError(errorText(r.error)))); } },
      ],
    );
  };

  const confirmForget = () => {
    Alert.alert(
      t('strand.forgetTitle'),
      // HONEST ABOUT WHAT IT CANNOT DO. Story 33 describes forgetting as
      // "discarding what identifies him and what he holds of the strand", and we
      // deliver the first half only: cadre-core's `unpublishStrand` is documented
      // as control-plane only — "the strand's local durable storage is retained ...
      // that is a separate purge step" — and no purge step exists. So the copy
      // promises the identity discard, which is real, and says plainly that the
      // messages stay on the device, rather than claiming an erasure that does not
      // happen. Restore the stronger wording when upstream can back it.
      t('strand.forgetBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.continue'), style: 'destructive', onPress: () =>
          Alert.alert(
            t('strand.forgetConfirm'),
            undefined,
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('strand.forgetIt'), style: 'destructive',
                onPress: () => { void model.strands.leave(strandId, { keepIdentity: false }).then(r => (r.ok ? navigation.popToTop() : setError(errorText(r.error)))); } },
            ],
          ) },
      ],
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry'), onPress: load }} /> : null}

      <SectionHeader label={t('strand.whatThisIs')} />
      {state ? <StrandStatus state={state} variant="full" testID="strand-status" />
        // Reading a strand's state and members can take tens of seconds on a slow
        // phone while it syncs; bare headings with nothing under them read as empty.
        : !error ? <ActivityIndicator style={styles.loading} color={theme.textMuted} /> : null}

      <SectionHeader label={t('strand.members')} />
      <View style={styles.rows}>
        {members.map(m => (
          <ListRow
            key={m.id}
            testID={`member-${m.id}`}
            title={m.name}
            subtitle={[m.isMe ? t('strand.you') : null,
                       m.isManager ? t('strand.manager') : null]
              .filter(Boolean).join(' · ') || undefined}
            leading={<Avatar name={m.name} uri={m.avatarUri} size="sm" />}
            onPress={() => memberActions(m)}
          />
        ))}
        {nobodyElse ? (
          <Text style={[typography.small, { color: theme.textMuted }]}>
            {t('strand.nobodyYet')}
          </Text>
        ) : null}
      </View>

      {canGrow ? (
        <>
          <SectionHeader label={t('strand.invitationsOut')
            .replace('{{n}}', String(invites.length))} />
          <View style={styles.rows}>
            {invites.map(inv => {
              const made = (inv as { createdAt?: string }).createdAt;
              return (
                <ListRow
                  key={inv.id}
                  testID={`invitation-${inv.id}`}
                  title={made
                    ? t('strand.invitationMade').replace('{{when}}', new Date(made).toLocaleString())
                    : t('strand.invitationTitle')}
                  subtitle={inv.expiresAt
                    ? t('invite.expires').replace('{{when}}', new Date(inv.expiresAt).toLocaleDateString())
                    : undefined}
                  onPress={() => navigation.navigate('InvitationGenerator', { strandId, token: inv.token })}
                  onLongPress={() => invitationActions(inv)}
                />
              );
            })}
            {state?.canIManage ? (
              <ListRow title={t('strand.makeInvitation')}
                onPress={() => navigation.navigate('InvitationGenerator', { strandId })} />
            ) : null}
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {t('strand.othersInvitations')}
            </Text>
          </View>
        </>
      ) : null}

      <SectionHeader label={t('strand.sharedHere')} />
      <ListRow
        title={t('strand.mediaCount').replace('{{n}}', String(media.length))}
        onPress={() => navigation.navigate('StrandMedia', { strandId, title })}
      />

      <SectionHeader label={t('strand.thisConversation')} />
      <View style={styles.rows}>
        {/* Story 33 offers mute in two depths, and says which you are in — "He
            chooses how quiet: silent unless somebody names him, or silent whatever
            happens." Tapping cycles none → soft → hard → none, and the subtitle
            reports the state rather than making the user open something to find
            out. Both settings are device-local and reversible, which is why they
            sit above Leave. */}
        <ListRow
          title={t('actions.mute')}
          subtitle={
            muted === 'soft' ? t('strand.muteSoftOn')
            : muted === 'hard' ? t('strand.muteHardOn')
            : t('strand.muteHint')
          }
          onPress={() => {
            const next = muted === 'none' ? 'soft' : muted === 'soft' ? 'hard' : 'none';
            setMuted(next);
            void model.strands.setMuted(strandId, next).then(r => {
              if (r.ok) return;
              setMuted(muted);   // put the switch back; it did not take
              setError(errorText(r.error));
            });
          }}
        />
        <ListRow
          title={archived ? t('actions.unhide') : t('actions.hide')}
          subtitle={t('strand.hideHint')}
          onPress={() => {
            const next = !archived;
            setArchived(next);
            void model.strands.setArchived(strandId, next).then(r => {
              if (r.ok) return;
              setArchived(!next);
              setError(errorText(r.error));
            });
          }}
        />
        <ListRow title={t('actions.leave')} onPress={confirmLeave} />
        <ListRow title={t('strand.forget')} onPress={confirmForget} />
      </View>

      {state?.canIManage ? (
        <>
          <SectionHeader label={t('strand.managing')} />
          <View style={styles.rows}>
            <ListRow title={t('strand.resign')} onPress={confirmResign} />
          </View>
        </>
      ) : null}

      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('strand.noDelete')}
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
