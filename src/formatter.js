/**
 * 多格式输出生成器
 * 支持：Clash / Base64 / Sing-box / Surge / Loon
 */

import { nodeToClashProxy } from './parser.js';

// ── 主入口 ──

/**
 * 根据格式生成输出
 * @param {Array<object>} nodes - 节点对象数组
 * @param {string} format - 输出格式 (clash/base64/singbox/surge/loon/auto)
 * @param {object} options - 额外选项 { rules, linkReplace, subscriptionUrls }
 * @returns {string}
 */
export function generateOutput(nodes, format = 'auto', options = {}) {
  switch (format) {
    case 'clash':
      return generateClash(nodes, options);
    case 'base64':
      return generateBase64(nodes);
    case 'singbox':
      return generateSingBox(nodes);
    case 'surge':
      return generateSurge(nodes);
    case 'loon':
      return generateLoon(nodes);
    case 'auto':
    default:
      return generateClash(nodes, options);
  }
}

// ── Clash YAML 格式 ──

function generateClash(nodes, options) {
  const proxies = nodes.map(n => nodeToClashProxy(n)).filter(Boolean);

  let yaml = `# CF-Workers-SUB-Next 自动生成
# 节点数: ${proxies.length}
# 生成时间: ${new Date().toISOString()}
# ---

port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info

proxies:
`;

  for (const p of proxies) {
    yaml += `  - name: "${p.name}"
    type: ${p.type}
    server: ${p.server}
    port: ${p.port}
`;
    // 协议特有字段
    switch (p.type) {
      case 'vmess':
        yaml += `    uuid: ${p.uuid}
    alterId: ${p.alterId}
    cipher: ${p.cipher}
    tls: ${p.tls || false}
    network: ${p.network || 'tcp'}
`;
        if (p.network === 'ws') {
          yaml += `    ws-opts:
      path: ${p['ws-opts']?.path || '/'}
`;
          if (p['ws-opts']?.headers?.Host) {
            yaml += `      headers:
        Host: ${p['ws-opts'].headers.Host}
`;
          }
        }
        if (p.servername) yaml += `    servername: ${p.servername}\n`;
        break;
      case 'vless':
        yaml += `    uuid: ${p.uuid}
    tls: ${p.tls || false}
    network: ${p.network || 'tcp'}
    flow: ${p.flow || ''}
`;
        if (p.network === 'ws') {
          yaml += `    ws-opts:
      path: ${p['ws-opts']?.path || '/'}
`;
        }
        if (p.servername) yaml += `    servername: ${p.servername}\n`;
        break;
      case 'trojan':
        yaml += `    password: ${p.password}
    sni: ${p.sni || p.server}
`;
        break;
      case 'ss':
        yaml += `    cipher: ${p.cipher}
    password: ${p.password}
`;
        if (p.plugin) yaml += `    plugin: ${p.plugin}\n`;
        break;
      case 'ssr':
        yaml += `    cipher: ${p.cipher}
    password: ${p.password}
    protocol: ${p.protocol}
    obfs: ${p.obfs}
    protocol-param: "${p['protocol-param'] || ''}"
    obfs-param: "${p['obfs-param'] || ''}"
`;
        break;
      case 'hysteria2':
        yaml += `    password: ${p.password}
    sni: ${p.sni || p.server}
    skip-cert-verify: ${p['skip-cert-verify'] || false}
`;
        if (p.obfs) yaml += `    obfs: ${p.obfs}\n    obfs-password: ${p['obfs-password'] || ''}\n`;
        break;
      case 'hysteria':
        yaml += `    auth-str: ${p['auth-str']}
    protocol: ${p.protocol || 'udp'}
    up-speed: ${p['up-speed'] || 100}
    down-speed: ${p['down-speed'] || 100}
    sni: ${p.sni || p.server}
    skip-cert-verify: ${p['skip-cert-verify'] || false}
    alpn: [${p.alpn ? p.alpn.join(', ') : 'h3'}]
`;
        break;
      case 'tuic':
        yaml += `    token: ${p.token}
    congestion-controller: ${p['congestion-controller'] || 'bbr'}
    udp-relay-mode: ${p['udp-relay-mode'] || 'native'}
    sni: ${p.sni || p.server}
    alpn: [${p.alpn ? p.alpn.join(', ') : 'h3'}]
`;
        break;
    }
  }

  // 代理组（如果有规则配置）
  if (options.rules && options.rules.length > 0) {
    // 规则提供者
    yaml += `\n# 规则集
rule-providers:
`;
    for (const r of options.rules) {
      if (r.url) {
        yaml += `  ${r.id}:
    type: http
    behavior: classical
    url: "${r.url}"
    interval: 86400
    path: ./rules/${r.id}.yaml
`;
      }
    }
    yaml += `\nproxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ♻️ 自动选择
      - DIRECT
`;
    for (const p of proxies) {
      yaml += `      - ${p.name}\n`;
    }
    yaml += `
  - name: ♻️ 自动选择
    type: url-test
    url: https://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
`;
    for (const p of proxies) {
      yaml += `    proxies:\n      - ${p.name}\n`;
      break; // 只加一个示例
    }
    yaml += `  - name: 🎯 全球直连
    type: select
    proxies:
      - DIRECT
  - name: 🛑 全球拦截
    type: select
    proxies:
      - REJECT
  - name: 🐟 漏网之鱼
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择

rules:
rules:
`;
    for (const rule of options.rules) {
      yaml += `  - ${rule.name}\n`;
    }
    yaml += `  - GEOIP,CN,🎯 全球直连
  - MATCH,🐟 漏网之鱼
`;
  }

  return yaml;
}

