// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analysis-form');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const loadingDiv = document.getElementById('loading');
    const resultContentDiv = document.getElementById('result-content');
    const predictionText = document.getElementById('prediction-text');
    const recommendationText = document.getElementById('recommendation-text');
    const confidenceText = document.getElementById('confidence-text');
    const errorMessageDiv = document.getElementById('error-message');
    const errorParagraph = errorMessageDiv.querySelector('p');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Clear previous results and error messages
        resultsContainer.classList.remove('hidden');
        resultContentDiv.classList.add('hidden');
        errorMessageDiv.classList.add('hidden');
        loadingDiv.classList.remove('hidden');
        analyzeBtn.disabled = true;

        const homeTeam = document.getElementById('home-team').value;
        const awayTeam = document.getElementById('away-team').value;

        try {
            const response = await fetch('/analyze-match', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ homeTeam, awayTeam }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Something went wrong on the server.');
            }

            const data = await response.json();

            // Display results
            predictionText.textContent = data.prediction;
            recommendationText.textContent = data.bettingRecommendation;
            confidenceText.textContent = data.confidence;
            
            loadingDiv.classList.add('hidden');
            resultContentDiv.classList.remove('hidden');

        } catch (error) {
            console.error('Error:', error);
            loadingDiv.classList.add('hidden');
            errorMessageDiv.classList.remove('hidden');
            errorParagraph.textContent = error.message;
        } finally {
            analyzeBtn.disabled = false;
        }
    });
});
