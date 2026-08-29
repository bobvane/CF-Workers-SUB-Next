/**
 * 配置输出服务
 * TASK 5.3 - Subscription Endpoint
 * 支持：节点启用状态过滤（disabled_nodes 存储于 KV Settings）
 */

import { Node, nodeFingerprint } from '@/models/node';
import { Repositories } from '@/storage/kv';
import { generateMihomoConfig } from '@/generator/mihomo';
import { generateSingboxConfig } from '@/generator/singbox';
import { generateBase64Config } from '@/generator/base64-generator';
import { generateSurgeConfig } from '@/generator/surge';
import { generateQuantumultXConfig } from '@/generator/quantumultx';
import { generateShadowrocketConfig } from '@/generator/shadowrocket';
import { generateLoonConfig } from '@/generator/loon';
import { nodeToUrl } from '@/generator/node-to-url';
import { MetaCubeXRule, RULE_GROUPS, CustomRule, mergeCustomRules, findRuleInGroups } from '@/data/metacubex-rules';
import { createIpGeoResolver } from './ip-geo.service';
import { deduplicateNodes } from '@/parser';
import { createCleanRule, applyCleanRules } from '@/models/clean-rule';

const CLEAN_RULES_KEY = 'clean_rules';

export type OutputFormat =
  | 'mihomo'
  | 'singbox'
  | 'surge'
  | 'quantumultx'
  | 'v2ray'
  | 'v2rayn'
  | 'nekoray'
  | 'shadowrocket'
  | 'loon';

export interface OutputResult {
  content: string;
  contentType: string;
  filename: string;
}

export interface ConfigService {
  generate(format: OutputFormat): Promise<string>;
  generateOutput(format: OutputFormat): Promise<OutputResult>;
  getNodes(): Promise<Node[]>;
  /** 获取禁用的节点指纹列表 */
  getDisabledNodes(): Promise<string[]>;
  /** 设置禁用的节点指纹列表 */
  setDisabledNodes(fingerprints: string[]): Promise<void>;
  /** 获取用户勾选的规则 id 列表 */
  getSelectedRuleIds(): Promise<string[]>;
  /** 设置用户勾选的规则 id 列表 */
  setSelectedRuleIds(ids: string[]): Promise<void>;
  /** 获取用户勾选的完整规则对象列表（由 id 解析自 RULE_GROUPS） */
  getSelectedRules(): Promise<MetaCubeXRule[]>;
  /** 获取自定义规则列表 */
  getCustomRules(): Promise<CustomRule[]>;
  /** 添加/更新一条自定义规则 */
  upsertCustomRule(rule: CustomRule): Promise<void>;
  /** 删除一条自定义规则（按 id） */
  deleteCustomRule(id: string): Promise<void>;
  /** 获取合并自定义规则后的完整分组（供 /api/rules/groups 返回） */
  getMergedGroups(): Promise<(typeof RULE_GROUPS)[number][]>;
  // ============ 节点名清洗规则（持久化，订阅更新后自动应用） ============
  getCleanRules(): Promise<import('@/models/clean-rule').CleanRule[]>;
  addCleanRule(rule: { pattern: string; replacement?: string; regex?: boolean }): Promise<import('@/models/clean-rule').CleanRule>;
  deleteCleanRule(id: string): Promise<void>;
  toggleCleanRule(id: string, enabled: boolean): Promise<void>;
  /** 对当前全部节点立即执行清洗规则集（手动触发），返回受影响数量 */
  applyCleanRulesNow(): Promise<number>;
}

const FORMAT_META: Record<OutputFormat, { contentType: string; filename: string }> = {
  mihomo: { contentType: 'text/yaml; charset=utf-8', filename: 'mihomo.yaml' },
  singbox: { contentType: 'application/json; charset=utf-8', filename: 'sing-box.json' },
  surge: { contentType: 'text/plain; charset=utf-8', filename: 'surge.conf' },
  quantumultx: { contentType: 'text/plain; charset=utf-8', filename: 'quantumultx.conf' },
  v2ray: { contentType: 'text/plain; charset=utf-8', filename: 'v2ray.txt' },
  v2rayn: { contentType: 'text/plain; charset=utf-8', filename: 'v2rayn.txt' },
  nekoray: { contentType: 'text/plain; charset=utf-8', filename: 'nekoray.txt' },
  shadowrocket: { contentType: 'text/plain; charset=utf-8', filename: 'shadowrocket.conf' },
  loon: { contentType: 'text/plain; charset=utf-8', filename: 'loon.conf' },
};

const DISABLED_NODES_KEY = 'disabled_nodes';
const SELECTED_RULES_KEY = 'selected_rules';
const CUSTOM_RULES_KEY = 'custom_rules';

