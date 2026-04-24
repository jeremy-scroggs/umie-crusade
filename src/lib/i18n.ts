import enStrings from '@/data/strings/en.json';
import type { StringKey, StringsDef } from '@/data/schemas/strings.schema';

// `en.json` is the source of truth for UI copy. The Zod schema in
// `strings.schema.ts` guarantees every `StringKey` resolves here at
// validate-data time, so a missing lookup can only be a programmer
// error (e.g. casting an unknown string through `as StringKey`). We
// throw so drift surfaces loudly in dev rather than leaking raw key
// names into the UI.
const bundle = enStrings as StringsDef;

export function t(key: StringKey): string {
  const value = bundle[key];
  if (value === undefined) {
    throw new Error(`[i18n] missing string for key: ${String(key)}`);
  }
  return value;
}

export type { StringKey };
