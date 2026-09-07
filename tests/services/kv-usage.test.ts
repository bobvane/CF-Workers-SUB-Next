/**
 * 单元测试 - KV 操作统计（v2.26.0，复用 CF 账户 token）
 * 覆盖：fetchKVUsage 解析各 actionType、错误降级、空数据 0
 */
import { describe, it, expect } from 'vitest';
import { fetchKVUsage, KV_WRITE_MAX } from '@/services/cf-usage.service';

const ACCOUNT = 'a1b2c3d4e5f6';
const TOKEN = 'test-token-123';

function mockGraphQL(groups: Array<{ sum: { requests: number }; dimensions: { actionType: string } } | null>) {
  return async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    expect(body.variables.AccountID).toBe(ACCOUNT);
    expect(body.variables.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    return new Response(
      JSON.stringify({ data: { viewer: { accounts: [{ kvOperationsAdaptiveGroups: groups }] } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };
}

describe('fetchKVUsage', () => {
  it('正确解析 4 种 actionType 累加各自分组', async () => {
    const fetchFn = mockGraphQL([
      { sum: { requests: 850 }, dimensions: { actionType: 'write' } },
      { sum: { requests: 12000 }, dimensions: { actionType: 'read' } },
      { sum: { requests: 30 }, dimensions: { actionType: 'delete' } },
      { sum: { requests: 8 }, dimensions: { actionType: 'list' } },
    ]);
    const r = await fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch);
    expect(r.success).toBe(true);
    expect(r.write).toBe(850);
    expect(r.read).toBe(12000);
    expect(r.delete).toBe(30);
    expect(r.list).toBe(8);
    expect(r.writeMax).toBe(KV_WRITE_MAX);
    expect(r.writeMax).toBe(1000);
  });

  it('空数据 → 全 0，success=true（dashboard 正常显示）', async () => {
    const fetchFn = mockGraphQL([]);
    const r = await fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch);
    expect(r.success).toBe(true);
    expect(r.write).toBe(0);
    expect(r.read).toBe(0);
    expect(r.delete).toBe(0);
    expect(r.list).toBe(0);
  });

  it('缺失字段 (sum=null / dimensions=null) 不抛错，降级累加为 0', async () => {
    const fetchFn = mockGraphQL([null as unknown as never, { sum: { requests: 5 }, dimensions: { actionType: 'write' } }]);
    const r = await fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch);
    expect(r.write).toBe(5);
  });

  it('HTTP 错误抛异常（路由层 catch 降级）', async () => {
    const fetchFn = async () => new Response('error', { status: 500 });
    await expect(fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch)).rejects.toThrow(/Cloudflare KV 查询失败/);
  });

  it('GraphQL errors 抛首个错误信息', async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ errors: [{ message: 'invalid token' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await expect(fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch)).rejects.toThrow(/invalid token/);
  });

  it('无账户数据 (accounts=[]) 抛「未找到账户数据」', async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ data: { viewer: { accounts: [] } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await expect(fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch)).rejects.toThrow(/未找到账户数据/);
  });

  it('未知 actionType 静默忽略（不抛错，统计 = 0）', async () => {
    const fetchFn = mockGraphQL([{ sum: { requests: 999 }, dimensions: { actionType: 'unknown_action' } }]);
    const r = await fetchKVUsage(ACCOUNT, TOKEN, fetchFn as unknown as typeof fetch);
    expect(r.write).toBe(0);
    expect(r.read).toBe(0);
    expect(r.delete).toBe(0);
    expect(r.list).toBe(0);
  });
});