// public/script.js
// Client-side logic for the betting analysis UI.

document.addEventListener('DOMContentLoaded', () => {
    const countrySelect = document.getElementById('country-select');
    const leagueSelect = document.getElementById('league-select');
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
     * Fetches all countries and populates the dropdown.
     */
    async function fetchCountries() {
        countrySelect.innerHTML = '<option value="">Loading countries...</option>';
        try {
            const response = await fetch('/api/countries');
            const countries = await response.json();

            if (!response.ok) {
                throw new Error(countries.error);
            }

            countrySelect.innerHTML = '<option value="">Select a Country</option>';
            if (Array.isArray(countries)) {
                countries.forEach(country => {
                    const option = document.createElement('option');
                    option.value = country.id;
                    option.textContent = country.name;
                    countrySelect.appendChild(option);
                });
            }
            leagueSelect.disabled = true;
            fixtureSearchInput.disabled = true;
            fixtureSelect.disabled = true;
        } catch (error) {
            console.error('Failed to fetch countries:', error);
            showMessageBox(`Failed to load countries: ${error.message}`);
        }
    }

    /**
     * Fetches leagues for a given country and populates the dropdown.
     */
    async function fetchLeagues(countryId) {
        leagueSelect.innerHTML = '<option value="">Loading leagues...</option>';
        leagueSelect.disabled = true;
        fixtureSearchInput.disabled = true;
        fixtureSelect.disabled = true;
        
        if (!countryId) {
            leagueSelect.innerHTML = '<option value="">Select a Country first</option>';
            return;
        }

        try {
            const response = await fetch(`/api/leagues/${countryId}`);
            const leagues = await response.json();
            
            if (!response.ok) {
                throw new Error(leagues.error);
            }

            leagueSelect.disabled = false;
            leagueSelect.innerHTML = '<option value="">Select a League</option>';
            if (Array.isArray(leagues)) {
                leagues.forEach(league => {
                    const option = document.createElement('option');
                    option.value = league.id;
                    option.textContent = league.name;
                    leagueSelect.appendChild(option);
                });
            }
            fixtureSearchInput.disabled = true;
            fixtureSelect.disabled = true;
        } catch (error) {
            console.error('Failed to fetch leagues:', error);
            showMessageBox(`Failed to load leagues: ${error.message}`);
        }
    }

    /**
     * Fetches fixtures for a given league, populates the dropdown, and enables search.
     */
    async function fetchFixtures(leagueId) {
        fixtureSelect.innerHTML = '<option value="">Loading fixtures...</option>';
        fixtureSelect.disabled = true;
        fixtureSearchInput.disabled = true;
        
        if (!leagueId) {
            fixtureSelect.innerHTML = '<option value="">Select a League first</option>';
            return;
        }

        try {
            const response = await fetch(`/api/fixtures/${leagueId}`);
            const fixtures = await response.json();
            
            if (!response.ok) {
                throw new Error(fixtures.error);
            }

            allFixtures = fixtures;
            updateFixtureList(''); // Show all fixtures initially
            
            fixtureSelect.disabled = false;
            fixtureSearchInput.disabled = false;

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
    countrySelect.addEventListener('change', (e) => {
        const countryId = e.target.value;
        fetchLeagues(countryId);
    });

    leagueSelect.addEventListener('change', (e) => {
        const leagueId = e.target.value;
        fetchFixtures(leagueId);
    });

    fixtureSearchInput.addEventListener('input', (e) => {
        updateFixtureList(e.target.value);
    });

    analyzeBtn.addEventListener('click', async () => {
        const fixtureOption = fixtureSelect.options[fixtureSelect.selectedIndex];
        const fixtureId = fixtureOption ? fixtureOption.value : null;
        const leagueId = fixtureOption ? fixtureOption.dataset.leagueId : null;

        if (!fixtureId || !leagueId) {
            showMessageBox('Please select a country, league, and fixture from the lists.');
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
    fetchCountries();
});
                
