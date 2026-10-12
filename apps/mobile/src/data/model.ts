/**
 * model.ts — this app's one `ChatModel`, chosen once (`USE_SEREUS`): the core's Sereus
 * model over this app's host, or the core's mock over the bundled fixtures.
 *
 * Screens never import this module's implementation choices; they reach the model
 * through `useModel()` and its data through stores (`./bind.ts`).
 */
import { createMockModel, type ChatModel, type MockControls } from '@chat/core';
// Static, not `await import()`: Metro's lazy bundles cannot reach a linked package
// outside the app folder ("Could not load bundle").
import { createSereusModel, type SereusModel } from '@chat/core/sereus';
import { chatHost } from '../host/chat-host';
import { appFixtures } from './mock-fixtures';
import { USE_SEREUS } from './config';

const sereus: SereusModel | null = USE_SEREUS ? createSereusModel(chatHost) : null;
const mock: { model: ChatModel; controls: MockControls } | null = USE_SEREUS ? null : createMockModel(appFixtures);

export const chatModel: ChatModel = sereus ? sereus.model : mock!.model;

/**
 * Start-up for the Sereus model: watch for offered strands, start the node, re-attach
 * remembered joins. App.tsx runs it once the data format is known to be usable.
 */
export async function bootSereus(): Promise<void> {
  await sereus?.boot();
}

/** Mock only: the variant a deep link selected. Signals every store to re-read. */
export function setMockVariant(variant: string): void {
  mock?.controls.setVariant(variant);
}
