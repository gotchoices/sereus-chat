/**
 * `ChatModel`: everything a chat app's screens can read and do, behind one interface.
 * Screens never learn what answers them — the mock (fixtures, in-memory writes) or the
 * Sereus implementation. Choosing one is configuration, made once, outside every screen.
 *
 * Chat's product model, not a general one (docs/app-family.md). Semantics:
 * design/specs/domain/ops.md.
 */
import type { ChangesModel } from './changes.js';
import type { InvitationsModel } from './invitations.js';
import type { MediaModel } from './media.js';
import type { MembersModel } from './members.js';
import type { MessagesModel } from './messages.js';
import type { PrefsModel } from './prefs.js';
import type { ProfileModel } from './profile.js';
import type { ReachabilityModel } from './reachability.js';
import type { SearchModel } from './search.js';
import type { StrandsModel } from './strands.js';

export interface ChatModel {
  strands: StrandsModel;
  messages: MessagesModel;
  members: MembersModel;
  invitations: InvitationsModel;
  media: MediaModel;
  search: SearchModel;
  profile: ProfileModel;
  prefs: PrefsModel;
  reachability: ReachabilityModel;
  changes: ChangesModel;
}
