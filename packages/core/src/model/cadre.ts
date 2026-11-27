/**
 * The cadre: this party's own machines (story 42, "adds a machine of their own").
 *
 * Defined in `@chat/cadre-client`, the UI-agnostic cadre package any Sereus app can use
 * (packages/cadre-client/README.md); re-exported here so the chat model and its screens
 * keep one import. `ChatModel.cadre` is a `CadreModel`, and its results' error kinds are
 * a subset of chat's own.
 */
export type {
  CadreMachine, CadreModel, CadreStatus, CadreView, NodeCodePreview, NodeReach,
  Cadron, CadronPreferences, BootstrapPlan, BootstrapEntry, BootstrapWarning, InvitationReadiness, InvitationText, InvitationAddressText,
  InvitationsModel as CadronsModel,
} from '@chat/cadre-client';
export { ownerFingerprint, shortPeerId } from '@chat/cadre-client';
