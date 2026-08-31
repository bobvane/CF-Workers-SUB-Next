import { describe, it, expect } from 'vitest';
import { createIpGeoResolver, IpGeoCache } from '@/services/ip-geo.service';
import { countryDisplayName } from '@/data/country-codes';

/** 内存缓存 adapter + 手动控制 fetch 的测试替身 */
function makeCache(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const cache: IpGeoCache = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v); },
  };
  const dump = () => Object.fromEntries(store);
  return { cache, dump, store };
}

function makeFetch(mock: (url: string) => unknown) {
  return (async (url: string) => ({
    ok: true,
    json: async () => mock(url),
  })) as unknown as typeof fetch;
}

describe('createIpGeoResolver', () => {
  it('returns country display name from ip-api countryCode', async () => {
    const { cache } = makeCache();
    const resolver = createIpGeoResolver(cache, makeFetch(() => ({
      status: 'success', countryCode: 'HK',
    })));
    expect(await resolver('hk.example.com')).toBe(countryDisplayName('HK'));
  });

  it('returns null when ip-api fails', async () => {
    const { cache } = makeCache();
    const resolver = createIpGeoResolver(cache, makeFetch(() => ({
      status: 'fail',
    })));
    expect(await resolver('unknown.example.com')).toBeNull();
  });

  it('returns null when countryCode not in table', async () => {
    const { cache } = makeCache();
    // ZZ 不存在于 COUNTRIES
    const resolver = createIpGeoResolver(cache, makeFetch(() => ({
      status: 'success', countryCode: 'ZZ',
    })));
    expect(await resolver('x.example.com')).toBeNull();
  });

  it('serves from cache and does not call ip-api again', async () => {
    const { cache, dump } = makeCache();
    let calls = 0;
    const fetchMock = makeFetch((_url) => {
      calls++;
      return { status: 'success', countryCode: 'JP' };
    });
    const resolver = createIpGeoResolver(cache, fetchMock);
    const first = await resolver('jp1.example.com');
    const second = await resolver('jp1.example.com');
    expect(first).toBe(countryDisplayName('JP'));
    expect(second).toBe(countryDisplayName('JP'));
    expect(calls).toBe(1); // 第二次走缓存，未再调 API
    // 缓存里应带时间戳
    const stored = dump()['ip_geo:jp1.example.com'] as string;
    expect(stored).toContain('|');
  });

  it('returns null for empty server', async () => {
    const { cache } = makeCache();
    const resolver = createIpGeoResolver(cache, makeFetch(() => ({
      status: 'success', countryCode: 'HK',
    })));
    expect(await resolver('')).toBeNull();
  });
});