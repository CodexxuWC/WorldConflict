// economy/testCountries.js
import { loadAll, getCountryById, getAllSummaries } from './countries.js';

async function t() {
  console.log(await loadAll());
  console.log((await getCountryById('fra'))?.summary);
  console.log((await getCountryById('france'))?.summary);
  console.log((await getAllSummaries()).slice(0,5));
}
t();
