// public/script.js
// Client-side logic for the betting analysis UI.

document.addEventListener('DOMContentLoaded', () => {
    const fixtureSearchInput = document.getElementById('fixture-search');
    const fixtureSelect = document.getElementById('fixture-select');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const loader = document.getElementById('loader');
    const resultsContent = document.getElementById('results-content');
    const errorMessage = document.getElementById('error-message');

    const predictedOutcomeEl = document.getElementById('predicted-outcome');
    const recommendedBetEl = document.getElementById('recommended-bet');
    const confidenceScoreEl = document.getElementById('confidence-score');

    let allFixtures = [];

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

    /**
     * Fetches all upcoming fixtures from the server.
     */
    async function fetchAllFixtures() {
        fixtureSelect.innerHTML = '<option value="">Loading fixtures...</option>';
        fixtureSelect.disabled = true;

        try {
            const response = await fetch('/api/all-fixtures');
            const fixtures = await response.json();

            if (!response.ok) {
                throw new Error(fixtures.error);
            }

            allFixtures = fixtures;
            updateFixtureList(''); // Show all fixtures initially
            fixtureSelect.disabled = false;
        } catch (error) {
            console.error('Failed to fetch fixtures:', error);
            showMessageBox(`Failed to load fixtures: ${error.message}`);
        }
    }

    /**
     * Filters and updates the fixture dropdown based on a search term.
     * @param {string} searchTerm The user's input.
     */
    function updateFixtureList(searchTerm) {
        fixtureSelect.innerHTML = '';
        const lowerCaseSearch = searchTerm.toLowerCase();

        const filteredFixtures = allFixtures.filter(fixture =>
            fixture.homeTeamName.toLowerCase().includes(lowerCaseSearch) ||
            fixture.awayTeamName.toLowerCase().includes(lowerCaseSearch)
        );

        if (filteredFixtures.length === 0) {
            fixtureSelect.innerHTML = '<option value="">No fixtures found</option>';
            fixtureSelect.disabled = true;
        } else {
            fixtureSelect.disabled = false;
            filteredFixtures.forEach(fixture => {
                const option = document.createElement('option');
                option.value = fixture.id;
                option.textContent = `${fixture.homeTeamName} vs ${fixture.awayTeamName}`;
                option.dataset.leagueId = fixture.leagueId;
                fixtureSelect.appendChild(option);
            });
        }
    }

    // Event listeners
    fixtureSearchInput.addEventListener('input', (e) => {
        updateFixtureList(e.target.value);
    });

    analyzeBtn.addEventListener('click', async () => {
        const fixtureOption = fixtureSelect.options[fixtureSelect.selectedIndex];
        const fixtureId = fixtureOption ? fixtureOption.value : null;
        const leagueId = fixtureOption ? fixtureOption.dataset.leagueId : null;

        if (!fixtureId || !leagueId) {
            showMessageBox('Please select a fixture from the list.');
            return;
        }

        // Hide results and show loader
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
                    fixtureId,
                    leagueId
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

    // Initial load
    fetchAllFixtures();
});
