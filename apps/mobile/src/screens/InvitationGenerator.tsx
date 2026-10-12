/**
 * InvitationGenerator — start a strand, or add somebody to one.
 * Spec: design/specs/mobile/screens/invitation-generator.md
 *
 * The first invitation for a new strand founds it — in sereus an invitation
 * names the strand it lets somebody into, so the strand comes first (story 02).
 * Every later invitation from this screen goes into that same strand. Until
 * somebody accepts, nobody else is in it, and nothing here may suggest a
 * conversation is already under way.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Share, Alert, Linking, ActivityIndicator } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import {
  INVITATION_VALIDITY, defaultInvitationTerms, loader, ok, outstandingInvitationsStore, reachabilityStore,
  type Invitation, type InvitationValidity,
} from '@chat/core';
import { useModel, useStore } from '../data/bind';

const NO_INVITATIONS: Invitation[] = [];
/** Before a new strand's first invitation there is no strand, and nothing to list. */
const NO_INVITATIONS_STORE = loader<Invitation[]>({ load: async () => ok(NO_INVITATIONS) });
import { useT } from '../i18n';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Banner, IconButton, ListRow, SectionHeader } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function InvitationGenerator() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const routeStrandId: string | undefined = route?.params?.strandId;
  /** Set when opened from the strand list's Pending row: show that invitation. */
  const routeToken: string | undefined = route?.params?.token;
  // Making an invitation for a NEW strand founds it (the invitation has to name
  // the strand it lets somebody into). Every later invitation from this screen —
  // "Make a new one" included — must go into that same strand, not found another.
  const [foundedStrandId, setFoundedStrandId] = useState<string | undefined>(undefined);
  const strandId = routeStrandId ?? foundedStrandId;
  const addingToExisting = !!routeStrandId;
  const t = useT();
  const theme = useTheme();

  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [grantsInviteRight, setGrants] = useState(false);
  // THE TERMS (story 02 step 3, paths C and F). Defaults follow the strand kind and
  // show as one line; "Change" opens the choices. Once the user has changed any of
  // them, a later change of strand kind no longer resets them.
  const [singleUse, setSingleUse] = useState(true);
  const [validity, setValidity] = useState<InvitationValidity>('week');
  const [termsTouched, setTermsTouched] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(false);
  const [showQr, setShowQr] = useState(true);   // human spec: default on
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const model = useModel();
  const focused = useIsFocused();
  /**
   * Reachability, live while "nowhere to answer" is showing: coming back from choosing
   * a relay (story 02 6.4, story 42 step 6), the panel must not outlive the problem. The
   * core's store re-reads when this device's addresses change (no 3 s poll).
   */
  const reach = useStore(useMemo(() => reachabilityStore(model), [model]), focused && unreachable);
  /** A relay has been chosen but is not carrying anybody yet. */
  const relayPending = unreachable && !!reach.value && !reach.value.reachable && reach.value.relayPending;
  useEffect(() => { if (unreachable && reach.value?.reachable) setUnreachable(false); }, [unreachable, reach.value]);
  /** When the current wait for a chosen relay began, to stop it spinning silently forever. */
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (relayPending) setPendingSince(p => p ?? Date.now());
    else setPendingSince(null);
  }, [relayPending]);
  useEffect(() => {
    if (!relayPending) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [relayPending]);
  // A relay normally connects in seconds. Past this, say so: a network that
  // blocks the relay's port, or a relay that is down, otherwise looks exactly
  // like patience — the first published APK sat here for minutes, silently.
  const RELAY_SLOW_MS = 30_000;
  const relaySlow = pendingSince !== null && now - pendingSince > RELAY_SLOW_MS;
  const [inviterName, setInviterName] = useState('');

  // Only THIS strand's outstanding invitations: an invitation is part of the
  // strand it leads into (story 02), and other strands' belong on their own
  // detail screens. Before a new strand's first invitation there is no strand,
  // so there is nothing to list.
  const outstandingStore = useMemo(
    () => (strandId ? outstandingInvitationsStore(model, strandId) : null),
    [model, strandId],
  );
  const outstandingView = useStore(outstandingStore ?? NO_INVITATIONS_STORE, focused);
  const outstanding = outstandingView.value ?? NO_INVITATIONS;
  const refresh = useCallback(() => { outstandingStore?.reload(); }, [outstandingStore]);
  useEffect(() => {
    void model.profile.get().then(p => { if (p.ok) setInviterName(p.value.name?.trim() ?? ''); });
  }, [model]);

  // Opened from a Pending row: show the invitation it names, and let any new one
  // go into the same strand.
  useEffect(() => {
    if (!routeToken) return;
    void model.invitations.listOutstanding().then(list => {
      const found = list.ok ? list.value.find(i => i.token === routeToken) : undefined;
      if (found) {
        setInvitation(found);
        if (found.strandId) setFoundedStrandId(found.strandId);
      }
    });
  }, [model, routeToken]);

  // Defaults by strand kind: the choice on a new strand, or the existing strand's own.
  useEffect(() => {
    if (termsTouched || addingToExisting) return;
    const d = defaultInvitationTerms(visibility);
    setSingleUse(d.singleUse); setValidity(d.validity);
  }, [visibility, termsTouched, addingToExisting]);
  useEffect(() => {
    if (!addingToExisting || !routeStrandId) return;
    void model.strands.state(routeStrandId).then(st => {
      if (!st.ok || termsTouched) return;
      const d = defaultInvitationTerms(st.value.visibility);
      setSingleUse(d.singleUse); setValidity(d.validity);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingToExisting, routeStrandId]);

  const validityLabel = (v: InvitationValidity) =>
    v === 'day' ? t('screens.invite.validDay', '1 day')
    : v === 'week' ? t('screens.invite.validWeek', '1 week')
    : t('screens.invite.validMonth', '1 month');
  const termsLine = [
    singleUse ? t('screens.invite.forOne', 'For one person') : t('screens.invite.forAnyone', 'Anyone with the link'),
    t('screens.invite.goodFor', 'good for {{period}}').replace('{{period}}', validityLabel(validity)),
    grantsInviteRight
      ? t('screens.invite.canInviteOnShort', 'they can add and remove people')
      : t('screens.invite.canInviteOffShort', 'they cannot add or remove anyone'),
  ].join(' · ');

  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null); setUnreachable(false);
    const result = await model.invitations.create({
        strandId,
        visibility: addingToExisting ? undefined : visibility,
        grantsInviteRight,
        singleUse,
        validForMs: INVITATION_VALIDITY[validity],
      });
    setLoading(false);
    if (result.ok) {
      const minted = result.value;
      // Dev-only: an invitation is a QR or a share sheet for a real user, but in
      // development it has to cross from one device to another with no camera in
      // the loop.  Logging the URL lets `link.sh` deliver it to the other device.
      if (__DEV__) console.info('[invite] minted:', minted.url);
      setInvitation(minted);
      if (!strandId && minted.strandId) setFoundedStrandId(minted.strandId);
      refresh();
      return;
    }
    setInvitation(null);
    // Story 02 Alt A: "nowhere to be reached yet" is not an error he caused, so it
    // never goes through the error Banner (which offers a Retry that could not
    // possibly work).  It gets its own state, below.
    if (result.error.kind === 'unreachable') { setUnreachable(true); setError(null); }
    else setError(result.error.message);
  }, [loading, model, strandId, addingToExisting, visibility, grantsInviteRight, singleUse, validity, refresh]);

  // What goes in the message. A bare 600-character link says nothing about what
  // it is to somebody who has never heard of the app.
  const shareText = (url: string) =>
    (inviterName
      ? t('screens.invite.shareBodyNamed', '{{name}} invites you to talk privately on Sereus Chat. Open this link on your phone:')
          .replace('{{name}}', inviterName)
      : t('screens.invite.shareBody', 'You are invited to talk privately on Sereus Chat. Open this link on your phone:'))
    + '\n' + url;

  const postIntoStrand = () =>
    Alert.alert(
      t('screens.invite.postTitle', 'Put it in the conversation?'),
      // An invitation works for whoever holds it.
      t('screens.invite.postBody',
        'Everyone in this strand will be able to use it. That hands every member a one-off ability to bring somebody in. If you can reach the person another way, do that instead.'),
      [{ text: t('common.cancel', 'Cancel'), style: 'cancel' }, { text: t('screens.invite.postConfirm', 'Post it') }],
    );

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: generate }} /> : null}

      {/* Story 02 Alt A — not reachable yet. Deliberately NOT the error Banner:
          this is where everyone starts, not a mistake, and a Retry here could not
          work. While it shows, the terms collapse to one line (they are still
          chosen — 6.4) so the screen asks one thing at a time. */}
      {unreachable && relayPending ? (
        <View style={[styles.unreachable, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={styles.pendingRow}>
            <ActivityIndicator color={theme.textMuted} />
            <Text style={[typography.title, styles.flex1, { color: theme.textPrimary }]}>
              {t('screens.invite.relayPendingTitle', 'Connecting to your relay')}
            </Text>
          </View>
          <Text style={[typography.body, styles.unreachableBody, { color: theme.textMuted }]}>
            {t('screens.invite.relayPendingBody',
              'This usually takes a few seconds. You can make the invitation as soon as it is connected.')}
          </Text>
          {relaySlow ? (
            <>
              <Text style={[typography.body, styles.unreachableBody, { color: theme.textPrimary }]}>
                {t('screens.invite.relaySlow',
                  'This is taking longer than it should. The relay may be down, or this network may block it — some work, school and public Wi-Fi do. Try another network, or choose another relay.')}
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => navigation.navigate('CadreManager')}
                style={({ pressed }) => [styles.wayOut, { borderColor: theme.border, backgroundColor: theme.surface },
                  pressed && styles.pressed]}
              >
                <View style={styles.flex1}>
                  <Text style={[typography.body, styles.wayOutTitle, { color: theme.textPrimary }]}>
                    {t('screens.invite.relaySlowManage', 'See or change your relay')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </Pressable>
            </>
          ) : null}
        </View>
      ) : unreachable ? (
        <View style={[styles.unreachable, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[typography.title, { color: theme.textPrimary }]}>
            {t('screens.invite.unreachableTitle', 'Your phone needs a relay first')}
          </Text>
          <Text style={[typography.body, styles.unreachableBody, { color: theme.textMuted }]}>
            {t('screens.invite.unreachableBody',
              'A phone cannot accept connections from the Internet on its own, so the person you invite would have no way to answer. A relay fixes that: a machine with a public Internet address that passes connections through to your phone.')}
          </Text>
          <Text style={[typography.small, styles.unreachableLead, { color: theme.textSecondary }]}>
            {t('screens.invite.unreachableWays', 'Two ways to get one')}
          </Text>

          {/* Two equal choices, in the stories' order (02 6.3, 42): neither is
              styled or placed as the obvious one. Each says what it costs and
              what happens when tapped, so it can be judged and acted on. Neither
              names an operator — the list lives on sereus.org and may grow. */}
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL('https://sereus.org/chat/relays.html#own')}
            style={({ pressed }) => [styles.wayOut, { borderColor: theme.border, backgroundColor: theme.surface },
              pressed && styles.pressed]}
          >
            <View style={styles.flex1}>
              <Text style={[typography.body, styles.wayOutTitle, { color: theme.textPrimary }]}>
                {t('screens.invite.wayOwn', 'Run your own relay')}
              </Text>
              <Text style={[typography.small, { color: theme.textMuted }]}>
                {t('screens.invite.wayOwnBody',
                  'The private way: nobody else sees who you talk to. Needs a machine that stays on. Opens the instructions on sereus.org.')}
              </Text>
            </View>
            <Ionicons name="open-outline" size={20} color={theme.textMuted} />
          </Pressable>

          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL('https://sereus.org/chat/relays.html#borrow')}
            style={({ pressed }) => [styles.wayOut, { borderColor: theme.border, backgroundColor: theme.surface },
              pressed && styles.pressed]}
          >
            <View style={styles.flex1}>
              <Text style={[typography.body, styles.wayOutTitle, { color: theme.textPrimary }]}>
                {t('screens.invite.wayBorrow', 'Use an open relay')}
              </Text>
              <Text style={[typography.small, { color: theme.textMuted }]}>
                {t('screens.invite.wayBorrowBody',
                  'The quick way: free, nothing to set up. Whoever runs it can see that you talk to someone, when, and roughly how much — never what you say. Opens the list on sereus.org; you confirm your pick here.')}
              </Text>
            </View>
            <Ionicons name="open-outline" size={20} color={theme.textMuted} />
          </Pressable>

          <Text style={[typography.small, { color: theme.textMuted }]}>
            {t('screens.invite.unreachableSwitch',
              'You can start with one and change later.')}
          </Text>
        </View>
      ) : null}

      {unreachable ? (
        // The terms are still chosen; saying so in one line keeps them from
        // reading as a second question while the relay is the only one.
        <Text style={[typography.small, styles.keptTerms, { color: theme.textMuted }]}>
          {t('screens.invite.termsKept', 'Kept for when you come back: {{kind}}, {{rights}}.')
            .replace('{{kind}}', addingToExisting
              ? t('screens.invite.existingStrand', 'this strand')
              : visibility === 'private' ? t('screens.invite.private', 'Private') : t('screens.invite.public', 'Open to anyone'))
            .replace('{{rights}}', termsLine.charAt(0).toLowerCase() + termsLine.slice(1))}
        </Text>
      ) : null}

      {unreachable ? null : !addingToExisting ? (
        <>
          <SectionHeader label={t('screens.invite.kind', 'What kind of strand')} />
          {(['private', 'public'] as const).filter(v => !foundedStrandId || v === visibility).map(v => (
            <Pressable key={v} onPress={() => { if (!foundedStrandId) setVisibility(v); }}
              style={[styles.card, { borderColor: visibility === v ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt }]}>
              <Text style={[typography.body, styles.cardTitle, { color: theme.textPrimary }]}>
                {v === 'private' ? t('screens.invite.private', 'Private') : t('screens.invite.public', 'Open to anyone')}
              </Text>
              <Text style={[typography.small, { color: theme.textMuted }]}>
                {v === 'private'
                  ? t('screens.invite.privateBody', 'Only people you invite can be in it.')
                  : t('screens.invite.publicBody', 'Anyone with the link can join, and nobody can be removed.')}
              </Text>
            </Pressable>
          ))}
        </>
      ) : (
        <Banner
          variant="info"
          message={t('screens.invite.historyWarning',
            'Whoever takes this up will be able to read everything already said here, including what was said before they arrived.')}
        />
      )}

      {unreachable ? null : (<>
      <SectionHeader label={t('screens.invite.rights', 'On this invitation')} />
      {/* One line a newcomer can leave alone; the choices are one tap away. */}
      <View style={[styles.card, styles.termsRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
        <Text testID="invite-terms" style={[typography.small, styles.flex1, { color: theme.textPrimary }]}>{termsLine}</Text>
        <Pressable accessibilityRole="button" onPress={() => setShowTerms(v => !v)} hitSlop={8}>
          <Text style={[typography.small, styles.cardTitle, { color: theme.accent }]}>
            {showTerms ? t('common.done', 'Done') : t('screens.invite.change', 'Change')}
          </Text>
        </Pressable>
      </View>

      {showTerms ? (
        <View style={styles.terms}>
          <Text style={[typography.small, { color: theme.textSecondary }]}>
            {t('screens.invite.whoCanUse', 'Who can use it')}
          </Text>
          <View style={styles.choiceRow}>
            {([true, false] as const).map(one => (
              <Pressable key={String(one)} onPress={() => { setSingleUse(one); setTermsTouched(true); }}
                style={[styles.choice, { borderColor: singleUse === one ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt }]}>
                <Text style={[typography.small, styles.cardTitle, { color: theme.textPrimary }]}>
                  {one ? t('screens.invite.forOne', 'For one person') : t('screens.invite.forAnyone', 'Anyone with the link')}
                </Text>
                <Text style={[typography.small, { color: theme.textMuted }]}>
                  {one
                    ? t('screens.invite.forOneBody', 'Spent once used, so a lost copy is useless to anyone else.')
                    : t('screens.invite.forAnyoneBody', 'Works for everyone who has it, until it runs out. It cannot be recalled.')}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[typography.small, { color: theme.textSecondary }]}>
            {t('screens.invite.goodForLabel', 'Good for')}
          </Text>
          <View style={styles.choiceRow}>
            {(['day', 'week', 'month'] as const).map(v => (
              <Pressable key={v} onPress={() => { setValidity(v); setTermsTouched(true); }}
                style={[styles.choice, styles.choiceShort, { borderColor: validity === v ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt }]}>
                <Text style={[typography.small, styles.cardTitle, { color: theme.textPrimary }]}>{validityLabel(v)}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => setGrants(g => !g)}
            style={[styles.card, { borderColor: grantsInviteRight ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt }]}>
            <Text style={[typography.body, styles.cardTitle, { color: theme.textPrimary }]}>
              {grantsInviteRight
                ? t('screens.invite.canInviteOn', 'They can add and remove people')
                : t('screens.invite.canInviteOff', 'They cannot add or remove anyone')}
            </Text>
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {t('screens.invite.rightsBody',
                'Passing this on gives them the same reach you have — including over you.')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!singleUse && grantsInviteRight ? (
        // Allowed (story 02 path F, 3.4), but said plainly.
        <Banner
          variant="info"
          message={t('screens.invite.anyoneAndRights',
            'Anyone who finds this link can join and then add or remove anyone, including you. It cannot be recalled.')}
        />
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || (unreachable && relayPending), busy: loading }}
          disabled={loading || (unreachable && relayPending)}
          onPress={generate}
          style={[styles.makeBtn, { backgroundColor: theme.accent, borderColor: theme.accent },
            (loading || (unreachable && relayPending)) && styles.dim]}
        >
          {loading ? <ActivityIndicator color={theme.accentText} /> : null}
          <Text style={[typography.body, styles.cardTitle, { color: theme.accentText }]}>
            {invitation
              ? t('screens.invite.generateAnother', 'Make another invitation')
              : t('screens.invite.generate', 'Make an invitation')}
          </Text>
        </Pressable>
        {loading ? (
          <Text style={[typography.small, styles.progress, { color: theme.textMuted }]}>
            {foundedStrandId || addingToExisting
              ? t('screens.invite.working', 'Making the invitation…')
              : t('screens.invite.workingFound', 'Setting up the strand. On some phones this takes up to a minute.')}
          </Text>
        ) : null}
      </View>
      </>)}

      {invitation ? (
        <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
          <Text style={[typography.small, { color: theme.textMuted }]} selectable>{invitation.url}</Text>

          <View style={styles.qrToggleRow}>
            <Text style={[typography.small, { color: theme.textPrimary }]}>
              {t('screens.invite.showQr', 'Show QR code')}
            </Text>
            <Switch value={showQr} onValueChange={setShowQr} />
          </View>
          {showQr ? (
            <View style={styles.qr}>
              <QRCode value={invitation.qrPayload} size={180}
                backgroundColor={theme.surfaceAlt} color={theme.textPrimary} />
            </View>
          ) : null}

          <Text style={[typography.small, { color: theme.textMuted }]}>
            {t('screens.invite.nothingYet', 'The strand is ready. Nobody else is in it until somebody accepts.')}
          </Text>
          <View style={styles.shareRow}>
            <IconButton name="copy-outline" size={20} accessibilityLabel={t('common.copy', 'Copy')}
              onPress={() => { Clipboard.setString(invitation.url); Alert.alert(t('common.copied', 'Copied')); }} />
            <IconButton name="share-outline" size={20} accessibilityLabel={t('common.share', 'Share')}
              onPress={() => Share.share({ message: shareText(invitation.url) })} />
            {addingToExisting ? (
              <IconButton name="chatbubble-outline" size={20}
                accessibilityLabel={t('screens.invite.post', 'Post into the strand')} onPress={postIntoStrand} />
            ) : null}
          </View>
        </View>
      ) : null}

      {outstanding.filter(i => i.id !== invitation?.id).length ? (
        <>
          <SectionHeader label={t('screens.invite.outstandingHere', 'Also out for this strand')} />
          <View style={styles.rows}>
            {outstanding.filter(i => i.id !== invitation?.id).map(inv => (
              <ListRow
                key={inv.id}
                title={inv.label ?? t('screens.invite.madeAt', 'Made {{when}}')
                  .replace('{{when}}', (inv as { createdAt?: string }).createdAt
                    ? new Date((inv as { createdAt?: string }).createdAt!).toLocaleString()
                    : '')}
                subtitle={[
                  inv.singleUse === false
                    ? (inv.uses === undefined
                        ? t('screens.invite.forAnyone', 'Anyone with the link')
                        : inv.uses === 1
                          ? t('screens.invite.usedOnce', 'Used once')
                          : t('screens.invite.usedTimes', 'Used {{n}} times').replace('{{n}}', String(inv.uses)))
                    : t('screens.invite.forOne', 'For one person'),
                  inv.expiresAt
                    ? t('screens.invite.expires', 'Runs out {{when}}').replace('{{when}}', new Date(inv.expiresAt).toLocaleDateString())
                    : null,
                ].filter(Boolean).join(' · ')}
                onPress={() => Alert.alert(inv.label ?? t('screens.strands.invitation', 'Invitation'),
                  // Honest about what removing it does: cadre-core cannot withdraw
                  // an invitation yet — see data/outgoing-invitations.ts.
                  t('screens.invite.forgetNote',
                    'Taking it off this list does not cancel it: whoever holds it can still use it until it runs out.'), [
                  { text: t('common.shareAgain', 'Share again'), onPress: () => Share.share({ message: shareText(inv.url) }) },
                  { text: t('screens.invite.forget', 'Take it off the list'), style: 'destructive',
                    onPress: () => { void model.invitations.cancel(inv.id).then(refresh); } },
                  { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                ])}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  unreachable: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card,
    padding: spacing[3], gap: spacing[2],
  },
  unreachableBody: { lineHeight: 22 },
  wayOut: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control,
    padding: spacing[3],
  },
  wayOutTitle: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
  unreachableLead: { textTransform: 'uppercase', paddingTop: spacing[1] },
  keptTerms: { textAlign: 'center', paddingVertical: spacing[1] },
  content: { padding: spacing[3], gap: spacing[1], paddingBottom: spacing[5] },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[2], gap: 4 },
  cardTitle: { fontWeight: '600' },
  actions: { alignItems: 'center', paddingVertical: spacing[2], gap: spacing[1] },
  makeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    paddingVertical: spacing[2], paddingHorizontal: spacing[3],
    borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth,
  },
  progress: { textAlign: 'center' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  flex1: { flex: 1 },
  shareRow: { flexDirection: 'row', gap: spacing[1], paddingTop: spacing[1] },
  qrToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing[1] },
  qr: { alignItems: 'center', paddingVertical: spacing[2] },
  rows: { gap: spacing[1] },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  terms: { gap: spacing[1], paddingVertical: spacing[1] },
  choiceRow: { flexDirection: 'row', gap: spacing[1] },
  choice: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[2], gap: 2 },
  choiceShort: { alignItems: 'center' },
  dim: { opacity: 0.5 },
});
