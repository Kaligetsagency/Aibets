document.addEventListener('DOMContentLoaded', () => {
    const assetSelector = document.getElementById('asset-selector');
    const timeframeSelector = document.getElementById('timeframe-selector');
    const analyzeButton = document.getElementById('analyze-button');
    const priceDisplay = document.getElementById('price-display');
    const aiAnalysisOutput = document.getElementById('ai-analysis-output');
    const chartContainer = document.getElementById('chart');
    const chartLoader = document.getElementById('chart-loader');

    // --- Chart Setup ---
    const chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 400,
        layout: { textColor: '#d1d4dc', backgroundColor: '#181c27' },
        grid: { vertLines: { color: '#2f3241' }, horzLines: { color: '#2f3241' } },
        timeScale: { timeVisible: true, secondsVisible: false },
    });
    const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });
    // --- End Chart Setup ---

    const DERIV_APP_ID = 1089; // Your Deriv App ID
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
    let currentTickSubscriptionId = null;

    ws.onopen = () => {
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) return;

        if (data.msg_type === 'active_symbols') {
            const forexAssets = data.active_symbols.filter(asset => asset.market === 'forex' && asset.submarket === 'major_pairs');
            assetSelector.innerHTML = '<option value="">Select an asset</option>';
            forexAssets.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.symbol;
                option.textContent = asset.display_name;
                assetSelector.appendChild(option);
            });
            analyzeButton.disabled = false;
        }

        if (data.msg_type === 'tick') {
            const price = data.tick.quote.toFixed(5);
            priceDisplay.textContent = `Price: ${price}`;
            currentTickSubscriptionId = data.subscription.id;
        }

        if (data.msg_type === 'candles') {
            const candleData = data.candles.map(candle => ({
                time: candle.epoch,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
            }));
            candleSeries.setData(candleData);
            chartLoader.classList.remove('active');
        }
    };
    
    // Function to fetch and display chart data
    const updateChartAndPrice = () => {
        const selectedAsset = assetSelector.value;
        const selectedTimeframe = timeframeSelector.value;
        priceDisplay.textContent = 'Price: --';

        if (currentTickSubscriptionId) {
            ws.send(JSON.stringify({ forget: currentTickSubscriptionId }));
            currentTickSubscriptionId = null;
        }

        if (selectedAsset) {
            chartLoader.classList.add('active');
            // Subscribe to real-time price ticks
            ws.send(JSON.stringify({ ticks: selectedAsset, subscribe: 1 }));
            // Get history for the chart
            ws.send(JSON.stringify({
                ticks_history: selectedAsset,
                style: "candles",
                end: "latest",
                count: 60,
                granularity: parseInt(selectedTimeframe),
            }));
        } else {
             candleSeries.setData([]); // Clear chart if no asset
        }
    };
    
    assetSelector.addEventListener('change', updateChartAndPrice);
    timeframeSelector.addEventListener('change', updateChartAndPrice);

    analyzeButton.addEventListener('click', async () => {
        const selectedAsset = assetSelector.value;
        const selectedTimeframe = timeframeSelector.value;
        if (!selectedAsset) {
            alert("Please select an asset first.");
            return;
        }

        aiAnalysisOutput.innerHTML = '<div class="loader-container active"><div class="loader"></div></div>';

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset: selectedAsset, timeframe: selectedTimeframe })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to get analysis.');
            }

            const analysis = await response.json();
            aiAnalysisOutput.innerHTML = analysis.htmlContent;

        } catch (error) {
            console.error("Analysis Error:", error);
            aiAnalysisOutput.innerHTML = `<p class="error">Error: Could not fetch analysis. ${error.message}</p>`;
        }
    });

    // Resize chart with window
    window.addEventListener('resize', () => {
        chart.resize(chartContainer.clientWidth, 400);
    });
});
