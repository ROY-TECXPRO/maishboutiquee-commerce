import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/supabase';

/**
 * Guards in-app navigation targets against open-redirect payloads.
 *
 * React Router 6 is affected by GHSA-wrjc-x8rr-h8h6 and
 * GHSA-2j2x-hqr9-3h42; the upstream fix ships in a v7 major. Until that
 * upgrade, safeInternalPath() is what stops a crafted link from bouncing a
 * shopper off to an attacker's site.
 */
describe('safeInternalPath', () => {
  it('passes through ordinary internal paths', () => {
    expect(safeInternalPath('/orders')).toBe('/orders');
    expect(safeInternalPath('/search?q=shirt')).toBe('/search?q=shirt');
    expect(safeInternalPath('/product/women-dress-001')).toBe('/product/women-dress-001');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeInternalPath('https://evil.example/steal')).toBe('/');
    expect(safeInternalPath('http://evil.example')).toBe('/');
    expect(safeInternalPath('//evil.example/steal')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
    expect(safeInternalPath('data:text/html,<script>alert(1)</script>')).toBe('/');
  });

  it('rejects backslash-prefixed targets that browsers normalise to //', () => {
    // A browser turns "\evil.example" into "//evil.example" before resolving it.
    expect(safeInternalPath('\\\\evil.example')).toBe('/');
    expect(safeInternalPath('\\evil.example')).toBe('/');
    expect(safeInternalPath('\\\\\\evil.example')).toBe('/');
  });

  it('rejects control characters used to smuggle a scheme', () => {
    // Built at runtime so literal control bytes never appear in this file;
    // editors and linters strip them.
    const NUL = String.fromCharCode(0);
    const NEWLINE = String.fromCharCode(10);
    const DEL = String.fromCharCode(127);

    expect(safeInternalPath('/ok' + NUL + '/../../evil')).toBe('/');
    expect(safeInternalPath('java' + NEWLINE + 'script:alert(1)')).toBe('/');
    expect(safeInternalPath('/path' + DEL)).toBe('/');
  });

  it('falls back on empty, blank and non-string input', () => {
    expect(safeInternalPath('')).toBe('/');
    expect(safeInternalPath('   ')).toBe('/');
    expect(safeInternalPath(undefined)).toBe('/');
    expect(safeInternalPath(null)).toBe('/');
    expect(safeInternalPath(42)).toBe('/');
    expect(safeInternalPath({ toString: () => '//evil.example' })).toBe('/');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeInternalPath('https://evil.example', '/orders')).toBe('/orders');
  });
});
