// fetch-articles.js
// Pobiera artykuły z PubMed i RSS, tłumaczy przez Claude AI
// Zapisuje do auto-articles.json w repo (czytanego przez aplikację)

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const UNSPLASH_KEY = 'a0UmrunrDS1E9U_LacY7PBGTgVL6KikHzeCC-Q77oMc';

const PUBMED_TOPICS = [
  'resistance training hypertrophy 2026',
  'creatine supplementation athletes 2026',
  'protein intake muscle recovery 2026',
  'HIIT cardiovascular fitness 2026',
  'sleep recovery athletic performance 2026',
  'omega-3 exercise performance 2026',
  'periodization strength training 2026',
  'nutrition sports performance 2026',
  'strength training women 2026',
  'intermittent fasting muscle 2026',
  'caffeine exercise performance 2026',
  'beta-alanine endurance 2026',
];

const RSS_FEEDS = [
  'https://examine.com/feed/',
  'https://www.strongerbyscience.com/feed/',
];

const TOPIC_TO_CAT = {
  'resistance training': 'sila', 'hypertrophy': 'sila', 'strength': 'sila',
  'creatine': 'supl', 'supplement': 'supl', 'beta-alanine': 'supl', 'caffeine': 'supl', 'omega': 'supl',
  'protein': 'dieta', 'nutrition': 'dieta', 'intermittent fasting': 'dieta',
  'HIIT': 'cardio', 'cardiovascular': 'cardio',
  'sleep': 'lifestyle', 'recovery': 'lifestyle',
  'periodization': 'trening', 'training': 'trening', 'women': 'trening',
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
      timeout: 30000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchPubMed(topic) {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(topic)}&retmax=3&sort=date&retmode=json&datetype=pdat&reldate=365`;
    const searchRes = await fetchUrl(searchUrl);
    const searchData = JSON.parse(searchRes.body);
    const ids = searchData.esearchresult?.idlist || [];
    if (!ids.length) return [];
    const fetchRes = await fetchUrl(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`);
    const xml = fetchRes.body;
    const articles = [];
    const titles = [...xml.matchAll(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    const abstracts = [...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    const pmids = [...xml.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g)].map(m => m[1]);
    for (let i = 0; i < Math.min(titles.length, 2); i++) {
      if (titles[i] && abstracts[i] && abstracts[i].length > 100) {
        articles.push({ title: titles[i], abstract: abstracts[i].substring(0, 1500), pmid: pmids[i] || '', topic, source: 'pubmed' });
      }
    }
    return articles;
  } catch (e) { return []; }
}

async function fetchRSS(feedUrl) {
  try {
    const res = await fetchUrl(feedUrl);
    const xml = res.body;
    const articles = [];
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const item = match[1];
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
      const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/);
      const title = (titleMatch?.[1] || titleMatch?.[2] || '').replace(/<[^>]+>/g, '').trim();
      const desc = (descMatch?.[1] || descMatch?.[2] || '').replace(/<[^>]+>/g, '').trim();
      if (title && desc && desc.length > 100) {
        articles.push({ title, abstract: desc.substring(0, 1500), source: 'rss', feedUrl });
        if (articles.length >= 2) break;
      }
    }
    return articles;
  } catch (e) { return []; }
}

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [keyword, cat] of Object.entries(TOPIC_TO_CAT)) {
    if (lower.includes(keyword.toLowerCase())) return cat;
  }
  return 'trening';
}

