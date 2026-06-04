const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/lottery.json');
const INDEX_FILE = path.join(__dirname, '../index.html');

// 嘗試兩個來源
const URLS = [
  'https://sc888.net/index.php?s=/LotteryFtn/index',
  'http://www.9800.com.tw/lotto539/statistics.html'
];

async function scrapeFrom9800() {
  const res = await axios.get('http://www.9800.com.tw/lotto539/statistics.html', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data);
  const records = [];
  $('table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;
    const periodText = $(cells[0]).text().trim();
    const dateText = $(cells[1]).text().trim();
    const numsText = $(cells[2]).text().trim();
    const periodMatch = periodText.match(/(\d{6})/);
    const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/);
    if (!periodMatch || !dateMatch) return;
    const nums = numsText.split(/\s+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 1 && n <= 39);
    if (nums.length !== 5) return;
    const dt = new Date(dateMatch[1]);
    const weekday = (dt.getDay() === 0) ? 0 : dt.getDay();
    records.push({ period: parseInt(periodMatch[1]), date: dateMatch[1], weekday, nums: nums.sort((a,b)=>a-b) });
  });
  return records;
}

async function scrapeFromSc888() {
  const res = await axios.get('https://sc888.net/index.php?s=/LotteryFtn/index', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data);
  const records = [];
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
    records.push({ period, date, weekday, nums });
  });
  return records;
}

async function scrape() {
  console.log(`[${new Date().toISOString()}] 開始抓取...`);
  let newRecords = [];
  
  try {
    newRecords = await scrapeFrom9800();
    console.log(`9800.com.tw 抓到 ${newRecords.length} 期`);
  } catch(e) {
    console.log(`9800 失敗: ${e.message}，改用 sc888`);
  }
  
  if (newRecords.length === 0) {
    try {
      newRecords = await scrapeFromSc888();
      console.log(`sc888 抓到 ${newRecords.length} 期`);
    } catch(e) {
      console.log(`sc888 也失敗: ${e.message}`);
    }
  }

  let existing = [];
  if (fs.existsSync(DATA_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
  }
  const allMap = {};
  [...existing, ...newRecords].forEach(r => { allMap[r.period] = r; });
  const final = Object.values(allMap).sort((a,b) => b.period - a.period).slice(0, 200);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(final, null, 2), 'utf8');
  console.log(`✅ lottery.json 完成，共 ${final.length} 期，最新：${final[0]?.date} ${final[0]?.nums}`);

  // 重新產生 index.html
  if (fs.existsSync(INDEX_FILE)) {
    let html = fs.readFileSync(INDEX_FILE, 'utf8');
    const newDataStr = 'const RAW_DATA = ' + JSON.stringify(final) + ';';
    html = html.replace(/const RAW_DATA = \[[\s\S]*?\];/, newDataStr);
    fs.writeFileSync(INDEX_FILE, html, 'utf8');
    console.log(`✅ index.html 更新完成`);
  }
}

scrape().catch(err => { console.error('❌', err.message); process.exit(1); });
