// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const sportSelect = document.getElementById('sport-select');
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

    /**
     * Shows an alert message to the user.
     */
    function showAlert(message) {
        alert(message);
    }

    /**
     * Fetches the list of active sports and populates the sport dropdown.
     */
    async function loadSports() {
        try {
            const response = await fetch('/api/sports');
            if (!response.ok) throw new Error('Failed to load sports.');

            const sports = await response.json();
            sportSelect.innerHTML = '<option value="" disabled selected>Select a Sport</option>';
            sports.forEach(sport => {
                if (sport.active) {
                    const option = document.createElement('option');
                    option.value = sport.key;
                    option.textContent = sport.title;
                    sportSelect.appendChild(option);
                }
            });
        } catch (error) {
            console.error(error);
            sportSelect.innerHTML = '<option value="">Error loading sports</option>';
        }
    }

    /**
     * Fetches upcoming games for the selected sport.
     */
    async function loadGames(sportKey) {
        gameSelect.innerHTML = '<option value="">Loading Games...</option>';
        gameSelect.disabled = true;
        analyzeBtn.disabled = true;

        try {
            const response = await fetch(`/api/games?sport=${sportKey}`);
             if (!response.ok) throw new Error('Failed to load games.');
            
            const games = await response.json();
            if (games.length === 0) {
                 gameSelect.innerHTML = '<option value="">No upcoming games found</option>';
                 return;
            }

            gameSelect.innerHTML = '<option value="" disabled selected>Select a Game</option>';
            games.forEach(game => {
                const option = document.createElement('option');
                option.value = game.id;
                option.textContent = `${game.home_team} vs. ${game.away_team}`;
                // Store data on the option element for later use
                option.dataset.sportKey = game.sport_key;
                option.dataset.homeTeam = game.home_team;
                option.dataset.awayTeam = game.away_team;
                gameSelect.appendChild(option);
            });
            gameSelect.disabled = false;
            analyzeBtn.disabled = false;
        } catch (error) {
            console.error(error);
            gameSelect.innerHTML = '<option value="">Error loading games</option>';
        }
    }

    // Event Listeners
    sportSelect.addEventListener('change', () => {
        const selectedSport = sportSelect.value;
        if (selectedSport) {
            loadGames(selectedSport);
        }
    });

    analyzeBtn.addEventListener('click', async () => {
        const selectedGameOption = gameSelect.options[gameSelect.selectedIndex];
        if (!selectedGameOption || !selectedGameOption.value) {
            showAlert('Please select a game to analyze.');
            return;
        }

        const { value: gameId, dataset } = selectedGameOption;
        const { sportKey, homeTeam, awayTeam } = dataset;
        
        // Show loader and hide previous results
        resultsContainer.classList.remove('results-hidden');
        resultsContent.style.display = 'none';
        loader.classList.remove('loader-hidden');
        errorMessage.classList.add('error-hidden');

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId, sportKey, homeTeam, awayTeam })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error! Status: ${response.status}`);
            }

            // Display results
            suggestedBetEl.textContent = result.suggestedBet || 'N/A';
            confidenceLevelEl.textContent = result.confidenceLevel || 'N/A';
            justificationEl.textContent = result.justification || 'N/A';
            
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
    loadSports();
});
