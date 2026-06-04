const https = require('https');
const http = require('http');
const fs = require('fs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const PUBMED_TOPICS = [
  'resistance training hypertrophy 2026',
  'creatine supplementation athletes 2026',
  'protein intake muscle recovery 2026',
  'HIIT cardiovascular fitness 2026',
  'sleep recovery athletic performance 2026',
  'omega-3 exercise performance 2026',
  'nutrition sports performance 2026',
  'strength training women 2026',
  'intermittent fasting muscle 2026',
  'caffeine exercise performance 2026',
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'NewsGym/1.0' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.content[0].text);
        } catch (e) { reject(new Error('API parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractJSON(text) {
  let s = text.trim();
  s = s.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  s = s.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}


}(title) {
  const t = title.toLowerCase();
  if (t.includes('protein') || t.includes('nutrition') || t.includes('diet') || t.includes('fasting')) return 'Dieta';
  if (t.includes('supplement') || t.includes('creatine') || t.includes('omega') || t.includes('caffeine') || t.includes('beta')) return 'Suplementy';
  if (t.includes('sleep') || t.includes('recovery')) return 'Regeneracja';
  if (t.includes('cardio') || t.includes('hiit') || t.includes('cardiovascular')) return 'Cardio';
  return 'Trening';
}

async function fetchPubMed() {
  const topic = PUBMED_TOPICS[Math.floor(Math.random() * PUBMED_TOPICS.length)];
  console.log('PubMed topic: ' + topic);
  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(topic)}&retmax=5&sort=date&retmode=json`;
    const searchData = JSON.parse(await fetchUrl(url));
    const ids = searchData.esearchresult?.idlist || [];
    const results = [];
    for (const id of ids.slice(0, 3)) {
      try {
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${id}&retmode=json`;
        const summaryData = JSON.parse(await fetchUrl(summaryUrl));
        const art = summaryData.result?.[id];
        if (art?.title) results.push({ title: art.title, source: 'PubMed', date: art.pubdate || new Date().toISOString().split('T')[0] });
      } catch (e) { console.log('PubMed item error: ' + e.message); }
    }
    return results;
  } catch (e) {
    console.log('PubMed error: ' + e.message);
    return [];
  }
}

async function fetchRSS() {
  const feeds = ['https://examine.com/feed/', 'https://www.strongerbyscience.com/feed/'];
  const results = [];
  for (const feed of feeds) {
    try {
      const xml = await fetchUrl(feed);
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, 2)) {
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1];
        if (title) results.push({ title: title.trim(), source: feed.includes('examine') ? 'Examine.com' : 'StrongerByScience', date: new Date().toISOString().split('T')[0] });
      }
    } catch (e) { console.log('RSS error: ' + e.message); }
  }
  return results;
}

async function generateArticle(raw) {
  const prompt = `Napisz artykuł fitness po polsku na podstawie tytułu badania naukowego: "${raw.title}".

Zwróć TYLKO JSON bez żadnego dodatkowego tekstu, bez markdown, bez backticks:
{"title":"[tytuł po polsku max 70 znaków]","excerpt":"[2 zdania po polsku max 150 znaków]","content":"[artykuł 3 akapity po polsku max 350 słów oddzielone \\n\\n]","category":"${function detectCategory(title) {
  const t = title.toLowerCase();
  if (t.includes('protein') || t.includes('nutrition') || t.includes('diet') || t.includes('fasting') || t.includes('żywien') || t.includes('białk') || t.includes('dieta')) return 'Dieta';
  if (t.includes('supplement') || t.includes('creatine') || t.includes('omega') || t.includes('caffeine') || t.includes('beta') || t.includes('witamin') || t.includes('magnez')) return 'Suplementy';
  if (t.includes('sleep') || t.includes('recovery') || t.includes('sen ') || t.includes('regenera')) return 'Regeneracja';
  if (t.includes('cardio') || t.includes('hiit') || t.includes('cardiovascular') || t.includes('ciśnienie') || t.includes('aerob')) return 'Cardio';
  if (t.includes('sarkopen') || t.includes('muscle') || t.includes('strength') || t.includes('hypertro') || t.includes('silown')) return 'Trening';
  return 'Trening';
}(raw.title)}","tags":["tag1","tag2","tag3"],"readTime":"4 min"}`;

  try {
    const text = await callClaude(prompt);
    const article = extractJSON(text);
    if (!article.title || !article.content) throw new Error('Brak wymaganych pól');
    article.id = 'auto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    article.date = raw.date || new Date().toISOString().split('T')[0];
    article.source = raw.source;
    article.generated = true;
    console.log('✅ OK: ' + article.title);
    return article;
  } catch (e) {
    console.log('❌ Błąd: ' + raw.title.substring(0, 50) + ' → ' + e.message);
    return null;
  }
}

async function main() {
  console.log('NEWS GYM Auto-fetch start: ' + new Date().toLocaleString('pl-PL'));

  if (!ANTHROPIC_API_KEY) {
    console.error('Brak ANTHROPIC_API_KEY!');
    process.exit(1);
  }

  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync('auto-articles.json', 'utf8'));
    console.log('Wczytano ' + existing.length + ' istniejących artykułów');
  } catch (e) {
    console.log('Brak istniejących artykułów');
  }

  const pubmed = await fetchPubMed();
  const rss = await fetchRSS();
  const raw = [...pubmed, ...rss];
  console.log('Pobrano ' + raw.length + ' surowych artykułów');

  const newArticles = [];
  for (const item of raw.slice(0, 4)) {
    const article = await generateArticle(item);
    if (article) newArticles.push(article);
    await new Promise(r => setTimeout(r, 1500));
  }

  const all = [...newArticles, ...existing].slice(0, 50);
  const tmp = 'auto-articles.json.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
  fs.renameSync(tmp, 'auto-articles.json');

  console.log('Zapisano ' + all.length + ' artykułów do auto-articles.json');
  console.log('Nowych artykułów: ' + newArticles.length);

  if (newArticles.length === 0) {
    console.error('UWAGA: 0 nowych artykułów!');
    process.exit(1);
  }
}

main().catch(e => { console.error('Krytyczny błąd:', e); process.exit(1); });
