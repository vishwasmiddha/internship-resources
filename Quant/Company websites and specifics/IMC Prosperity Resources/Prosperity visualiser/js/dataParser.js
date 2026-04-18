// ============================================================
// dataParser.js — Parse Prosperity CSV data (semicolon-delimited)
// ============================================================

/**
 * Parse a Prosperity submission JSON log (e.g. 50122.json)
 * Returns { prices, trades } where prices = { rows, products } and trades = []
 */
export function parseSubmissionJSON(text) {
  // Accept either a JSON string or an already-parsed object
  let json;
  if (typeof text === 'string') {
    json = JSON.parse(text);
  } else {
    json = text;
  }

  // activitiesLog contains the semicolon-delimited prices CSV as a single string
  const pricesText = json.activitiesLog || '';
  const prices = parsePricesCSV(pricesText);

  // tradeHistory can be an array of objects or a CSV string
  let trades = [];
  if (Array.isArray(json.tradeHistory)) {
    trades = json.tradeHistory.map(t => {
      // Support alternate field names that appear in different logs
      const symbol = (t.symbol || t.product || t.instrument || '').toString();
      const buyerRaw = t.buyer || t.buyerName || '';
      const sellerRaw = t.seller || t.sellerName || '';

      // Keep buyer/seller trimmed for display; filter/own-detection uses exact 'SUBMISSION'
      const buyer = String(buyerRaw).trim();
      const seller = String(sellerRaw).trim();

      return {
        timestamp: parseInt(t.timestamp) || 0,
        buyer,
        seller,
        symbol,
        price: parseFloat(t.price) || 0,
        quantity: parseInt(t.quantity) || 0,
        tradeType: 'own' // All trades returned in the log are our own
      };
    });
  } else if (typeof json.tradeHistory === 'string' && json.tradeHistory.trim().length > 0) {
    trades = parseTradesCSV(json.tradeHistory, true);
  }

  // Derive fallback meta values when missing
  const finalProfit = (json.profit !== undefined && json.profit !== null)
    ? json.profit
    : (prices.rows && prices.rows.length ? prices.rows[prices.rows.length - 1].pnl : undefined);
  const finalRound = (json.round !== undefined && json.round !== null)
    ? json.round
    : (prices.rows && prices.rows.length ? prices.rows[0].day : undefined);

  return { prices, trades, meta: { round: finalRound, profit: finalProfit, status: json.status } };
}

/**
 * Try to extract a JSON object from a mixed log file.
 * Returns the parsed object or null.
 */
