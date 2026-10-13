/**
 * @chat/resources — what every Sereus Chat app shares beyond the core: string catalogs,
 * design tokens and brand art. Data only, no platform code.
 *
 * STRINGS. The shared catalog (`strings/<locale>.json`) holds the words that mean the
 * same in every app: concepts and their consequences (strands, invitations, relays),
 * states, and a message for every error kind the core returns. Keys are by meaning
 * (`invite.historyWarning`, `errors.invitation-spent`), not by screen. An app keeps its
 * own catalog for what only it shows (device features, its own layout) and may override
 * any shared key; `createTranslator` looks in the app's catalog first.
 *
 * TOKENS. Color roles (light and dark, plus the avatar palette) and the layout scale, as
 * data. Each app maps them onto its own styling.
 */
import { en, layout, locales, strings, type Catalog, type Locale, type PartialCatalog } from './data.generated.js';

export { colors, layout, locales, strings } from './data.generated.js';
export type { Catalog, Locale, PartialCatalog } from './data.generated.js';

export type ColorRole = keyof typeof import('./data.generated.js').colors.light;
export type Layout = typeof layout;

/** A catalog in any shape: an app's own, keyed the same way (area, then key). */
export type AnyCatalog = { readonly [key: string]: string | AnyCatalog };

/** The string at a dotted path, if there is one. */
export function lookup(catalog: AnyCatalog | PartialCatalog | undefined, key: string): string | undefined {
  let at: unknown = catalog;
  for (const part of key.split('.')) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[part];
  }
  return typeof at === 'string' ? at : undefined;
}

/** Fill `{{name}}` placeholders. Unknown placeholders are left as they are. */
export function format(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export interface Translator {
  /** The text for `key`, formatted; `fallback` (formatted) or the key itself when nothing has it. */
  (key: string, fallback?: string, vars?: Record<string, string | number>): string;
  /** The text for `key` if any catalog has it. */
  find(key: string): string | undefined;
}

/**
 * A lookup over, in order: the app's catalog for the locale, the shared catalog for the
 * locale, the app's English, the shared English.
 */
export function createTranslator(locale: string, app: Partial<Record<string, AnyCatalog>> = {}): Translator {
  const shared = isLocale(locale) ? strings[locale] : undefined;
  const chain: Array<AnyCatalog | PartialCatalog | undefined> = [app[locale], shared, app.en, en as Catalog];
  const find = (key: string) => {
    for (const catalog of chain) {
      const hit = lookup(catalog, key);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const t = ((key, fallback, vars) => format(find(key) ?? fallback ?? key, vars)) as Translator;
  t.find = find;
  return t;
}

/** The parts of a core `ChatError` the words depend on (structural: no core import). */
export interface ErrorLike {
  kind: string;
  reason?: string;
  message: string;
}

/**
 * Words for a model error: `errors.<kind>.<reason>`, then `errors.<kind>` (or its
 * `default`), then the core's own English message. For `unexpected` the core's message
 * is appended, since it is the only clue to what happened.
 */
export function errorText(t: Translator, error: ErrorLike): string {
  const found = (error.reason && t.find(`errors.${error.kind}.${error.reason}`))
    || t.find(`errors.${error.kind}`)
    || t.find(`errors.${error.kind}.default`);
  if (!found) return error.message;
  return error.kind === 'unexpected' && error.message ? `${found} (${error.message})` : found;
}
