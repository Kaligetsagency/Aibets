document.addEventListener('DOMContentLoaded', () => {
    const assetSelector = document.getElementById('asset-selector');
    const analyzeButton = document.getElementById('analyze-button');
    const priceDisplay = document.getElementById('price-display');
    const analysisOutput = document.getElementById('ai-analysis-output');
    const chartCanvas = document.getElementById('priceChart');
    const loader = document.querySelector('.loader');

    let priceChart = null; // Variable to hold the Chart.js instance

    // Enable the button once an asset is selected
    assetSelector.addEventListener('change', () => {
        analyzeButton.disabled = !assetSelector.value;
    });

    analyzeButton.addEventListener('click', analyzeAsset);

    async function analyzeAsset() {
        const asset = assetSelector.value;
        if (!asset) return;

        // 1. Set Loading State
        analysisOutput.innerHTML = '';
        analysisOutput.appendChild(loader);
        loader.style.display = 'block';
        analyzeButton.disabled = true;
        priceDisplay.textContent = 'Current Price: Fetching Data...';

        try {
            // 2. Call the new server endpoint
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `Server error: ${response.status}`);
            }

            const data = await response.json();
            const { analysis, chartData, currentPrice } = data;

            // 3. Update Price Display
            priceDisplay.textContent = `Current Price: ${currentPrice}`;

            // 4. Render Chart
            renderChart(chartData);

            // 5. Render Structured Analysis
            renderAnalysis(analysis);

        } catch (error) {
            console.error('Analysis failed:', error);
            analysisOutput.innerHTML = `<p class="placeholder" style="color: var(--bearish-color);">Error: ${error.message}. Please check your API keys or try a different asset.</p>`;
            priceDisplay.textContent = 'Current Price: --';
            if (priceChart) priceChart.destroy();
        } finally {
            // 6. Reset State
            loader.style.display = 'none';
            analyzeButton.disabled = false;
        }
    }

    function renderChart(data) {
        if (priceChart) {
            priceChart.destroy(); // Destroy previous chart instance
        }

        // Prepare data for Chart.js
        const chartDataPoints = data.map(d => ({
            x: new Date(d.date),
            y: [d.open, d.high, d.low, d.close]
        }));
        
        // Define colors based on price change
        const colors = chartDataPoints.map(d => (d.y[3] >= d.y[0] ? 'rgba(76, 175, 80, 1)' : 'rgba(244, 67, 54, 1)'));

        priceChart = new Chart(chartCanvas, {
            type: 'bar', // Using bar chart as a simple candlestick substitute with Chart.js
            data: {
                datasets: [{
                    label: 'Price Action (Daily)',
                    data: chartDataPoints,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: 'var(--secondary-text-color)' }
                    },
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: 'var(--secondary-text-color)' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `${assetSelector.value} Daily Price Action`,
                        color: 'var(--primary-text-color)'
                    }
                }
            }
        });
    }

    function renderAnalysis(analysis) {
        // Normalize sentiment for CSS class (lowercase and no special chars)
        const sentimentClass = analysis.sentiment.toLowerCase().replace(/[^a-z0-9]/g, '');

        analysisOutput.innerHTML = `
            <div class="analysis-header">
                <div class="sentiment ${sentimentClass}">
                    ${analysis.sentiment.toUpperCase()}
                </div>
                <div class="confidence-score">
                    Confidence: ${analysis.confidence_score}/10
                </div>
            </div>

            <h3>Trend Prediction (Next 4-8 hours)</h3>
            <p>${analysis.trend_prediction}</p>

            <h3>Justification</h3>
            <p>${analysis.justification}</p>

            <h3>Key Price Levels</h3>
            <div style="display: flex; gap: 2rem;">
                <div>
                    <h4>Support:</h4>
                    <ul class="levels-list">
                        ${analysis.support_levels.map(level => `<li>${level.toFixed(5)}</li>`).join('')}
                    </ul>
                </div>
                <div>
                    <h4>Resistance:</h4>
                    <ul class="levels-list">
                        ${analysis.resistance_levels.map(level => `<li>${level.toFixed(5)}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <div class="trade-idea-box">
                <strong>Potential Trade Idea:</strong>
                <p>${analysis.trade_idea}</p>
                <p style="font-size: 0.75rem; color: #888; margin-top: 0.5rem;">Disclaimer: This is for informational purposes only and is not financial advice.</p>
            </div>
        `;
    }

    // Initial load, populate assets (already done in index.html for simplicity, but could be an API call)
    analyzeButton.disabled = true; 
});
