import { describe, expect, it } from 'vitest';
import { translateType } from './closure-type.ts';

describe('translateType', () => {
  it('should pass primitives through', () => {
    expect(translateType('string')).toBe('string');
    expect(translateType('number')).toBe('number');
    expect(translateType('boolean')).toBe('boolean');
  });

  it('should drop the non-null prefix', () => {
    expect(translateType('!Element')).toBe('Element');
    expect(translateType('!shaka.util.Error')).toBe('shaka.util.Error');
  });

  it('should turn the nullable prefix into a null union', () => {
    expect(translateType('?number')).toBe('number | null');
  });

  it('should map the wildcard and bare nullable to unknown', () => {
    expect(translateType('*')).toBe('unknown');
    expect(translateType('?')).toBe('unknown');
  });

  it('should translate array generics, recursing into the element', () => {
    expect(translateType('!Array<string>')).toBe('Array<string>');
    expect(translateType('Array<?number>')).toBe('Array<number | null>');
    expect(translateType('!Array<!Element>')).toBe('Array<Element>');
  });

  it('should accept the dotted generic form', () => {
    expect(translateType('Array.<string>')).toBe('Array<string>');
  });

  it('should map Object with two args to a Record', () => {
    expect(translateType('!Object<string, number>')).toBe('Record<string, number>');
  });

  it('should map bare Object to object', () => {
    expect(translateType('Object')).toBe('object');
  });

  it('should translate unions', () => {
    expect(translateType('(number|string)')).toBe('number | string');
    expect(translateType('string|null')).toBe('string | null');
  });

  it('should parenthesise a union before a null suffix', () => {
    expect(translateType('?(number|string)')).toBe('(number | string) | null');
  });

  it('should translate record types', () => {
    expect(translateType('{a: number, b: string}')).toBe('{ a: number; b: string }');
  });

  it('should recurse into nested record and array types', () => {
    expect(translateType('!Array<{time: ?number, uri: string}>')).toBe(
      'Array<{ time: number | null; uri: string }>',
    );
  });

  it('should translate a function type into an arrow', () => {
    expect(translateType('function(string, number): boolean')).toBe(
      '(arg0: string, arg1: number) => boolean',
    );
  });

  it('should default a function with no return to void', () => {
    expect(translateType('function()')).toBe('() => void');
    expect(translateType('function(!Event)')).toBe('(arg0: Event) => void');
  });

  it('should handle a this type in a function', () => {
    expect(translateType('function(this: Element, string): void')).toBe(
      '(this: Element, arg0: string) => void',
    );
  });

  it('should handle a constructor function type', () => {
    expect(translateType('function(new: Foo, string)')).toBe('new (arg0: string) => Foo');
  });

  it('should handle rest and optional parameters', () => {
    expect(translateType('function(...number)')).toBe('(...args0: number[]) => void');
    expect(translateType('function(string=)')).toBe('(arg0?: string) => void');
  });

  it('should preserve Map, Set and Promise generics', () => {
    expect(translateType('!Map<string, !Element>')).toBe('Map<string, Element>');
    expect(translateType('!Promise<number>')).toBe('Promise<number>');
  });

  it('should preserve the typeof operator', () => {
    expect(translateType('typeof shaka.Player')).toBe('typeof shaka.Player');
  });

  it('should return unknown for an empty type', () => {
    expect(translateType('')).toBe('unknown');
  });
});
