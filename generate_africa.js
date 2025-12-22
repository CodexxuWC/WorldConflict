// generate_africa.js
// Usage:
//   node generate_africa.js            -> crée fichiers si absents (ne pas écraser)
//   node generate_africa.js --force    -> écrase les fichiers existants
//
// Place ce fichier à la racine du projet (~/WorldConflict) et exécute-le avec node.

const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');

function slugify(name){
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlever accents
    .toLowerCase()
    .replace(/['’"]/g, '') // virer apostrophes/marques
    .replace(/[^a-z0-9\s-]/g, '') // garder alnum espace -
    .trim()
    .replace(/\s+/g, '-');
}

// Liste complète Afrique (incl. Western Sahara et Somaliland)
// id = identifiant court (3 lettres ou custom), name = nom affiché
const AFRICA = [
  { id: 'dza', name: 'Algeria' },
  { id: 'ago', name: 'Angola' },
  { id: 'ben', name: 'Benin' },
  { id: 'bwa', name: 'Botswana' },
  { id: 'bfa', name: 'Burkina Faso' },
  { id: 'bdi', name: 'Burundi' },
  { id: 'cpv', name: 'Cabo Verde' },
  { id: 'cmr', name: 'Cameroon' },
  { id: 'caf', name: 'Central African Republic' },
  { id: 'tcd', name: 'Chad' },
  { id: 'com', name: 'Comoros' },
  { id: 'cog', name: 'Congo' },
  { id: 'cod', name: 'Democratic Republic of the Congo' },
  { id: 'civ', name: 'Côte d’Ivoire' },
  { id: 'dji', name: 'Djibouti' },
  { id: 'egy', name: 'Egypt' },
  { id: 'gnq', name: 'Equatorial Guinea' },
  { id: 'eri', name: 'Eritrea' },
  { id: 'swz', name: 'Eswatini' },
  { id: 'eth', name: 'Ethiopia' },
  { id: 'gab', name: 'Gabon' },
  { id: 'gmb', name: 'Gambia' },
  { id: 'gha', name: 'Ghana' },
  { id: 'gin', name: 'Guinea' },
  { id: 'gnb', name: 'Guinea-Bissau' },
  { id: 'ken', name: 'Kenya' },
  { id: 'lso', name: 'Lesotho' },
  { id: 'lbr', name: 'Liberia' },
  { id: 'lby', name: 'Libya' },
  { id: 'mdg', name: 'Madagascar' },
  { id: 'mwi', name: 'Malawi' },
  { id: 'mli', name: 'Mali' },
  { id: 'mrt', name: 'Mauritania' },
  { id: 'mus', name: 'Mauritius' },
  { id: 'mar', name: 'Morocco' },
  { id: 'moz', name: 'Mozambique' },
  { id: 'nam', name: 'Namibia' },
  { id: 'ner', name: 'Niger' },
  { id: 'nga', name: 'Nigeria' },
  { id: 'rwa', name: 'Rwanda' },
  { id: 'stp', name: 'Sao Tome and Principe' },
  { id: 'sen', name: 'Senegal' },
  { id: 'syc', name: 'Seychelles' },
  { id: 'sle', name: 'Sierra Leone' },
  { id: 'som', name: 'Somalia' },
  { id: 'sdn', name: 'Sudan' },
  { id: 'ssd', name: 'South Sudan' },
  { id: 'tza', name: 'Tanzania' },
  { id: 'tgo', name: 'Togo' },
  { id: 'tun', name: 'Tunisia' },
  { id: 'uga', name: 'Uganda' },
  { id: 'zmb', name: 'Zambia' },
  { id: 'zwe', name: 'Zimbabwe' },
  { id: 'zaf', name: 'South Africa' },
  // Territoires / quasi-États
  { id: 'esh', name: 'Western Sahara' },    // Sahara Occidental
  { id: 'som-l', name: 'Somaliland' }       // Somaliland (autoproclamé)
];

const outDir = path.join(process.cwd(), 'map', 'world', 'africa');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD

let created = 0, skipped = 0, overwritten = 0;

AFRICA.forEach(c => {
  const slug = slugify(c.name);
  const fileName = `${slug}.json`;
  const filePath = path.join(outDir, fileName);

  const payload = {
    id: (c.id || slug).toLowerCase(),
    name: c.name,
    continent: 'africa',
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
