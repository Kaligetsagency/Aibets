// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const leagueSelect = document.getElementById('league-select');
    const gameSelect = document.getElementById('game-select');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const loader = document.getElementById('loader');
    const resultsContent = document.getElementById('results-content');
    const errorMessage = document.getElementById('error-message');

    // Result elements
    const suggestedBetEl = document.getElementById('suggested-bet');
    const confidenceLevelEl = document.getElementById('confidence-level');
    const justificationEl = document.getElementById('justification');
    const riskAssessmentEl = document.getElementById('risk-assessment'); // New
    const alternativeBetEl = document.getElementById('alternative-bet'); // New


    /**
     * Shows an alert message to the user.
     */
    function showAlert(message) {
        alert(message);
    }

    /**
     * Fetches the list of active leagues and populates the league dropdown.
     */
    async function loadLeagues() {
        try {
            const response = await fetch('/api/leagues');
            if (!response.ok) throw new Error('Failed to load leagues.');

            const leagues = await response.json();
            leagueSelect.innerHTML = '<option value="" disabled selected>Select a League</option>';
            leagues.forEach(leagueData => {
                const option = document.createElement('option');
                option.value = leagueData.league.id;
                option.textContent = leagueData.league.name;
                leagueSelect.appendChild(option);
            });
        } catch (error) {
            console.error(error);
            leagueSelect.innerHTML = '<option value="">Error loading leagues</option>';
        }
    }

    /**
     * Fetches upcoming games for the selected league.
     */
    async function loadGames(leagueId) {
        gameSelect.innerHTML = '<option value="">Loading Games...</option>';
        gameSelect.disabled = true;
        analyzeBtn.disabled = true;

        try {
            const response = await fetch(`/api/games?leagueId=${leagueId}`);
             if (!response.ok) throw new Error('Failed to load games.');
            
            const games = await response.json();
            if (games.length === 0) {
                 gameSelect.innerHTML = '<option value="">No upcoming games found</option>';
                 return;
            }

            gameSelect.innerHTML = '<option value="" disabled selected>Select a Game</option>';
            games.forEach(game => {
                const option = document.createElement('option');
                option.value = game.fixture.id;
                option.textContent = `${game.teams.home.name} vs. ${game.teams.away.name}`;
                // Store all necessary data on the option element
                option.dataset.leagueId = game.league.id;
                option.dataset.homeTeamId = game.teams.home.id;
                option.dataset.awayTeamId = game.teams.away.id;
                gameSelect.appendChild(option);
            });
            gameSelect.disabled = false;
        } catch (error) {
            console.error(error);
            gameSelect.innerHTML = '<option value="">Error loading games</option>';
        }
    }

    // Event Listeners
    leagueSelect.addEventListener('change', () => {
        const selectedLeague = leagueSelect.value;
        if (selectedLeague) {
            loadGames(selectedLeague);
        }
    });
    
    gameSelect.addEventListener('change', () => {
        analyzeBtn.disabled = !gameSelect.value;
    });

    analyzeBtn.addEventListener('click', async () => {
        const selectedGameOption = gameSelect.options[gameSelect.selectedIndex];
        if (!selectedGameOption || !selectedGameOption.value) {
            showAlert('Please select a game to analyze.');
            return;
        }

        const { value: fixtureId, dataset } = selectedGameOption;
        const { leagueId, homeTeamId, awayTeamId } = dataset;
        
        // Show loader and hide previous results
        resultsContainer.classList.remove('results-hidden');
        resultsContent.style.display = 'none';
        loader.classList.remove('loader-hidden');
        errorMessage.classList.add('error-hidden');

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fixtureId, leagueId, homeTeamId, awayTeamId })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error! Status: ${response.status}`);
            }

            // Display results
            suggestedBetEl.textContent = result.suggestedBet || 'N/A';
            confidenceLevelEl.textContent = result.confidenceLevel || 'N/A';
            justificationEl.textContent = result.justification || 'N/A';
            riskAssessmentEl.textContent = result.riskAssessment || 'N/A'; // New
            alternativeBetEl.textContent = result.alternativeBet || 'N/A'; // New
            
            loader.classList.add('loader-hidden');
            resultsContent.style.display = 'block';

        } catch (error) {
            console.error('Analysis request failed:', error);
            errorMessage.textContent = `Analysis failed: ${error.message}`;
            errorMessage.classList.remove('error-hidden');
            loader.classList.add('loader-hidden');
        }
    });

    // Initial load
    loadLeagues();
});