// ── Base64 格式 ──

function generateBase64(nodes) {
  // 生成 Shadowsocks/ShadowsocksR 标准的 Base64 节点列表
  const lines = nodes.map(n => {
    switch (n.protocol) {
      case 'ss': {
        const str = `${n.method}:${n.password}@${n.server}:${n.port}`;
        return `ss://${btoa(str)}#${encodeURIComponent(n.name)}`;
      }
      case 'ssr': {
        const pwd = btoa(n.password);
        const str = `${n.server}:${n.port}:${n.protocol}:${n.method}:${n.obfs}:${pwd}`;
        return `ssr://${btoa(str)}#${encodeURIComponent(n.name)}`;
      }
      case 'vmess': {
        const json = {
          v: '2', ps: n.name, add: n.server, port: n.port,
          id: n.uuid, aid: n.aid || 0, scy: n.security || 'auto',
          net: n.network || 'tcp', type: 'none', tls: n.tls ? 'tls' : '',
          path: n.path || '', host: n.host || '',
        };
        return `vmess://${btoa(JSON.stringify(json))}`;
      }
      case 'vless':
      case 'trojan':
      case 'hysteria2':
      case 'hysteria':
      case 'tuic':
        // 这些协议标准 Base64 订阅不支持，跳过
        return null;
      default:
        return null;
    }
  }).filter(Boolean);

  return btoa(lines.join('\n'));
}

// ── Sing-box 格式 ──

function generateSingBox(nodes) {
  const outbounds = nodes.map(n => {
    const base = {
      tag: n.name,
      server: n.server,
      server_port: n.port,
    };

    switch (n.protocol) {
      case 'vmess':
        return {
          type: 'vmess',
          ...base,
          uuid: n.uuid,
          security: n.security || 'auto',
          alter_id: n.aid || 0,
          tls: n.tls ? { enabled: true, server_name: n.sni || n.server } : undefined,
          transport: n.network === 'ws' ? {
            type: 'ws',
            path: n.path || '/',
            headers: n.host ? { Host: n.host } : undefined,
          } : undefined,
        };
      case 'vless':
        return {
          type: 'vless',
          ...base,
          uuid: n.uuid,
          flow: n.flow || '',
          tls: n.tls ? { enabled: true, server_name: n.sni || n.server } : undefined,
          transport: n.network === 'ws' ? {
            type: 'ws',
            path: n.path || '/',
          } : undefined,
        };
      case 'trojan':
        return {
          type: 'trojan',
          ...base,
          password: n.password,
          tls: { enabled: true, server_name: n.sni || n.server },
        };
      case 'ss':
        return {
          type: 'shadowsocks',
          ...base,
          method: n.method,
          password: n.password,
        };
      case 'hysteria2':
        return {
          type: 'hysteria2',
          ...base,
          password: n.password,
          tls: { enabled: true, server_name: n.sni || n.server },
        };
      case 'tuic':
        return {
          type: 'tuic',
          ...base,
          token: n.token,
          tls: { enabled: true, server_name: n.sni || n.server },
        };
      default:
        return null;
    }
  }).filter(Boolean);

  return JSON.stringify({
    version: 2,
    log: { level: 'info' },
    outbounds: [
      ...outbounds,
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' },
      {
        type: 'selector',
        tag: 'proxy',
        outbounds: outbounds.map(o => o.tag),
      },
    ],
    route: {
      rules: [
        { protocol: 'dns', outbound: 'dns' },
        { geoip: 'cn', outbound: 'direct' },
        { geosite: 'cn', outbound: 'direct' },
      ],
      final: 'proxy',
      auto_detect_interface: true,
    },
  }, null, 2);
}

