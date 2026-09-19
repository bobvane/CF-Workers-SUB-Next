import { describe, it, expect } from 'vitest';
import { buildRules } from '@/generator/rule-providers';
import { RULE_GROUPS } from '@/data/metacubex-rules';
describe('rule order', () => {
  it('category-ai-!cn (ai) before microsoft', () => {
    // 使用 native=true 模拟已定稿组的原生规则输出
    const all = RULE_GROUPS.flatMap(g => g.items.filter(i => !i.custom)).map(i => ({ ...i, native: true }));
    const lines = buildRules(all, RULE_GROUPS);
    // 精确匹配业务分类行（避免误匹配 microsoft@cn 国内直连行）
    const oi = lines.findIndex(l => l === 'GEOSITE,category-ai-!cn,AI 平台');
    const ms = lines.findIndex(l => l === 'GEOSITE,microsoft,微软服务');
    expect(oi).toBeGreaterThan(-1);
    expect(ms).toBeGreaterThan(-1);
    expect(oi).toBeLessThan(ms);
  });

  it('custom rule outputs at its assigned group position (2026-09-07)', () => {
    // 将一条自定义规则归入「国外媒体」组（user 组无预置规则，media 组有 category-media）
    const groups = RULE_GROUPS.map(g => ({ ...g, items: [...g.items] }));
    const media = groups.find(g => g.key === 'media')!;
    media.items.push({ id: 'netflix-custom', label: 'Netflix 自定义', tag: 'geosite' as const, target: 'PROXY' as const, custom: true });
    // 选入：media 聚合规则 + 自定义规则
    const selected = [
      { id: 'category-media', label: '媒体聚合', tag: 'geosite' as const, target: 'PROXY' as const, native: true, fixed: true },
      { id: 'netflix-custom', label: 'Netflix 自定义', tag: 'geosite' as const, target: 'PROXY' as const, custom: true },
    ];
    const lines = buildRules(selected, groups);
    // 自定义规则输出的位置（GEOSITE 行，custom 走原生输出）
    const ci = lines.findIndex(l => l === 'GEOSITE,netflix-custom,国外媒体');
    // media 聚合规则位置
    const mi = lines.findIndex(l => l === 'GEOSITE,category-media,国外媒体');
    expect(ci).toBeGreaterThan(-1);
    expect(mi).toBeGreaterThan(-1);
    // 自定义规则必须排在 media 组之内/之后，而不是置顶于 ②
    expect(ci).toBeGreaterThanOrEqual(mi);
  });

  it('吸收专业配置：QUIC 防泄漏最前 + @cn 细分在直连位 + GEOIP 兜底在 MATCH 前 (v2.26.3)', () => {
    const all = RULE_GROUPS.flatMap(g => g.items.filter(i => !i.custom));
    const lines = buildRules(all, RULE_GROUPS);
    const idx = (s: string) => lines.findIndex(l => l.startsWith(s));

    // ①c TikTok QUIC 例外 + ①b QUIC 防泄漏：紧跟内网防代理之后，早于一切业务规则
    // v2.26.6: TikTok 的 UDP443 先走国外媒体组，再由 ①b 全局拦截兜底
    expect(lines[2]).toBe('AND,((GEOSITE,tiktok),(DST-PORT,443),(NETWORK,UDP)),国外媒体');
    expect(lines[3]).toBe('AND,((GEOSITE,geolocation-!cn),(DST-PORT,443),(NETWORK,UDP)),REJECT');

    // @cn 细分：中国区直连必须排在同名国际版之前，否则会先命中国际版走代理
    const msCn = idx('GEOSITE,microsoft@cn');
    const ms = idx('GEOSITE,microsoft,');
    expect(lines[msCn]).toBe('GEOSITE,microsoft@cn,DIRECT');
    expect(lines[idx('GEOSITE,steam@cn')]).toBe('GEOSITE,steam@cn,DIRECT');
    expect(msCn).toBeGreaterThan(-1);
    expect(msCn).toBeLessThan(ms);
    expect(idx('GEOSITE,steam@cn')).toBeLessThan(idx('GEOSITE,category-games-!cn'));

    // v2.27.0：IP 兜底随各自组输出（google/telegram/netflix），排在 GEOIP,CN 之前（不再统一沉底）
    const cnIp = lines.indexOf('GEOIP,CN,DIRECT');
    const match = lines.indexOf('MATCH,漏网之鱼');
    for (const t of ['GEOIP,telegram,', 'GEOIP,netflix,', 'GEOIP,google,']) {
      expect(idx(t)).toBeGreaterThan(-1);
      expect(idx(t)).toBeLessThan(cnIp); // 随组输出，在 GEOIP,CN 之前
      expect(idx(t)).toBeLessThan(match);
    }
  });
});
