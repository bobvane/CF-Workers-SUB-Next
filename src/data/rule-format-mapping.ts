/**
 * 规则格式映射表
 * 将内部规则 ID 映射到各客户端格式所需的规则源 URL
 *
 * 数据源：
 * - Sing-box：MetaCubeX/meta-rules-dat (sing 分支)
 *   https://github.com/MetaCubeX/meta-rules-dat
 * - Mihomo：MetaCubeX/meta-rules-dat (meta 分支，已由 rule-providers.ts 处理)
 */

/** MetaCubeX sing-box 规则 CDN 基础 URL（sing 分支 .srs 格式） */
export const METACUBEX_SING_BASE = 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite';

/**
 * 获取 MetaCubeX sing-box 规则 URL（.srs 格式）
 */
export function metacubexSrsUrl(geositeName: string): string {
  return `${METACUBEX_SING_BASE}/${geositeName.toLowerCase()}.srs`;
}

/**
 * 获取 MetaCubeX sing-box 规则 URL（.json 格式，兜底）
 */
export function metacubexJsonUrl(geositeName: string): string {
  return `${METACUBEX_SING_BASE}/${geositeName.toLowerCase()}.json`;
}