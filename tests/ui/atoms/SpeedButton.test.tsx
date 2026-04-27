import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SpeedButton } from '@/ui/atoms/SpeedButton';

describe('SpeedButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the supplied label', () => {
    render(
      <SpeedButton
        scale={2}
        label="2×"
        ariaLabel="2×"
        active={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('2×')).toBeDefined();
  });

  it('keeps a 44px+ tap target (height and width) for mobile', () => {
    render(
      <SpeedButton
        scale={1}
        label="1×"
        ariaLabel="1×"
        active={false}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: '1×' });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });

  it('reflects the active prop via aria-pressed', () => {
    const { rerender } = render(
      <SpeedButton
        scale={1}
        label="1×"
        ariaLabel="1×"
        active={false}
        onSelect={() => {}}
      />,
    );
    let btn = screen.getByRole('button', { name: '1×' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    rerender(
      <SpeedButton
        scale={1}
        label="1×"
        ariaLabel="1×"
        active={true}
        onSelect={() => {}}
      />,
    );
    btn = screen.getByRole('button', { name: '1×' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('invokes onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(
      <SpeedButton
        scale={4}
        label="4×"
        ariaLabel="4×"
        active={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '4×' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders a pause glyph for scale 0 alongside the label', () => {
    render(
      <SpeedButton
        scale={0}
        label="Pause"
        ariaLabel="Pause"
        active={false}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Pause' });
    // Visible label still present for sighted users.
    expect(btn.textContent).toContain('Pause');
    // Unicode pause glyph is rendered.
    expect(btn.textContent).toContain('⏸');
  });

  it('does NOT render a glyph for non-zero scales', () => {
    render(
      <SpeedButton
        scale={1}
        label="1×"
        ariaLabel="1×"
        active={false}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: '1×' });
    expect(btn.textContent ?? '').not.toContain('⏸');
  });
});
