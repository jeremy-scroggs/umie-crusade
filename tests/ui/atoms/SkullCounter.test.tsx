import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SkullCounter } from '@/ui/atoms/SkullCounter';

describe('SkullCounter', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the value', () => {
    render(<SkullCounter ariaLabel="Skulls taken" value={42} />);
    expect(screen.getByText('42')).toBeDefined();
  });

  it('exposes a status role with the localised aria label', () => {
    render(<SkullCounter ariaLabel="Skulls taken" value={5} />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-label')).toBe('Skulls taken 5');
  });

  it('keeps a 44px+ tap target for mobile', () => {
    render(<SkullCounter ariaLabel="Skulls taken" value={0} />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('min-h-[44px]');
  });
});
