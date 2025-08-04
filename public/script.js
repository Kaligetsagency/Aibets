// public/script.js
// Client-side logic for the betting analysis UI.

document.addEventListener('DOMContentLoaded', () => {
    const fixtureSearchInput = document.getElementById('fixture-search');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const loader = document.getElementById('loader');
    const resultsContent = document.getElementById('results-content');
    const errorMessage = document.getElementById('error-message');

    const predictedOutcomeEl = document.getElementById('predicted-outcome');
    const recommendedBetEl = document.getElementById('recommended-bet');
    const confidenceScoreEl = document.getElementById('confidence-score');

    /**
     * Shows a custom message box instead of a standard browser alert.
     * @param {string} message The message to display.
     */
    function showMessageBox(message) {
        const existingBox = document.querySelector('.message-box');
        if (existingBox) {
            existingBox.remove();
        }

        const messageBox = document.createElement('div');
        messageBox.className = `message-box error`;
        messageBox.innerHTML = `
            <p>${message}</p>
            <button class="message-box-close">OK</button>
        `;
        document.body.appendChild(messageBox);

        document.querySelector('.message-box-close').addEventListener('click', () => {
            messageBox.remove();
        });
    }

    // Event listeners
    analyzeBtn.addEventListener('click', async () => {
        const fixtureName = fixtureSearchInput.value.trim();

        if (!fixtureName) {
            showMessageBox('Please enter a fixture name to analyze.');
            return;
        }

        // Hide previous results and show loader
        resultsContent.style.display = 'none';
        loader.classList.remove('loader-hidden');
        errorMessage.classList.add('error-hidden');
        errorMessage.textContent = '';

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fixtureName: fixtureName
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error! Status: ${response.status}`);
            }

            // Display results
            predictedOutcomeEl.textContent = result.predictedOutcome || 'N/A';
            recommendedBetEl.textContent = result.recommendedBet || 'N/A';
            confidenceScoreEl.textContent = result.confidenceScore !== undefined ? `${result.confidenceScore}%` : 'N/A';

            // Hide loader and show content
            loader.classList.add('loader-hidden');
            resultsContent.style.display = 'block';

        } catch (error) {
            console.error('Analysis request failed:', error);
            // Display error message
            errorMessage.textContent = `Analysis failed: ${error.message}`;
            errorMessage.classList.remove('error-hidden');
            loader.classList.add('loader-hidden');
        }
    });
});
