// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemNode from './ItemNode';
import type { SLAItem } from '@/lib/sla-calculator';
import { searchTree } from '@/lib/search';

afterEach(cleanup);

const api: SLAItem = { id: 'api', name: 'API', type: 'component', sla: 99.9 };
const tier: SLAItem = { id: 'tier', name: 'App Tier', type: 'group', config: 'series', children: [api] };

const renderNode = (item: SLAItem, collapsedIds: ReadonlySet<string> = new Set(), showRecoveryFields = false, query = '') => {
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
      showRecoveryFields={showRecoveryFields}
      search={searchTree(item, query)}
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

describe('ItemNode root', () => {
  it('offers no remove button for the root group, only for nested ones', () => {
    const outer: SLAItem = { id: 'outer', name: 'Outer', type: 'group', config: 'series', children: [tier] };
    renderNode(outer);
    expect(screen.queryByRole('button', { name: 'Remove Outer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove App Tier' })).toBeTruthy();
  });
});

describe('ItemNode recovery fields', () => {
  it('hides RTO and RPO unless recovery fields are shown', () => {
    renderNode({ ...api, rto: 15, rpo: 0 });
    expect(screen.queryByText('RTO (min)')).toBeNull();
    expect(screen.queryByText('RPO (min)')).toBeNull();

    cleanup();
    renderNode({ ...api, rto: 15, rpo: 0 }, new Set(), true);
    expect((screen.getByRole('spinbutton', { name: 'RTO (min)' }) as HTMLInputElement).value).toBe('15');
    expect((screen.getByRole('spinbutton', { name: 'RPO (min)' }) as HTMLInputElement).value).toBe('0');
  });

  it('passes the setting down to nested components', () => {
    renderNode(tier, new Set(), true);
    expect(screen.getByText('RTO (min)')).toBeTruthy();
  });

  it('keeps shared failures visible for replicated components either way', () => {
    renderNode({ ...api, replicas: 3 });
    expect(screen.getByText('Min UP')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Shared failures (%)' })).toBeTruthy();
  });
});

describe('ItemNode search', () => {
  const db: SLAItem = { id: 'db', name: 'Database', type: 'component', sla: 99.95 };
  const outer: SLAItem = { id: 'outer', name: 'Outer', type: 'group', config: 'series', children: [tier, db] };

  it('shows only matches and the groups leading to them', () => {
    renderNode(outer, new Set(), false, 'api');
    expect(nameInput('App Tier')).toBeTruthy();
    expect(nameInput('API')).toBeTruthy();
    expect(nameInput('Database')).toBeNull();
  });

  it('opens collapsed groups that contain a match', () => {
    renderNode(outer, new Set(['tier']), false, 'api');
    expect(nameInput('API')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse App Tier' })).toBeTruthy();
  });

  it('highlights matching names only', () => {
    renderNode(outer, new Set(), false, 'api');
    expect(nameInput('API')!.className).toContain('bg-amber-100');
    expect(nameInput('App Tier')!.className).not.toContain('bg-amber-100');
  });

  it('hides the add buttons while searching', () => {
    renderNode(outer, new Set(), false, 'api');
    expect(screen.queryByRole('button', { name: /add component/i })).toBeNull();
  });

  it('says so when nothing matches', () => {
    renderNode(outer, new Set(), false, 'kafka');
    expect(screen.getByText('Nothing matches “kafka”.')).toBeTruthy();
    expect(nameInput('App Tier')).toBeNull();
  });
});
