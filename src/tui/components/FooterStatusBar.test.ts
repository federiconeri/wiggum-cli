import { describe, it, expect } from 'vitest';

// We test the module exports and basic construction.
// Ink component rendering requires ink-testing-library; we verify
// the module shape and that the component is a function.

describe('FooterStatusBar', () => {
  it('exports FooterStatusBar as a function component', async () => {
    const mod = await import('./FooterStatusBar.js');
    expect(typeof mod.FooterStatusBar).toBe('function');
  });

  it('exports FooterStatusBarProps type (module loads without error)', async () => {
    // Type-only export: just ensure the module loads cleanly
    const mod = await import('./FooterStatusBar.js');
    expect(mod).toBeDefined();
  });
});
