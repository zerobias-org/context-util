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
