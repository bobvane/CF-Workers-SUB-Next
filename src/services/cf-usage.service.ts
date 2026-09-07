/**
 * Cloudflare 请求数统计服务（v2.18.0）
 * 借鉴 cmliu/edgetunnel 的 getCloudflareUsage：调 CF GraphQL 取今日（北京时间8点=UTC0点起）请求数。
 *
 * 安全：API Token 只在本服务里使用，前端不接触明文；GET 接口不回传 token。
 */
import { Repositories } from '@/storage/kv';

/** 一个 Cloudflare 账户的统计配置（apiToken 仅存在 KV，不回传前端展示） */
export interface CFUsageAccount {
  id: string;
  name: string;
  accountId: string;
  apiToken: string;
  enabled: boolean;
  sort: number;
}

export interface CFUsageResult {
  accountId: string;
  name: string;
  success: boolean;
  pages: number;
  workers: number;
  total: number;
  max: number;
  error?: string;
}

/** KV 操作统计（v2.26.0）：今日 account-wide 写/读/删/列表次数。复用 CF 账户的 token + Account ID。 */
export interface KVUsageResult {
  success: boolean;
  write: number;
  read: number;
  delete: number;
  list: number;
  writeMax: number;
  error?: string;
}

export const CF_USAGE_KEY = 'cf_usage_accounts';
export const CF_USAGE_MAX = 100000; // CF Workers 免费请求额度
export const CF_USAGE_LIMIT = 3; // 最多 3 个账户
// CF Workers 免费版 KV 写额度：1000 次/天
export const KV_WRITE_MAX = 1000;

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 从 KV 读全部 CF 账户（含明文 token，仅限后端处理时使用） */
export async function getCFAccountsRaw(repos: Repositories): Promise<CFUsageAccount[]> {
  const raw = await repos.settings.get(CF_USAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCFAccounts(repos: Repositories, list: CFUsageAccount[]): Promise<void> {
  await repos.settings.set(CF_USAGE_KEY, JSON.stringify(list));
}

/**
 * 调 CF GraphQL 查询某 account 今日（UTC 0 点起）请求数。
 * @returns 成功时 total = pages+workers，max = CF_USAGE_MAX
 */
export async function fetchCfUsage(
  accountId: string,
  apiToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<Omit<CFUsageResult, 'accountId' | 'name'>> {
  const API = 'https://api.cloudflare.com/client/v4/graphql';
  const now = new Date();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const query = `query getBillingMetrics($AccountID: String!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject) {
    viewer { accounts(filter: {accountTag: $AccountID}) {
      pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: $filter) { sum { requests } }
      workersInvocationsAdaptive(limit: 10000, filter: $filter) { sum { requests } }
    } }
  }`;
  const sumRequests = (a: { sum?: { requests?: number | null } }[] | undefined): number =>
    a?.reduce((t, i) => t + (i?.sum?.requests || 0), 0) || 0;

  const res = await fetchFn(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({
      query,
      variables: {
        AccountID: accountId,
        filter: { datetime_geq: start.toISOString(), datetime_leq: now.toISOString() },
      },
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare 查询失败: ${res.status}`);
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { viewer?: { accounts?: { pagesFunctionsInvocationsAdaptiveGroups?: { sum?: { requests?: number } }[]; workersInvocationsAdaptive?: { sum?: { requests?: number } }[] }[] } };
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const acc = json.data?.viewer?.accounts?.[0];
  if (!acc) throw new Error('未找到账户数据');
  const pages = sumRequests(acc.pagesFunctionsInvocationsAdaptiveGroups);
  const workers = sumRequests(acc.workersInvocationsAdaptive);
  return { success: true, pages, workers, total: pages + workers, max: CF_USAGE_MAX };
}

/**
 * 调 CF GraphQL 查询 account 下今日（UTC 0 点起）KV 操作数。
 * 复用 CF 账户的 token + Account ID（无需新增配置）。
 * 字段 `kvOperationsAdaptiveGroups` 按 actionType 维度聚合。
 * 官方文档：https://developers.cloudflare.com/kv/observability/metrics-analytics
 */
export async function fetchKVUsage(
  accountId: string,
  apiToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<KVUsageResult> {
  const API = 'https://api.cloudflare.com/client/v4/graphql';
  // date 字段是 Date（YYYY-MM-DD），用 today UTC 即可
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const startDate = start.toISOString().slice(0, 10);

  // 不带 namespaceId = account-wide 聚合（v2.26.0：用户实际部署通常一个 namespace）
  const query = `query KvUsage($AccountID: String!, $start: Date) {
    viewer { accounts(filter: {accountTag: $AccountID}) {
      kvOperationsAdaptiveGroups(limit: 100, filter: {date_geq: $start}) {
        sum { requests }
        dimensions { actionType }
      }
    } }
  }`;
  const res = await fetchFn(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiToken },
    body: JSON.stringify({
      query,
      variables: { AccountID: accountId, start: startDate },
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare KV 查询失败: ${res.status}`);
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { viewer?: { accounts?: { kvOperationsAdaptiveGroups?: { sum?: { requests?: number | null } | null; dimensions?: { actionType?: string | null } | null }[] }[] } };
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const acc = json.data?.viewer?.accounts?.[0];
  if (!acc) throw new Error('未找到账户数据');
  // 累加各 actionType 的 sum.requests
  let write = 0, read = 0, del = 0, list = 0;
  for (const g of acc.kvOperationsAdaptiveGroups || []) {
    const n = g?.sum?.requests || 0;
    const a = g?.dimensions?.actionType;
    if (a === 'write') write += n;
    else if (a === 'read') read += n;
    else if (a === 'delete') del += n;
    else if (a === 'list') list += n;
  }
  return { success: true, write, read, delete: del, list, writeMax: KV_WRITE_MAX };
}