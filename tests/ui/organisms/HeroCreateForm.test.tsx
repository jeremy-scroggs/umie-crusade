import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HeroCreateForm } from '@/ui/organisms/HeroCreateForm';
import muggrJson from '@/data/heroes/mougg-r.json';
import { heroDefSchema } from '@/data/schemas';
import type { HeroDef } from '@/types';

const MUGGR: HeroDef = heroDefSchema.parse(muggrJson);

function renderForm(onSubmit = vi.fn()) {
  render(<HeroCreateForm bloodlines={[MUGGR]} onSubmit={onSubmit} />);
  return { onSubmit };
}

function typeName(value: string) {
  const input = screen.getByLabelText('Name') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  return input;
}

describe('HeroCreateForm', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, bloodline card, name input, and Begin button from i18n', () => {
    renderForm();

    expect(
      screen.getByRole('heading', { name: 'Forge Thy Warchief' }),
    ).toBeDefined();
    expect(screen.getByText("Mougg'r")).toBeDefined();
    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Begin Klerg' }),
    ).toBeDefined();
  });

  it('disables Begin when name is empty', () => {
    renderForm();
    const button = screen.getByRole('button', {
      name: 'Begin Klerg',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('disables Begin when name is whitespace-only', () => {
    renderForm();
    typeName('   ');
    const button = screen.getByRole('button', {
      name: 'Begin Klerg',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('disables Begin when name contains invalid chars (digits or spaces)', () => {
    renderForm();
    typeName('Mougg 3');
    const button = screen.getByRole('button', {
      name: 'Begin Klerg',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables Begin with a valid orcish name and submits heroDef + name', () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    typeName("Mougg'r");
    const button = screen.getByRole('button', {
      name: 'Begin Klerg',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0]?.[0] as {
      name: string;
      heroDef: HeroDef;
    };
    expect(call.name).toBe("Mougg'r");
    expect(call.heroDef.id).toBe('mougg-r-hero');
    expect(call.heroDef.bloodline).toBe('mougg-r');
  });

  it('enforces the 20-char maxLength on the input', () => {
    renderForm();
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input.maxLength).toBe(20);
  });

  it('shows an inline error after the user touches the field with an invalid value', () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    const input = screen.getByLabelText('Name');
    fireEvent.blur(input);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Name thy warchief.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bloodline card exposes pressed state for the selected option', () => {
    renderForm();
    const card = screen.getByRole('button', { pressed: true });
    expect(card.textContent).toContain("Mougg'r");
  });
});
