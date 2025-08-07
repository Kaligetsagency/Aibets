// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const homeTeamInput = document.getElementById('homeTeamInput');
    const awayTeamInput = document.getElementById('awayTeamInput');
    const analyzeButton = document.getElementById('analyzeButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsDiv = document.getElementById('results');
    const errorMessageDiv = document.getElementById('error-message');

    analyzeButton.addEventListener('click', async () => {
        const homeTeam = homeTeamInput.value.trim();
        const awayTeam = awayTeamInput.value.trim();

        if (!homeTeam || !awayTeam) {
            errorMessageDiv.textContent = 'Please enter both team names.';
            errorMessageDiv.classList.remove('hidden');
            return;
        }

        // Show loading state and hide previous results
        errorMessageDiv.classList.add('hidden');
        resultsDiv.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ homeTeam, awayTeam }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Something went wrong.');
            }

            const data = await response.json();
            displayResults(data);

        } catch (error) {
            console.error('Fetch error:', error);
            errorMessageDiv.textContent = `Error: ${error.message}`;
            errorMessageDiv.classList.remove('hidden');
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    });

    function displayResults(data) {
        // Clear previous content
        document.getElementById('summary').innerHTML = '';
        document.getElementById('analysis-container').innerHTML = '';
        document.getElementById('prediction').innerHTML = '';

        // Display summary
        document.getElementById('summary').innerHTML = `<p class="text-lg text-gray-800">${data.summary}</p>`;

        // Display analysis
        const analysisContainer = document.getElementById('analysis-container');
        analysisContainer.innerHTML = `
            <div class="bg-white p-4 rounded-xl border border-gray-200 mb-6">
                <h3 class="text-xl font-semibold text-gray-700 mb-2">${data.analysis.homeTeam.teamName} Analysis</h3>
                <ul class="list-disc list-inside text-gray-600 space-y-1">
                    <li><strong>Recent Form:</strong> ${data.analysis.homeTeam.recentForm}</li>
                    <li><strong>Home Record:</strong> ${data.analysis.homeTeam.homeRecord}</li>
                    <li><strong>Key Players:</strong> ${data.analysis.homeTeam.keyPlayers.join(', ')}</li>
                    <li><strong>Tactical Style:</strong> ${data.analysis.homeTeam.tacticalStyle}</li>
                    <li><strong>Motivation:</strong> ${data.analysis.homeTeam.motivation}</li>
                </ul>
            </div>
            <div class="bg-white p-4 rounded-xl border border-gray-200 mb-6">
                <h3 class="text-xl font-semibold text-gray-700 mb-2">${data.analysis.awayTeam.teamName} Analysis</h3>
                <ul class="list-disc list-inside text-gray-600 space-y-1">
                    <li><strong>Recent Form:</strong> ${data.analysis.awayTeam.recentForm}</li>
                    <li><strong>Away Record:</strong> ${data.analysis.awayTeam.awayRecord}</li>
                    <li><strong>Key Players:</strong> ${data.analysis.awayTeam.keyPlayers.join(', ')}</li>
                    <li><strong>Tactical Style:</strong> ${data.analysis.awayTeam.tacticalStyle}</li>
                    <li><strong>Motivation:</strong> ${data.analysis.awayTeam.motivation}</li>
                </ul>
            </div>
            <div class="bg-white p-4 rounded-xl border border-gray-200 mb-6">
                <h3 class="text-xl font-semibold text-gray-700 mb-2">Match Context</h3>
                <ul class="list-disc list-inside text-gray-600 space-y-1">
                    <li><strong>Head-to-Head:</strong> ${data.analysis.headToHead}</li>
                    <li><strong>Injuries/Suspensions:</strong> ${data.analysis.injuriesAndSuspensions}</li>
                </ul>
            </div>
        `;

        // Display prediction
        document.getElementById('prediction').innerHTML = `
            <h3 class="text-2xl font-bold text-blue-800 mb-2">Final Prediction</h3>
            <p class="text-xl font-semibold text-blue-700">Outcome: ${data.prediction.outcome}</p>
            <p class="text-xl font-semibold text-blue-700">Scoreline: ${data.prediction.scoreline}</p>
            <p class="text-xl font-semibold text-blue-700">Confidence: ${data.prediction.confidence}</p>
            <p class="text-base text-gray-700 mt-4">${data.conclusion}</p>
        `;

        resultsDiv.classList.remove('hidden');
    }
});
                                   
