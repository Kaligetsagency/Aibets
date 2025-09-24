document.addEventListener('DOMContentLoaded', () => {
    const assetSelector = document.getElementById('asset-selector');
    const timeframeSelector = document.getElementById('timeframe-selector');
    const analyzeButton = document.getElementById('analyze-button');
    const priceDisplay = document.getElementById('price-display');
    const aiAnalysisOutput = document.getElementById('ai-analysis-output');
    const chartContainer = document.getElementById('chart-container');

    const DERIV_APP_ID = 1089;
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);

    let currentSubscriptionId = null;
    let historicalData = [];
    let chart = null;
    let candlestickSeries = null;

    // --- Chart Initialization ---
    function initializeChart() {
        if (chart) chart.remove(); // Remove old chart if it exists
        
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
            layout: {
                backgroundColor: '#1e1e1e',
                textColor: '#e0e0e0',
            },
            grid: {
                vertLines: { color: '#333333' },
                horzLines: { color: '#333333' },
            },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#333333' },
            timeScale: { borderColor: '#333333' },
        });

        candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderDownColor: '#ef5350',
            borderUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            wickUpColor: '#26a69a',
        });
    }

    // --- WebSocket Event Handlers ---
    ws.onopen = () => {
        console.log("Connected to Deriv WebSocket API.");
        ws.send(JSON.stringify({
            active_symbols: "brief",
            product_type: "basic"
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            console.error("WebSocket Error:", data.error.message);
            return;
        }

        if (data.msg_type === 'active_symbols') {
            const forexAssets = data.active_symbols.filter(a => a.market === 'forex' || a.market === 'synthetic_index');
            assetSelector.innerHTML = '<option value="">Select an asset</option>';
            forexAssets.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.symbol;
                option.textContent = asset.display_name;
                assetSelector.appendChild(option);
            });
            analyzeButton.disabled = false;
        }

        if (data.msg_type === 'history') {
            historicalData = data.candles.map(c => ({
                time: c.epoch,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
            }));
            candlestickSeries.setData(historicalData);
            chart.timeScale().fitContent();
        }

        if (data.msg_type === 'tick') {
            const tick = data.tick;
            priceDisplay.textContent = `Price: ${tick.quote.toFixed(5)}`;
            const lastCandle = historicalData[historicalData.length - 1];
            
            if (lastCandle && tick.epoch > lastCandle.time) {
                // Update the last candle in real-time
                candlestickSeries.update({
                    time: tick.epoch,
                    open: lastCandle.close,
                    high: Math.max(lastCandle.high, tick.quote),
                    low: Math.min(lastCandle.low, tick.quote),
                    close: tick.quote,
                });
            }
            if (tick.subscription) {
                currentSubscriptionId = tick.subscription.id;
            }
        }
    };

    ws.onclose = () => {
        console.log("Disconnected from Deriv WebSocket API.");
        priceDisplay.textContent = "Connection lost. Please refresh.";
    };
    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        priceDisplay.textContent = "Connection error.";
    };

    // --- Data Subscription Logic ---
    function subscribeToData() {
        const selectedAsset = assetSelector.value;
        const selectedTimeframe = parseInt(timeframeSelector.value);
        priceDisplay.textContent = 'Fetching data...';
        historicalData = [];
        
        if (currentSubscriptionId) {
            ws.send(JSON.stringify({ forget: currentSubscriptionId }));
            currentSubscriptionId = null;
        }

        if (selectedAsset) {
            // Request historical data (candles)
            ws.send(JSON.stringify({
                ticks_history: selectedAsset,
                adjust_start_time: 1,
                count: 100, // Fetch more for chart history
                end: "latest",
                style: "candles",
                granularity: selectedTimeframe
            }));

            // Subscribe to live ticks for real-time updates
            ws.send(JSON.stringify({
                ticks: selectedAsset,
                subscribe: 1
            }));
        } else {
            priceDisplay.textContent = 'Select an asset to view data';
            if (candlestickSeries) candlestickSeries.setData([]);
        }
    }

    // --- Event Listeners ---
    assetSelector.addEventListener('change', subscribeToData);
    timeframeSelector.addEventListener('change', subscribeToData);

    analyzeButton.addEventListener('click', async () => {
        const selectedAsset = assetSelector.value;
        const selectedTimeframe = timeframeSelector.options[timeframeSelector.selectedIndex].text;

        if (!selectedAsset) {
            alert("Please select an asset first.");
            return;
        }

        if (historicalData.length < 28) {
             alert("Not enough historical data to perform analysis. Please wait or choose a different asset/timeframe.");
            return;
        }

        aiAnalysisOutput.innerHTML = '<div class="loader"></div>';

        // Get the last 28 candles for analysis
        const recentCandles = historicalData.slice(-28);

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset: selectedAsset,
                    timeframe: selectedTimeframe,
                    candles: recentCandles
                })
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

    // Initial chart setup
    initializeChart();
    window.addEventListener('resize', () => {
        if(chart) chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
    });
});
