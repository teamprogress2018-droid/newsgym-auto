Skip to content
teamprogress2018-droid
newsgym-auto
Repository navigation
Code
Issues
Pull requests
Agents
Actions
Projects
Security and quality
Insights
Settings
newsgym-auto
/
fetch-articles.js
in
main

Edit

Preview
Indent mode

Spaces
Indent size

2
Line wrap mode

No wrap
Editing fetch-articles.js file contents
const prompt = `Napisz artykuł fitness po polsku na podstawie tytułu: "${raw.title}".

Zwróć TYLKO JSON (bez markdown, bez backticks):
{"title":"[tytuł po polsku, max 70 znaków]","excerpt":"[2 zdania, max 120 znaków]","content":"[3 akapity po polsku, max 350 słów, oddzielone \\n\\n]","tags":["tag1","tag2","tag3"],"readTime":"4 min"}`;
nextpreviousallmatch caseregexpby word
Replace
replacereplace all×
  1
  2
  3
  4
  5
  6
  7
  8
  9
 10
 11
 12
 13
 14
 15
 16
 17
 18
 19
 20
 21
 22
 23
 24
 25
 26
 27
 28
 29
 30
 31
 32
 33
 34
 35
 36
 37
 38
 39
 40
 41
 42
 43
 44
 45
 46
 47
 48
 49
 50
 51
 52
 53
 54
 55
 56
 57
 58
 59
 60
 61
 62
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
 const cat = raw.topic ? detectCategory(raw.topic) : detectCategory(raw.title + ' ' + (raw.abstract || ''));
Use Control + Shift + m to toggle the tab key moving focus. Alternatively, use esc then tab to move to the next interactive element on the page.
