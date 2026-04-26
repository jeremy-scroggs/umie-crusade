import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HeroStatus } from '@/ui/molecules/HeroStatus';

describe('HeroStatus', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders label and current/max numeric', () => {
    render(<HeroStatus label="Hero HP" hp={45} maxHp={100} />);
    expect(screen.getByText('Hero HP')).toBeDefined();
    expect(screen.getByText('45/100')).toBeDefined();
  });

  it('exposes a progressbar with aria-valuenow / aria-valuemax', () => {
    render(<HeroStatus label="Hero HP" hp={30} maxHp={120} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    expect(bar.getAttribute('aria-valuemax')).toBe('120');
  });

  it('clamps overflow values to maxHp', () => {
    render(<HeroStatus label="Hero HP" hp={500} maxHp={100} />);
    expect(screen.getByText('100/100')).toBeDefined();
  });

  it('clamps negative hp to zero', () => {
    render(<HeroStatus label="Hero HP" hp={-12} maxHp={100} />);
    expect(screen.getByText('0/100')).toBeDefined();
  });

  it('handles uninitialised hero (maxHp 0) without NaN', () => {
    render(<HeroStatus label="Hero HP" hp={0} maxHp={0} />);
    expect(screen.getByText('0/0')).toBeDefined();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });
});
