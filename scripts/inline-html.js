/**
 * 将 static/index.html 转换为 JS 模块
 * 运行：node scripts/inline-html.js
 * 输出：src/html.js（ES module 导出 HTML 字符串）
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, '..', 'static', 'index.html');
const outputPath = resolve(__dirname, '..', 'src', 'html.js');

try {
  const html = readFileSync(htmlPath, 'utf-8');
  // 转义反引号和 ${} 以安全嵌入模板字符串
  const escaped = html
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  const module = `// 自动生成，请勿手动编辑
// 运行 scripts/inline-html.js 更新
const DEFAULT_HTML = \`${escaped}\`;
export default DEFAULT_HTML;
`;

  writeFileSync(outputPath, module, 'utf-8');
  console.log(`✅ 已生成 src/html.js（${(module.length / 1024).toFixed(1)} KB）`);
} catch (err) {
  if (err.code === 'ENOENT') {
    // 如果 static/index.html 不存在，生成一个占位
    const placeholder = `// 占位：请先创建 static/index.html 再运行此脚本
const DEFAULT_HTML = \`<!DOCTYPE html><html><body><h1>CF-Workers-SUB-Next</h1><p>请先创建 static/index.html</p></body></html>\`;
export default DEFAULT_HTML;
`;
    writeFileSync(outputPath, placeholder, 'utf-8');
    console.log('⚠️  static/index.html 不存在，已生成占位 html.js');
  } else {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  }
}