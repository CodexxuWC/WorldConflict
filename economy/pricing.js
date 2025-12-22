// economy/pricing.js
// Pure functions only — no file I/O, no side effects.

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * computePrice (pure)
 *
 * itemId: string
 * stateItem: { stock: number, demand: number, trend: number }  // snapshot from state.json for the item
 * countryEconomy: object|null   // optional: country.economy (to detect local abundance)
 * qty: number - requested quantity (positive)
 * opts: { basePrice?: number, minPrice?: number, maxPrice?: number, scarcityFactor?: number }
 *
 * Returns: { price: number, breakdown: { base, supplyFactor, demandFactor, qtyImpact, trendFactor, countryFactor } }
 */
export function computePrice(itemId, stateItem = {}, countryEconomy = null, qty = 1, opts = {}) {
  // defaults
  const basePrice = Number(opts.basePrice ?? 100); // default base price when nothing else provided
  const minPrice = Number(opts.minPrice ?? 0.01);
  const maxPrice = Number(opts.maxPrice ?? 1e9);
  const scarcityFactor = Number(opts.scarcityFactor ?? 1.0);

  const stock = Math.max(0, Number(stateItem.stock ?? 0));
  const demand = Math.max(0, Number(stateItem.demand ?? 0));
  const trend = Number(stateItem.trend ?? 0); // positive increases price, negative decreases

  qty = Math.max(0, Number(qty ?? 0));

  // country factor: if country has the resource listed, slightly cheaper (exporter),
  // otherwise slightly more expensive. Expect countryEconomy.resources = { itemId: qtyAvailable } or array.
  let countryFactor = 1.0;
  try {
    if (countryEconomy) {
      const res = countryEconomy.resources;
      if (res) {
        if (Array.isArray(res)) {
          if (res.includes(itemId)) countryFactor = 0.95;
        } else if (typeof res === 'object') {
          if (res[itemId] !== undefined) {
            // if quantity known and abundant -> cheaper proportional
            const localQty = Number(res[itemId] ?? 0);
            if (localQty > 0) countryFactor = clamp(0.85 + 0.15 * Math.exp(-localQty / 10000), 0.7, 1.0);
            else countryFactor = 0.98;
          }
        }
      }
    }
  } catch (e) {
    countryFactor = 1.0;
  }

  // supply-demand factor: if supply >> demand, cheap; if demand >> supply, expensive.
  // Use a soft ratio to avoid division by zero.
  const ratio = (stock + 1) / (demand + 1); // >1 => oversupply, <1 => scarcity
  // supplyFactor decreases with ratio; mapped so ratio 10 => 0.6, ratio 0.1 => 2.0
  const supplyFactor = clamp(1.0 / Math.pow(ratio, 0.25), 0.5, 3.0);

  // demandFactor — direct scaling on absolute demand pressure
  const demandFactor = clamp(1.0 + (demand / (Math.max(1, stock + demand)) ) * 1.2, 0.5, 3.0);

  // qtyImpact — larger single order moves price up (slippage)
  // small orders (<1% of stock) negligible; large orders push price non-linearly.
  const relOrder = stock > 0 ? (qty / (stock + qty)) : 1;
  const qtyImpact = 1.0 + Math.pow(relOrder, 0.6) * 2.0; // 1.0..3.0

  // trendFactor: incorporate market trend (can be negative)
  const trendFactor = 1.0 + clamp(trend, -0.5, 0.5);

  // scarcityFactor (global tuning)
  const sf = clamp(scarcityFactor, 0.5, 5.0);

  // final price
  let price = basePrice * supplyFactor * demandFactor * qtyImpact * trendFactor * countryFactor * sf;

  // defensive clamps
  price = clamp(Number(price), minPrice, maxPrice);

  // round to 2 decimals for currency-like behaviour
  const rounded = Math.round(price * 100) / 100;

  return {
    price: rounded,
    breakdown: {
      base: basePrice,
      supplyFactor,
      demandFactor,
      qtyImpact,
      trendFactor,
      countryFactor,
      scarcityFactor: sf
    }
  };
}

/**
 * simulateStateAfterTrade (pure)
 * - Given a snapshot of stateItem, simulate the new stock/demand/trend after a trade
 *
 * side: 'buy' (actor buys from market -> market stock decreases) or 'sell' (actor sells to market -> stock increases)
 */
export function simulateStateAfterTrade(stateItem = {}, qty = 1, side = 'buy', opts = {}) {
  const stock = Math.max(0, Number(stateItem.stock ?? 0));
  const demand = Math.max(0, Number(stateItem.demand ?? 0));
  const trend = Number(stateItem.trend ?? 0);

  qty = Math.max(0, Number(qty ?? 0));
  const newStock = side === 'buy' ? Math.max(0, stock - qty) : stock + qty;

  // demand moves: buy increases demand slightly, sell reduces it
  const demandDelta = (side === 'buy') ? Math.max(0, qty * 0.1) : -Math.max(0, qty * 0.05);
  const newDemand = Math.max(0, demand + demandDelta);

  // trend adjust: small EMA-like update
  const trendDelta = (demandDelta / (Math.max(1, stock + qty))) * 0.5;
  const newTrend = trend + trendDelta;
  return {
    stock: newStock,
    demand: newDemand,
    trend: Number(newTrend)
  };
}

export default { computePrice, simulateStateAfterTrade };
