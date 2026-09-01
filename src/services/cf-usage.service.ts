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

export const CF_USAGE_KEY = 'cf_usage_accounts';
export const CF_USAGE_MAX = 100000; // CF Workers 免费额度
export const CF_USAGE_LIMIT = 3; // 最多 3 个账户

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