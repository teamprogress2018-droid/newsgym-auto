// fetch-articles.js
// Pobiera artykuły z PubMed i RSS, tłumaczy przez Claude AI, zapisuje do Firebase
// Uruchamiany automatycznie co 2 dni przez GitHub Actions

const https = require('https');
const http = require('http');

// ═══════════════════════════════════════
// KONFIGURACJA
// ═══════════════════════════════════════
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_CONFIG   = JSON.parse(process.env.FIREBASE_CONFIG);
const PROJECT_ID        = FIREBASE_CONFIG.projectId;
const FIREBASE_API_KEY  = FIREBASE_CONFIG.apiKey;

// Tematy do wyszukania w PubMed
const PUBMED_TOPICS = [
  'resistance training hypertrophy 2024',
  'creatine supplementation athletes 2025',
  'protein intake muscle recovery 2024',
  'HIIT cardiovascular fitness 2024',
  'sleep recovery athletic performance 2025',
  'omega-3 exercise performance 2024',
  'periodization strength training 2025',
  'nutrition sports performance 2025',
];

// RSS feedów fitness (po angielsku — Claude przetłumaczy)
const RSS_FEEDS = [
  'https://examine.com/feed/',
  'https://www.strongerbyscience.com/feed/',
];

// Kategorie
const TOPIC_TO_CAT = {
  'resistance training': 'sila',
  'hypertrophy': 'sila',
  'strength': 'sila',
  'creatine': 'supl',
  'supplement': 'supl',
  'protein': 'dieta',
  'nutrition': 'dieta',
  'HIIT': 'cardio',
  'cardiovascular': 'cardio',
  'sleep': 'lifestyle',
  'recovery': 'lifestyle',
  'omega': 'supl',
  'periodization': 'trening',
  'training': 'trening',
};

