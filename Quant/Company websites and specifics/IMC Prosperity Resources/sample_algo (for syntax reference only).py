from datamodel import OrderDepth, TradingState, Order
from typing import List, Dict

class Trader:
    """
    Multi-asset market maker.
    - EMERALDS: Mean-reverting strategy around 10000.
    - TOMATOES: Random walk strategy with dynamic fair value and aggressive linear skewing.
    """
    
    # Store position limits centrally so they are easy to update
    POSITION_LIMITS = {
        "EMERALDS": 80,
        "TOMATOES": 80
    }

    def run(self, state: TradingState) -> tuple[Dict[str, List[Order]], int, str]:
        result: Dict[str, List[Order]] = {}

        # Iterate through every product available in the current tick
        for product in state.order_depths.keys():
            if product == "EMERALDS":
                result[product] = self.trade_emeralds(product, state)
            elif product == "TOMATOES":
                result[product] = self.trade_tomatoes(product, state)

        return result, 0, ""

    # ═════════════════════════════════════════════════════════════════════
    # EMERALDS STRATEGY (Mean-Reverting)
    # ═════════════════════════════════════════════════════════════════════
    def trade_emeralds(self, product: str, state: TradingState) -> List[Order]:
        order_depth: OrderDepth = state.order_depths[product]
        orders: List[Order] = []
        
        limit = self.POSITION_LIMITS[product]
        initial_position = state.position.get(product, 0)
        buy_budget = limit - initial_position
        sell_budget = limit + initial_position

        best_bid = max(order_depth.buy_orders.keys()) if order_depth.buy_orders else None
        best_ask = min(order_depth.sell_orders.keys()) if order_depth.sell_orders else None

        best_bid_vol = order_depth.buy_orders.get(best_bid, 0) if best_bid else 0
        best_ask_vol = abs(order_depth.sell_orders.get(best_ask, 0)) if best_ask else 0
        total_vol = best_bid_vol + best_ask_vol

        # Emeralds default to 10000 if the book is empty
        micro_price = 10000.0  
        imbalance = 0.5        
        
        if best_bid and best_ask and total_vol > 0:
            micro_price = (best_bid * best_ask_vol + best_ask * best_bid_vol) / total_vol
            imbalance = best_bid_vol / total_vol

        # 1. Aggressively take mispriced orders
        if order_depth.sell_orders:
            for ask_price in sorted(order_depth.sell_orders.keys()):
                if ask_price < micro_price:
                    ask_vol = -order_depth.sell_orders[ask_price]
                    qty = min(ask_vol, buy_budget)
                    if qty > 0:
                        orders.append(Order(product, ask_price, qty))
                        buy_budget -= qty

        if order_depth.buy_orders:
            for bid_price in sorted(order_depth.buy_orders.keys(), reverse=True):
                if bid_price > micro_price:
                    bid_vol = order_depth.buy_orders[bid_price]
                    qty = min(bid_vol, sell_budget)
                    if qty > 0:
                        orders.append(Order(product, bid_price, -qty))
                        sell_budget -= qty

        # 2. Smart Pennying with Threshold Inventory Skew
        if best_bid is not None and best_ask is not None:
            my_bid_price = best_bid + 1
            my_ask_price = best_ask - 1

            if imbalance < 0.2: 
                my_bid_price = best_bid - 1
            elif imbalance > 0.8:
                my_ask_price = best_ask + 1

            if initial_position > 40:
                my_bid_price -= 1  
                my_ask_price -= 1  
            elif initial_position < -40:
                my_bid_price += 1  
                my_ask_price += 1  

            my_bid_price = min(my_bid_price, best_ask - 1)
            my_ask_price = max(my_ask_price, best_bid + 1)

            if buy_budget > 0:
                bid_qty = min(buy_budget, 40)
                orders.append(Order(product, my_bid_price, bid_qty))
                buy_budget -= bid_qty
                if buy_budget > 0:
                    orders.append(Order(product, my_bid_price - 1, buy_budget))

            if sell_budget > 0:
                ask_qty = min(sell_budget, 40)
                orders.append(Order(product, my_ask_price, -ask_qty))
                sell_budget -= ask_qty
                if sell_budget > 0:
                    orders.append(Order(product, my_ask_price + 1, -sell_budget))

        return orders

    # ═════════════════════════════════════════════════════════════════════
    # TOMATOES STRATEGY (Random Walk)
    # ═════════════════════════════════════════════════════════════════════
    def trade_tomatoes(self, product: str, state: TradingState) -> List[Order]:
        order_depth: OrderDepth = state.order_depths[product]
        orders: List[Order] = []
        
        limit = self.POSITION_LIMITS[product]
        initial_position = state.position.get(product, 0)
        buy_budget = limit - initial_position
        sell_budget = limit + initial_position

        best_bid = max(order_depth.buy_orders.keys()) if order_depth.buy_orders else None
        best_ask = min(order_depth.sell_orders.keys()) if order_depth.sell_orders else None

        # Cannot trade a random walk if the book is missing a side to anchor us
        if best_bid is None or best_ask is None:
            return orders 

        best_bid_vol = order_depth.buy_orders[best_bid]
        best_ask_vol = abs(order_depth.sell_orders[best_ask])
        total_vol = best_bid_vol + best_ask_vol

        micro_price = (best_bid * best_ask_vol + best_ask * best_bid_vol) / total_vol
        imbalance = best_bid_vol / total_vol if total_vol > 0 else 0.5

        # 1. Aggressively take mispriced orders (with margin of safety)
        if order_depth.sell_orders:
            for ask_price in sorted(order_depth.sell_orders.keys()):
                if ask_price < micro_price - 0.5:
                    ask_vol = -order_depth.sell_orders[ask_price]
                    qty = min(ask_vol, buy_budget)
                    if qty > 0:
                        orders.append(Order(product, ask_price, qty))
                        buy_budget -= qty

        if order_depth.buy_orders:
            for bid_price in sorted(order_depth.buy_orders.keys(), reverse=True):
                if bid_price > micro_price + 0.5:
                    bid_vol = order_depth.buy_orders[bid_price]
                    qty = min(bid_vol, sell_budget)
                    if qty > 0:
                        orders.append(Order(product, bid_price, -qty))
                        sell_budget -= qty

        # 2. Smart Pennying with Aggressive Linear Inventory Skew
        my_bid_price = best_bid + 1
        my_ask_price = best_ask - 1

        if imbalance < 0.25: 
            my_bid_price -= 1  
        elif imbalance > 0.75:
            my_ask_price += 1  

        # Tomatoes need continuous linear pressure to avoid holding bad positions
        position_ratio = initial_position / limit
        inventory_skew = int(position_ratio * 2.5) 

        my_bid_price -= inventory_skew
        my_ask_price -= inventory_skew

        my_bid_price = min(my_bid_price, best_ask - 1)
        my_ask_price = max(my_ask_price, best_bid + 1)

        if buy_budget > 0:
            bid_qty = min(buy_budget, 40)
            orders.append(Order(product, my_bid_price, bid_qty))
            buy_budget -= bid_qty
            if buy_budget > 0:
                orders.append(Order(product, my_bid_price - 1, buy_budget))

        if sell_budget > 0:
            ask_qty = min(sell_budget, 40)
            orders.append(Order(product, my_ask_price, -ask_qty))
            sell_budget -= ask_qty
            if sell_budget > 0:
                orders.append(Order(product, my_ask_price + 1, -sell_budget))

        return orders