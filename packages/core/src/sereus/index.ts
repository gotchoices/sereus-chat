// The Sereus `ChatModel` and what an app must supply to run it. A subpath of its own
// (`@chat/core/sereus`), so the main entry — protocol, model, mock — never loads the
// stack at runtime.
export { createSereusModel, type SereusModel } from './model.js';
export type { ChatHost, CreateExtraNode, NodeHost, SlotName, DurableSlot } from './host.js';
export { ChatFailure, toChatError } from './errors.js';
