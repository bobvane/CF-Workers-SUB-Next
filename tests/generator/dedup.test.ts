import { describe, it, expect } from 'vitest';
import { makeUniqueNames, generateMihomoConfig } from '@/generator/mihomo';
import { generateSingboxConfig } from '@/generator/singbox';
import { generateSurgeConfig } from '@/generator/surge';
import { generateQuantumultXConfig } from '@/generator/quantumultx';
import { Node } from '@/models/node';

function makeNode(name: string): Node {
  return {
    id: 'n1', name, protocol: 'vless', server: 'example.com', port: 443,
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    metadata: { source: 'test', originalName: name, tags: [] },
    version: 1,
  } as Node;
}

describe('makeUniqueNames', () => {
  it('should keep unique names unchanged', async () => {
    const nodes = [makeNode('JP'), makeNode('US'), makeNode('HK')];
    const result = makeUniqueNames(nodes);
    expect(result.map(n => n.name)).toEqual(['JP', 'US', 'HK']);
  });

  it('should append suffix to duplicate names', async () => {
    const nodes = [makeNode('US'), makeNode('US'), makeNode('US')];
    const result = makeUniqueNames(nodes);
    expect(result.map(n => n.name)).toEqual(['US', 'US-1', 'US-2']);
  });

  it('should handle mixed duplicates', async () => {
    const nodes = [makeNode('JP'), makeNode('US'), makeNode('US'), makeNode('JP')];
    const result = makeUniqueNames(nodes);
    expect(result.map(n => n.name)).toEqual(['JP', 'US', 'US-1', 'JP-1']);
  });
});

describe('generators with duplicate names', () => {
  it('should not produce duplicate proxy names in mihomo', async () => {
    const yaml = await generateMihomoConfig([makeNode('US'), makeNode('US')]);
    expect(yaml).toContain('US');
    expect(yaml).toContain('US-1');
    // 确保只有 US-1，没有重复
    expect(yaml.match(/^\s+- name: US$/m)).toBeTruthy();
    expect(yaml.match(/^\s+- name: US-1$/m)).toBeTruthy();
  });

  it('should not produce duplicate tags in singbox', async () => {
    const json = generateSingboxConfig([makeNode('US'), makeNode('US')]);
    expect(json).toContain('"US"');
    expect(json).toContain('"US-1"');
  });

  it('should not produce duplicate names in surge', async () => {
    const config = generateSurgeConfig([makeNode('US'), makeNode('US')]);
    expect(config).toContain('US-1');
  });

  it('should not produce duplicate names in quantumultx', async () => {
    const config = generateQuantumultXConfig([makeNode('US'), makeNode('US')]);
    expect(config).toContain('US-1');
  });
});