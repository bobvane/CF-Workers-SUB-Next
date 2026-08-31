/**
 * IP 地理定位服务（IP 兜底）
 *
 * 用途：节点名无法识别地区时，用节点 server 查 IP 归属地 → 地区（emoji中文名）。
 * 数据源：ip-api.com（免费、无需 key、返回 ISO 3166-1 alpha-2 countryCode）
 * 缓存：KV（settings），TTL 30 天，避免每次生成订阅都重复查询。
 *
 * 注意：ip-api 免费版限 45 次/分钟；未分组节点通常极少（0~5 个），正常无压力。
 * 用户已确认：生成前强制等待 IP 结果（不采用异步+缓存）。
 */

import { countryDisplayName } from '@/data/country-codes';

const IP_GEO_KEY_PREFIX = 'ip_geo:';
const IP_API_URL = 'http://ip-api.com/json/';
/** IP 缓存有效期 30 天（写进缓存值，读取时判断过期） */
const IP_GEO_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

interface IpApiResponse {
  status: 'success' | 'fail';
  countryCode?: string;
}

export interface IpGeoCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * 创建 IP 地理定位 resolver
 * 返回的函数接受节点 server（域名或 IP），返回地区显示名（如 🇭🇰 香港）或 null。
 *
 * @param cache KV 缓存适配器（复用 settings repo 的 KV 能力）
 * @param fetchFn 可注入 fetch（测试用）
 */
export function createIpGeoResolver(
  cache: IpGeoCache,
  fetchFn: typeof fetch = fetch
): (server: string) => Promise<string | null> {
  return async (server: string): Promise<string | null> => {
    if (!server) return null;

    // 1. 查缓存（缓存值格式：`timestamp|displayName`，带过期时间）
    const cacheKey = IP_GEO_KEY_PREFIX + server;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const [ts, name] = cached.split('|');
        if (ts && name) {
          if (Date.now() - Number(ts) < IP_GEO_CACHE_MS) {
            return name === '__NULL__' ? null : name;
          }
        } else {
          // 旧格式（无时间戳），直接当作有效
          return cached === '__NULL__' ? null : cached;
        }
      }
    } catch {
      // 缓存不可用不阻塞，继续查
    }

    // 2. 调 ip-api.com（server 可以是 IP 或域名，ip-api 会解析域名）
    try {
      const res = await fetchFn(`${IP_API_URL}${encodeURIComponent(server)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as IpApiResponse;
      if (data.status !== 'success' || !data.countryCode) return null;

      const display = countryDisplayName(data.countryCode);
      if (!display) return null;

      // 3. 写缓存（带时间戳）
      try {
        await cache.set(cacheKey, `${Date.now()}|${display}`);
      } catch {
        // 缓存写失败不阻塞
      }
      return display;
    } catch {
      return null;
    }
  };
}