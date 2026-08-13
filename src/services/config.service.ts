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

    async generate(format: OutputFormat): Promise<string> {
      const all = await repos.nodes.getAll();
      // 过滤禁用的节点
      const disabled = new Set(await this.getDisabledNodes());
      const nodes = all.filter((n) => !disabled.has(nodeFingerprint(n)));
      switch (format) {
        case 'mihomo':
          return generateMihomoConfig(nodes);
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