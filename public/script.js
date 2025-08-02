// public/script.js
// Client-side logic for the betting analysis UI.

document.addEventListener('DOMContentLoaded', () => {
    const leagueSelect = document.getElementById('league-select');
    const teamSelect = document.getElementById('team-select');
    const fixtureSelect = document.getElementById('fixture-select');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const loader = document.getElementById('loader');
    const resultsContent = document.getElementById('results-content');
    const errorMessage = document.getElementById('error-message');

    const predictedOutcomeEl = document.getElementById('predicted-outcome');
    const recommendedBetEl = document.getElementById('recommended-bet');
    const confidenceScoreEl = document.getElementById('confidence-score');

    const FOOTBALL_API_SEASON = 2023; // Hardcoded season for this example

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
     * Fetches leagues and populates the dropdown.
     */
    async function fetchLeagues() {
        try {
            const response = await fetch('/api/leagues');
            const leagues = await response.json();

            if (!response.ok) {
                throw new Error(leagues.error);
            }

            leagueSelect.innerHTML = '<option value="">Select a League</option>';
            leagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league.league.id;
                option.textContent = league.league.name;
                leagueSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to fetch leagues:', error);
            showMessageBox(`Failed to load leagues: ${error.message}`);
        }
    }

    /**
     * Fetches teams for a given league and populates the dropdown.
     * @param {string} leagueId - The ID of the league.
     */
    async function fetchTeams(leagueId) {
        teamSelect.innerHTML = '<option value="">Select a Team</option>';
        teamSelect.disabled = true;
        fixtureSelect.innerHTML = '<option value="">Select a Fixture</option>';
        fixtureSelect.disabled = true;

        if (!leagueId) return;

        try {
            const response = await fetch(`/api/teams/${leagueId}/${FOOTBALL_API_SEASON}`);
            const teams = await response.json();

            if (!response.ok) {
                throw new Error(teams.error);
            }

            teamSelect.disabled = false;
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.team.id;
                option.textContent = team.team.name;
                teamSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to fetch teams:', error);
            showMessageBox(`Failed to load teams: ${error.message}`);
        }
    }

    /**
     * Fetches fixtures for a given team and populates the dropdown.
     * @param {string} teamId - The ID of the team.
     */
    async function fetchFixtures(teamId) {
        fixtureSelect.innerHTML = '<option value="">Select a Fixture</option>';
        fixtureSelect.disabled = true;
        const leagueId = leagueSelect.value;
        if (!teamId || !leagueId) return;

        try {
            const response = await fetch(`/api/fixtures/${teamId}/${leagueId}/${FOOTBALL_API_SEASON}`);
            const fixtures = await response.json();

            if (!response.ok) {
                throw new Error(fixtures.error);
            }

            fixtureSelect.disabled = false;
            fixtures.forEach(fixture => {
                const option = document.createElement('option');
                option.value = fixture.fixture.id;
                option.textContent = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
                option.dataset.homeTeamId = fixture.teams.home.id;
                option.dataset.awayTeamId = fixture.teams.away.id;
                fixtureSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to fetch fixtures:', error);
            showMessageBox(`Failed to load fixtures: ${error.message}`);
        }
    }

    // Event listeners
    leagueSelect.addEventListener('change', (e) => {
        const leagueId = e.target.value;
        fetchTeams(leagueId);
    });

    teamSelect.addEventListener('change', (e) => {
        const teamId = e.target.value;
        fetchFixtures(teamId);
    });

    analyzeBtn.addEventListener('click', async () => {
        const fixtureOption = fixtureSelect.options[fixtureSelect.selectedIndex];
        const fixtureId = fixtureOption ? fixtureOption.value : null;
        const homeTeamId = fixtureOption ? fixtureOption.dataset.homeTeamId : null;
        const awayTeamId = fixtureOption ? fixtureOption.dataset.awayTeamId : null;
        const leagueId = leagueSelect.value;

        if (!fixtureId || !homeTeamId || !awayTeamId) {
            showMessageBox('Please select a league, team, and fixture first.');
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
                    homeTeamId,
                    awayTeamId,
                    leagueId,
                    season: FOOTBALL_API_SEASON
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
    fetchLeagues();
});
