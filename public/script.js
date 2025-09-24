document.addEventListener('DOMContentLoaded', () => {
    const assetSelector = document.getElementById('asset-selector');
    const analyzeButton = document.getElementById('analyze-button');
    const priceDisplay = document.getElementById('price-display');
    const analysisOutput = document.getElementById('ai-analysis-output');
    const chartCanvas = document.getElementById('priceChart');
    
    // Create the loader element in JavaScript
    const loader = document.createElement('div');
    loader.className = 'loader'; 
    
    let priceChart = null; 

    // --- 1. Asset Population Logic ---
    async function populateAssets() {
        try {
            const response = await fetch('/assets');
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `Server error: ${response.status}`);
            }
            const assets = await response.json();
            
            // Clear loading message and add default
            assetSelector.innerHTML = '<option value="" disabled selected>Select an Asset...</option>';
            
            assets.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.symbol;
                option.textContent = asset.name;
                assetSelector.appendChild(option);
            });

        } catch (error) {
            assetSelector.innerHTML = '<option value="" disabled selected>Error loading assets</option>';
            console.error('Failed to populate assets:', error);
        }
    }

    // Call asset population on load
    populateAssets();
    
    // --- 2. Event Listeners ---
    assetSelector.addEventListener('change', () => {
        analyzeButton.disabled = !assetSelector.value;
    });

    analyzeButton.addEventListener('click', analyzeAsset);

    // --- 3. Main Analysis Logic ---
    async function analyzeAsset() {
        const asset = assetSelector.value;
        if (!asset) return;

        // Set Loading State
        analysisOutput.innerHTML = '';
        analysisOutput.appendChild(loader);
        loader.style.display = 'block';
        analyzeButton.disabled = true;
        priceDisplay.textContent = 'Price: Fetching Data...';
        
        const assetName = assetSelector.options[assetSelector.selectedIndex].text;

        try {
            // Call the server endpoint
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

            // Update Price Display
            priceDisplay.textContent = `Price: ${parseFloat(currentPrice).toFixed(3)}`;

            // Render Chart
            renderChart(chartData, assetName);

            // Render Structured Analysis
            renderAnalysis(analysis);

        } catch (error) {
            console.error('Analysis failed:', error);
            analysisOutput.innerHTML = `<p class="placeholder" style="color: var(--bearish-color);">Analysis Error: ${error.message}.</p>`;
            priceDisplay.textContent = 'Price: --';
            if (priceChart) priceChart.destroy();
        } finally {
            // Reset State
            loader.style.display = 'none';
            analyzeButton.disabled = false;
        }
    }

    // --- 4. Chart Rendering ---
    function renderChart(data, assetName) {
        if (priceChart) {
            priceChart.destroy(); 
        }
        
        // Prepare data for Chart.js
        const chartDataPoints = data.map(d => ({
            x: new Date(d.epoch * 1000), 
            y: [d.low, d.high] // Low/High for bar range
        }));
        
        // Define colors based on open vs close (Bullish/Bearish)
        const colors = data.map(d => (d.close >= d.open ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)'));

        priceChart = new Chart(chartCanvas, {
            type: 'bar', // Using bar chart as a simple candlestick substitute
            data: {
                datasets: [{
                    label: 'Daily Price Action',
                    data: chartDataPoints,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1,
                    barPercentage: 1.0, 
                    categoryPercentage: 1.0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day' },
                        grid: { display: false },
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
                        text: `${assetName} Daily Candles (Last 30 days)`,
                        color: 'var(--primary-text-color)'
                    }
                }
            }
        });
    }

    // --- 5. Structured JSON Rendering ---
    function renderAnalysis(analysis) {
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

            <h3>Trend Prediction</h3>
            <p>${analysis.trend_prediction}</p>

            <h3>Justification</h3>
            <p>${analysis.justification}</p>

            <h3>Key Price Levels</h3>
            <div style="display: flex; gap: 2rem;">
                <div>
                    <h4>Support:</h4>
                    <ul class="levels-list">
                        ${analysis.support_levels.map(level => `<li>${parseFloat(level).toFixed(3)}</li>`).join('')}
                    </ul>
                </div>
                <div>
                    <h4>Resistance:</h4>
                    <ul class="levels-list">
                        ${analysis.resistance_levels.map(level => `<li>${parseFloat(level).toFixed(3)}</li>`).join('')}
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
});