export function extractJSONFromLogText(text) {
  if (!text || typeof text !== 'string') return null;
  const key = '"tradeHistory"';
  const idx = text.indexOf(key);
  if (idx === -1) return null;

  // Find the nearest opening brace before the key
  let start = text.lastIndexOf('{', idx);
  if (start === -1) start = text.indexOf('{');
  if (start === -1) return null;

  const candidate = text.slice(start);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    // If parsing fails, try a looser approach: find the first '{' and last '}' and attempt
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

/**
 * Auto-detect file format and parse accordingly
 * Supports: .json (submission log), .csv (raw prices or trades)
 */
export function autoDetect(text, fileName) {
  const trimmed = text.trim();
  // If it looks like a JSON object, or contains a submission-style tradeHistory
  if (trimmed.startsWith('{')) {
    return { type: 'json', data: parseSubmissionJSON(text) };
  }
  if (trimmed.includes('"tradeHistory"') || (fileName || '').toLowerCase().endsWith('.log')) {
    const obj = extractJSONFromLogText(text);
    if (obj) return { type: 'json', data: parseSubmissionJSON(obj) };
    // fallback: continue to CSV detection
  }
  // CSV — check header to determine if prices or trades
  const firstLine = trimmed.split('\n')[0].toLowerCase();
  if (firstLine.includes('bid_price') || firstLine.includes('mid_price')) {
    return { type: 'prices', data: parsePricesCSV(text) };
  }
  if (firstLine.includes('buyer') || firstLine.includes('seller')) {
    return { type: 'trades', data: parseTradesCSV(text) };
  }
  // Fallback: try prices
  return { type: 'prices', data: parsePricesCSV(text) };
}

/**
 * Parse Prices CSV
 * Columns: day;timestamp;product;bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;
 *          ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;mid_price;profit_and_loss
 */
export function parsePricesCSV(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], products: [] };

  const header = lines[0].split(';').map(h => h.trim());
  const rows = [];
  const productSet = new Set();
  const prev = {}; // store previous mid/bestBid/bestAsk per product

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 16) continue;

    const product = cols[2]?.trim();
    if (!product) continue;
    productSet.add(product);

    const bids = [];
    const asks = [];

    // Up to 3 bid levels
    for (let lvl = 0; lvl < 3; lvl++) {
      const pIdx = 3 + lvl * 2;
      const vIdx = 4 + lvl * 2;
      const price = parseFloat(cols[pIdx]);
      const vol = parseInt(cols[vIdx]);
      if (!isNaN(price) && !isNaN(vol) && vol > 0) {
        bids.push({ price, volume: vol });
      }
    }

    // Up to 3 ask levels
    for (let lvl = 0; lvl < 3; lvl++) {
      const pIdx = 9 + lvl * 2;
      const vIdx = 10 + lvl * 2;
      const price = parseFloat(cols[pIdx]);
      const vol = parseInt(cols[vIdx]);
      if (!isNaN(price) && !isNaN(vol) && vol > 0) {
        asks.push({ price, volume: vol });
      }
    }

    const midRaw = cols[15] ? cols[15].trim() : '';
    const midParsed = midRaw.length > 0 ? parseFloat(midRaw) : NaN;
    const midPriceFromCSV = Number.isFinite(midParsed) ? midParsed : null;
    const pnl = parseFloat(cols[16]) || 0;

    // Determine best bid/ask for this row
    const bestBid = bids.length ? Math.max(...bids.map(b => b.price)) : null;
    const bestAsk = asks.length ? Math.min(...asks.map(a => a.price)) : null;

    // Prepare prev state for this product
    if (!prev[product]) prev[product] = { mid: null, bestBid: null, bestAsk: null };
    const pstate = prev[product];

    // Compute mid price following exact forward-fill rules provided by user:
    // 1) If CSV provides midPrice, use it.
    // 2) If no bid and no ask exists -> same mid price as previous tick.
    // 3) If no bid exists -> previous mid price + (new bestAsk - previous bestAsk).
    // 4) If no ask exists -> previous mid price + (new bestBid - previous bestBid).
    // 5) Otherwise use (bestBid + bestAsk)/2.
    let midPrice = null;
    if (midPriceFromCSV != null) {
      midPrice = midPriceFromCSV;
    } else {
      if (bestBid === null && bestAsk === null) {
        midPrice = pstate.mid;
      } else if (bestBid === null && bestAsk !== null) {
        if (pstate.mid != null && pstate.bestAsk != null) {
          midPrice = pstate.mid + (bestAsk - pstate.bestAsk);
        } else {
          midPrice = bestAsk;
        }
      } else if (bestAsk === null && bestBid !== null) {
        if (pstate.mid != null && pstate.bestBid != null) {
          midPrice = pstate.mid + (bestBid - pstate.bestBid);
        } else {
          midPrice = bestBid;
        }
      } else if (bestBid !== null && bestAsk !== null) {
        midPrice = (bestBid + bestAsk) / 2;
      } else {
        midPrice = pstate.mid;
      }
    }

    // Ensure midPrice is numeric: fallback to previous mid or 0 if still null
    if (midPrice == null) midPrice = pstate.mid != null ? pstate.mid : 0;

    // Update previous state
    pstate.mid = midPrice;
    if (bestBid !== null) pstate.bestBid = bestBid;
    if (bestAsk !== null) pstate.bestAsk = bestAsk;

    rows.push({
      day: parseInt(cols[0]) || 0,
      timestamp: parseInt(cols[1]) || 0,
      product,
      bids,
      asks,
      midPrice,
      pnl
    });
  }

  return {
    rows,
    products: [...productSet].sort()
  };
}

/**
 * Parse Trades CSV
 * Columns: timestamp;buyer;seller;symbol;currency;price;quantity
 */
export function parseTradesCSV(text, forceOwn = false) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const trades = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 7) continue;

    const timestamp = parseInt(cols[0]);
    if (isNaN(timestamp)) continue;

    const buyer = cols[1]?.trim() || '';
    const seller = cols[2]?.trim() || '';
    const symbol = cols[3]?.trim() || '';
    const price = parseFloat(cols[5]);
    const quantity = parseInt(cols[6]);

    if (isNaN(price) || isNaN(quantity)) continue;

    // Determine trade type based on buyer/seller
    let tradeType = forceOwn ? 'own' : 'market';
    if (!forceOwn && (buyer === 'SUBMISSION' || seller === 'SUBMISSION')) {
      tradeType = 'own';
    }

    trades.push({
      timestamp,
      buyer,
      seller,
      symbol,
      price,
      quantity,
      tradeType
    });
  }

  return trades;
}

/**
 * Filter data by product
 */
