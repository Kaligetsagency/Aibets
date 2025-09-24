document.addEventListener('DOMContentLoaded', () => {
    const assetSelect = document.getElementById('asset-select');
    const analysisContainer = document.getElementById('analysis-container');
    const loader = document.getElementById('loader');
    const results = document.getElementById('results');
    const forecastResult = document.getElementById('forecast-result');
    const sentimentResult = document.getElementById('sentiment-result');
    const reversalResult = document.getElementById('reversal-result');
    const detailsResult = document.getElementById('details-result');
    const errorMessage = document.getElementById('error-message');

    let derivWs;
    let tickSubscriber;

    // --- 1. Fetch available assets from our server ---
    async function populateAssetDropdown() {
        try {
            const response = await fetch('/api/assets');
            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }
            const assets = await response.json();

            assetSelect.innerHTML = '<option value="">-- Select an Asset --</option>';
            assets.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.symbol;
                option.textContent = asset.displayName;
                assetSelect.appendChild(option);
            });
        } catch (error) {
            assetSelect.innerHTML = '<option value="">Could not load assets</option>';
            showError('Failed to fetch the list of forex assets. Please refresh the page.');
            console.error('Error populating asset dropdown:', error);
        }
    }

    // --- 2. Handle asset selection ---
    assetSelect.addEventListener('change', async (event) => {
        const selectedSymbol = event.target.value;
        if (!selectedSymbol) {
            analysisContainer.classList.add('hidden');
            return;
        }
        
        // Unsubscribe from previous tick stream if it exists
        if (tickSubscriber) {
            tickSubscriber.unsubscribe();
        }

        analysisContainer.classList.remove('hidden');
        showLoading(true);
        hideError();
        resetResults();

        connectToDerivAndFetchTick(selectedSymbol);
    });

    // --- 3. Connect to Deriv WebSocket and get real-time data ---
    function connectToDerivAndFetchTick(symbol) {
        if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
            derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
        }

        derivWs.onopen = () => {
            console.log('Deriv WebSocket connected.');
            derivWs.send(JSON.stringify({ ticks: symbol }));
        };

        derivWs.onmessage = async (msg) => {
            const data = JSON.parse(msg.data);

            if (data.error) {
                console.error('Deriv API Error:', data.error.message);
                showError(`Error from Deriv API: ${data.error.message}`);
                showLoading(false);
                return;
            }

            if (data.msg_type === 'tick') {
                console.log('Tick data received:', data.tick);
                
                // Once we have the first tick, send it for analysis
                await getAIAnalysis(data.tick);
                
                // Unsubscribe to prevent continuous analysis on every tick
                derivWs.send(JSON.stringify({ "forget": data.subscription.id }));
            }
        };
        
        derivWs.onerror = (error) => {
            console.error('Deriv WebSocket error:', error);
            showError('A WebSocket connection error occurred with the data provider.');
            showLoading(false);
        };
    }

    // --- 4. Send data to our server for AI analysis ---
    async function getAIAnalysis(assetData) {
        try {
            const response = await fetch('/api/analyze-asset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ assetData }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get analysis.');
            }

            const analysis = await response.json();
            updateUI(analysis);

        } catch (error) {
            console.error('Error getting AI analysis:', error);
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    // --- 5. UI Helper Functions ---
    function showLoading(isLoading) {
        if (isLoading) {
            loader.classList.remove('hidden');
            results.classList.add('hidden');
        } else {
            loader.classList.add('hidden');
            results.classList.remove('hidden');
        }
    }

    function updateUI(analysis) {
        forecastResult.textContent = analysis.forecast || 'N/A';
        
        sentimentResult.textContent = analysis.sentiment || 'N/A';
        sentimentResult.className = ''; // Clear existing classes
        if (analysis.sentiment) {
            sentimentResult.classList.add(`sentiment-${analysis.sentiment.toLowerCase()}`);
        }

        reversalResult.textContent = analysis.reversalAlerts ? '🚨 Yes' : 'No';
        
        // Use the 'marked' library to parse markdown from the API
        detailsResult.innerHTML = marked.parse(analysis.analysisDetails || '<p>No detailed analysis available.</p>');
    }
    
    function resetResults() {
        forecastResult.textContent = '--';
        sentimentResult.textContent = '--';
        sentimentResult.className = 'sentiment-neutral';
        reversalResult.textContent = '--';
        detailsResult.innerHTML = '<p>Select an asset to see the detailed analysis.</p>';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
        analysisContainer.classList.add('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }


    // --- Initial Load ---
    populateAssetDropdown();
});
