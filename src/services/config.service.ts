/**
 * 配置输出服务
 * TASK 5.3 - Subscription Endpoint
 * 09_CONFIG_GENERATOR_SPEC.md §11：/sub/mihomo/{token} + /sub/singbox/{token}
 */

import { Node } from '@/models/node';
import { Repositories } from '@/storage/kv';
import { generateMihomoConfig, MihomoTemplate } from '@/generator/mihomo';
import { generateSingboxConfig, SingboxTemplate } from '@/generator/singbox';

export type OutputFormat = 'mihomo' | 'singbox';

export interface OutputResult {
  content: string;
  contentType: string;
  filename: string;
}

export interface ConfigService {
  /**
   * 生成指定格式的配置
   */
  generate(format: OutputFormat): Promise<string>;
  /**
   * 生成带元信息的输出结果
   */
  generateOutput(format: OutputFormat): Promise<OutputResult>;
  /**
   * 获取聚合节点列表（所有订阅）
   */
  getNodes(): Promise<Node[]>;
}

export function createConfigService(repos: Repositories): ConfigService {
  return {
    async getNodes(): Promise<Node[]> {
      return repos.nodes.getAll();
    },

    async generate(format: OutputFormat): Promise<string> {
      const nodes = await repos.nodes.getAll();
      if (format === 'mihomo') {
        return generateMihomoConfig(nodes);
      }
      return generateSingboxConfig(nodes);
    },

    async generateOutput(format: OutputFormat): Promise<OutputResult> {
      const content = await this.generate(format);
      const metadata: Record<OutputFormat, { contentType: string; filename: string }> = {
        mihomo: { contentType: 'text/yaml; charset=utf-8', filename: 'mihomo.yaml' },
        singbox: { contentType: 'application/json; charset=utf-8', filename: 'config.json' },
      };
      return {
        content,
        contentType: metadata[format].contentType,
        filename: metadata[format].filename,
      };
    },
  };
}