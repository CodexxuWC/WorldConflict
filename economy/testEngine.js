import { getQuote, executeTrade, getMarketSnapshot } from './engine.js';

async function test() {
  console.log('--- Quote ---');
  const quote = await getQuote({ itemId: 'oil', qty: 100, countryId: 'fra', opts: { basePrice: 60 } });
  console.log(quote);

  console.log('--- Execute trade ---');
  const trade = await executeTrade({ actor: 'user123', itemId: 'oil', qty: 100, countryId: 'fra', side: 'buy', opts: { basePrice: 60 } });
  console.log(trade);

  console.log('--- Market snapshot ---');
  const snapshot = await getMarketSnapshot();
  console.log(snapshot);
}

test();
