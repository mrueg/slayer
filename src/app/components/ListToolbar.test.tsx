// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListToolbar from './ListToolbar';

afterEach(cleanup);

type Props = React.ComponentProps<typeof ListToolbar>;

const setup = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    query: '',
    onQueryChange: vi.fn(),
    matchCount: null,
    showRecoveryFields: false,
    onShowRecoveryFieldsChange: vi.fn(),
    canCollapse: true,
    allCollapsed: false,
    onToggleCollapseAll: vi.fn(),
    ...overrides,
  };
  render(<ListToolbar {...props} />);
  return { user: userEvent.setup(), props, input: screen.getByRole('searchbox', { name: /search/i }) };
};

describe('ListToolbar search', () => {
  it('reports what is typed', async () => {
    const { user, props, input } = setup();
    await user.type(input, 'd');
    expect(props.onQueryChange).toHaveBeenLastCalledWith('d');
  });

  it('focuses the search on "/" but not while typing elsewhere', async () => {
    const { user, input } = setup();
    await user.keyboard('/');
    expect(document.activeElement).toBe(input);

    input.blur();
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    await user.keyboard('/');
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('clears on Escape and with the clear button', async () => {
    const { user, props, input } = setup({ query: 'dns', matchCount: 1 });
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(props.onQueryChange).toHaveBeenLastCalledWith('');

    vi.mocked(props.onQueryChange).mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(props.onQueryChange).toHaveBeenCalledWith('');
  });

  it('shows the match count only while searching', () => {
    setup();
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    setup({ query: 'aurora', matchCount: 2 });
    expect(screen.getByRole('status').textContent).toBe('2 matches');
    cleanup();
    setup({ query: 'dns', matchCount: 1 });
    expect(screen.getByRole('status').textContent).toBe('1 match');
  });
});

describe('ListToolbar view toggles', () => {
  it('toggles the RTO/RPO fields', async () => {
    const { user, props } = setup();
    const toggle = screen.getByRole('button', { name: 'RTO/RPO' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(props.onShowRecoveryFieldsChange).toHaveBeenCalledWith(true);
  });

  it('offers collapse or expand all, and nothing without nested groups', async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(props.onToggleCollapseAll).toHaveBeenCalledTimes(1);

    cleanup();
    setup({ allCollapsed: true });
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeTruthy();

    cleanup();
    setup({ canCollapse: false });
    expect(screen.queryByRole('button', { name: /collapse all|expand all/i })).toBeNull();
  });
});
