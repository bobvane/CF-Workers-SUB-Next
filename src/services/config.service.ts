/**
 * 配置输出服务
 * TASK 5.3 - Subscription Endpoint
 * 09_CONFIG_GENERATOR_SPEC.md §11：多格式订阅输出
 */

import { Node } from '@/models/node';
import { Repositories } from '@/storage/kv';
import { generateMihomoConfig } from '@/generator/mihomo';
import { generateSingboxConfig } from '@/generator/singbox';
import { generateBase64Config } from '@/generator/base64-generator';
import { generateSurgeConfig } from '@/generator/surge';
import { generateQuantumultXConfig } from '@/generator/quantumultx';
import { nodeToUrl } from '@/generator/node-to-url';

export type OutputFormat =
  // 完整配置类
  | 'mihomo'      // Clash Meta / Mihomo / Stash（兼容）
  | 'singbox'     // Sing-box
  | 'surge'       // Surge
  | 'quantumultx' // Quantumult X
  // Base64 链接列表类
  | 'v2ray'       // V2ray 标准订阅
  | 'v2rayn'      // V2RayNG
  | 'nekoray'     // NekoRay / NekoBox
  | 'shadowrocket'// Shadowrocket
  | 'loon';       // Loon

export interface OutputResult {
  content: string;
  contentType: string;
  filename: string;
}

export interface ConfigService {
  generate(format: OutputFormat): Promise<string>;
  generateOutput(format: OutputFormat): Promise<OutputResult>;
  getNodes(): Promise<Node[]>;
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

export function createConfigService(repos: Repositories): ConfigService {
  return {
    async getNodes(): Promise<Node[]> {
      return repos.nodes.getAll();
    },

    async generate(format: OutputFormat): Promise<string> {
      const nodes = await repos.nodes.getAll();
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
          // Base64 链接列表（各客户端通用）
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