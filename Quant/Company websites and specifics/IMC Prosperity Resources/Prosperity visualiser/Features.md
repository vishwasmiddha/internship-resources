# Dashboard Features

This document describes the features of the Prosperity Visualiser dashboard and companion tooling.

## Overview

- **Interactive charts:** Multiple interactive charts driven by the `js/` scripts provide visual summaries of datasets (histograms, time-series, etc.).
- **Data parsing:** `js/dataParser.js` handles ingesting CSV/JSON and normalising data for the charts.
- **Histogram generation:** Use `histogram.py`

## User Guide (Quick Start)

- **Load data:** Click `JSON Log`, `Prices`, or `Trades` and select your files. Or click `Load Demo Data` to try the dashboard immediately.
- **Select product:** Choose the asset in the **Product** dropdown — charts and filters update to that product.
- **Show / hide layers:** Use the toggles to enable or disable `Order Book`, `All Trades`, and `Mid Price Line`.
- **Filter trades:** Set `Min` / `Max` quantity and `Trade Quantity Filter` to limit visible trades. Enable `Exact Volume` and use the slider to show only trades with that exact size.
- **Trade type toggles:** Use `Own Buys (X)`, `Own Sells (○)`, and `Bot Trades (▲)` to hide or show those markers. Note: the `Bot Trades` toggle hides all green-triangle markers (both BOT-labelled and other market trades).
- **Hover for details:** Move the cursor over the main chart to view the tooltip with order-book rows, trades, and the timestamp; the top bar shows mid price and counts.
- **Performance tuning:** Adjust `OB Point Size`, `Trade Marker Size`, and `Downsample` to improve rendering performance for large datasets.
- **Export / snapshot:** Use the file buttons and browser tools to save screenshots or export processed JSON from backend/auxiliary scripts if needed.

If something doesn't appear, confirm files were loaded (file names update next to the buttons) and that a `Product` is selected.

## Main Features

- **Upload / Load data:** Users can upload CSV or JSON files via the UI. The parser supports files with header rows and JSON arrays of objects.
- **Column selection:** If multiple columns exist, users can choose which numeric column to visualise.
- **Adjustable bins:** The histogram supports changing the number of bins (granularity) interactively.
- **Range selection / filtering:** Users can filter the data by numeric ranges or date ranges (if applicable) to focus analysis.
- **Tooltips & hover details:** Hovering over chart elements shows exact counts, bin ranges, and percentage of total.
- **Responsive & accessible legends:** Legends explain series and color encodings; they remain readable on small screens.
- **Export / download:** Charts and processed histogram data can be exported. The Python script can output JSON (bin edges + counts) suitable for direct consumption by the frontend.

## Data Handling & Preprocessing

- **Missing values:** Non-numeric or missing values are ignored when computing histograms; the UI shows the number of skipped rows.
- **Type coercion:** Strings that represent numbers are converted automatically; otherwise they are treated as missing.
- **Aggregation:** The dashboard aggregates counts per bin and shows both absolute counts and normalized densities where relevant.

## Python Helper: `histogram.py`

This repository includes a companion Python analysis script `histogram.py` that loads raw Prices and Trades CSVs and renders two exploratory histograms using `pandas`, `seaborn` and `matplotlib`.

What `histogram.py` does:
- Loads a Prices CSV and a Trades CSV (paths are set at the top of the file). The script is tolerant of both `;` and `,` separators and tries a fallback if the first parser fails.
- Filters both files for a target `product` (the `TARGET_PRODUCT` constant) so the charts focus on a single asset.
- From the Prices file it extracts resting bid and ask quote volumes across order-book levels (e.g. `bid_volume_1`, `ask_volume_1`, ...), normalises sign where needed, and aggregates them into arrays used for plotting order-book depth.
- From the Trades file it extracts executed trade sizes (quantity/volume) for the same product and prepares a frequency distribution.
- Renders two side-by-side figures:
  - Order Book Depth: overlaid histograms of bid vs ask lot sizes (uses `sns.histplot`).
  - Executed Trades: histogram of executed trade sizes (discrete bins), with the top frequent sizes annotated.

Dependencies and notes:
- Requires `pandas`, `numpy`, `matplotlib`, and `seaborn` (install via `pip install pandas numpy matplotlib seaborn`).
- The script contains hardcoded example paths (`PRICES_CSV_PATH`, `TRADES_CSV_PATH`) and `TARGET_PRODUCT`; change these to point to your data before running.
- If the Trades CSV is unavailable the script will still plot order-book histograms and display a "No Trade Data Available" message for the trades panel.

Usage example (edit paths and product at top of file, then run):

```bash
python histogram.py
```

Output:
- A Matplotlib window with two histograms (order-book depth and executed-trade size distribution). The script annotates the most frequent trade sizes when trade data is present.


## Usage Recommendations

- For large datasets, preprocess histograms with `histogram.py` and load the generated JSON to avoid heavy client-side computation.
- Keep number of bins reasonable (10–200) for performance and readability; extremely high bin counts may reduce interpretability.
- When sharing exported JSON files, include metadata (source filename, column used, bin count, date computed).

## Files to inspect

- `index.html` — main dashboard page.
- `styles.css` — styling.
- `js/app.js` — application glue code (event handlers, UI wiring).
- `js/dataParser.js` — data parsing and cleaning.
- `js/chart.js` — chart rendering utilities.
- `histogram.py` — offline histogram preprocessing script (provided).

## Next steps / Improvements

- Add CSV streaming for extremely large files and worker-thread processing in the browser.
- Add saving/loading of user chart presets (selected column, bins, filters).
- Add unit tests for `dataParser.js` and a small test suite for `histogram.py`.

---
Generated as a companion document to the dashboard.
