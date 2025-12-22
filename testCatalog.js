import { reloadCatalog, getMarketItems } from './economy/catalog.js';

(async () => {
  const r = await reloadCatalog();
  console.log(r);
  console.log(getMarketItems());
})();
