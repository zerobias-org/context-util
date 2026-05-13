import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  resolveSavedQuery,
  resolveMappingSql,
  PipelineSavedQuery,
} from '../../src/index.js';

describe('resolveSavedQuery', () => {
  const a: PipelineSavedQuery = { key: 'a', name: 'A', query: 'SELECT 1' };
  const b: PipelineSavedQuery = { key: 'b', name: 'B', query: 'SELECT 2' };

  it('returns the entry by key from a Record registry', () => {
    const reg = { a, b };
    expect(resolveSavedQuery('b', reg)).to.equal(b);
  });

  it('returns the entry by key from an array registry', () => {
    expect(resolveSavedQuery('a', [a, b])).to.equal(a);
  });

  it('returns undefined when the registry is missing the key', () => {
    expect(resolveSavedQuery('missing', { a })).to.equal(undefined);
    expect(resolveSavedQuery('missing', [a])).to.equal(undefined);
  });

  it('returns undefined for falsy keys and falsy registries', () => {
    expect(resolveSavedQuery(undefined, { a })).to.equal(undefined);
    expect(resolveSavedQuery(null, [a])).to.equal(undefined);
    expect(resolveSavedQuery('', { a })).to.equal(undefined);
    expect(resolveSavedQuery('a', undefined)).to.equal(undefined);
    expect(resolveSavedQuery('a', null)).to.equal(undefined);
  });
});

describe('resolveMappingSql', () => {
  const a: PipelineSavedQuery = { key: 'a', name: 'A', query: 'SELECT * FROM users' };

  it('prefers sourceQueryKey over inline sql when both are present', () => {
    const source = { sourceQueryKey: 'a', sql: 'SELECT legacy' };
    expect(resolveMappingSql(source, { a })).to.equal(a.query);
  });

  it('returns undefined when sourceQueryKey is set but the registry omits it', () => {
    // Intentional: the runner sees this as "stale binding" — caller
    // decides whether to fall back, error, or skip the mapping.
    const source = { sourceQueryKey: 'missing' };
    expect(resolveMappingSql(source, { a })).to.equal(undefined);
  });

  it('falls back to legacy inline sql when no sourceQueryKey is set', () => {
    const source = { sql: 'SELECT legacy' };
    expect(resolveMappingSql(source, { a })).to.equal('SELECT legacy');
  });

  it('returns undefined when neither field is set (collection-backed source)', () => {
    expect(resolveMappingSql({}, { a })).to.equal(undefined);
  });

  it('returns undefined for null / undefined source', () => {
    expect(resolveMappingSql(null, { a })).to.equal(undefined);
    expect(resolveMappingSql(undefined, { a })).to.equal(undefined);
  });

  it('works with an array-shaped registry too', () => {
    const source = { sourceQueryKey: 'a' };
    expect(resolveMappingSql(source, [a])).to.equal(a.query);
  });

  it('passes through extra DataMappingSource fields the structural type ignores', () => {
    // Real persisted sources carry objectId / objectPath / schema etc;
    // the helper accepts them via the open object type.
    const source = {
      objectId: '/db:x/function:query',
      objectName: 'query',
      objectPath: ['/db:x'],
      schema: { properties: [] },
      sourceQueryKey: 'a',
    } as any;
    expect(resolveMappingSql(source, { a })).to.equal(a.query);
  });
});
