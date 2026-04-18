import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

# =============================================================================
# 1. FILE PATHS & SETTINGS
# Replace these with the actual paths to the CSVs you downloaded from Intara
# =============================================================================
PRICES_CSV_PATH = r'C:\Users\dkmid\OneDrive\Desktop\Quant\prosperity\R1\ROUND1\prices_round_1_day_0.csv'   # Usually contains: timestamp, product, bid_volume_1, ask_volume_1, etc.
TRADES_CSV_PATH = r'C:\Users\dkmid\OneDrive\Desktop\Quant\prosperity\R1\ROUND1\trades_round_1_day_0.csv'   # Usually contains: timestamp, buyer, seller, product, price, quantity
TARGET_PRODUCT = 'ASH_COATED_OSMIUM' # Change to INTARIAN_PEPPER_ROOT to analyze the other asset

def plot_real_market_data(prices_file, trades_file, product):
    print(f"Loading data for {product}...")
    
    # =============================================================================
    # 2. LOAD AND PARSE THE ORDER BOOK (PRICES CSV)
    # =============================================================================
    try:
        df_prices = pd.read_csv(prices_file, sep=';') # Sometimes Prosperity uses ';' instead of ','
        if 'product' not in df_prices.columns:
            df_prices = pd.read_csv(prices_file, sep=',')
            
        # Filter for our specific product
        df_product_book = df_prices[df_prices['product'] == product].copy()
        
        # Extract all available Bid and Ask volumes across all 3 levels of the order book
        bid_vols = []
        ask_vols = []
        
        # Depending on the engine, columns are usually named bid_volume_1, bid_volume_2...
        for level in [1, 2, 3]:
            bid_col = f'bid_volume_{level}'
            ask_col = f'ask_volume_{level}'
            
            if bid_col in df_product_book.columns:
                # Drop NAs (empty levels) and add to our master list
                bid_vols.extend(df_product_book[bid_col].dropna().tolist())
            if ask_col in df_product_book.columns:
                ask_vols.extend(df_product_book[ask_col].dropna().tolist())
                
        # Convert to numpy arrays and ensure absolute values (asks are often negative)
        bid_volumes = np.abs(np.array(bid_vols))
        ask_volumes = np.abs(np.array(ask_vols))
        
        print(f"Successfully loaded {len(bid_volumes)} Bid quotes and {len(ask_volumes)} Ask quotes.")
        
    except Exception as e:
        print(f"Error loading Prices CSV. Check your file path and column names. Error: {e}")
        return

    # =============================================================================
    # 3. LOAD AND PARSE EXECUTED TRADES (TRADES CSV)
    # =============================================================================
    try:
        df_trades = pd.read_csv(trades_file, sep=';')
        if 'symbol' not in df_trades.columns and 'product' not in df_trades.columns:
             df_trades = pd.read_csv(trades_file, sep=',')
             
        # Handle column naming variations (symbol vs product, quantity vs volume)
        prod_col = 'symbol' if 'symbol' in df_trades.columns else 'product'
        qty_col = 'quantity' if 'quantity' in df_trades.columns else 'volume'
        
        df_product_trades = df_trades[df_trades[prod_col] == product].copy()
        trade_sizes = np.abs(df_product_trades[qty_col].dropna().values)
        
        print(f"Successfully loaded {len(trade_sizes)} executed trades.")
        
    except Exception as e:
        print(f"Error loading Trades CSV (You might not have access to this file yet). Error: {e}")
        trade_sizes = []

    # =============================================================================
    # 4. RENDER THE CHARTS
    # =============================================================================
    # Create a layout with 1 row and 2 columns
    fig, axes = plt.subplots(1, 2, figsize=(18, 6))
    fig.suptitle(f'Microstructure Analysis: {product}', fontsize=16, fontweight='bold')

    # --- CHART 1: Quote Volumes (Bids vs Asks) ---
    ax1 = axes[0]
    sns.histplot(bid_volumes, bins=50, color='#2ca02c', alpha=0.6, label='Resting Bids (Buyers)', element='step', fill=True, ax=ax1)
    sns.histplot(ask_volumes, bins=50, color='#d62728', alpha=0.5, label='Resting Asks (Sellers)', element='step', fill=True, ax=ax1)
    
    ax1.set_title('Order Book Depth: Bid vs Ask Lot Sizes')
    ax1.set_xlabel('Volume (Lot Size)')
    ax1.set_ylabel('Frequency (Ticks)')
    ax1.grid(axis='y', linestyle='--', alpha=0.4)
    ax1.legend()

    # --- CHART 2: Executed Trade Sizes (The Whale Radar) ---
    ax2 = axes[1]
    if len(trade_sizes) > 0:
        # We use discrete bins here because trade sizes are usually whole integers
        sns.histplot(trade_sizes, discrete=True, color='#1f77b4', alpha=0.8, ax=ax2)
        ax2.set_title('Executed Trades: Frequency of Trade Sizes (Hunt the Whale)')
        ax2.set_xlabel('Quantity Traded (Lot Size)')
        ax2.set_ylabel('Number of Occurrences')
        ax2.grid(axis='y', linestyle='--', alpha=0.4)
        
        # Annotate the most common trade sizes
        unique, counts = np.unique(trade_sizes, return_counts=True)
        top_indices = np.argsort(-counts)[:3] # Top 3 most frequent sizes
        for i in top_indices:
            ax2.text(unique[i], counts[i], f'Size {int(unique[i])}\n({counts[i]}x)', 
                     ha='center', va='bottom', fontsize=9, fontweight='bold', color='black')
    else:
        ax2.text(0.5, 0.5, 'No Trade Data Available', ha='center', va='center', fontsize=14)
        ax2.set_title('Executed Trades')

    plt.tight_layout()
    plt.show()

# Run the analyzer
if __name__ == "__main__":
    plot_real_market_data(PRICES_CSV_PATH, TRADES_CSV_PATH, TARGET_PRODUCT)