async function generateArticle(raw) {
  const cat = raw.topic ? detectCategory(raw.topic) : detectCategory(raw.title + ' ' + raw.abstract);
  const prompt = `Jesteś ekspertem fitness piszącym po POLSKU dla aplikacji NEWS GYM.\n\nNa podstawie poniższego tekstu stwórz artykuł. Odpowiedz WYŁĄCZNIE czystym JSON bez backticks ani komentarzy:\n\nTYTUŁ ORYGINAŁU: ${raw.title}\nTREŚĆ: ${raw.abstract}\n${raw.pmid ? 'PMID: ' + raw.pmid : ''}\n\nWymagany format JSON:\n{\n  "title": "Chwytliwy tytuł po polsku (max 80 znaków)",\n  "excerpt": "Krótki opis 1-2 zdania po polsku",\n  "content": "Treść w HTML po polsku min 200 słów. Używaj: <h3>, <p>, <div class=\'highlight\'>, <div class=\'tip-box\'>",\n  "tags": ["tag1", "tag2", "tag3"],\n  "readTime": "X min",\n  "sources": [{"journal": "Nazwa","year": "2026","title": "Tytuł","authors": "Nazwisko et al.","finding": "Wynik","pmid": "${raw.pmid || ''}"}]\n}`;

  try {
    const res = await postJson(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] },
      { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }
    );
    const data = JSON.parse(res.body);
    const text = data.content?.map(c => c.text || '').join('') || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return {
      id: 'auto-' + Date.now() + '-' + Math.random().toString(36).substr(2,6),
      cat, title: parsed.title, excerpt: parsed.excerpt, content: parsed.content,
      tags: parsed.tags || [], readTime: parsed.readTime || '5 min',
      author: 'Redakcja NEWS GYM', authorInit: 'AI',
      date: new Date().toLocaleDateString('pl-PL'),
      views: Math.floor(Math.random() * 500) + 100,
      likes: Math.floor(Math.random() * 50) + 10,
      extraSources: parsed.sources || [],
      source: raw.source, originalTitle: raw.title, featured: false,
      createdAt: new Date().toISOString(),
    };
  } catch (e) { console.log('Błąd Claude:', e.message); return null; }
}

async function fetchUnsplashPhoto(query) {
  try {
    const res = await fetchUrl(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' fitness')}&per_page=1&orientation=landscape&client_id=${UNSPLASH_KEY}`);
    const data = JSON.parse(res.body);
    if (data.results?.length > 0) return data.results[0].urls.regular + '&w=400&q=80';
  } catch(e) {}
  return null;
}

async function main() {
  console.log('NEWS GYM Auto-fetch start:', new Date().toLocaleString('pl-PL'));
  if (!ANTHROPIC_API_KEY) { console.error('Brak ANTHROPIC_API_KEY!'); process.exit(1); }

  const articlesFile = path.join(__dirname, 'auto-articles.json');
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(articlesFile, 'utf8'));
    console.log('Wczytano ' + existing.length + ' istniejących artykułów');
  } catch(e) {
    console.log('Brak pliku auto-articles.json — tworzę nowy');
  }

  let allRaw = [];
  const shuffled = PUBMED_TOPICS.sort(() => Math.random() - 0.5).slice(0, 4);
  for (const topic of shuffled) {
    const arts = await fetchPubMed(topic);
    allRaw.push(...arts);
    await new Promise(r => setTimeout(r, 1000));
  }
  for (const feed of RSS_FEEDS) {
    const arts = await fetchRSS(feed);
    allRaw.push(...arts);
  }

  console.log('Pobrano ' + allRaw.length + ' surowych artykułów');

  let newArticles = [];
  for (const raw of allRaw.slice(0, 4)) {
    console.log('Generuję: ' + raw.title.substring(0, 60));
    const article = await generateArticle(raw);
    if (!article) continue;
    const imageUrl = await fetchUnsplashPhoto(raw.topic || article.cat);
    if (imageUrl) article.imageUrl = imageUrl;
    newArticles.push(article);
    console.log('Wygenerowano: ' + article.title);
    await new Promise(r => setTimeout(r, 2000));
  }

  const combined = [...newArticles, ...existing].slice(0, 50);
  fs.writeFileSync(articlesFile, JSON.stringify(combined, null, 2));
  console.log('Zapisano ' + combined.length + ' artykułów do auto-articles.json');
  console.log('Nowych artykułów: ' + newArticles.length);
}

main().catch(e => { console.error('Błąd:', e.message); process.exit(1); });
