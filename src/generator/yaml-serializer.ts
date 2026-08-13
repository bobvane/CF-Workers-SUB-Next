/**
 * YAML 序列化器
 * 将对象模型序列化为 YAML 文本（避免手写字符串拼接）
 */

import { parse as yamlParse } from 'yaml';
import { stringify } from 'yaml';

/**
 * 将对象模型序列化为 YAML
 */
export function generateYaml(data: Record<string, unknown>): string {
  return stringify(data, {
    indent: 2,
    lineWidth: 0, // 不折行
  });
}

/**
 * 解析 YAML 文本（验证用）
 */
export function parseYaml(yaml: string): unknown {
  return yamlParse(yaml);
}