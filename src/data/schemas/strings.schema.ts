import { z } from 'zod';

// TODO(#4): tighten to a canonical key set once all M1 UI strings are landed.
export const stringsDefSchema = z.record(z.string(), z.string());
