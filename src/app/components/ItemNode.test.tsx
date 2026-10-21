// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemNode from './ItemNode';
import type { SLAItem } from '@/lib/sla-calculator';

afterEach(cleanup);

const api: SLAItem = { id: 'api', name: 'API', type: 'component', sla: 99.9 };
const tier: SLAItem = { id: 'tier', name: 'App Tier', type: 'group', config: 'series', children: [api] };

const renderNode = (item: SLAItem, collapsedIds: ReadonlySet<string> = new Set()) => {
  const onToggleCollapsed = vi.fn();
  render(
    <ItemNode
      item={item}
      onUpdate={vi.fn()}
      onRemove={vi.fn()}
      onAddChild={vi.fn()}
      depth={0}
      bottleneckIds={[]}
      chaosMode={false}
      itemSlas={{ tier: 99.9, api: 99.9 }}
      collapsedIds={collapsedIds}
      onToggleCollapsed={onToggleCollapsed}
    />
  );
  return { user: userEvent.setup(), onToggleCollapsed };
};

const nameInput = (name: string) => screen.queryByDisplayValue(name);

describe('ItemNode groups', () => {
  it('shows children while expanded and asks to collapse', async () => {
    const { user, onToggleCollapsed } = renderNode(tier);
    expect(nameInput('API')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Collapse App Tier' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);
    expect(onToggleCollapsed).toHaveBeenCalledWith('tier');
  });

  it('hides children and add buttons when collapsed, showing a count instead', () => {
    renderNode(tier, new Set(['tier']));
    expect(nameInput('App Tier')).toBeTruthy();
    expect(nameInput('API')).toBeNull();
    expect(screen.queryByRole('button', { name: /add component/i })).toBeNull();
    expect(screen.getByText('1 item')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand App Tier' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('collapses nested groups independently', () => {
    const outer: SLAItem = { id: 'outer', name: 'Outer', type: 'group', config: 'series', children: [tier] };
    renderNode(outer, new Set(['tier']));
    expect(nameInput('App Tier')).toBeTruthy();
    expect(nameInput('API')).toBeNull();
  });
});

describe('ItemNode component details', () => {
  it('hides RTO, RPO and shared failures until More is opened', async () => {
    const { user } = renderNode({ ...api, replicas: 3 });
    expect(screen.queryByText('RTO (min)')).toBeNull();
    expect(screen.queryByText('RPO (min)')).toBeNull();
    expect(screen.queryByText('Shared %')).toBeNull();
    // Min UP belongs with Replicas and stays visible
    expect(screen.getByText('Min UP')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText('RTO (min)')).toBeTruthy();
    expect(screen.getByText('RPO (min)')).toBeTruthy();
    expect(screen.getByText('Shared %')).toBeTruthy();
    expect(screen.getByRole('button', { name: /less/i }).getAttribute('aria-expanded')).toBe('true');
  });

  it('flags hidden values that are set and lists them on hover', () => {
    renderNode({ ...api, rto: 15, rpo: 0, replicas: 2, commonCause: 5 });
    const more = screen.getByRole('button', { name: /more/i });
    expect(screen.getByLabelText('3 set')).toBeTruthy();
    expect(more.getAttribute('title')).toBe('Show recovery and shared-failure fields\nRTO 15 min\nRPO 0 min\nShared 5%');
  });

  it('shows no flag when nothing hidden is set', () => {
    // Shared % only applies with several replicas, so it doesn't count for one
    renderNode({ ...api, commonCause: 5 });
    expect(screen.queryByLabelText(/set$/)).toBeNull();
  });
});
