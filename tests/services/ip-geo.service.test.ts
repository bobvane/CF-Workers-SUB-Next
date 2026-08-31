import { describe, it, expect, beforeEach } from 'vitest';
import {
  createIpGeoResolver,
  IpGeoCache,
  __resetIpGeoStateForTests,
  __getIpGeoPendingCount,
} from '@/services/ip-geo.service';
import { countryDisplayName } from '@/data/country-codes';

/** 内存缓存 adapter + 手动控制 fetch 的测试替身 */
function makeCache(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const cache: IpGeoCache = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v); },
  };
  return { cache, store };
}

/** Batch fetch mock：根据请求 body 返回对应 IP 数组的结果 */
function makeBatchFetch(perIpResult: (ip: string) => unknown) {
  const calls: { body: string }[] = [];
  const fetchMock = (async (_url: string, init?: RequestInit) => {
    const body = String(init?.body ?? '');
    calls.push({ body });
    const ips = JSON.parse(body) as { query: string }[];
    return {
      ok: true,
      json: async () => ips.map((item) => perIpResult(item.query)),
    };
  }) as unknown as typeof fetch;
  return { fetchMock, calls };
}

describe('createIpGeoResolver (v2.11.9 Batch mode)', () => {
  beforeEach(() => {
    __resetIpGeoStateForTests();
  });

  it('skips non-IPv4 hosts (domain/IPv6) and returns null', async () => {
    const { cache } = makeCache();
    const { fetchMock, calls } = makeBatchFetch(() => ({ status: 'success', countryCode: 'HK' }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('hk.example.com')).toBeNull();
    expect(await resolver('::1')).toBeNull();
    expect(calls.length).toBe(0); // 不发起网络请求
  });

  it('returns country display name from Batch API for pure IPv4', async () => {
    const { cache } = makeCache();
    const { fetchMock, calls } = makeBatchFetch(() => ({ status: 'success', countryCode: 'HK' }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    const result = await resolver('1.2.3.4');
    expect(result).toBe(countryDisplayName('HK'));
    // Batch POST 一次，body 含目标 IP
    expect(calls.length).toBe(1);
    expect(calls[0]!.body).toContain('1.2.3.4');
  });

  it('aggregates multiple IPs in same tick into one Batch call', async () => {
    const { cache } = makeCache();
    const { fetchMock, calls } = makeBatchFetch((ip) => ({
      status: 'success',
      countryCode: ip.startsWith('1.') ? 'HK' : 'JP',
    }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    // 同一 tick 内 3 个不同 IP — 应合并为一次 Batch POST
    const [r1, r2, r3] = await Promise.all([
      resolver('1.1.1.1'),
      resolver('2.2.2.2'),
      resolver('3.3.3.3'),
    ]);
    expect(r1).toBe(countryDisplayName('HK'));
    expect(r2).toBe(countryDisplayName('JP'));
    expect(r3).toBe(countryDisplayName('JP'));
    // 一次 Batch 调用
    expect(calls.length).toBe(1);
    const ips = JSON.parse(calls[0]!.body) as { query: string }[];
    expect(ips.map((i) => i.query).sort()).toEqual(['1.1.1.1', '2.2.2.2', '3.3.3.3']);
  });

  it('serves second call from L1 cache without re-fetching', async () => {
    const { cache } = makeCache();
    let calls = 0;
    const fetchMock = (async (_url: string, init?: RequestInit) => {
      calls++;
      const ips = JSON.parse(String(init?.body ?? '')) as { query: string }[];
      return {
        ok: true,
        json: async () => ips.map(() => ({ status: 'success', countryCode: 'JP' })),
      };
    }) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('1.2.3.4')).toBe(countryDisplayName('JP'));
    expect(await resolver('1.2.3.4')).toBe(countryDisplayName('JP'));
    expect(calls).toBe(1); // 第二次走 L1
  });

  it('serves from KV cache and writes L1', async () => {
    // 预置 KV 缓存（带时间戳、未过期）
    const validTs = String(Date.now() - 1000); // 1s 前
    const { cache } = makeCache({
      'ip_geo:1.2.3.4': `${validTs}|${countryDisplayName('HK')}`,
    });
    let calls = 0;
    const fetchMock = (async () => {
      calls++;
      return { ok: true, json: async () => [] };
    }) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    const result = await resolver('1.2.3.4');
    expect(result).toBe(countryDisplayName('HK'));
    expect(calls).toBe(0); // KV 命中不发请求
  });

  it('treats expired KV cache as miss', async () => {
    const expiredTs = String(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30d 前，超 7d TTL
    const { cache } = makeCache({
      'ip_geo:1.2.3.4': `${expiredTs}|${countryDisplayName('HK')}`,
    });
    const { fetchMock, calls } = makeBatchFetch(() => ({ status: 'success', countryCode: 'HK' }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    const result = await resolver('1.2.3.4');
    expect(result).toBe(countryDisplayName('HK'));
    expect(calls.length).toBe(1);
  });

  it('returns null when ip-api status:fail (fail-open for name weighted scoring)', async () => {
    const { cache } = makeCache();
    const { fetchMock } = makeBatchFetch(() => ({ status: 'fail', message: 'private range' }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('10.0.0.1')).toBeNull();
  });

  it('returns null when countryCode is not in COUNTRIES table', async () => {
    const { cache } = makeCache();
    const { fetchMock } = makeBatchFetch(() => ({ status: 'success', countryCode: 'XX' }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('1.2.3.4')).toBeNull();
  });

  it('returns null when fetch network errors (fail-open)', async () => {
    const { cache } = makeCache();
    const fetchMock = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('1.2.3.4')).toBeNull();
  });

  it('returns null when fetch returns non-ok', async () => {
    const { cache } = makeCache();
    const fetchMock = (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('1.2.3.4')).toBeNull();
  });

  it('returns null for empty server', async () => {
    const { cache } = makeCache();
    const { fetchMock } = makeBatchFetch(() => ({ status: 'success', countryCode: 'HK' }));
    const resolver = createIpGeoResolver(cache, fetchMock);
    expect(await resolver('')).toBeNull();
  });

  it('single-flight: concurrent calls to same IP share one result', async () => {
    const { cache } = makeCache();
    let calls = 0;
    const fetchMock = (async (_url: string, init?: RequestInit) => {
      calls++;
      const ips = JSON.parse(String(init?.body ?? '')) as { query: string }[];
      return {
        ok: true,
        json: async () => ips.map(() => ({ status: 'success', countryCode: 'JP' })),
      };
    }) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    // 5 个并发同 IP
    const results = await Promise.all([
      resolver('1.2.3.4'),
      resolver('1.2.3.4'),
      resolver('1.2.3.4'),
      resolver('1.2.3.4'),
      resolver('1.2.3.4'),
    ]);
    expect(results.every((r) => r === countryDisplayName('JP'))).toBe(true);
    expect(calls).toBe(1); // 只发一次 Batch
  });

  it('rate limit: when ≥15 batches in 60s, subsequent calls return null (fail-open)', async () => {
    const { cache } = makeCache();
    let callCount = 0;
    const fetchMock = (async (_url: string, init?: RequestInit) => {
      callCount++;
      const ips = JSON.parse(String(init?.body ?? '')) as { query: string }[];
      return {
        ok: true,
        json: async () => ips.map((i) => ({
          status: 'success' as const,
          countryCode: 'JP',
          query: i.query,
        })),
      };
    }) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    // 触发 15 个不同 IP 各自 flush（每个 IP 单独一批，跨 16 个 microtask）
    for (let i = 0; i < 16; i++) {
      await resolver(`1.1.1.${i + 1}`);
    }
    // 第 16 个 IP 应被限流，返回 null
    expect(callCount).toBe(15);
    // 再触发一个，应走 null（信号灯限流）
    const extra = await resolver('2.2.2.2');
    expect(extra).toBeNull();
  });

  it('pending count reflects in-flight tasks', async () => {
    const { cache } = makeCache();
    // 写一个永不 resolve 的 fetch 来让任务卡在 pending
    const fetchMock = (async () => new Promise(() => {})) as unknown as typeof fetch;
    const resolver = createIpGeoResolver(cache, fetchMock);
    // 不 await — 触发入队
    resolver('1.2.3.4').catch(() => {});
    resolver('2.3.4.5').catch(() => {});
    // 等下一个 microtask
    await new Promise((r) => setTimeout(r, 1));
    // pending 应该被消费（flush 已起），但 flush 卡住
    // 测试目的：证明 batch 确实被消费（_getIpGeoPendingCount 行为可观察）
    expect(__getIpGeoPendingCount()).toBe(0);
  });
});
