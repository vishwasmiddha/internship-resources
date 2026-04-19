### **Tutorial for using the dashboard**



1. Install node.js on your pc

2\. Open the prosperity visualiser directory

3\. Run below command in your terminal in current directory

npx http-server -p 8000

Leave the terminal running in the background.



Now open this link in your web browser: http://localhost:8000/

This will open up the dashboard in your browser.



**You can load data from IMC Prosperity in two ways:**

1. Download the Data capsule of the 3 days from IMC Prosperity website.

Extract the zip file.

You will find 6 csvs in the folder: prices\_round\_1\_day\_X , trades\_round\_1\_day\_X , where X = 0,-1,-2

To load the data for a day X:

In the dashboard, in the top right, click the Prices button, and select your file prices\_round\_1\_day\_X.csv

Similarly, in the top right, click the Trades button, and select your file trades\_round\_1\_day\_X.csv



2\. After submitting your algo, you can download its logs (performance data) from the IMC prosperity website. Download the zip file for the logs (say: 123456.zip)

Extract the zip file

In the top right of the dashboard, click the "JSON log" button

Navigate to your newly extracted folder, and select 123456.txt file



(If you have trouble with running my dashboard or do not like it, you may also use [Equirag visualiser](https://prosperity.equirag.com/))







**How to use the dashboard:**



The x-axis is the ticks(time) and the y-axis is the price.

In your newly loaded data: you will see the following things:

1. Yellow line: This is the mid price of the good. It is calculated by (best bid + best ask)/2. Note that some of the fluctuations in the yellow line are due to no bids or no asks existing at a tick.
2. Red dots: These are the ask quotes in the order book at any given tick.

3\. Blue dots: These are the bid quotes in the order book at any given tick.

4\. Green triangle: These are the trades executed between two dots.

5\. Purple X: These are the trades which you made with a bot where you are the buyer.

6\. Purple O: These are the trades which you made with a bot where you are the seller.

You can hover your cursor over a trade or a tick for more info.

Additionally, you will also see a PnL and a positions plot below the main graph. (Please ignore the positions graph for now, as it is a little buggy.)



On the right sidebar, you will find many features. Here is how to use them and understand them.

1. Data Selection: This section is used to import fresh data. This has been explained above.
2. Product selection: You can pick the goods that you want to see the plot of in the drop-down menu.
3. Normalise by: You can pick this option to be the mid-price if you want to fix the yellow line to be the x-axis. May be useful for some insights in order book behaviour.
4. Market info: Shows the order book structure for the tick at which the cursor is currently hovering.
5. Display and Filtering: You can disable the order book quotes, the trades, or the mid price line for selective viewing purposes.
6. Trade quantity filter: Set the upper and lower cap for showing only the trades with the volume in above brackets.
7. Quote volume cutoffs: Same as above, but it filters order book quotes instead.
8. Exact volume filter: Enable this if you want to view only the trades of a specific volume (Can provide useful insights to identify bot patterns.)
9. Performance: Apply changes to Order book point size, trade marker size or downsample points. These features can be use to increase visibility and readability of the graph.





#### **Histogram.py**



Open the python file and set the goods name and the csv locations, then run it. This will give you the frequency distribution of trades and order book quotes with respect to volume. This can be useful in identifying whale behaviour in the bots.







