/**
 * 测试 - ConfigService 生成配置时注入已保存的分流规则（原生规则集适配）
 */
import { describe, it, expect } from 'vitest';
import { MemoryKvAdapter, createRepositories } from '@/storage/kv';
import { createConfigService } from '@/services/config.service';
import { Node } from '@/models/node';

function makeNode(name: string): Node {
  return {
    id: name,
    name,
    protocol: 'vless',
    server: 'example.com',
    port: 443,
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    tls: true,
    metadata: { source: 'manual', originalName: name, tags: [] },
    version: 1,
  };
}

describe('ConfigService 分流规则注入', () => {
  it('未保存规则时，mihomo 配置仍包含 base 规则（如 MATCH），且 native 固定规则自动注入', async () => {
    const kv = new MemoryKvAdapter();
    const repos = createRepositories(kv);
    const svc = createConfigService(repos);

    const yaml = await svc.generate('mihomo');

    // 无用户保存规则时，native 固定规则（如 category-ads-all / cn / geoip,cn）会自动注入
    expect(yaml).toContain('MATCH'); // MATCH 兜底始终存在
    expect(yaml).toContain('GEOIP,private,DIRECT'); // PRIVATE 始终存在
    // native 固定规则也会出现在输出中
    expect(yaml).toContain('GEOSITE,category-ads-all');
  });

  it('保存非native规则后，mihomo 配置包含 RULE-SET 规则', async () => {
    const kv = new MemoryKvAdapter();
    const repos = createRepositories(kv);
    const svc = createConfigService(repos);

    // 保存非 native 规则（googlefcm 走 provider 路径）
    await repos.settings.set('selected_rules', JSON.stringify(['googlefcm']));

    const yaml = await svc.generate('mihomo');

    // googlefcm 是非 native 规则，走 RULE-SET provider 路径
    expect(yaml).toContain('RULE-SET,geosite-googlefcm');
    expect(yaml).toContain('谷歌FCM');
  });

  it('不生成 rule-providers 块（全组原生化）', async () => {
    const kv = new MemoryKvAdapter();
    const repos = createRepositories(kv);
    const svc = createConfigService(repos);

    const yaml = await svc.generate('mihomo');

    // 全组原生化后，不再输出 rule-providers
    expect(yaml).not.toContain('rule-providers');
  });
});
