import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { HeroDef } from '@/types';
import { Button } from '@/ui/atoms/Button';
import { TextInput } from '@/ui/atoms/TextInput';
import { HeroOptionCard } from '@/ui/molecules/HeroOptionCard';
import {
  HERO_NAME_PATTERN,
  MAX_HERO_NAME_LENGTH,
} from '@/ui/pages/heroCreate.constants';

export interface HeroCreateSubmit {
  name: string;
  heroDef: HeroDef;
}

interface HeroCreateFormProps {
  units: HeroDef[];
  onSubmit: (payload: HeroCreateSubmit) => void;
}

type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'tooLong' | 'invalidChars' };

function validateName(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_HERO_NAME_LENGTH)
    return { ok: false, reason: 'tooLong' };
  if (!HERO_NAME_PATTERN.test(trimmed))
    return { ok: false, reason: 'invalidChars' };
  return { ok: true };
}

// Inline English fallbacks; localizing validation errors is a follow-up
// (intentionally not expanding the #4 string bundle for a scaffold).
const ERROR_COPY: Record<
  Exclude<ValidationResult, { ok: true }>['reason'],
  string
> = {
  empty: 'Name thy warchief.',
  tooLong: `Name must be ${MAX_HERO_NAME_LENGTH} runes or fewer.`,
  invalidChars: "Letters and apostrophe only ('Brute).",
};

export function HeroCreateForm({ units, onSubmit }: HeroCreateFormProps) {
  const [selectedId, setSelectedId] = useState<string>(
    // M1 has one option — start selected. Safe because data layer guarantees
    // at least one hero def by the time we reach this page.
    units[0]?.id ?? '',
  );
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const selectedDef = units.find((u) => u.id === selectedId);
  const validation = validateName(name);
  const showError = touched && !validation.ok;
  const canSubmit = validation.ok && selectedDef !== undefined;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit || !selectedDef) return;
    onSubmit({ name: name.trim(), heroDef: selectedDef });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-5"
      noValidate
    >
      <h1 className="font-mono text-2xl text-white">
        {t('hero.create.title')}
      </h1>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-mono text-sm text-white/80">
          {t('hero.create.unitLabel')}
        </legend>
        {units.map((def) => (
          <HeroOptionCard
            key={def.id}
            heroDef={def}
            selected={def.id === selectedId}
            onSelect={() => setSelectedId(def.id)}
          />
        ))}
      </fieldset>

      <TextInput
        label={t('hero.create.nameLabel')}
        placeholder={t('hero.create.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setTouched(true)}
        maxLength={MAX_HERO_NAME_LENGTH}
        autoComplete="off"
        error={showError && !validation.ok ? ERROR_COPY[validation.reason] : undefined}
      />

      <Button type="submit" disabled={!canSubmit}>
        {t('hero.create.beginButton')}
      </Button>
    </form>
  );
}
