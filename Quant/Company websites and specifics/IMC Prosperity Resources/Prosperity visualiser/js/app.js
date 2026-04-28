// ============================================================
// app.js — Main application controller
// ============================================================

import { parsePricesCSV, parseTradesCSV, filterByProduct, generateDemoData, autoDetect } from './dataParser.js';
import { ChartRenderer } from './chart.js';

class ProsperityDashboard {
  constructor() {
    // State
    this.rawPrices = null;  // { rows, products }
    this.rawTrades = null;  // array
    this.filteredData = null;
    this.selectedProduct = '';

    // Init chart
    this.chart = new ChartRenderer(
      document.getElementById('main-chart'),
      document.getElementById('pnl-chart'),
      document.getElementById('pos-chart'),
      document.getElementById('bid-hist'),
      document.getElementById('ask-hist')
    );

    // Chart hover callback
    this.chart.onHoverChange = (ts) => this._updateLogViewer(ts);

    this._bindEvents();
  }

  _bindEvents() {
    // File imports
    document.getElementById('prices-file')?.addEventListener('change', (e) => this._loadPrices(e));
    document.getElementById('trades-file')?.addEventListener('change', (e) => this._loadTrades(e));
    document.getElementById('json-file')?.addEventListener('change', (e) => this._loadJSON(e));

    // Product selection
    document.getElementById('product-select')?.addEventListener('change', (e) => {
      this.selectedProduct = e.target.value;
      this._applyFilter();
    });

    // Normalization
    document.getElementById('normalize-select')?.addEventListener('change', (e) => {
      this.chart.setFilters({ normalize: e.target.value });
    });

    // Toggles
    document.getElementById('toggle-ob')?.addEventListener('change', (e) => {
      this.chart.setFilters({ showOB: e.target.checked });
    });
    document.getElementById('toggle-trades')?.addEventListener('change', (e) => {
      this.chart.setFilters({ showTrades: e.target.checked });
    });
    document.getElementById('toggle-midline')?.addEventListener('change', (e) => {
      this.chart.setFilters({ showMidLine: e.target.checked });
    });

    // Quantity filter
    document.getElementById('qty-min')?.addEventListener('input', (e) => {
      this.chart.setFilters({ qtyMin: parseInt(e.target.value) || 0 });
    });
    document.getElementById('qty-max')?.addEventListener('input', (e) => {
      this.chart.setFilters({ qtyMax: parseInt(e.target.value) || 999 });
    });

    // Trade cutoff and type toggles
    document.getElementById('trade-cutoff')?.addEventListener('input', (e) => {
      this.chart.setFilters({ tradeVolumeCutoff: parseInt(e.target.value) || 0 });
    });

    // Bid/Ask quote cutoff
    document.getElementById('bid-cutoff')?.addEventListener('input', (e) => {
      this.chart.setFilters({ bidQuoteCutoff: parseInt(e.target.value) || 0 });
    });
    document.getElementById('ask-cutoff')?.addEventListener('input', (e) => {
      this.chart.setFilters({ askQuoteCutoff: parseInt(e.target.value) || 0 });
    });

    // Exact volume filter
    const exactToggle = document.getElementById('exact-volume-toggle');
    const exactSlider = document.getElementById('exact-volume');
    const exactValEl = document.getElementById('exact-volume-val');
    if (exactToggle && exactSlider) {
      exactToggle.addEventListener('change', (e) => {
        this.chart.setFilters({ exactVolumeEnabled: e.target.checked });
      });
      exactSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value) || 1;
        exactValEl.textContent = v;
        this.chart.setFilters({ exactVolume: v });
      });
    }

    // Trade type toggles
    const buyToggle = document.getElementById('show-own-buys');
    const sellToggle = document.getElementById('show-own-sells');
    const botToggle = document.getElementById('show-bot-trades');
    
    console.log('Trade toggle elements:', { buyToggle, sellToggle, botToggle });
    
    if (buyToggle) {
      buyToggle.addEventListener('change', (e) => {
        console.log('showOwnBuys changed to:', e.target.checked);
        this.chart.setFilters({ showOwnBuys: e.target.checked });
      });
    }
    if (sellToggle) {
      sellToggle.addEventListener('change', (e) => {
        console.log('showOwnSells changed to:', e.target.checked);
        this.chart.setFilters({ showOwnSells: e.target.checked });
      });
    }
    if (botToggle) {
      botToggle.addEventListener('change', (e) => {
        console.log('showBotTrades changed to:', e.target.checked);
        this.chart.setFilters({ showBotTrades: e.target.checked });
      });
    }

    document.getElementById('trader-select')?.addEventListener('change', (e) => {
      this.chart.setFilters({ selectedTrader: e.target.value });
      this._calculateTraderPnL(e.target.value);
    });

    document.getElementById('scan-traders-btn')?.addEventListener('click', () => {
      this._scanTraders();
    });

    // Performance
    document.getElementById('ob-size')?.addEventListener('input', (e) => {
      this.chart.setFilters({ obSize: parseInt(e.target.value) });
    });
    document.getElementById('trade-size')?.addEventListener('input', (e) => {
      this.chart.setFilters({ tradeSize: parseInt(e.target.value) });
    });
    document.getElementById('downsample')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const downsampleVal = document.getElementById('downsample-val');
      if (downsampleVal) downsampleVal.textContent = val;
      this.chart.setFilters({ maxPoints: val });
    });

    // Demo data
    document.getElementById('load-demo')?.addEventListener('click', () => this._loadDemo());
  }

  // ======================== FILE LOADING ========================
  async _loadPrices(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('prices-file-name').textContent = file.name;
    const text = await file.text();

    // Auto-detect: if JSON, load both prices and trades from it
    const detected = autoDetect(text, file.name);
    if (detected.type === 'json') {
      return this._applyJSON(detected.data, file.name);
    }

    this.rawPrices = detected.data;
    this._updateProductDropdown();
    this._updateTopbar(file.name);

    if (this.rawPrices.products.length > 0 && !this.selectedProduct) {
      this.selectedProduct = this.rawPrices.products[0];
      document.getElementById('product-select').value = this.selectedProduct;
    }

    this._applyFilter();
  }

  async _loadTrades(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('trades-file-name').textContent = file.name;
    const text = await file.text();
    this.rawTrades = parseTradesCSV(text);
    this._applyFilter();
  }

  async _loadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const detected = autoDetect(text, file.name);
    if (detected.type === 'json') {
      this._applyJSON(detected.data, file.name);
    }
  }

  _applyJSON(data, fileName) {
    this.rawPrices = data.prices;
    this.rawTrades = data.trades;

    const meta = data.meta || {};
    const label = `${fileName} (R${meta.round || '?'} • PnL: ${meta.profit ?? '?'} • ${meta.status || ''})`;    

    this._updateProductDropdown();
    this._updateTopbar(label);
    document.getElementById('prices-file-name').textContent = fileName;
    document.getElementById('trades-file-name').textContent = data.trades.length > 0 ? `${data.trades.length} trades` : 'in JSON';
    const jsonNameEl = document.getElementById('json-file-name');
    if (jsonNameEl) jsonNameEl.textContent = fileName;

    this.selectedProduct = this.rawPrices.products[0] || '';
    document.getElementById('product-select').value = this.selectedProduct;

    this._applyFilter();
  }

  _loadDemo() {
    const demo = generateDemoData();
    this.rawPrices = demo.prices;
    this.rawTrades = demo.trades;

    this._updateProductDropdown();
    this._updateTopbar('Demo Data');
    document.getElementById('prices-file-name').textContent = 'demo';
    document.getElementById('trades-file-name').textContent = 'demo';

    // Select first product
    this.selectedProduct = this.rawPrices.products[0];
    document.getElementById('product-select').value = this.selectedProduct;

    this._applyFilter();
  }

  // ======================== FILTERING ========================
  _applyFilter() {
    if (!this.rawPrices || !this.selectedProduct) return;

    this.filteredData = filterByProduct(
      this.rawPrices.rows,
      this.rawTrades || [],
      this.selectedProduct
    );

    this.chart.setData(this.filteredData);

    // Update trader dropdown automatically
    this._scanTraders();

    // Update topbar
    const n = this.filteredData.prices.length;
    const nt = this.filteredData.trades.length;
    document.getElementById('topbar-datapoints').textContent = `${n} ticks • ${nt} trades`;

    // Update exact-volume slider range to match data
    try {
      const slider = document.getElementById('exact-volume');
      const valEl = document.getElementById('exact-volume-val');
      if (slider && valEl) {
        const trades = this.filteredData.trades || [];
        const maxQty = trades.length > 0 ? Math.max(1, ...trades.map(t => Number(t.quantity) || 0)) : 1;
        slider.min = 1;
        slider.max = Math.max(1, maxQty);
        // clamp current value
        if (Number(slider.value) > Number(slider.max)) {
          slider.value = slider.max;
          valEl.textContent = slider.value;
          this.chart.setFilters({ exactVolume: Number(slider.value) });
        }
        valEl.textContent = slider.value;
      }
    } catch (err) {
      // non-fatal
    }
  }

  _scanTraders() {
    const traderSelect = document.getElementById('trader-select');
    if (!traderSelect) return;
    
    const tradesToScan = this.rawTrades || (this.filteredData && this.filteredData.trades) || [];
    const prevVal = traderSelect.value;
    const traders = new Set();
    for (const t of tradesToScan) {
      if (t.buyer && t.buyer.trim() !== '') traders.add(t.buyer);
      if (t.seller && t.seller.trim() !== '') traders.add(t.seller);
    }
    
    traderSelect.innerHTML = '<option value="ALL">All Traders</option><option value="SUBMISSION">Myself (SUBMISSION)</option>';
    const sorted = Array.from(traders).filter(x => x !== 'SUBMISSION').sort();
    for (const b of sorted) {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      traderSelect.appendChild(opt);
    }
    
    if (traders.has(prevVal) || prevVal === 'ALL' || prevVal === 'SUBMISSION') {
      traderSelect.value = prevVal;
    } else {
      traderSelect.value = 'ALL';
      this.chart.setFilters({ selectedTrader: 'ALL' });
    }
    
    this._calculateTraderPnL(traderSelect.value);
  }

  _calculateTraderPnL(traderName) {
    const el = document.getElementById('trader-pnl-display');
    if (!el) return;
    
    if (!traderName || traderName === 'ALL') {
      el.textContent = '';
      return;
    }
    
    // We only want trades for the selected product, which are in this.filteredData.trades
    const trades = (this.filteredData && this.filteredData.trades) ? this.filteredData.trades : [];
    let cash = 0;
    let position = 0;
    
    for (const t of trades) {
      if (t.buyer === traderName) {
        cash -= t.price * t.quantity;
        position += t.quantity;
      }
      if (t.seller === traderName) {
        cash += t.price * t.quantity;
        position -= t.quantity;
      }
    }
    
    // Evaluate open position using the last known mid price for this product
    let finalMid = 0;
    if (this.filteredData && this.filteredData.prices && this.filteredData.prices.length > 0) {
      const lastPriceRow = this.filteredData.prices[this.filteredData.prices.length - 1];
      finalMid = lastPriceRow.midPrice || 0;
    }
    
    const pnl = cash + (position * finalMid);
    
    // Only display if the trader actually had trades for this product
    if (position === 0 && cash === 0) {
      el.textContent = `${traderName} has no trades for ${this.selectedProduct}`;
    } else {
      const sign = pnl > 0 ? '+' : '';
      el.textContent = `${traderName} PnL: ${sign}${(Math.round(pnl * 10) / 10).toLocaleString()} (Pos: ${position})`;
    }
  }

  // ======================== UI UPDATES ========================
  _updateProductDropdown() {
    const select = document.getElementById('product-select');
    select.innerHTML = '<option value="">— Select —</option>';
    for (const p of this.rawPrices.products) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    }
  }

  _updateTopbar(fileName) {
    document.getElementById('topbar-file').textContent = fileName || 'No data loaded';
  }

  _updateLogViewer(timestamp) {
    if (!this.filteredData || timestamp === null) {
      document.getElementById('topbar-timestamp').textContent = 'T: —';
      document.getElementById('topbar-midprice').textContent = 'Mid: —';
      return;
    }

    // Update topbar badges
    const row = this.filteredData.prices.find(r => r.timestamp === timestamp);
    document.getElementById('topbar-timestamp').textContent = `T: ${timestamp}`;
    document.getElementById('topbar-midprice').textContent = row ? `Mid: ${row.midPrice}` : 'Mid: —';

    // Update log viewer
    const logEl = document.getElementById('log-content');
    const trades = this.filteredData.trades.filter(t => t.timestamp === timestamp);

    let text = `━━━ Timestamp: ${timestamp} ━━━\n`;

    if (row) {
      text += `\n┌─ Order Book ─────────────\n`;
      for (const a of [...row.asks].reverse()) {
        text += `│  ASK  ${String(a.price).padStart(8)}  × ${String(a.volume).padStart(3)}\n`;
      }
      text += `│  ── spread ──\n`;
      for (const b of row.bids) {
        text += `│  BID  ${String(b.price).padStart(8)}  × ${String(b.volume).padStart(3)}\n`;
      }
      text += `└──────────────────────────\n`;
      text += `\n  Mid: ${row.midPrice}  |  PnL: ${row.pnl}\n`;
    }

    if (trades.length > 0) {
      text += `\n┌─ Trades (${trades.length}) ────────────\n`;
      for (const t of trades) {
        const side = t.buyer === 'SUBMISSION' ? '→ BUY ' : t.seller === 'SUBMISSION' ? '→ SELL' : '  MKT ';
        const who = t.buyer || t.seller || 'anon';
        text += `│  ${side}  ${String(t.quantity).padStart(3)} × ${String(t.price).padStart(8)}  [${who}]\n`;
      }
      text += `└──────────────────────────\n`;
    }

    logEl.textContent = text;
  }
}

// ======================== INIT ========================
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new ProsperityDashboard();
});
