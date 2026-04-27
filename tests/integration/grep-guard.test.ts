import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Grep guard — meta-test for the data-driven rule.
 *
 * Scans every `src/game/systems/*.ts` file for numeric literals NOT in a
 * conservative whitelist. The intent is to catch *new* hardcoded balance
 * values landing in systems code (e.g. an enthusiastic refactor pasting
 * `const HP = 100;` into AI.ts). Existing structural defaults are
 * whitelisted explicitly with a per-file comment.
 *
 * The check is intentionally gentle:
 *  - Comments + string literals are stripped before scanning. Numbers in
 *    docs / dev-notes don't trip the guard.
 *  - Numbers `<= 1` are always allowed: identity comparisons (0/1),
 *    `array.length - 1`, `Math.max(0, ...)`, sign tests, the structural
 *    `0.5` tile-centre offset, and rate fractions like `1 / 60`.
 *  - Numbers used in array index brackets `[0]`, `[1]`, … are allowed
 *    via the same rule (covered by the `<= 1` cutoff for typical access).
 *  - The test logs any violations to its assertion message so a failing
 *    file points at the exact lines.
 *
 * Whitelist of larger structural numerics — every entry here is a
 * documented STRUCTURAL default (engine-side), NOT balance:
 *  - `AI.ts`:
 *    - `6` — default aggro radius in tiles. Real runs override.
 *    - `2` — used in distance formulas? Actually none currently.
 *
 * If a system later adds a new structural default ≥ 2, document it here
 * AND add it to the per-file allowlist.
 */

interface Violation {
  file: string;
  line: number;
  match: string;
  contextLine: string;
}

interface FileAllowlist {
  /**
   * Whitelisted numeric literals (decimal form). A literal in the file is
   * allowed if and only if it appears here OR is `<= 1`.
   */
  numerics: ReadonlySet<string>;
  /**
   * Optional explanation for human readers — surfaced in the assertion
   * failure message when a NEW number violates.
   */
  rationale: Readonly<Record<string, string>>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SYSTEMS_DIR = resolve(__dirname, '../../src/game/systems');

/**
 * Per-file allowlists. Keys are file basenames. Numbers `<= 1` are
 * allowed everywhere implicitly; only larger structural defaults need
 * an entry here.
 */
const ALLOWLISTS: Readonly<Record<string, FileAllowlist>> = {
  'AI.ts': {
    numerics: new Set(['6']),
    rationale: {
      '6':
        'Default aggro radius in tiles for the Orc FSM (multiplied by ' +
        'pxPerCell). Structural — every real run overrides via ctor opts.',
    },
  },
  'Pathfinding.ts': {
    numerics: new Set(),
    rationale: {},
  },
  'Damage.ts': {
    numerics: new Set(),
    rationale: {},
  },
  'Building.ts': {
    numerics: new Set(),
    rationale: {},
  },
  'Wave.ts': {
    numerics: new Set(),
    rationale: {},
  },
  'Economy.ts': {
    numerics: new Set(),
    rationale: {},
  },
  'Input.ts': {
    numerics: new Set(['2']),
    rationale: {
      '2':
        'Pointer-event button code (2 === right-click) and two-finger pinch ' +
        'count — DOM API constants, not balance. PLAN-21 keeps the actual ' +
        'gesture thresholds (tap-radius, long-press-ms, etc.) in the input ' +
        'data file via `InputGesturesConfig`.',
    },
  },
  'events.ts': {
    numerics: new Set(),
    rationale: {},
  },
  'index.ts': {
    numerics: new Set(),
    rationale: {},
  },
};

/**
 * Strip line + block comments and all string / template literals so we
 * don't scan numbers in JSDoc text or string args. Preserves line breaks
 * to keep line numbers honest in the violation report.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    const next = source[i + 1];
    // Line comment
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    // String literal (single / double / template). Preserve newlines.
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < n) {
          if (source[i + 1] === '\n') out += '\n';
          i += 2;
          continue;
        }
        if (source[i] === '\n') out += '\n';
        // Template literals can have ${ ... } expressions — we don't try
        // to parse them; numeric literals inside an interpolated expr are
        // still inside the string scan so they get skipped. That matches
        // the intent (dev hot strings are data, not balance).
        i += 1;
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Match a numeric literal. Excludes:
 *  - Numbers preceded by `[` (array literal slot — these are content,
 *    not balance — but only when the literal is the sole content)
 *    Actually we keep all literal scans — the `<= 1` rule covers the
 *    common cases.
 *  - Object property identifiers like `0xff`. We only match decimals.
 */
const NUMERIC_RE = /(?<![\w$.])(\d+(?:\.\d+)?)/g;

function isAllowed(value: string, allowlist: FileAllowlist): boolean {
  // Always allow values <= 1 (identity, array index, sign, fractions).
  const num = Number(value);
  if (Number.isFinite(num) && num <= 1) return true;
  return allowlist.numerics.has(value);
}

function scanFile(absPath: string, file: string): Violation[] {
  const source = readFileSync(absPath, 'utf-8');
  const stripped = stripCommentsAndStrings(source);
  const lines = stripped.split('\n');
  const violations: Violation[] = [];
  const allowlist = ALLOWLISTS[file] ?? { numerics: new Set(), rationale: {} };

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]!;
    NUMERIC_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUMERIC_RE.exec(line))) {
      const value = m[1]!;
      if (isAllowed(value, allowlist)) continue;
      violations.push({
        file,
        line: li + 1,
        match: value,
        contextLine: source.split('\n')[li] ?? '',
      });
    }
  }
  return violations;
}

function listSystemFiles(): { file: string; abs: string }[] {
  const out: { file: string; abs: string }[] = [];
  for (const file of readdirSync(SYSTEMS_DIR)) {
    const abs = join(SYSTEMS_DIR, file);
    if (!file.endsWith('.ts')) continue;
    if (statSync(abs).isDirectory()) continue;
    out.push({ file, abs });
  }
  return out;
}

describe('grep guard — no hardcoded balance numbers in src/game/systems', () => {
  for (const entry of listSystemFiles()) {
    it(`${entry.file} contains zero non-whitelisted numeric literals (AC)`, () => {
      const violations = scanFile(entry.abs, entry.file);
      if (violations.length > 0) {
        const lines = violations
          .map(
            (v) =>
              `  ${v.file}:${v.line}  "${v.match}"  ←  ${v.contextLine.trim()}`,
          )
          .join('\n');
        expect.fail(
          `Hardcoded numeric literal(s) detected — move balance to data ` +
            `or whitelist with a structural rationale in ` +
            `tests/integration/grep-guard.test.ts:\n${lines}`,
        );
      }
      expect(violations).toEqual([]);
    });
  }
});
