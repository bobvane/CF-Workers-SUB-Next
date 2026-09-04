/**
 * 单元测试 - GeoRetry 任务门闩（active 哨兵，v2.25.0）
 * 验证：正常态短路（active=false）、激活、关闭、损坏数据降级、前向兼容旧格式（无 active 字段）
 */
import { describe, it, expect } from 'vitest';
import { MemoryKvAdapter, createRepositories } from '@/storage/kv';
import {
  GEO_PENDING_RETRY_KEY,
  getGeoRetryGate,
  setGeoRetryGate,
  activateGeoRetry,
  deactivateGeoRetry,
} from '@/services/ip-geo.service';

const settings = () => createRepositories(new MemoryKvAdapter()).settings;

describe('GeoRetry Gate (v2.25.0)', () => {
  it('默认状态：active=false（门闩闭合，cron 不跑重试、0 KV 写）', async () => {
    const s = settings();
    const gate = await getGeoRetryGate(s);
    expect(gate.active).toBe(false);
    expect(gate.count).toBe(0);
  });

  it('activateGeoRetry：未识别 IP >0 时拨 active=true 并清零计数', async () => {
    const s = settings();
    // 先设一个进行中的旧状态
    await setGeoRetryGate(s, { ts: 1, count: 5, active: true });
    const activated = await activateGeoRetry(3, s);
    expect(activated).toBe(true);
    const gate = await getGeoRetryGate(s);
    expect(gate.active).toBe(true);
    expect(gate.count).toBe(0); // 激活时清零，重新计次
  });

  it('activateGeoRetry：unlocatedCount=0 时不激活（保持关闭）', async () => {
    const s = settings();
    const activated = await activateGeoRetry(0, s);
    expect(activated).toBe(false);
    const gate = await getGeoRetryGate(s);
    expect(gate.active).toBe(false);
  });

  it('deactivateGeoRetry：全部识别成功后关闭门闩（回到 0 KV 写睡眠态）', async () => {
    const s = settings();
    await setGeoRetryGate(s, { ts: 1, count: 4, active: true });
    await deactivateGeoRetry(s);
    const gate = await getGeoRetryGate(s);
    expect(gate.active).toBe(false);
    expect(gate.count).toBe(0);
  });

  it('前向兼容：旧格式 {ts, count} 无 active 字段时视为 active=false（默认关闭）', async () => {
    const s = settings();
    await s.set(GEO_PENDING_RETRY_KEY, JSON.stringify({ ts: 1700000000000, count: 10 }));
    const gate = await getGeoRetryGate(s);
    expect(gate.active).toBe(false); // 旧部署升级后门闩默认闭合，避免继续白耗 KV
    expect(gate.count).toBe(10);
  });

  it('损坏的 KV 数据降级为默认关闭状态', async () => {
    const kv = new MemoryKvAdapter();
    await kv.put('setting:geo_pending_retry', 'not-json{{{');
    const s = createRepositories(kv).settings;
    const gate = await getGeoRetryGate(s);
    expect(gate.active).toBe(false);
    expect(gate.count).toBe(0);
  });
});