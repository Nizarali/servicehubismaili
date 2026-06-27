const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

const SERVICE_HUB_URL = 'https://servicehub.usa.ismaili';
let scrapeResults = null;
let scrapeStatus = 'idle';
let scrapeTime = null;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ServiceHub Scraper', scrapeStatus, scrapeTime });
});

// Start scrape in background
app.get('/scrape/start', async (req, res) => {
  if (scrapeStatus === 'running') {
    return res.json({ status: 'already running' });
  }
  scrapeStatus = 'running';
  scrapeResults = null;
  res.json({ status: 'started', message: 'Check /scrape/results in 60 seconds' });

  // Run in background
  const region = req.query.region || 'Southeast';
  runScrape(region);
});

// Check results
app.get('/scrape/results', (req, res) => {
  res.json({ status: scrapeStatus, time: scrapeTime, count: scrapeResults ? scrapeResults.length : 0, data: scrapeResults });
});

async function runScrape(region) {
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
    await new Promise(r => setTimeout(r, 8000));

    const opportunities = await page.evaluate((filterRegion) => {
      const seen = new Set();
      const items = [];
      const cards = document.querySelectorAll('[class*="card"], [class*="list-item"], [class*="record"], .softr-list-item, [data-record-id]');

      cards.forEach(card => {
        const title = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]')?.innerText?.trim();
        if (!title || seen.has(title)) return;
        seen.add(title);

        const parts = title.split('|');
        const regionFromTitle = parts.length > 2 ? parts[parts.length - 1].trim() : '';
        const cleanTitle = parts[0].trim();
        const institution = parts.length > 1 ? parts[1].trim() : '';

        if (filterRegion && !regionFromTitle.toLowerCase().includes(filterRegion.toLowerCase()) && !regionFromTitle.toLowerCase().includes('global')) return;

        items.push({
          title: cleanTitle,
          institution,
          region: regionFromTitle,
          description: card.querySelector('p, [class*="description"]')?.innerText?.trim() || '',
          category: card.querySelector('[class*="category"], [class*="tag"]')?.innerText?.trim() || '',
          deadline: card.querySelector('[class*="deadline"], [class*="date"]')?.innerText?.trim() || '',
          contact: card.querySelector('a[href*="mailto"]')?.href?.replace('mailto:', '') || '',
          link: card.querySelector('a')?.href || ''
        });
      });
      return items;
    }, region);

    await browser.close();
    scrapeResults = opportunities;
    scrapeStatus = 'done';
    scrapeTime = new Date().toISOString();
    console.log('Scrape done:', opportunities.length, 'items');
  } catch (err) {
    if (browser) await browser.close();
    scrapeStatus = 'error';
    console.error('Scrape error:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ServiceHub scraper running on port ${PORT}`));