// ═══════════════════════════════════════
// POMOCNICZE FUNKCJE HTTP
// ═══════════════════════════════════════
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 15000, ...options }, (res) => {
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
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
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

// ═══════════════════════════════════════
// POBIERZ Z PUBMED
// ═══════════════════════════════════════
async function fetchPubMed(topic) {
  try {
    console.log(`📚 PubMed: szukam "${topic}"...`);
    
    // Szukaj artykułów
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(topic)}&retmax=3&sort=date&retmode=json&datetype=pdat&reldate=365`;
    const searchRes = await fetchUrl(searchUrl);
    const searchData = JSON.parse(searchRes.body);
    const ids = searchData.esearchresult?.idlist || [];
    
    if (!ids.length) {
      console.log(`  Brak wyników dla "${topic}"`);
      return [];
    }

    // Pobierz szczegóły
    const fetchUrl2 = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
    const fetchRes = await fetchUrl(fetchUrl2);
    
    // Parsuj XML prosto — wyciągnij tytuł i abstrakt
    const articles = [];
    const xml = fetchRes.body;
    
    const titleMatches = xml.matchAll(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/g);
    const abstractMatches = xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
    const pmidMatches = xml.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g);
    
    const titles = [...titleMatches].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    const abstracts = [...abstractMatches].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    const pmids = [...pmidMatches].map(m => m[1]);
    
    for (let i = 0; i < Math.min(titles.length, 2); i++) {
      if (titles[i] && abstracts[i] && abstracts[i].length > 100) {
        articles.push({
          title: titles[i],
          abstract: abstracts[i].substring(0, 1500),
          pmid: pmids[i] || '',
          topic,
          source: 'pubmed',
        });
      }
    }
    
    console.log(`  Znaleziono ${articles.length} artykułów`);
    return articles;
  } catch (e) {
    console.log(`  Błąd PubMed: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════
// POBIERZ Z RSS
// ═══════════════════════════════════════
async function fetchRSS(feedUrl) {
  try {
    console.log(`📰 RSS: ${feedUrl}`);
    const res = await fetchUrl(feedUrl);
    const xml = res.body;
    
    const articles = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    
    for (const match of itemMatches) {
      const item = match[1];
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
      const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/);
      
      const title = (titleMatch?.[1] || titleMatch?.[2] || '').replace(/<[^>]+>/g, '').trim();
      const desc = (descMatch?.[1] || descMatch?.[2] || '').replace(/<[^>]+>/g, '').trim();
      
      if (title && desc && desc.length > 100) {
        articles.push({
          title,
          abstract: desc.substring(0, 1500),
          source: 'rss',
          feedUrl,
        });
        if (articles.length >= 2) break;
      }
    }
    
    console.log(`  Znaleziono ${articles.length} artykułów`);
    return articles;
  } catch (e) {
    console.log(`  Błąd RSS: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════
// WYKRYJ KATEGORIĘ
// ═══════════════════════════════════════
function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [keyword, cat] of Object.entries(TOPIC_TO_CAT)) {
    if (lower.includes(keyword.toLowerCase())) return cat;
  }
  return 'trening';
}

// ═══════════════════════════════════════
// GENERUJ ARTYKUŁ PRZEZ CLAUDE AI
// ═══════════════════════════════════════
async function generateArticle(raw) {
  const cat = raw.topic ? detectCategory(raw.topic) : detectCategory(raw.title + ' ' + raw.abstract);
  
  const prompt = `Jesteś ekspertem fitness piszącym po POLSKU dla aplikacji NEWS GYM.

Na podstawie poniższego tekstu stwórz artykuł. Odpowiedz WYŁĄCZNIE czystym JSON bez backticks ani komentarzy:

TYTUŁ ORYGINAŁU: ${raw.title}
TREŚĆ: ${raw.abstract}
${raw.pmid ? 'PMID: ' + raw.pmid : ''}

Wymagany format JSON:
{
  "title": "Chwytliwy tytuł po polsku (max 80 znaków)",
  "excerpt": "Krótki opis 1-2 zdania po polsku zachęcający do czytania",
  "content": "Treść artykułu w HTML po polsku min 200 słów. Używaj: <h3>nagłówek</h3>, <p>akapit</p>, <div class='highlight'>cytat</div>, <div class='tip-box'><strong>💡 ETYKIETA</strong>wskazówka</div>",
  "tags": ["tag1", "tag2", "tag3"],
  "readTime": "X min",
  "sources": [
    {
      "journal": "Nazwa czasopisma np. J Strength Cond Res",
      "year": "2024",
      "title": "Tytuł badania po angielsku",
      "authors": "Nazwisko A, Nazwisko B et al.",
      "finding": "Kluczowy wynik po polsku z <strong>liczbami</strong>",
      "pmid": "${raw.pmid || 'PMC' + Math.floor(Math.random()*9000000+1000000)}"
    }
  ]
}

Wymagania:
- Treść MUSI być po polsku
- sources = 2-3 PRAWDZIWE badania powiązane z tematem
- Styl przystępny dla sportowca-amatora`;

  try {
    const res = await postJson(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      }
    );
    
    const data = JSON.parse(res.body);
    const text = data.content?.map(c => c.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    
    return {
      cat,
      title: parsed.title,
      excerpt: parsed.excerpt,
      content: parsed.content,
      tags: parsed.tags || [],
      readTime: parsed.readTime || '5 min',
      author: 'Redakcja NEWS GYM',
      authorInit: 'AI',
      date: new Date().toLocaleDateString('pl-PL'),
      views: 0,
      likes: 0,
      extraSources: parsed.sources || [],
      source: raw.source,
      originalTitle: raw.title,
      featured: false,
    };
  } catch (e) {
    console.log(`  Błąd Claude: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════
// ZAPISZ DO FIREBASE FIRESTORE
// ═══════════════════════════════════════
async function saveToFirebase(article) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/articles?key=${FIREBASE_API_KEY}`;
    
    // Konwertuj do formatu Firestore
    const doc = {
      fields: {
        title:         { stringValue: article.title || '' },
        excerpt:       { stringValue: article.excerpt || '' },
        content:       { stringValue: article.content || '' },
        cat:           { stringValue: article.cat || 'trening' },
        author:        { stringValue: article.author || 'Redakcja NEWS GYM' },
        authorInit:    { stringValue: article.authorInit || 'AI' },
        date:          { stringValue: article.date || '' },
        readTime:      { stringValue: article.readTime || '5 min' },
        views:         { integerValue: 0 },
        likes:         { integerValue: 0 },
        featured:      { booleanValue: false },
        source:        { stringValue: article.source || 'auto' },
        originalTitle: { stringValue: article.originalTitle || '' },
        tags:          { arrayValue: { values: (article.tags || []).map(t => ({ stringValue: t })) } },
        extraSources:  { arrayValue: { values: (article.extraSources || []).map(s => ({
          mapValue: { fields: {
            journal:  { stringValue: s.journal || '' },
            year:     { stringValue: s.year || '' },
            title:    { stringValue: s.title || '' },
            authors:  { stringValue: s.authors || '' },
            finding:  { stringValue: s.finding || '' },
            pmid:     { stringValue: s.pmid || '' },
          }}
        })) }},
        createdAt: { stringValue: new Date().toISOString() },
      }
    };
    
    const res = await postJson(url, doc);
    
    if (res.status === 200) {
      console.log(`  ✅ Zapisano: "${article.title}"`);
      return true;
    } else {
      console.log(`  ❌ Błąd Firebase ${res.status}: ${res.body.substring(0, 200)}`);
      return false;
    }
  } catch (e) {
    console.log(`  ❌ Błąd zapisu: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════
// GŁÓWNA FUNKCJA
// ═══════════════════════════════════════
async function main() {
  console.log('🚀 NEWS GYM Auto-fetch start:', new Date().toLocaleString('pl-PL'));
  console.log('═'.repeat(50));
  
  if (!ANTHROPIC_API_KEY) { console.error('❌ Brak ANTHROPIC_API_KEY!'); process.exit(1); }
  if (!PROJECT_ID)        { console.error('❌ Brak FIREBASE_CONFIG!');   process.exit(1); }

  let allRaw = [];

  // 1. Pobierz z PubMed (losowo 3 tematy żeby nie powtarzać)
  const shuffled = PUBMED_TOPICS.sort(() => Math.random() - 0.5).slice(0, 3);
  for (const topic of shuffled) {
    const arts = await fetchPubMed(topic);
    allRaw.push(...arts);
    await new Promise(r => setTimeout(r, 1000)); // pauza między requestami
  }

  // 2. Pobierz z RSS
  for (const feed of RSS_FEEDS) {
    const arts = await fetchRSS(feed);
    allRaw.push(...arts);
  }

  console.log(`\n📊 Pobrano ${allRaw.length} surowych artykułów`);
  console.log('═'.repeat(50));

  // 3. Generuj i zapisuj (max 5 artykułów na run)
  let saved = 0;
  const toProcess = allRaw.slice(0, 5);
  
  for (const raw of toProcess) {
    console.log(`\n🤖 Generuję: "${raw.title.substring(0, 60)}..."`);
    
    const article = await generateArticle(raw);
    if (!article) continue;
    
    console.log(`  📝 Wygenerowano: "${article.title}"`);
    
    const ok = await saveToFirebase(article);
    if (ok) saved++;
    
    // Pauza między requestami do Claude (rate limiting)
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Zakończono! Zapisano ${saved}/${toProcess.length} artykułów do Firebase`);
  console.log('Następne uruchomienie: za 2 dni o 8:00');
}

main().catch(e => {
  console.error('❌ Krytyczny błąd:', e.message);
  process.exit(1);
});
