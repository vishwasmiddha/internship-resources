// ============================================================
// chart.js — Canvas-based chart rendering
// ============================================================

const COLORS = {
  bid: '#3b82f6',
  bidDim: 'rgba(59,130,246,0.30)',
  ask: '#ef4444',
  askDim: 'rgba(239,68,68,0.30)',
  mid: 'rgba(250,204,21,0.45)',
  ownTrade: '#c084fc',
  marketTrade: '#22c55e',
  grid: 'rgba(255,255,255,0.04)',
  gridText: 'rgba(255,255,255,0.25)',
  pnlPos: '#22c55e',
  pnlNeg: '#ef4444',
  posLine: '#60a5fa',
  bg: '#0a0e17'
};

export class ChartRenderer {
  constructor(mainCanvas, pnlCanvas, posCanvas, bidCanvas, askCanvas) {
    this.main = { canvas: mainCanvas, ctx: mainCanvas.getContext('2d') };
    this.pnl = { canvas: pnlCanvas, ctx: pnlCanvas.getContext('2d') };
    this.pos = { canvas: posCanvas, ctx: posCanvas.getContext('2d') };
    this.bidHist = bidCanvas ? { canvas: bidCanvas, ctx: bidCanvas.getContext('2d') } : null;
    this.askHist = askCanvas ? { canvas: askCanvas, ctx: askCanvas.getContext('2d') } : null;

    // View state
    this.viewStart = 0;
    this.viewEnd = 100000;
    this.data = null;
    this.filters = {
      showOB: true,
      showTrades: true,
      showMidLine: true,
      qtyMin: 0,
      qtyMax: 999,
      obSize: 4,
      tradeSize: 8,
      maxPoints: 10000,
      normalize: 'none',
      tradeVolumeCutoff: 0,
      showOwnBuys: true,
      showOwnSells: true,
      showBotTrades: true,
      selectedTrader: 'ALL'
    };
    // quote cutoff filters
    this.filters.bidQuoteCutoff = 0;
    this.filters.askQuoteCutoff = 0;
    // exact-volume filter defaults
    this.filters.exactVolume = 1;
    this.filters.exactVolumeEnabled = false;

    // Interaction state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartView = { start: 0, end: 0 };
    this.hoverX = -1;
    this.hoverY = -1;
    this.hoveredTimestamp = null;
    this.hoveredTrade = null;

    // Padding
    this.padding = { left: 60, right: 20, top: 12, bottom: 28 };
    this.subPad = { left: 60, right: 20, top: 8, bottom: 20 };

    this._setupEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  setData(data) {
    this.data = data;
    if (data && data.timestamps.length > 0) {
      this.viewStart = data.timestamps[0];
      this.viewEnd = data.timestamps[data.timestamps.length - 1];
    }
    this.render();
  }

  setFilters(f) {
    Object.assign(this.filters, f);
    this.render();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const channels = [this.main, this.pnl, this.pos];
    if (this.bidHist) channels.push(this.bidHist);
    if (this.askHist) channels.push(this.askHist);
    for (const ch of channels) {
      const rect = ch.canvas.parentElement.getBoundingClientRect();
      ch.canvas.width = rect.width * dpr;
      ch.canvas.height = rect.height * dpr;
      ch.canvas.style.width = rect.width + 'px';
      ch.canvas.style.height = rect.height + 'px';
      ch.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ch.w = rect.width;
      ch.h = rect.height;
    }
    this.render();
  }

  // ======================== COORDINATE MAPPING ========================
  _tsToX(ts, w, pad) {
    const range = this.viewEnd - this.viewStart;
    if (range <= 0) return pad.left;
    return pad.left + (ts - this.viewStart) / range * (w - pad.left - pad.right);
  }

  _xToTs(x, w, pad) {
    const range = this.viewEnd - this.viewStart;
    return this.viewStart + (x - pad.left) / (w - pad.left - pad.right) * range;
  }

  _valToY(val, minV, maxV, h, pad) {
    const range = maxV - minV;
    if (range <= 0) return h / 2;
    return pad.top + (1 - (val - minV) / range) * (h - pad.top - pad.bottom);
  }

  // ======================== EVENT HANDLING ========================
  _setupEvents() {
    const el = this.main.canvas.parentElement;

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const range = this.viewEnd - this.viewStart;
      const ratio = (mx - this.padding.left) / (this.main.w - this.padding.left - this.padding.right);
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
      const newRange = Math.max(500, Math.min(range * zoomFactor, this.data ? (this.data.timestamps[this.data.timestamps.length-1] - this.data.timestamps[0]) * 1.1 : 200000));
      const center = this.viewStart + range * Math.max(0, Math.min(1, ratio));
      this.viewStart = center - newRange * ratio;
      this.viewEnd = center + newRange * (1 - ratio);
      this.render();
    }, { passive: false });

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartView = { start: this.viewStart, end: this.viewEnd };
      el.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      this.hoverX = e.clientX - rect.left;
      this.hoverY = e.clientY - rect.top;

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const pxRange = this.main.w - this.padding.left - this.padding.right;
        const tsRange = this.dragStartView.end - this.dragStartView.start;
        const tsDelta = -dx / pxRange * tsRange;
        this.viewStart = this.dragStartView.start + tsDelta;
        this.viewEnd = this.dragStartView.end + tsDelta;
        this.render();
      } else {
        this._updateHover();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        el.style.cursor = 'crosshair';
      }
    });

    el.addEventListener('mouseleave', () => {
      this.hoverX = -1;
      this.hoverY = -1;
      this.hoveredTimestamp = null;
      this._hideCrosshair();
      this._hideTooltip();
      if (this.onHoverChange) this.onHoverChange(null);
    });
  }

  _updateHover() {
    if (!this.data || this.hoverX < 0) return;
    const ts = this._xToTs(this.hoverX, this.main.w, this.padding);
    // Find closest timestamp
    const tsList = this.data.timestamps;
    let closest = tsList[0];
    let minDist = Infinity;
    // Binary search for efficiency
    let lo = 0, hi = tsList.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const dist = Math.abs(tsList[mid] - ts);
      if (dist < minDist) { minDist = dist; closest = tsList[mid]; }
      if (tsList[mid] < ts) lo = mid + 1; else hi = mid - 1;
    }
    this.hoveredTimestamp = closest;
    this._showCrosshair();

    // Detect nearest trade marker to the mouse (within a small pixel radius)
    // Build visible price range for mapping
    const pricesVisible = this.data.prices.filter(r => r.timestamp >= this.viewStart && r.timestamp <= this.viewEnd);
    const ds = this._downsample(pricesVisible, this.filters.maxPoints);

    let minP = Infinity, maxP = -Infinity;
    for (const r of ds) {
      const normVal = this.filters.normalize === 'mid_price' && r.midPrice != null ? r.midPrice : 0;
      for (const b of r.bids) {
        if (Number(b.volume) < (this.filters.bidQuoteCutoff || 0)) continue;
        const p = b.price - normVal;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
      for (const a of r.asks) {
        if (Number(a.volume) < (this.filters.askQuoteCutoff || 0)) continue;
        const p = a.price - normVal;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
    }
    if (minP === Infinity) { this.hoveredTrade = null; this._showTooltip(); return; }
    const priceRange = maxP - minP || 1;
    minP -= priceRange * 0.05;
    maxP += priceRange * 0.05;

    // visible trades (same filtering as render)
    const visibleTrades = this.data.trades.filter(t =>
      t.timestamp >= this.viewStart && t.timestamp <= this.viewEnd &&
      t.quantity >= this.filters.qtyMin && t.quantity <= this.filters.qtyMax &&
      t.quantity >= (this.filters.tradeVolumeCutoff || 0) &&
        (!this.filters.exactVolumeEnabled || Number(t.quantity) === Number(this.filters.exactVolume)) &&
        (!this.filters.selectedTrader || this.filters.selectedTrader === 'ALL' || t.buyer === this.filters.selectedTrader || t.seller === this.filters.selectedTrader)
    );

    // Find nearest trade marker to (hoverX, hoverY)
    let nearest = null;
    let minTradeDist = Infinity;
    for (const t of visibleTrades) {
      // apply type toggles
      const buyerUpper = (t.buyer || '').toString().toUpperCase();
      const sellerUpper = (t.seller || '').toString().toUpperCase();
      if (buyerUpper === 'SUBMISSION' && !this.filters.showOwnBuys) continue;
      if (sellerUpper === 'SUBMISSION' && !this.filters.showOwnSells) continue;
      // Treat any non-own trade marker as a "green triangle". The bot-trade toggle
      // hides all green triangles (both explicit BOT-labelled trades and other market trades).
      const isGreenTriangle = !(buyerUpper === 'SUBMISSION' || sellerUpper === 'SUBMISSION');
      if (isGreenTriangle && !this.filters.showBotTrades) continue;

      const normRow = this.data.prices.find(r => r.timestamp === t.timestamp);
      const normVal = this.filters.normalize === 'mid_price' && normRow?.midPrice ? normRow.midPrice : 0;
      const x = this._tsToX(t.timestamp, this.main.w, this.padding);
      const y = this._valToY(t.price - normVal, minP, maxP, this.main.h, this.padding);
      const dx = x - this.hoverX;
      const dy = y - this.hoverY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minTradeDist) { minTradeDist = dist; nearest = t; }
    }

    // threshold in pixels
    if (minTradeDist <= 12) this.hoveredTrade = nearest; else this.hoveredTrade = null;

    this._showTooltip();
    if (this.onHoverChange) this.onHoverChange(closest);
  }

  _showCrosshair() {
    const chX = document.getElementById('crosshair-x');
    const chY = document.getElementById('crosshair-y');
    if (!chX || !chY) return;
    chX.classList.remove('hidden');
    chY.classList.remove('hidden');
    chX.style.left = this.hoverX + 'px';
    chY.style.top = this.hoverY + 'px';
  }

  _hideCrosshair() {
    document.getElementById('crosshair-x')?.classList.add('hidden');
    document.getElementById('crosshair-y')?.classList.add('hidden');
  }

  _showTooltip() {
    if (!this.data || (!this.hoveredTimestamp && !this.hoveredTrade)) return;
    const tt = document.getElementById('tooltip');
    if (!tt) return;

    let html = '';
    if (this.hoveredTrade) {
      const t = this.hoveredTrade;
      const side = t.buyer === 'SUBMISSION' ? 'BUY' : t.seller === 'SUBMISSION' ? 'SELL' : 'MKT';
      html += `<div class="tt-header">Trade • T: ${t.timestamp}</div>`;
      html += `<div>Type: ${side}</div>`;
      html += `<div>Qty: ${t.quantity} × ${t.price}</div>`;
      html += `<div>Buyer: ${t.buyer || '-'}<br>Seller: ${t.seller || '-'}</div>`;
    } else {
      const ts = this.hoveredTimestamp;
      const priceRow = this.data.prices.find(r => r.timestamp === ts);
      const tsTrades = this.data.trades.filter(t => t.timestamp === ts);
      html += `<div class="tt-header">T: ${ts}</div>`;
      if (priceRow) {
        html += `<span class="tt-bid">BID:</span>`;
        for (const b of priceRow.bids) html += ` ${b.price}×${b.volume}`;
        html += `<br><span class="tt-ask">ASK:</span>`;
        for (const a of priceRow.asks) html += ` ${a.price}×${a.volume}`;
        html += `<br>Mid: ${priceRow.midPrice} | PnL: ${priceRow.pnl}`;
      }
      if (tsTrades.length > 0) {
        html += `<br><span class="tt-trade">TRADES:</span>`;
        for (const t of tsTrades.slice(0, 5)) {
          const side = t.buyer === 'SUBMISSION' ? 'BUY' : t.seller === 'SUBMISSION' ? 'SELL' : 'MKT';
          const who = t.buyer || t.seller || '?';
          html += `<br>  ${side} ${t.quantity}×${t.price} (${who})`;
        }
        if (tsTrades.length > 5) html += `<br>  ...+${tsTrades.length - 5} more`;
      }
    }

    tt.innerHTML = html;
    tt.classList.remove('hidden');

    // Position tooltip
    const container = this.main.canvas.parentElement.getBoundingClientRect();
    let tx = this.hoverX + 16;
    let ty = this.hoverY - 10;
    if (tx + 260 > container.width) tx = this.hoverX - 270;
    if (ty + tt.offsetHeight > container.height) ty = container.height - tt.offsetHeight - 8;
    if (ty < 4) ty = 4;
    tt.style.left = tx + 'px';
    tt.style.top = ty + 'px';
  }

  _hideTooltip() {
    document.getElementById('tooltip')?.classList.add('hidden');
    this.hoveredTrade = null;
  }

  // ======================== RENDER ========================
  render() {
    this._renderMain();
    this._renderSubChart(this.pnl, this.data?.pnl, COLORS.pnlPos, COLORS.pnlNeg, true);
    this._renderSubChart(this.pos, this.data?.position, COLORS.posLine, COLORS.posLine, false);
    this._renderHistograms();
  }

  _renderHistograms() {
    const draw = (histObj, volumes, color) => {
      if (!histObj) return;
      const { ctx, w, h } = histObj;
      ctx.clearRect(0, 0, w, h);
      if (!volumes || volumes.length === 0) return;

      const buckets = Math.min(20, Math.max(4, Math.ceil(Math.sqrt(volumes.length))));
      const maxVol = Math.max(...volumes);
      const bucketSize = Math.max(1, Math.ceil((maxVol + 1) / buckets));
      const counts = new Array(buckets).fill(0);
      for (const v of volumes) {
        const idx = Math.min(buckets - 1, Math.floor(Number(v) / bucketSize));
        counts[idx]++;
      }
      const maxCount = Math.max(...counts) || 1;

      const padL = 4, padR = 4, padT = 4, padB = 8;
      const bw = (w - padL - padR) / buckets;
      ctx.fillStyle = color;
      for (let i = 0; i < buckets; i++) {
        const barH = (counts[i] / maxCount) * (h - padT - padB);
        const x = padL + i * bw;
        const y = h - padB - barH;
        ctx.fillRect(x, y, Math.max(1, bw - 2), barH);
      }

      // small axis labels: left = count
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(maxCount), 4, 10);
      ctx.fillText('0', 4, h - 2);
    };

    const bidVolumes = [];
    const askVolumes = [];
    if (this.data && this.data.prices) {
      for (const r of this.data.prices) {
        for (const b of r.bids) {
          if (Number(b.volume) >= (this.filters.bidQuoteCutoff || 0)) bidVolumes.push(Number(b.volume) || 0);
        }
        for (const a of r.asks) {
          if (Number(a.volume) >= (this.filters.askQuoteCutoff || 0)) askVolumes.push(Number(a.volume) || 0);
        }
      }
    }

    // If no volumes, render a small placeholder message to indicate lack of data
    if ((!bidVolumes || bidVolumes.length === 0) && this.bidHist) {
      const { ctx, w, h } = this.bidHist;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('No bid quote volume data', 6, h / 2 + 4);
    } else {
      draw(this.bidHist, bidVolumes, COLORS.bid);
    }

    if ((!askVolumes || askVolumes.length === 0) && this.askHist) {
      const { ctx, w, h } = this.askHist;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('No ask quote volume data', 6, h / 2 + 4);
    } else {
      draw(this.askHist, askVolumes, COLORS.ask);
    }
  }

  _renderMain() {
    const { ctx, w, h } = this.main;
    const pad = this.padding;
    ctx.clearRect(0, 0, w, h);

    if (!this.data || this.data.prices.length === 0) {
      ctx.fillStyle = COLORS.gridText;
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Load data or click "Load Demo Data" to start', w / 2, h / 2);
      return;
    }

    const prices = this.data.prices;
    const norm = this.filters.normalize;

    // Filter visible data
    const visible = prices.filter(r => r.timestamp >= this.viewStart && r.timestamp <= this.viewEnd);
    if (visible.length === 0) return;

    // Downsample if needed
    const ds = this._downsample(visible, this.filters.maxPoints);

    // Compute price range
    let minP = Infinity, maxP = -Infinity;
    for (const r of ds) {
      const normVal = norm === 'mid_price' && r.midPrice ? r.midPrice : 0;
      for (const b of r.bids) {
        const p = b.price - normVal;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
      for (const a of r.asks) {
        const p = a.price - normVal;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
    }

    // Add margin
    const priceRange = maxP - minP || 1;
    minP -= priceRange * 0.05;
    maxP += priceRange * 0.05;

    // Draw grid
    this._drawGrid(ctx, w, h, pad, minP, maxP);

    // Draw mid price line
    if (this.filters.showMidLine) {
      ctx.beginPath();
      ctx.strokeStyle = COLORS.mid;
      ctx.lineWidth = 1;
      let started = false;
      for (const r of ds) {
        if (r.midPrice == null) continue;
        const normVal = norm === 'mid_price' ? r.midPrice : 0;
        const x = this._tsToX(r.timestamp, w, pad);
        const y = this._valToY(r.midPrice - normVal, minP, maxP, h, pad);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw order book dots
    if (this.filters.showOB) {
      const obSize = this.filters.obSize;
      for (const r of ds) {
        const normVal = norm === 'mid_price' && r.midPrice ? r.midPrice : 0;
        const x = this._tsToX(r.timestamp, w, pad);

        for (const b of r.bids) {
          if (Number(b.volume) < (this.filters.bidQuoteCutoff || 0)) continue;
          const y = this._valToY(b.price - normVal, minP, maxP, h, pad);
          const sz = Math.max(1, Math.min(obSize + Math.log2(b.volume + 1), obSize * 2.5));
          ctx.fillStyle = COLORS.bidDim;
          ctx.beginPath();
          ctx.arc(x, y, sz, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const a of r.asks) {
          if (Number(a.volume) < (this.filters.askQuoteCutoff || 0)) continue;
          const y = this._valToY(a.price - normVal, minP, maxP, h, pad);
          const sz = Math.max(1, Math.min(obSize + Math.log2(a.volume + 1), obSize * 2.5));
          ctx.fillStyle = COLORS.askDim;
          ctx.beginPath();
          ctx.arc(x, y, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw trades
    if (this.filters.showTrades) {
      const visibleTrades = this.data.trades.filter(t => {
        if (t.timestamp < this.viewStart || t.timestamp > this.viewEnd) return false;
        if (t.quantity < this.filters.qtyMin || t.quantity > this.filters.qtyMax) return false;
        if (t.quantity < (this.filters.tradeVolumeCutoff || 0)) return false;
        if (this.filters.exactVolumeEnabled && Number(t.quantity) !== Number(this.filters.exactVolume)) return false;
        if (this.filters.selectedTrader && this.filters.selectedTrader !== 'ALL') {
          if (t.buyer !== this.filters.selectedTrader && t.seller !== this.filters.selectedTrader) return false;
        }

        const buyerUpper = (t.buyer || '').toString().toUpperCase();
        const sellerUpper = (t.seller || '').toString().toUpperCase();

          // Filter by type toggles
          if (buyerUpper === 'SUBMISSION' && !this.filters.showOwnBuys) return false;
          if (sellerUpper === 'SUBMISSION' && !this.filters.showOwnSells) return false;
          // Treat any non-own trade marker as a "green triangle". The bot-trade toggle
          // hides all green triangles (both explicit BOT-labelled trades and other market trades).
          const isGreenTriangle = !(buyerUpper === 'SUBMISSION' || sellerUpper === 'SUBMISSION');
          if (isGreenTriangle && !this.filters.showBotTrades) return false;

        return true;
      });

      const sz = this.filters.tradeSize;
      for (const t of visibleTrades) {
        const normRow = prices.find(r => r.timestamp === t.timestamp);
        const normVal = norm === 'mid_price' && normRow?.midPrice ? normRow.midPrice : 0;
        const x = this._tsToX(t.timestamp, w, pad);
        const y = this._valToY(t.price - normVal, minP, maxP, h, pad);
        const buyerUpper = (t.buyer || '').toString().toUpperCase();
        const sellerUpper = (t.seller || '').toString().toUpperCase();

        // Own buy fills (buyer == SUBMISSION) -> purple X
        if (buyerUpper === 'SUBMISSION') {
          ctx.strokeStyle = COLORS.ownTrade;
          ctx.lineWidth = Math.max(2, Math.round(sz / 3));
          const half = sz;
          ctx.beginPath();
          ctx.moveTo(x - half, y - half); ctx.lineTo(x + half, y + half);
          ctx.moveTo(x + half, y - half); ctx.lineTo(x - half, y + half);
          ctx.stroke();

        // Own sell fills (seller == SUBMISSION) -> purple circle
        } else if (sellerUpper === 'SUBMISSION') {
          ctx.fillStyle = COLORS.ownTrade;
          const radius = Math.max(2, Math.round(sz * 0.9));
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();

        // Bot trades -> green triangle
        } else if (buyerUpper.includes('BOT') || sellerUpper.includes('BOT')) {
          const half = sz * 2;
          ctx.fillStyle = COLORS.marketTrade;
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.moveTo(x, y - half);
          ctx.lineTo(x - half, y + half);
          ctx.lineTo(x + half, y + half);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1.0;

        // Other market trades -> smaller green triangle
        } else {
          const half = sz;
          ctx.fillStyle = COLORS.marketTrade;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.moveTo(x, y - half);
          ctx.lineTo(x - half, y + half);
          ctx.lineTo(x + half, y + half);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }

        // Highlight hovered trade marker
        if (this.hoveredTrade === t) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = 1.8;
          if (buyerUpper === 'SUBMISSION') {
            const halfH = Math.max(2, sz + 2);
            ctx.beginPath();
            ctx.moveTo(x - halfH, y - halfH); ctx.lineTo(x + halfH, y + halfH);
            ctx.moveTo(x + halfH, y - halfH); ctx.lineTo(x - halfH, y + halfH);
            ctx.stroke();
          } else if (sellerUpper === 'SUBMISSION') {
            const r = Math.max(3, sz + 2);
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          } else {
            // outline triangle
            const halfH = Math.max(3, sz + 2);
            ctx.beginPath();
            ctx.moveTo(x, y - halfH);
            ctx.lineTo(x - halfH, y + halfH);
            ctx.lineTo(x + halfH, y + halfH);
            ctx.closePath();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    // Highlight hovered timestamp
    if (this.hoveredTimestamp !== null) {
      const x = this._tsToX(this.hoveredTimestamp, w, pad);
      if (x >= pad.left && x <= w - pad.right) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, h - pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  _renderSubChart(ch, series, posColor, negColor, isTwoColor) {
    const { ctx, w, h } = ch;
    const pad = this.subPad;
    ctx.clearRect(0, 0, w, h);

    if (!series || series.length === 0) return;

    const visible = series.filter(s => s.timestamp >= this.viewStart && s.timestamp <= this.viewEnd);
    if (visible.length === 0) return;

    let minV = Infinity, maxV = -Infinity;
    for (const s of visible) {
      if (s.value < minV) minV = s.value;
      if (s.value > maxV) maxV = s.value;
    }
    const range = maxV - minV || 1;
    minV -= range * 0.1;
    maxV += range * 0.1;

    // Zero line
    if (isTwoColor && minV < 0 && maxV > 0) {
      const zeroY = this._valToY(0, minV, maxV, h, pad);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, zeroY);
      ctx.lineTo(w - pad.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw line
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    let started = false;
    for (const s of visible) {
      const x = this._tsToX(s.timestamp, w, pad);
      const y = this._valToY(s.value, minV, maxV, h, pad);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }

    if (isTwoColor) {
      const lastVal = visible[visible.length - 1]?.value || 0;
      ctx.strokeStyle = lastVal >= 0 ? posColor : negColor;
    } else {
      ctx.strokeStyle = posColor;
    }
    ctx.stroke();

    // Fill area
    if (visible.length > 1) {
      const firstX = this._tsToX(visible[0].timestamp, w, pad);
      const lastX = this._tsToX(visible[visible.length - 1].timestamp, w, pad);
      const baseY = isTwoColor ? this._valToY(0, minV, maxV, h, pad) : h - pad.bottom;

      ctx.lineTo(lastX, baseY);
      ctx.lineTo(firstX, baseY);
      ctx.closePath();

      const lastV = visible[visible.length - 1]?.value || 0;
      const color = isTwoColor ? (lastV >= 0 ? posColor : negColor) : posColor;
      ctx.fillStyle = color.replace(')', ',0.08)').replace('rgb', 'rgba');
      ctx.fill();
    }

    // Y-axis labels
    ctx.fillStyle = COLORS.gridText;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const val = minV + (maxV - minV) * i / steps;
      const y = this._valToY(val, minV, maxV, h, pad);
      ctx.fillText(val.toFixed(1), pad.left - 6, y + 3);
    }
  }

  _drawGrid(ctx, w, h, pad, minP, maxP) {
    ctx.fillStyle = COLORS.gridText;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = '10px JetBrains Mono, monospace';

    // Y-axis (price) grid
    const priceRange = maxP - minP;
    const priceStep = this._niceStep(priceRange, 8);
    const startPrice = Math.ceil(minP / priceStep) * priceStep;

    ctx.textAlign = 'right';
    for (let p = startPrice; p <= maxP; p += priceStep) {
      const y = this._valToY(p, minP, maxP, h, pad);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(priceStep < 1 ? 1 : 0), pad.left - 6, y + 3);
    }

    // X-axis (time) grid
    const tsRange = this.viewEnd - this.viewStart;
    const tsStep = this._niceStep(tsRange, 8);
    const startTs = Math.ceil(this.viewStart / tsStep) * tsStep;

    ctx.textAlign = 'center';
    for (let t = startTs; t <= this.viewEnd; t += tsStep) {
      const x = this._tsToX(t, w, pad);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, h - pad.bottom);
      ctx.stroke();
      ctx.fillText(t.toString(), x, h - pad.bottom + 14);
    }
  }

  _niceStep(range, maxTicks) {
    const rough = range / maxTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 5) step = 5;
    else step = 10;
    return step * mag;
  }

  _downsample(data, maxPoints) {
    if (data.length <= maxPoints) return data;
    const step = Math.ceil(data.length / maxPoints);
    const result = [];
    for (let i = 0; i < data.length; i += step) {
      result.push(data[i]);
    }
    return result;
  }
}
