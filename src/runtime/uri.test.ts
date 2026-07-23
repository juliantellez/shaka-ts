import { describe, expect, it } from 'vitest';
import { Uri } from './uri.ts';

/**
 * These cases are the reason `goog.Uri` is replaced as its own change rather
 * than folded into the module transform. Manifest parsing depends on every one
 * of them, and `URL` alone handles none of the relative ones.
 */
describe('Uri.resolve', () => {
  it('should resolve a relative reference against an absolute base', () => {
    const resolved = new Uri('https://example.com/a/b/manifest.mpd').resolve('seg/1.m4s');
    expect(resolved.toString()).toBe('https://example.com/a/b/seg/1.m4s');
  });

  it('should resolve a relative reference against a relative base', () => {
    expect(new Uri('a/b/').resolve('c.mp4').toString()).toBe('a/b/c.mp4');
  });

  it('should honour parent segments in a relative base', () => {
    expect(new Uri('a/b/c.mpd').resolve('../d.mp4').toString()).toBe('a/d.mp4');
  });

  it('should preserve a leading slash on an absolute path base', () => {
    expect(new Uri('/a/b/c.mpd').resolve('d.mp4').toString()).toBe('/a/b/d.mp4');
  });

  it('should let an absolute reference override the base entirely', () => {
    const resolved = new Uri('https://example.com/a/').resolve('https://cdn.example.net/x.mp4');
    expect(resolved.toString()).toBe('https://cdn.example.net/x.mp4');
  });

  it('should treat a root relative reference as replacing the base path', () => {
    const resolved = new Uri('https://example.com/a/b/').resolve('/x/y.mp4');
    expect(resolved.toString()).toBe('https://example.com/x/y.mp4');
  });

  it('should not mutate the receiver', () => {
    const base = new Uri('https://example.com/a/');
    base.resolve('b.mp4');
    expect(base.toString()).toBe('https://example.com/a/');
  });
});

describe('Uri.setQueryData', () => {
  it('should add a query string where there was none', () => {
    const uri = new Uri('https://example.com/a.mpd');
    uri.setQueryData('token=abc');
    expect(uri.toString()).toBe('https://example.com/a.mpd?token=abc');
  });

  it('should replace an existing query string rather than append to it', () => {
    const uri = new Uri('https://example.com/a.mpd?old=1');
    uri.setQueryData('token=abc');
    expect(uri.toString()).toBe('https://example.com/a.mpd?token=abc');
  });

  it('should tolerate a leading question mark', () => {
    const uri = new Uri('https://example.com/a.mpd');
    uri.setQueryData('?token=abc');
    expect(uri.toString()).toBe('https://example.com/a.mpd?token=abc');
  });

  it('should keep the fragment after the query', () => {
    const uri = new Uri('https://example.com/a.mpd#frag');
    uri.setQueryData('token=abc');
    expect(uri.toString()).toBe('https://example.com/a.mpd?token=abc#frag');
  });

  it('should clear the query when given an empty string', () => {
    const uri = new Uri('https://example.com/a.mpd?old=1');
    uri.setQueryData('');
    expect(uri.toString()).toBe('https://example.com/a.mpd');
  });
});
