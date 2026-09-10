import { expect } from 'chai';

import { toBatchLogData } from '../../src/errorData.js';

/**
 * The defect these cover: `data: data ?? {}` handed a raw Error to a body that gets
 * JSON.stringify'd, and Error's own fields are non-enumerable, so every batch log row a
 * collector wrote landed with `data = {}`.
 */
describe('toBatchLogData', () => {
  it('survives JSON.stringify, which a raw Error does not', () => {
    const err = new Error('Too Many Requests');
    expect(JSON.stringify(err)).to.equal('{}');
    expect(JSON.parse(JSON.stringify(toBatchLogData(err)))).to.include({
      name: 'Error',
      message: 'Too Many Requests',
    });
  });

  it('keys the cause the way the retry classifier reads it', () => {
    // classifyBatchLog maps the row onto { _model: data }, then reads _model.msg / .key /
    // .statusCode — so these live at the top level, not nested under a _model of their own.
    const err = Object.assign(new Error('Unexpected error: Too Many Requests'), {
      _model: { key: 'err.unexpected', statusCode: 429 },
    });
    const out = toBatchLogData(err);
    expect(out.msg).to.equal('Unexpected error: Too Many Requests');
    expect(out.statusCode).to.equal(429);
    expect(out.key).to.equal('err.unexpected');
  });

  it('lifts a status code from an axios-shaped response', () => {
    const err = Object.assign(new Error('Request failed'), { response: { status: 429 } });
    expect(toBatchLogData(err).statusCode).to.equal(429);
  });

  it('prefers an explicit statusCode over the nested ones', () => {
    const err = Object.assign(new Error('boom'), {
      statusCode: 503, _model: { statusCode: 500 }, response: { status: 502 },
    });
    expect(toBatchLogData(err).statusCode).to.equal(503);
  });

  // The direct shape below was covered; a WRAPPED error was not. `cause` is an own property, so
  // getOwnPropertyNames finds it, and a top-level-only filter handed the token straight back.
  it('never copies credentials out of a nested cause either', () => {
    const axiosErr = Object.assign(new Error('Request failed'), {
      config: { headers: { Authorization: 'Bearer super-secret' } },
      response: { status: 500 },
    });
    const wrapped = new Error('Unable to load user', { cause: axiosErr });

    const serialized = JSON.stringify(toBatchLogData(wrapped));

    expect(serialized).to.not.contain('super-secret');
    expect(serialized).to.not.contain('Authorization');
    // The cause itself is the most useful diagnostic, so it is kept — just sanitized.
    expect(serialized).to.contain('Request failed');
  });

  it('bounds a nested value, not just a top-level string', () => {
    // Truncation used to apply only to `typeof value === 'string'` at the top level, so anything
    // under _model, cause or a custom property was unbounded.
    const err = Object.assign(new Error('boom'), { _model: { blob: 'x'.repeat(50_000) } });
    expect(JSON.stringify(toBatchLogData(err))).to.have.length.lessThan(20_000);
  });

  it('survives a circular value instead of throwing', () => {
    // This runs while a collector is already reporting a failure. The previous `data ?? {}` could
    // not throw, so neither may this.
    const err: any = Object.assign(new Error('boom'), { ctx: {} });
    err.ctx.self = err.ctx;

    const out = toBatchLogData(err);

    expect(() => JSON.stringify(out)).to.not.throw();
    expect(JSON.stringify(out)).to.contain('[circular]');
  });

  it('survives a bigint, which JSON.stringify refuses outright', () => {
    const err = Object.assign(new Error('boom'), { attempt: 9007199254740993n });
    expect(() => JSON.stringify(toBatchLogData(err))).to.not.throw();
  });

  it('caps the whole payload, keeping the fields the classifier reads', () => {
    const err = Object.assign(new Error('boom'), {
      statusCode: 429,
      details: Array.from({ length: 400 }, (_, i) => ({ i, blob: 'y'.repeat(200) })),
    });

    const out = toBatchLogData(err);

    expect(JSON.stringify(out)).to.have.length.lessThan(20_000);
    expect(out.msg).to.equal('boom');
    expect(out.statusCode).to.equal(429);
  });

  it('never copies the axios request, which carries the connection credentials', () => {
    const err = Object.assign(new Error('Request failed'), {
      config: { headers: { Authorization: 'Bearer super-secret' } },
      request: { path: '/x' },
      response: { status: 500, config: { headers: { Authorization: 'Bearer super-secret' } } },
    });

    const serialized = JSON.stringify(toBatchLogData(err));

    expect(serialized).to.not.contain('super-secret');
    expect(serialized).to.not.contain('Authorization');
    expect(toBatchLogData(err).statusCode).to.equal(500);
  });

  it('keeps other own properties, including non-enumerable ones', () => {
    const err = new Error('boom');
    Object.defineProperty(err, 'code', { value: 'ECONNRESET', enumerable: false });
    expect(toBatchLogData(err).code).to.equal('ECONNRESET');
  });

  it('truncates unbounded fields', () => {
    const err = new Error('x'.repeat(10_000));
    const out = toBatchLogData(err);
    expect(String(out.message)).to.have.length.lessThan(4_200);
    expect(String(out.message)).to.contain('[truncated]');
  });

  it('passes a plain object through and maps nothing for no data', () => {
    expect(toBatchLogData({ rows: 3 })).to.deep.equal({ rows: 3 });
    expect(toBatchLogData()).to.deep.equal({});
    expect(toBatchLogData(undefined)).to.deep.equal({});
  });

  it('falls back to the string form when message is empty', () => {
    const err = new Error('');
    expect(toBatchLogData(err).message).to.equal('Error');
  });
});
