import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BuildSlot } from '@/ui/molecules/BuildSlot';

describe('BuildSlot', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders label + cost when affordable', () => {
    render(
      <BuildSlot
        label="Wall"
        cost={20}
        goldLabel="Gold"
        affordable={true}
        insufficientLabel="Nub nuff gold!"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Wall')).toBeDefined();
    expect(screen.getByText('Gold 20')).toBeDefined();
  });

  it('calls onSelect when affordable and clicked', () => {
    const onSelect = vi.fn();
    render(
      <BuildSlot
        label="Wall"
        cost={20}
        goldLabel="Gold"
        affordable={true}
        insufficientLabel="Nub nuff gold!"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Wall, 20 Gold/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disables and shows insufficient-gold note when not affordable', () => {
    const onSelect = vi.fn();
    render(
      <BuildSlot
        label="Ballista"
        cost={60}
        goldLabel="Gold"
        affordable={false}
        insufficientLabel="Nub nuff gold!"
        onSelect={onSelect}
      />,
    );
    const btn = screen.getByRole('button', { name: /Ballista, 60 Gold/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    // Cost chip is hidden in favour of the insufficient note.
    expect(screen.queryByText('Gold 60')).toBeNull();
    expect(screen.getByText('Nub nuff gold!')).toBeDefined();
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders an icon when iconSrc is provided', () => {
    render(
      <BuildSlot
        label="Wall"
        cost={20}
        goldLabel="Gold"
        affordable={true}
        iconSrc="buildings/wall-wood-pristine.png"
        insufficientLabel="Nub nuff gold!"
        onSelect={() => {}}
      />,
    );
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('wall-wood-pristine.png');
  });
});
