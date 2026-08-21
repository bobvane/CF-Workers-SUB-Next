const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto('http://localhost:8788', { waitUntil: 'networkidle' });
  const pw = process.env.ADMIN;
  await page.fill('#loginPassword', pw);
  await page.click('text=登录');
  await page.waitForTimeout(1400);
  await page.click('text=设置');
  await page.waitForTimeout(1500);

  const before = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.catalog-chip')].map(c => ({
      type: c.dataset.type,
      text: c.textContent.trim(),
      active: c.classList.contains('active'),
      count: c.querySelector('.catalog-chip-count')?.textContent,
    }));
    const items = document.querySelectorAll('.catalog-item').length;
    return { chips, items };
  });
  console.log('BEFORE', JSON.stringify(before, null, 2));

  // 点击「聚合」chip
  await page.evaluate(() => {
    const agg = document.querySelector('.catalog-chip[data-type="aggregate"]');
    if (agg) agg.click();
  });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.catalog-item')];
    const types = [...new Set(items.map(it => it.querySelector('span:nth-child(2)')?.textContent))];
    return {
      items: items.length,
      activeType: document.querySelector('.catalog-chip.active')?.dataset.type,
      types,
      allAggregate: items.every(it => it.querySelector('span:nth-child(3)')?.textContent === 'aggregate'),
    };
  });
  console.log('AFTER', JSON.stringify(after, null, 2));
  await browser.close();
})();