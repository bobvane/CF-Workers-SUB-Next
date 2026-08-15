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
import { nodeToUrl } from '@/generator/node-to-url';
import { MetaCubeXRule, RULE_GROUPS, CustomRule, mergeCustomRules, findRuleInGroups } from '@/data/metacubex-rules';

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
}

const FORMAT_META: Record<OutputFormat, { contentType: string; filename: string }> = {
  mihomo: { contentType: 'text/yaml; charset=utf-8', filename: 'mihomo.yaml' },
  singbox: { contentType: 'application/json; charset=utf-8', filename: 'sing-box.json' },
  surge: { contentType: 'text/plain; charset=utf-8', filename: 'surge.conf' },
  quantumultx: { contentType: 'text/plain; charset=utf-8', filename: 'quantumultx.conf' },
  v2ray: { contentType: 'text/plain; charset=utf-8', filename: 'v2ray.txt' },
  v2rayn: { contentType: 'text/plain; charset=utf-8', filename: 'v2rayn.txt' },
  nekoray: { contentType: 'text/plain; charset=utf-8', filename: 'nekoray.txt' },
  shadowrocket: { contentType: 'text/plain; charset=utf-8', filename: 'shadowrocket.txt' },
  loon: { contentType: 'text/plain; charset=utf-8', filename: 'loon.txt' },
};

const DISABLED_NODES_KEY = 'disabled_nodes';
const SELECTED_RULES_KEY = 'selected_rules';
const CUSTOM_RULES_KEY = 'custom_rules';

export function createConfigService(repos: Repositories): ConfigService {
  return {
    async getNodes(): Promise<Node[]> {
      return repos.nodes.getAll();
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
      return ids
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

    async generate(format: OutputFormat): Promise<string> {
      const all = await repos.nodes.getAll();
      // 过滤禁用的节点
      const disabled = new Set(await this.getDisabledNodes());
      const nodes = all.filter((n) => !disabled.has(nodeFingerprint(n)));
      switch (format) {
        case 'mihomo':
          return generateMihomoConfig(nodes, undefined, await this.getSelectedRules());
        case 'singbox':
          return generateSingboxConfig(nodes);
        case 'surge':
          return generateSurgeConfig(nodes);
        case 'quantumultx':
          return generateQuantumultXConfig(nodes);
        case 'v2ray':
        case 'v2rayn':
        case 'nekoray':
        case 'shadowrocket':
        case 'loon':
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