// ── Surge 格式 ──

function generateSurge(nodes) {
  let output = `# CF-Workers-SUB-Next · Surge 配置
# 节点数: ${nodes.length}
# 生成时间: ${new Date().toISOString()}

[General]
loglevel = notify
skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local
dns-server = 223.5.5.5, 114.114.114.114

[Proxy]
`;

  for (const n of nodes) {
    let line = `${n.name} = `;
    switch (n.protocol) {
      case 'vmess':
        line += `vmess, ${n.server}, ${n.port}, username=${n.uuid}, tls=${n.tls ? 'true' : 'false'}`;
        if (n.network === 'ws') line += `, ws=true, ws-path=${n.path || '/'}`;
        break;
      case 'trojan':
        line += `trojan, ${n.server}, ${n.port}, password=${n.password}, tls=true`;
        break;
      case 'ss':
        line += `ss, ${n.server}, ${n.port}, encrypt-method=${n.method}, password=${n.password}`;
        break;
      case 'vless':
        // Surge 不原生支持 vless，跳过
        continue;
      default:
        continue;
    }
    output += line + '\n';
  }

  output += `
[Proxy Group]
Proxy = select, auto, ${nodes.filter(n => ['vmess','trojan','ss'].includes(n.protocol)).map(n => n.name).join(', ')}
auto = url-test, ${nodes.filter(n => ['vmess','trojan','ss'].includes(n.protocol)).map(n => n.name).join(', ')}, url=http://www.gstatic.com/generate_204, interval=600

[Rule]
RULE-SET,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ChinaDomain.yaml, DIRECT
RULE-SET,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/LocalAreaNetwork.yaml, DIRECT
GEOIP,CN,DIRECT
FINAL,Proxy
`;

  return output;
}

// ── Loon 格式 ──

function generateLoon(nodes) {
  let output = `# CF-Workers-SUB-Next · Loon 配置
# 节点数: ${nodes.length}
# 生成时间: ${new Date().toISOString()}

[General]
skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local
dns-server = 223.5.5.5, 114.114.114.114
allow-conn = true

[Proxy]
`;

  for (const n of nodes) {
    let line = `${n.name} = `;
    switch (n.protocol) {
      case 'vmess':
        line += `vmess, ${n.server}, ${n.port}, username=${n.uuid}, tls=${n.tls ? 'true' : 'false'}`;
        if (n.network === 'ws') line += `, ws=true, ws-path=${n.path || '/'}`;
        break;
      case 'trojan':
        line += `trojan, ${n.server}, ${n.port}, password=${n.password}, tls=true`;
        break;
      case 'ss':
        line += `shadowsocks, ${n.server}, ${n.port}, encrypt-method=${n.method}, password=${n.password}`;
        break;
      default:
        continue;
    }
    output += line + '\n';
  }

  output += `
[Proxy Group]
Proxy = select, auto, ${nodes.filter(n => ['vmess','trojan','ss'].includes(n.protocol)).map(n => n.name).join(', ')}
auto = url-test, ${nodes.filter(n => ['vmess','trojan','ss'].includes(n.protocol)).map(n => n.name).join(', ')}, url=http://www.gstatic.com/generate_204, interval=600

[Rule]
DOMAIN-SUFFIX,cn,DIRECT
IP-CIDR,192.168.0.0/16,DIRECT
IP-CIDR,10.0.0.0/8,DIRECT
IP-CIDR,172.16.0.0/12,DIRECT
GEOIP,CN,DIRECT
FINAL,Proxy
`;

  return output;
}