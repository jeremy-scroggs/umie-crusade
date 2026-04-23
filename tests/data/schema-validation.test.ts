import { describe, it, expect } from 'vitest';
import { unitDefSchema } from '@/data/schemas/unit.schema';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';

describe('data schema validation', () => {
  describe('orc unit definitions', () => {
    it('mougg-grunt.json is valid', () => {
      const result = unitDefSchema.safeParse(mouggGrunt);
      if (!result.success) {
        console.error(result.error.format());
      }
      expect(result.success).toBe(true);
    });
  });

  describe('unit schema rejects invalid data', () => {
    it('rejects missing required fields', () => {
      const result = unitDefSchema.safeParse({ id: 'test' });
      expect(result.success).toBe(false);
    });

    it('rejects negative hp', () => {
      const invalid = {
        ...mouggGrunt,
        stats: { ...mouggGrunt.stats, hp: -10 },
      };
      const result = unitDefSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid category', () => {
      const invalid = { ...mouggGrunt, category: 'dragon' };
      const result = unitDefSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid faction', () => {
      const invalid = { ...mouggGrunt, faction: 'elf' };
      const result = unitDefSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
