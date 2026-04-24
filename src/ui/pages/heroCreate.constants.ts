/**
 * UI validation constants for the hero-creation page. Kept in one place so
 * store/form/tests all agree. These are UX policy (not balance numbers) —
 * the data-driven rule targets gameplay tunables under `src/data/`.
 */
export const MAX_HERO_NAME_LENGTH = 20;

// Letters + apostrophe: orcish-friendly (e.g. "Mougg'r", "Krog'nak") while
// excluding spaces, digits, and punctuation that would collide with HUD
// rendering or save-file identifiers.
export const HERO_NAME_PATTERN = /^[A-Za-z']+$/;
