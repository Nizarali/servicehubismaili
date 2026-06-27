const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

const SEBOT_URL = process.env.SEBOT_API_URL || 'https://sebot.online';
const SERVICE_HUB_URL = 'https://servicehub.usa.ismaili';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ServiceHub Scraper' });
});

app.get('/scrape', async (req, res) => {
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
    
    console.log('Navigating to Service Hub...');
    await page.goto(SERVICE_HUB_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for content to load
    await page.waitForTimeout(5000);

    // Extract all volunteer opportunities
    const opportunities = await page.evaluate(() => {
      const items = [];
      
      // Try different selectors Softr might use
      const cards = document.querySelectorAll('[class*="card"], [class*="list-item"], [class*="record"], .softr-list-item, [data-record-id]');
      
      cards.forEach(card => {
        const title = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]')?.innerText?.trim();
        const description = card.querySelector('p, [class*="description"], [class*="body"]')?.innerText?.trim();
        const location = card.querySelector('[class*="location"], [class*="region"]')?.innerText?.trim();
        const category = card.querySelector('[class*="category"], [class*="tag"], [class*="type"]')?.innerText?.trim();
        const deadline = card.querySelector('[class*="deadline"], [class*="date"]')?.innerText?.trim();
        const contact = card.querySelector('[class*="contact"], [class*="email"]')?.innerText?.trim();
        
        if (title) {
          items.push({ title, description, location, category, deadline, contact });
        }
      });
      
      // If no cards found, try getting all text content
      if (items.length === 0) {
        const allText = document.body.innerText;
        return { raw: allText.substring(0, 5000), items: [] };
      }
      
      return { items, raw: '' };
    });

    await browser.close();
    
    console.log('Scraped:', opportunities);
    res.json({ success: true, data: opportunities, url: SERVICE_HUB_URL });

  } catch (err) {
    if (browser) await browser.close();
    console.error('Scrape error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/scrape/southeast', async (req, res) => {
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
    await page.waitForTimeout(5000);

    // Try to filter by Southeast
    await page.evaluate(() => {
      const filters = document.querySelectorAll('button, select, [class*="filter"]');
      filters.forEach(f => {
        if (f.innerText && f.innerText.toLowerCase().includes('southeast')) {
          f.click();
        }
      });
    });

    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      return {
        html: document.body.innerHTML.substring(0, 10000),
        text: document.body.innerText.substring(0, 5000)
      };
    });

    await browser.close();
    res.json({ success: true, data });

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ServiceHub scraper running on port ${PORT}`));