export function filterByProduct(priceRows, trades, product) {
  const filteredPrices = priceRows.filter(r => r.product === product);
  filteredPrices.sort((a, b) => a.timestamp - b.timestamp);

  const filteredTrades = trades.filter(t => t.symbol === product);

  // Compute cumulative position from trades (for own trades)
  let position = 0;
  const positionSeries = [];
  const pnlSeries = [];
  const timestamps = new Set();

  for (const row of filteredPrices) {
    timestamps.add(row.timestamp);
    pnlSeries.push({ timestamp: row.timestamp, value: row.pnl });
  }

  // Include trade timestamps so position updates at trade times are captured
  for (const t of filteredTrades) {
    timestamps.add(t.timestamp);
  }

  // Build position from own trades
  const ownByTs = {};
  for (const t of filteredTrades) {
    if (t.tradeType === 'own') {
      if (!ownByTs[t.timestamp]) ownByTs[t.timestamp] = 0;
      const buyerUpper = (t.buyer || '').toString().toUpperCase();
      const sellerUpper = (t.seller || '').toString().toUpperCase();
      if (buyerUpper === 'SUBMISSION') {
        ownByTs[t.timestamp] += t.quantity;
      } else if (sellerUpper === 'SUBMISSION') {
        ownByTs[t.timestamp] -= t.quantity;
      } else {
        // Fallback: if neither side labeled 'SUBMISSION', treat as market counter-party
        ownByTs[t.timestamp] -= t.quantity;
      }
    }
  }

  const sortedTs = [...timestamps].sort((a, b) => a - b);
  for (const ts of sortedTs) {
    if (ownByTs[ts]) position += ownByTs[ts];
    positionSeries.push({ timestamp: ts, value: position });
  }

  return {
    prices: filteredPrices,
    trades: filteredTrades,
    pnl: pnlSeries,
    position: positionSeries,
    timestamps: sortedTs
  };
}

/**
 * Generate demo data (realistic Prosperity-style)
 */
export function generateDemoData() {
  const products = ['KELP', 'RAINFOREST_RESIN', 'SQUID_INK'];
  const basePrices = { KELP: 2025, RAINFOREST_RESIN: 10000, SQUID_INK: 2005 };
  const rows = [];
  const trades = [];
  const traderNames = ['Amelia', 'Bob', 'Caesar', 'Diana', 'Eve', 'Frank', 'Grace'];

  for (const product of products) {
    let price = basePrices[product];
    let pnl = 0;

    for (let ts = 0; ts <= 100000; ts += 100) {
      // Random walk
      price += (Math.random() - 0.5) * 3;
      const roundedMid = Math.round(price * 2) / 2;
      const spread = product === 'RAINFOREST_RESIN' ? 10 : 3;
      const halfSpread = spread / 2;

      const bestBid = Math.floor(roundedMid - halfSpread);
      const bestAsk = Math.ceil(roundedMid + halfSpread);

      const bids = [{ price: bestBid, volume: Math.floor(Math.random() * 30 + 2) }];
      const asks = [{ price: bestAsk, volume: Math.floor(Math.random() * 30 + 2) }];

      // Add depth levels randomly
      if (Math.random() > 0.3) {
        bids.push({ price: bestBid - 1, volume: Math.floor(Math.random() * 25 + 5) });
      }
      if (Math.random() > 0.3) {
        asks.push({ price: bestAsk + 1, volume: Math.floor(Math.random() * 25 + 5) });
      }
      if (Math.random() > 0.7) {
        bids.push({ price: bestBid - 2, volume: Math.floor(Math.random() * 20 + 10) });
      }
      if (Math.random() > 0.7) {
        asks.push({ price: bestAsk + 2, volume: Math.floor(Math.random() * 20 + 10) });
      }

      pnl += (Math.random() - 0.48) * 5;

      rows.push({
        day: 0,
        timestamp: ts,
        product,
        bids,
        asks,
        midPrice: (bestBid + bestAsk) / 2,
        pnl: Math.round(pnl * 10) / 10
      });

      // Generate random trades
      if (Math.random() > 0.7) {
        const tPrice = Math.random() > 0.5 ? bestAsk : bestBid;
        const trader = traderNames[Math.floor(Math.random() * traderNames.length)];
        const qty = Math.floor(Math.random() * 15 + 1);
        const isBuy = tPrice === bestAsk;

        trades.push({
          timestamp: ts,
          buyer: isBuy ? trader : '',
          seller: isBuy ? '' : trader,
          symbol: product,
          price: tPrice,
          quantity: qty,
          tradeType: 'market'
        });
      }

      // Own trades occasionally
      if (Math.random() > 0.95) {
        const isBuy = Math.random() > 0.5;
        trades.push({
          timestamp: ts,
          buyer: isBuy ? 'SUBMISSION' : 'Bot',
          seller: isBuy ? 'Bot' : 'SUBMISSION',
          symbol: product,
          price: isBuy ? bestAsk : bestBid,
          quantity: Math.floor(Math.random() * 10 + 1),
          tradeType: 'own'
        });
      }
    }
  }

  return {
    prices: { rows, products },
    trades
  };
}
