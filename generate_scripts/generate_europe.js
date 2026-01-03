// generate_europe.js
// Usage:
//   node generate_europe.js            -> crée fichiers si absents (ne pas écraser)
//   node generate_europe.js --force    -> écrase les fichiers existants
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

// Liste complète Europe (incl. territoires contestés et pays partiellement reconnus)
// id = identifiant court (3 lettres ou custom), name = nom affiché
const EUROPE = [
  { id: 'alb', name: 'Albania' },
  { id: 'and', name: 'Andorra' },
  { id: 'arm', name: 'Armenia' },
  { id: 'aut', name: 'Austria' },
  { id: 'aze', name: 'Azerbaijan' },
  { id: 'blr', name: 'Belarus' },
  { id: 'bel', name: 'Belgium' },
  { id: 'bih', name: 'Bosnia and Herzegovina' },
  { id: 'bul', name: 'Bulgaria' },
  { id: 'cro', name: 'Croatia' },
  { id: 'cyp', name: 'Cyprus' },
  { id: 'cze', name: 'Czech Republic' },
  { id: 'dnk', name: 'Denmark' },
  { id: 'est', name: 'Estonia' },
  { id: 'fin', name: 'Finland' },
  { id: 'fra', name: 'France' },
  { id: 'geo', name: 'Georgia' }, // Partly in Europe
  { id: 'deu', name: 'Germany' },
  { id: 'grc', name: 'Greece' },
  { id: 'hun', name: 'Hungary' },
  { id: 'isl', name: 'Iceland' },
  { id: 'irl', name: 'Ireland' },
  { id: 'ita', name: 'Italy' },
  { id: 'kaz', name: 'Kazakhstan' }, // Partly in Europe
  { id: 'kos', name: 'Kosovo' }, // Partially recognized
  { id: 'lva', name: 'Latvia' },
  { id: 'lie', name: 'Liechtenstein' },
  { id: 'ltu', name: 'Lithuania' },
  { id: 'lux', name: 'Luxembourg' },
  { id: 'mlt', name: 'Malta' },
  { id: 'mda', name: 'Moldova' },
  { id: 'mco', name: 'Monaco' },
  { id: 'mne', name: 'Montenegro' },
  { id: 'nld', name: 'Netherlands' },
  { id: 'mkd', name: 'North Macedonia' },
  { id: 'nor', name: 'Norway' },
  { id: 'pol', name: 'Poland' },
  { id: 'prt', name: 'Portugal' },
  { id: 'rou', name: 'Romania' },
  { id: 'rus', name: 'Russia' }, // Partly in Europe
  { id: 'smr', name: 'San Marino' },
  { id: 'srb', name: 'Serbia' },
  { id: 'svk', name: 'Slovakia' },
  { id: 'svn', name: 'Slovenia' },
  { id: 'esp', name: 'Spain' },
  { id: 'swe', name: 'Sweden' },
  { id: 'che', name: 'Switzerland' },
  { id: 'tur', name: 'Turkey' }, // Partly in Europe
  { id: 'ukr', name: 'Ukraine' },
  { id: 'gbr', name: 'United Kingdom' },
  { id: 'vat', name: 'Vatican City' },
  { id: 'tms', name: 'Transnistria' }, // Contested territory
  { id: 'abk', name: 'Abkhazia' }, // Contested territory
  { id: 'oss', name: 'South Ossetia' }, // Contested territory
];

const outDir = path.join(process.cwd(), 'map', 'world', 'europe');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

let created = 0, skipped = 0, overwritten = 0;

EUROPE.forEach(c => {
  const slug = slugify(c.name);
  const fileName = `${slug}.json`;
  const filePath = path.join(outDir, fileName);

  const payload = {
    id: (c.id || slug).toLowerCase(),
    name: c.name,
    continent: 'europe',
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
