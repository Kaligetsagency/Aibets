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
            // apifootball.com returns all leagues as an array of standings.
            // We need to extract the unique leagues from this data.
            const uniqueLeagues = new Map();
            if (Array.isArray(leagues)) {
                leagues.forEach(league => {
                    if (league.league_id && !uniqueLeagues.has(league.league_id)) {
                        uniqueLeagues.set(league.league_id, {
                            id: league.league_id,
                            name: league.league_name
                        });
                    }
                });
            }

            uniqueLeagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league.id;
                option.textContent = league.name;
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
            const response = await fetch(`/api/teams/${leagueId}`);
            const teams = await response.json();

            if (!response.ok) {
                throw new Error(teams.error);
            }

            teamSelect.disabled = false;
            // The API returns teams from standings, which might have duplicates. Use a Set to store unique teams.
            const uniqueTeams = new Map();
            teams.forEach(team => {
                if (!uniqueTeams.has(team.id)) {
                    uniqueTeams.set(team.id, team);
                }
            });
            uniqueTeams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                teamSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to fetch teams:', error);
            showMessageBox(`Failed to load teams: ${error.message}`);
        }
    }

    /**
     * Fetches fixtures for a given league and populates the dropdown.
     */
    async function fetchFixtures(leagueId) {
        fixtureSelect.innerHTML = '<option value="">Select a Fixture</option>';
        fixtureSelect.disabled = true;
        
        if (!leagueId) return;

        try {
            const response = await fetch(`/api/fixtures/${leagueId}`);
            const fixtures = await response.json();
            
            if (!response.ok) {
                throw new Error(fixtures.error);
            }
            
            fixtureSelect.disabled = false;
            
            const upcomingFixtures = fixtures.filter(f => f.match_status === '');

            upcomingFixtures.forEach(fixture => {
                const option = document.createElement('option');
                option.value = fixture.match_id;
                option.textContent = `${fixture.match_hometeam_name} vs ${fixture.match_awayteam_name}`;
                option.dataset.homeTeamId = fixture.match_hometeam_id;
                option.dataset.awayTeamId = fixture.match_awayteam_id;
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
        fetchFixtures(leagueId);
    });

    analyzeBtn.addEventListener('click', async () => {
        const fixtureOption = fixtureSelect.options[fixtureSelect.selectedIndex];
        const fixtureId = fixtureOption ? fixtureOption.value : null;
        const leagueId = leagueSelect.value;

        if (!fixtureId || !leagueId) {
            showMessageBox('Please select a league and a fixture first.');
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
    fetchLeagues();
});
