import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataRegistry, dataFileOverrides } from '../src/data/schemas/index';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = join(here, '..', 'src', 'data');

let passed = 0;
let failed = 0;

for (const [subdir, schema] of Object.entries(dataRegistry)) {
  const absDir = join(dataDir, subdir);
  let entries: string[];
  try {
    entries = readdirSync(absDir)
      .filter((f) => f.endsWith('.json'))
      // Skip nested-subdir entries when we have a more specific
      // registry entry that handles them (e.g. `waves` vs
      // `waves/patterns`). Top-level dir only iterates JSON files.
      .filter((f) => statSync(join(absDir, f)).isFile());
  } catch {
    continue;
  }

  for (const file of entries) {
    const relPath = `src/data/${subdir}/${file}`;
    const overrideKey = `${subdir}/${file}`;
    const effective = dataFileOverrides[overrideKey] ?? schema;
    const raw = readFileSync(join(absDir, file), 'utf-8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      console.log(`${RED}✗${RESET} ${relPath}`);
      console.log(`  ${DIM}invalid JSON: ${(err as Error).message}${RESET}`);
      failed++;
      continue;
    }

    const result = effective.safeParse(json);
    if (result.success) {
      console.log(`${GREEN}✓${RESET} ${relPath}`);
      passed++;
    } else {
      console.log(`${RED}✗${RESET} ${relPath}`);
      for (const issue of result.error.issues) {
        const path = issue.path.length ? issue.path.join('.') : '(root)';
        console.log(`  ${DIM}${path}: ${issue.message}${RESET}`);
      }
      failed++;
    }
  }
}

const total = passed + failed;
console.log('');
console.log(
  failed === 0
    ? `${GREEN}${total} passed${RESET}`
    : `${RED}${failed} failed${RESET}, ${passed} passed`,
);

process.exit(failed === 0 ? 0 : 1);
