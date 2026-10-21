// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopologyView from './TopologyView';
import type { SLAItem } from '@/lib/sla-calculator';

afterEach(cleanup);

const root: SLAItem = {
  id: 'root',
  name: 'System',
  type: 'group',
  config: 'series',
  children: [{ id: 'api', name: 'API', type: 'component', sla: 99.9 }],
};

const renderView = (layout: 'horizontal' | 'vertical') => {
  const onLayoutChange = vi.fn();
  render(
    <TopologyView
      root={root}
      bottleneckIds={[]}
      layout={layout}
      onLayoutChange={onLayoutChange}
      chaosMode={false}
      onUpdate={vi.fn()}
      blastRadiusMap={{}}
      itemSlas={{ root: 99.9, api: 99.9 }}
    />
  );
  return { user: userEvent.setup(), onLayoutChange };
};

describe('TopologyView layout toggle', () => {
  it('marks the current layout as pressed', () => {
    renderView('vertical');
    expect(screen.getByRole('button', { name: 'Vertical layout' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Horizontal layout' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the chosen layout', async () => {
    const { user, onLayoutChange } = renderView('vertical');
    await user.click(screen.getByRole('button', { name: 'Horizontal layout' }));
    expect(onLayoutChange).toHaveBeenCalledWith('horizontal');
  });
});
