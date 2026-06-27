const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

const SERVICE_HUB_URL = 'https://servicehub.usa.ismaili';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ServiceHub Scraper' });
});

app.get('/scrape', async (req, res) => {
  const region = req.query.region || '';
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(SERVICE_HUB_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 6000));

    const opportunities = await page.evaluate((filterRegion) => {
      const seen = new Set();
      const items = [];

      const cards = document.querySelectorAll('[class*="card"], [class*="list-item"], [class*="record"], .softr-list-item, [data-record-id]');

      cards.forEach(card => {
        const title = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]')?.innerText?.trim();
        if (!title || seen.has(title)) return;
        seen.add(title);

        const description = card.querySelector('p, [class*="description"], [class*="body"]')?.innerText?.trim();
        const location = card.querySelector('[class*="location"], [class*="region"]')?.innerText?.trim();
        const category = card.querySelector('[class*="category"], [class*="tag"], [class*="type"]')?.innerText?.trim();
        const deadline = card.querySelector('[class*="deadline"], [class*="date"]')?.innerText?.trim();
        const contact = card.querySelector('[class*="contact"], [class*="email"], a[href*="mailto"]')?.innerText?.trim();
        const link = card.querySelector('a')?.href;

        // Extract region from title (format: "Title | Institution | Region")
        const parts = title.split('|');
        const regionFromTitle = parts.length > 2 ? parts[parts.length - 1].trim() : '';
        const institutionFromTitle = parts.length > 1 ? parts[1].trim() : '';
        const cleanTitle = parts[0].trim();

        // Filter by region if specified
        if (filterRegion && !regionFromTitle.toLowerCase().includes(filterRegion.toLowerCase()) && !regionFromTitle.toLowerCase().includes('global')) {
          return;
        }

        items.push({
          title: cleanTitle,
          institution: institutionFromTitle,
          region: regionFromTitle || location || '',
          description: description || '',
          category: category || '',
          deadline: deadline || '',
          contact: contact || '',
          link: link || ''
        });
      });

      return items;
    }, region);

    await browser.close();
    res.json({ success: true, count: opportunities.length, region: region || 'all', data: opportunities });

  } catch (err) {
    if (browser) await browser.close();
    console.error('Scrape error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ServiceHub scraper running on port ${PORT}`));