export function createConfigService(repos: Repositories): ConfigService {
  return {
    async getNodes(): Promise<Node[]> {
      // 返回去重后节点（按 server:port:protocol 三项指纹）
      return deduplicateNodes(await repos.nodes.getAll());
    },

    async getDisabledNodes(): Promise<string[]> {
      const raw = await repos.settings.get(DISABLED_NODES_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },

    async setDisabledNodes(fingerprints: string[]): Promise<void> {
      // 去重
      const unique = [...new Set(fingerprints)];
      await repos.settings.set(DISABLED_NODES_KEY, JSON.stringify(unique));
    },

    async getSelectedRuleIds(): Promise<string[]> {
      const raw = await repos.settings.get(SELECTED_RULES_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },

    async setSelectedRuleIds(ids: string[]): Promise<void> {
      const unique = [...new Set(ids)];
      await repos.settings.set(SELECTED_RULES_KEY, JSON.stringify(unique));
    },

    async getSelectedRules(): Promise<MetaCubeXRule[]> {
      const ids = await this.getSelectedRuleIds();
      const groups = await this.getMergedGroups();
      // 自动注入 native 固定规则：即使未勾选也要输出（承重墙）
      const fixedNativeIds = new Set(
        groups.flatMap(g => g.items.filter(it => it.fixed && it.native).map(it => it.id))
      );
      const mergedIds = [...new Set([...ids, ...fixedNativeIds])];
      return mergedIds
        .map((id) => findRuleInGroups(groups, id))
        .filter((r): r is MetaCubeXRule => r !== undefined);
    },

    async getCustomRules(): Promise<CustomRule[]> {
      const raw = await repos.settings.get(CUSTOM_RULES_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as CustomRule[] : [];
      } catch {
        return [];
      }
    },

    async upsertCustomRule(rule: CustomRule): Promise<void> {
      const rules = await this.getCustomRules();
      const idx = rules.findIndex((r) => r.id === rule.id);
      const item: CustomRule = { ...rule, createdAt: rule.createdAt ?? Date.now() };
      if (idx >= 0) rules[idx] = item;
      else rules.push(item);
      await repos.settings.set(CUSTOM_RULES_KEY, JSON.stringify(rules));
    },

    async deleteCustomRule(id: string): Promise<void> {
      const rules = await this.getCustomRules();
      const filtered = rules.filter((r) => r.id !== id);
      await repos.settings.set(CUSTOM_RULES_KEY, JSON.stringify(filtered));
      // 同时从勾选集合中移除
      const selected = await this.getSelectedRuleIds();
      if (selected.includes(id)) {
        await this.setSelectedRuleIds(selected.filter((s) => s !== id));
      }
    },

    async getMergedGroups() {
      const custom = await this.getCustomRules();
      return mergeCustomRules(custom);
    },

    // ============ 节点名清洗规则 ============
    async getCleanRules() {
      const raw = await repos.settings.get(CLEAN_RULES_KEY);
      if (!raw) return [];
      try {
        return JSON.parse(raw) as import('@/models/clean-rule').CleanRule[];
      } catch {
        return [];
      }
    },

    async addCleanRule(rule) {
      const rules = await this.getCleanRules();
      const created = createCleanRule({
        pattern: rule.pattern,
        replacement: rule.replacement ?? '',
        regex: rule.regex ?? false,
      });
      rules.push(created);
      await repos.settings.set(CLEAN_RULES_KEY, JSON.stringify(rules));
      return created;
    },

    async deleteCleanRule(id) {
      const rules = await this.getCleanRules();
      await repos.settings.set(CLEAN_RULES_KEY, JSON.stringify(rules.filter((r) => r.id !== id)));
    },

    async toggleCleanRule(id, enabled) {
      const rules = await this.getCleanRules();
      const target = rules.find((r) => r.id === id);
      if (!target) throw new Error('Clean rule not found');
      target.enabled = enabled;
      await repos.settings.set(CLEAN_RULES_KEY, JSON.stringify(rules));
    },

    async applyCleanRulesNow() {
      const rules = await this.getCleanRules();
      let changed = 0;
      for (const sub of await repos.subscriptions.list()) {
        const nodes = await repos.nodes.getBySubscription(sub.id);
        let subChanged = false;
        const transformed = nodes.map((n) => {
          // 始终从原始名出发应用全部启用规则（幂等且删除规则后可正确还原）
          const base = n.metadata?.originalName ?? n.name;
          const newName = applyCleanRules(base, rules);
          if (newName !== n.name) {
            changed++;
            subChanged = true;
            return { ...n, name: newName };
          }
          return n;
        });
        if (subChanged) await repos.nodes.setBySubscription(sub.id, transformed);
      }
      return changed;
    },

    async generate(format: OutputFormat): Promise<string> {
      // 去重：按 server:port:protocol 三项指纹，合并多订阅重复节点
      const all = deduplicateNodes(await repos.nodes.getAll());
      // 过滤禁用的节点
      const disabled = new Set(await this.getDisabledNodes());
      const nodes = all.filter((n) => !disabled.has(nodeFingerprint(n)));
      switch (format) {
        case 'mihomo':
          return generateMihomoConfig(
            nodes,
            undefined,
            await this.getSelectedRules(),
            await this.getMergedGroups(),
            createIpGeoResolver({
              get: (k) => repos.settings.get(k),
              set: (k, v) => repos.settings.set(k, v),
            })
          );
        case 'singbox':
          return generateSingboxConfig(nodes, undefined, await this.getSelectedRules(), await this.getMergedGroups());
        case 'surge':
          return generateSurgeConfig(nodes, await this.getSelectedRules(), await this.getMergedGroups());
        case 'quantumultx':
          return generateQuantumultXConfig(nodes, await this.getSelectedRules(), await this.getMergedGroups());
        case 'shadowrocket':
          return generateShadowrocketConfig(nodes, await this.getSelectedRules(), await this.getMergedGroups());
        case 'loon':
          return generateLoonConfig(nodes, await this.getSelectedRules(), await this.getMergedGroups());
        case 'v2ray':
        case 'v2rayn':
        case 'nekoray':
          return generateBase64Config(nodes);
        default:
          return '';
      }
    },

    async generateOutput(format: OutputFormat): Promise<OutputResult> {
      const content = await this.generate(format);
      return {
        content,
        contentType: FORMAT_META[format].contentType,
        filename: FORMAT_META[format].filename,
      };
    },
  };
}

/**
 * 生成单节点链接（无 Base64 编码，调试用）
 */
export function nodeToLink(node: Node): string {
  return nodeToUrl(node);
}