import { describe, it } from 'mocha';
import { expect } from 'chai';
import { DataMapper, MappingRule } from '../../src/index.js';

const PIPELINE_ID = '9b1c0c5e-4f60-4d6f-9a52-1b2c3d4e5f60';

/** A rule writing `key` from the row's `key` through `expression`. */
function expressionRule(key: string, expression: string, sourceKeys: string[] = [key]): MappingRule {
  return {
    id: `rule_${key}`,
    source: sourceKeys.map((sourceKey) => ({ key: sourceKey, name: sourceKey, type: 'string', level: 0 })),
    transform: { type: 'expression', options: { expression } },
    destination: { key, name: key, type: 'string', level: 0 },
  } as unknown as MappingRule;
}

/** A rule copying the row's `key` unchanged. */
function directRule(key: string): MappingRule {
  return {
    id: `rule_${key}`,
    source: { key, name: key, type: 'string', level: 0 },
    transform: { type: 'direct' },
    destination: { key, name: key, type: 'string', level: 0 },
  } as unknown as MappingRule;
}

describe('DataMapper bindings', () => {
  it('lets an expression read a binding as a $ variable', async () => {
    const { result, errors } = await new DataMapper().applyAllMappings(
      [expressionRule('id', 'id != null ? $pipelineId & "/" & $string(id)')],
      { id: 'plan-a/space/living-room' },
      { pipelineId: PIPELINE_ID }
    );

    expect(errors).to.deep.equal([]);
    expect(result).to.deep.equal({ id: `${PIPELINE_ID}/plan-a/space/living-room` });
  });

  it('binds into every rule, including ones that build objects and lists', async () => {
    const rules = [
      expressionRule('placedIn', 'placedIn ? { "id": $pipelineId & "/" & placedIn }'),
      expressionRule('connects', '[$map($split(connects, " | "), function($v) { $pipelineId & "/" & $v })]'),
      directRule('name'),
    ];

    const { result } = await new DataMapper().applyAllMappings(
      rules,
      { placedIn: 'plan-a/space/hall', connects: 'plan-a/space/hall | plan-a/space/kitchen', name: 'Door' },
      { pipelineId: PIPELINE_ID }
    );

    expect(result).to.deep.equal({
      placedIn: { id: `${PIPELINE_ID}/plan-a/space/hall` },
      connects: [`${PIPELINE_ID}/plan-a/space/hall`, `${PIPELINE_ID}/plan-a/space/kitchen`],
      name: 'Door',
    });
  });

  it('keeps a row field and a binding of the same name apart', async () => {
    const { result } = await new DataMapper().applyAllMappings(
      [expressionRule('both', 'pipelineId & "|" & $pipelineId', ['pipelineId'])],
      { pipelineId: 'from-the-row' },
      { pipelineId: PIPELINE_ID }
    );

    expect(result).to.deep.equal({ both: `from-the-row|${PIPELINE_ID}` });
  });

  it('applies a single rule with bindings', async () => {
    const mapping = await new DataMapper().applyMapping(
      expressionRule('id', '$pipelineId & "/" & id'),
      { id: 'plan-a' },
      { pipelineId: PIPELINE_ID }
    );

    expect(mapping.success).to.equal(true);
    expect(mapping.value).to.equal(`${PIPELINE_ID}/plan-a`);
  });

  it('passes bindings through a query source', async () => {
    const invoke = async () => ({ rows: [{ id: 'plan-a' }] });
    const { result } = await new DataMapper().applyAllMappingsFromQuery(
      invoke,
      { objectId: 'object-1', sql: 'SELECT id' } as any,
      [expressionRule('pipeline', '$pipelineId', [])],
      { pipelineId: PIPELINE_ID }
    );

    expect(result).to.deep.equal({ pipeline: PIPELINE_ID });
  });

  it('leaves an unbound variable undefined, so expressions without bindings work as before', async () => {
    const { result } = await new DataMapper().applyAllMappings(
      [expressionRule('id', '$pipelineId ? $pipelineId & "/" & id : id')],
      { id: 'plan-a' }
    );

    expect(result).to.deep.equal({ id: 'plan-a' });
  });
});
