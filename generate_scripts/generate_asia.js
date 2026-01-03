// generate_asia.js
// Usage:
//   node generate_asia.js            -> crée fichiers si absents (ne pas écraser)
//   node generate_asia.js --force    -> écrase les fichiers existants
//
// Place ce fichier à la racine du projet (~/WorldConflict) et exécute-le avec node.

const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');

function slugify(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlever accents
    .toLowerCase()
    .replace(/['’"]/g, '') // virer apostrophes/marques
    .replace(/[^a-z0-9\s-]/g, '') // garder alnum espace -
    .trim()
    .replace(/\s+/g, '-');
}

// Liste complète Asie
// id = identifiant court (3 lettres ou custom), name = nom affiché
const ASIA = [
  { id: 'afg', name: 'Afghanistan' },
  { id: 'arm', name: 'Armenia' },
  { id: 'aze', name: 'Azerbaijan' },
  { id: 'bhr', name: 'Bahrain' },
  { id: 'bgd', name: 'Bangladesh' },
  { id: 'btn', name: 'Bhutan' },
  { id: 'brn', name: 'Brunei' },
  { id: 'mmr', name: 'Burma (Myanmar)' },
  { id: 'khm', name: 'Cambodia' },
  { id: 'chn', name: 'China' },
  { id: 'cyp', name: 'Cyprus' },
  { id: 'geo', name: 'Georgia' },
  { id: 'ind', name: 'India' },
  { id: 'idn', name: 'Indonesia' },
  { id: 'irn', name: 'Iran' },
  { id: 'irq', name: 'Iraq' },
  { id: 'isr', name: 'Israel' },
  { id: 'jpn', name: 'Japan' },
  { id: 'jor', name: 'Jordan' },
  { id: 'kaz', name: 'Kazakhstan' },
  { id: 'kwt', name: 'Kuwait' },
  { id: 'kgz', name: 'Kyrgyzstan' },
  { id: 'lao', name: 'Laos' },
  { id: 'lbn', name: 'Lebanon' },
  { id: 'mys', name: 'Malaysia' },
  { id: 'mdv', name: 'Maldives' },
  { id: 'mng', name: 'Mongolia' },
  { id: 'npl', name: 'Nepal' },
  { id: 'prk', name: 'North Korea' },
  { id: 'omn', name: 'Oman' },
  { id: 'pak', name: 'Pakistan' },
  { id: 'pse', name: 'Palestine' },
  { id: 'phl', name: 'Philippines' },
  { id: 'qat', name: 'Qatar' },
  { id: 'rus', name: 'Russia' },
  { id: 'sau', name: 'Saudi Arabia' },
  { id: 'sgp', name: 'Singapore' },
  { id: 'kor', name: 'South Korea' },
  { id: 'lka', name: 'Sri Lanka' },
  { id: 'syc', name: 'Syria' },
  { id: 'tjk', name: 'Tajikistan' },
  { id: 'tha', name: 'Thailand' },
  { id: 'tls', name: 'Timor-Leste (East Timor)' },
  { id: 'tur', name: 'Turkey' },
  { id: 'tkm', name: 'Turkmenistan' },
  { id: 'are', name: 'United Arab Emirates' },
  { id: 'uzb', name: 'Uzbekistan' },
  { id: 'vnm', name: 'Vietnam' },
  { id: 'yem', name: 'Yemen' }
];

const outDir = path.join(process.cwd(), 'map', 'world', 'asia');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

let created = 0, skipped = 0, overwritten = 0;

ASIA.forEach(c => {
  const slug = slugify(c.name);
  const fileName = `${slug}.json`;
  const filePath = path.join(outDir, fileName);

  const payload = {
    id: (c.id || slug).toLowerCase(),
    name: c.name,
    continent: 'asia',
    metadata: {
      created_at: today,
      updated_at: null
    },
    government: {
      leader: null,
      ministers: [],
      system: null
    },
    population: {
      value: 0,
      growth_rate: 0
    },
    economy: {
      gdp: 0,
      resources: {}
    },
    military: {
      active: 0,
      reserve: 0,
      equipment: {}
    },
    geography: {
      area_km2: 0,
      major_cities: [],
      climate_zones: [],
      borders: []
    },
    status: {
      occupied: false,
      contested: false
    }
  };

  if (fs.existsSync(filePath)) {
    if (FORCE) {
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      overwritten++;
      console.log(`overwritten: ${fileName}`);
    } else {
      skipped++;
      console.log(`skipped: ${fileName} (exists)`);
    }
  } else {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    created++;
    console.log(`created: ${fileName}`);
  }
});

console.log('\nSummary:');
console.log(`  created: ${created}`);
console.log(`  overwritten: ${overwritten}`);
console.log(`  skipped: ${skipped}`);
console.log(`Files generated in: ${outDir}`);
