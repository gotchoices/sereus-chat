/**
 * An invitation in words: what a person sees when they ask what is in the link they are about to
 * hand out (or were handed). Pure: `/sereus` decodes the invitation, this describes it.
 */
import { addressKind, reachesAnywhere, type CadronAddressKind } from './address.js';
import { shortPeerId } from './model.js';

export interface InvitationAddressText {
  /** The cadron's name the person gave it, else its short peer id. */
  label: string;
  peerId: string;
  /** This device's own address rather than one of its cadrons'. */
  thisDevice: boolean;
  /** Null for an address no phone can dial (plain TCP, unparsable). */
  kind: CadronAddressKind | null;
  reachesAnywhere: boolean;
  /** The host a joiner dials: the cadron's own, or for a relayed address the relay's. */
  host: string;
  port: number | null;
  /** `ws`, `wss`, `tcp`, or `relay` for an address reached through a relay. */
  via: 'ws' | 'wss' | 'tcp' | 'relay';
  addr: string;
}

export interface InvitationText {
  expiresAt: string;
  /** Length of the text shared (the link), in characters. */
  linkLength: number;
  /** The smallest QR version (1–40) holding the link at error correction M, or null past 40. */
  qrVersion: number | null;
  addresses: InvitationAddressText[];
}

/** QR byte-mode capacity at error correction level M, versions 1–40. */
const QR_CAPACITY_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779,
  857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331];

export function qrVersionFor(length: number): number | null {
  const i = QR_CAPACITY_M.findIndex(cap => cap >= length);
  return i < 0 ? null : i + 1;
}

/** The peer an address ends in (`/p2p/<id>`, the last one). */
export function destinationPeerId(addr: string): string {
  const parts = addr.split('/').filter(Boolean);
  const i = parts.lastIndexOf('p2p');
  return i >= 0 ? parts[i + 1] ?? '' : '';
}

function hostAndPort(addr: string): { host: string; port: number | null; via: InvitationAddressText['via'] } {
  const parts = addr.split('/').filter(Boolean);
  const relayed = parts.includes('p2p-circuit');
  const host = parts[1] ?? '';
  const t = parts.indexOf('tcp');
  const port = t >= 0 ? Number(parts[t + 1]) : NaN;
  const via = relayed ? 'relay' : parts.includes('wss') || parts.includes('tls') ? 'wss' : parts.includes('ws') ? 'ws' : 'tcp';
  return { host, port: Number.isFinite(port) ? port : null, via };
}

export function describeInvitation(
  invitation: { expiration: Date | string; bootstrap: readonly string[] },
  opts: { link: string; names?: Record<string, string>; thisDevicePeerId?: string | null },
): InvitationText {
  const names = opts.names ?? {};
  return {
    expiresAt: new Date(invitation.expiration).toISOString(),
    linkLength: opts.link.length,
    qrVersion: qrVersionFor(opts.link.length),
    addresses: invitation.bootstrap.map(addr => {
      const peerId = destinationPeerId(addr);
      const kind = addressKind(addr);
      return {
        label: names[peerId]?.trim() || shortPeerId(peerId),
        peerId,
        thisDevice: !!opts.thisDevicePeerId && peerId === opts.thisDevicePeerId,
        kind,
        reachesAnywhere: reachesAnywhere(kind),
        ...hostAndPort(addr),
        addr,
      };
    }),
  };
}
