document.addEventListener('DOMContentLoaded', () => {
    const assetSelector = document.getElementById('asset-selector');
    const analyzeButton = document.getElementById('analyze-button');
    const priceDisplay = document.getElementById('price-display');
    const aiAnalysisOutput = document.getElementById('ai-analysis-output');

    const DERIV_APP_ID = 1089;
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);

    let currentTickSubscriptionId = null;

    ws.onopen = () => {
        console.log("Connected to Deriv WebSocket API.");
        // Request active symbols for forex
        ws.send(JSON.stringify({
            active_symbols: "brief",
            product_type: "basic",
            landing_company: "svg"
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            console.error("WebSocket Error:", data.error.message);
            return;
        }

        // Handle active_symbols response to populate dropdown
        if (data.msg_type === 'active_symbols') {
            const forexAssets = data.active_symbols.filter(asset => asset.market === 'forex');
            assetSelector.innerHTML = '<option value="">Select an asset</option>'; // Clear loading text
            forexAssets.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.symbol;
                option.textContent = asset.display_name;
                assetSelector.appendChild(option);
            });
             analyzeButton.disabled = false;
        }

        // Handle tick response to display price
        if (data.msg_type === 'tick') {
            const symbol = data.tick.symbol;
            const price = data.tick.quote.toFixed(5);
            priceDisplay.textContent = `Price: ${price}`;
            if (data.tick.subscription) {
                 currentTickSubscriptionId = data.tick.subscription.id;
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

    // Subscribe to ticks when user selects an asset
    assetSelector.addEventListener('change', () => {
        const selectedAsset = assetSelector.value;
        priceDisplay.textContent = 'Price: --';

        // Unsubscribe from previous tick stream
        if (currentTickSubscriptionId) {
            ws.send(JSON.stringify({ forget: currentTickSubscriptionId }));
            currentTickSubscriptionId = null;
        }

        if (selectedAsset) {
            ws.send(JSON.stringify({
                ticks: selectedAsset,
                subscribe: 1
            }));
        }
    });

    // Handle AI analysis request
    analyzeButton.addEventListener('click', async () => {
        const selectedAsset = assetSelector.value;
        if (!selectedAsset) {
            alert("Please select an asset first.");
            return;
        }

        aiAnalysisOutput.innerHTML = '<div class="loader"></div>';

        try {
            // --- THIS IS THE FIX ---
            // Use a relative URL instead of an absolute one.
            const response = await fetch('/analyze', {
            // ---------------------
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ asset: selectedAsset })
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
});

        
