const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/lottery.json');
const URL = 'https://sc888.net/index.php?s=/LotteryFtn/index';

async function scrape() {
  console.log(`[${new Date().toISOString()}] 開始抓取...`);
  const res = await axios.get(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data);
  const newRecords = [];
  $('table tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    const periodCell = $(cells[0]).text().trim();
    const numCell = $(cells[1]);
    const periodMatch = periodCell.match(/第\s*(\d+)\s*期/);
    const dateMatch = periodCell.match(/(\d{4}-\d{2}-\d{2})/);
    const weekdayMatch = periodCell.match(/星期([一二三四五六日])/);
    if (!periodMatch || !dateMatch) return;
    const period = parseInt(periodMatch[1]);
    const date = dateMatch[1];
    const weekdayMap = {'日':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6};
    const weekday = weekdayMatch ? (weekdayMap[weekdayMatch[1]] ?? 0) : 0;
    const nums = [];
    numCell.find('strong').each((j, el) => {
      const n = parseInt($(el).text().trim());
      if (!isNaN(n) && n >= 1 && n <= 39) nums.push(n);
    });
    if (nums.length !== 5) return;
    newRecords.push({ period, date, weekday, nums });
  });
  let existing = [];
  if (fs.existsSync(DATA_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
  }
  const allMap = {};
  [...existing, ...newRecords].forEach(r => { allMap[r.period] = r; });
  const final = Object.values(allMap).sort((a,b) => b.period - a.period).slice(0, 100);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(final, null, 2), 'utf8');
  console.log(`✅ 完成，共 ${final.length} 期`);
}
scrape().catch(err => { console.error('❌', err.message); process.exit(1); });
