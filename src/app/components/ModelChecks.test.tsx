// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelChecks from './ModelChecks';
import type { ModelWarning } from '@/lib/warnings';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const warning: ModelWarning = { itemId: 'db', itemName: 'Database', severity: 'warning', message: 'All replicas must be up' };

describe('ModelChecks', () => {
  it('reveals the item before scrolling to it, so items in collapsed groups can be reached', async () => {
    const order: string[] = [];
    const target = document.createElement('div');
    target.dataset.itemId = 'db';
    target.scrollIntoView = vi.fn(() => order.push('scroll'));
    // Rendered only once revealed, like an item inside a collapsed group
    const onReveal = vi.fn(() => {
      order.push('reveal');
      document.body.appendChild(target);
    });

    render(<ModelChecks warnings={[warning]} canNavigate onReveal={onReveal} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /database/i }));
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(onReveal).toHaveBeenCalledWith('db');
    expect(order).toEqual(['reveal', 'scroll']);
  });

  it('does not navigate outside the list view', () => {
    render(<ModelChecks warnings={[warning]} canNavigate={false} onReveal={vi.fn()} />);
    expect(screen.getByRole('button', { name: /database/i }).hasAttribute('disabled')).toBe(true);
  });
});
