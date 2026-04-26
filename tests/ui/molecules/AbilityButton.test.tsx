import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AbilityButton } from '@/ui/molecules/AbilityButton';

describe('AbilityButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows ready label and is enabled when readyAtMs is null', () => {
    const onActivate = vi.fn();
    render(
      <AbilityButton
        label="Clomp'uk"
        readyLabel="Ready"
        cooldownMs={12000}
        readyAtMs={null}
        nowMs={1000}
        onActivate={onActivate}
      />,
    );
    const btn = screen.getByRole('button', { name: "Clomp'uk" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.textContent).toContain('Ready');
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('disables and shows seconds remaining while on cooldown', () => {
    const onActivate = vi.fn();
    render(
      <AbilityButton
        label="Clomp'uk"
        readyLabel="Ready"
        cooldownMs={12000}
        readyAtMs={5500}
        nowMs={1000}
        onActivate={onActivate}
      />,
    );
    const btn = screen.getByRole('button', { name: "Clomp'uk" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    // 4500ms remaining -> ceil(4.5) = 5s
    expect(btn.textContent).toContain('5s');
    fireEvent.click(btn);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('treats readyAtMs <= nowMs as ready', () => {
    render(
      <AbilityButton
        label="Clomp'uk"
        readyLabel="Ready"
        cooldownMs={12000}
        readyAtMs={500}
        nowMs={1000}
        onActivate={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: "Clomp'uk" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.textContent).toContain('Ready');
  });
});
