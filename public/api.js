/**
 * 前端 API 客户端
 * 统一处理认证、错误、请求配置
 */

const API_BASE = '/api';

async function api(path, options = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const separator = path.includes('?') ? '&' : '?';
  const url = API_BASE + path + (token ? `${separator}token=${token}` : '');

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Request failed');
  }
  return data;
}

async function apiRaw(path) {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const separator = path.includes('?') ? '&' : '?';
  const url = API_BASE + path + (token ? `${separator}token=${token}` : '');

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Request failed');
  return res.text();
}