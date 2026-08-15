/**
 * 测试 - 项目元信息与升级检测 API
 */
import { describe, it, expect } from 'vitest';
import { isNewerVersion } from '@/meta';

describe('isNewerVersion（语义化版本比较）', () => {
  it('检测出新版本', () => {
    expect(isNewerVersion('1.1.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
  });

  it('检测出不是新版本（相等或更旧）', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '1.0.0')).toBe(false);
  });

  it('容忍数字前缀 v', () => {
    // 注意：调用方负责去掉 v 前缀；此函数只比较纯数字段
    expect(isNewerVersion('1.0.1', '1.0')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.1')).toBe(false);
  });

  it('非数字段降级为 0', () => {
    expect(isNewerVersion('abc', '0.1.0')).toBe(false);
  });
});