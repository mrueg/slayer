// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SidebarSection from './SidebarSection';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderSection = (summary?: React.ReactNode) =>
  render(
    <SidebarSection id="test" title="Model Checks" icon={<span />} summary={summary}>
      <p>Body content</p>
    </SidebarSection>
  );

describe('SidebarSection', () => {
  it('starts open and collapses from its header', async () => {
    renderSection();
    const header = screen.getByRole('button', { name: /model checks/i });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Body content')).toBeTruthy();

    await userEvent.setup().click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Body content')).toBeNull();
  });

  it('keeps the summary visible while collapsed', async () => {
    renderSection(3);
    await userEvent.setup().click(screen.getByRole('button', { name: /model checks/i }));
    expect(screen.getByRole('button', { name: /model checks/i }).textContent).toContain('3');
  });

  it('remembers being collapsed', async () => {
    renderSection();
    await userEvent.setup().click(screen.getByRole('button', { name: /model checks/i }));
    cleanup();

    renderSection();
    expect(screen.getByRole('button', { name: /model checks/i }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Body content')).toBeNull();
  });

  it('remembers each section separately', async () => {
    render(
      <>
        <SidebarSection id="a" title="First" icon={<span />}><p>First body</p></SidebarSection>
        <SidebarSection id="b" title="Second" icon={<span />}><p>Second body</p></SidebarSection>
      </>
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /first/i }));
    expect(screen.queryByText('First body')).toBeNull();
    expect(screen.getByText('Second body')).toBeTruthy();
  });
});
