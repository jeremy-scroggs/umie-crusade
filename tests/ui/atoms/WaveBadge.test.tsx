import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WaveBadge } from '@/ui/atoms/WaveBadge';

describe('WaveBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the label and value', () => {
    render(<WaveBadge label="Wave" value={3} />);
    expect(screen.getByText('Wave')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('exposes a status role with combined aria-label', () => {
    render(<WaveBadge label="Wave" value={7} />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-label')).toBe('Wave 7');
  });

  it('keeps a 44px+ tap target for mobile', () => {
    render(<WaveBadge label="Wave" value={1} />);
    const node = screen.getByRole('status');
    expect(node.className).toContain('min-h-[44px]');
  });
});
