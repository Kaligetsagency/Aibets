// server.js
// Backend Express server for the AI betting analysis application.

const express = require('express');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Middleware to parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static('public'));

// Retrieve API keys from environment variables
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Base URL for the apifootball.com API (v3 as per documentation)
const FOOTBALL_API_URL = 'https://apiv3.apifootball.com/';

// Helper function to make requests to the apifootball.com API
async function fetchFootballData(params) {
    const queryParams = new URLSearchParams({
        ...params,
        APIkey: FOOTBALL_API_KEY
    });

    const requestUrl = `${FOOTBALL_API_URL}?${queryParams.toString()}`;
    console.log('Fetching from:', requestUrl);

    const response = await fetch(requestUrl);

    if (!response.ok) {
        throw new Error(`Football API error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
        console.error('Football API returned an error:', data.error);
        throw new Error(`Football API Error: ${data.error}`);
    }

    // Handle cases where API returns a string message instead of an array
    if (data.length === 1 && typeof data[0] === 'string') {
        return [];
    }

    return data;
}

/**
 * Endpoint to get a list of all countries with football leagues.
 */
app.get('/api/countries', async (req, res) => {
    try {
        const countries = await fetchFootballData({ action: 'get_countries' });
        res.json(countries.map(c => ({ id: c.country_id, name: c.country_name })));
    } catch (error) {
        console.error('Failed to fetch countries:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get a list of leagues for a specific country.
 */
app.get('/api/leagues/:countryId', async (req, res) => {
    const { countryId } = req.params;
    try {
        const leagues = await fetchFootballData({ action: 'get_leagues', country_id: countryId });
        res.json(leagues.map(l => ({ id: l.league_id, name: l.league_name })));
    } catch (error) {
        console.error('Failed to fetch leagues:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get upcoming fixtures for a specific league.
 */
app.get('/api/fixtures/:leagueId', async (req, res) => {
    const { leagueId } = req.params;
    const fromDate = new Date().toISOString().slice(0, 10);
    const toDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
        const fixtures = await fetchFootballData({
            action: 'get_events',
            league_id: leagueId,
            from: fromDate,
            to: toDate,
        });

        // The API might return an error message in an array if no matches are found, so we handle it.
        const fixtureList = Array.isArray(fixtures) ? fixtures : [];

        // Filter for upcoming (not started) matches, which have an empty match_status
        const upcomingFixtures = fixtureList
            .filter(fixture => fixture.match_status === '')
            .map(fixture => ({
                id: fixture.match_id,
                leagueId: fixture.league_id,
                name: `${fixture.match_hometeam_name} vs ${fixture.match_awayteam_name}`,
                homeTeamName: fixture.match_hometeam_name,
                awayTeamName: fixture.match_awayteam_name,
                date: fixture.match_date,
            }));

        res.json(upcomingFixtures);
    } catch (error) {
        console.error('Failed to fetch fixtures:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint for AI analysis.
 * Takes fixture ID and league ID as input.
 * Fetches data, constructs a prompt, and sends to Gemini.
 */
app.post('/api/analyze', async (req, res) => {
    const { fixtureId, leagueId } = req.body;

    if (!fixtureId || !leagueId) {
        return res.status(400).json({ error: 'Missing required parameters for analysis.' });
    }

    try {
        // Fetch specific fixture details
        const fixtureResponse = await fetchFootballData({
            action: 'get_events',
            match_id: fixtureId
        });
        const fixture = fixtureResponse.length > 0 ? fixtureResponse[0] : null;

        if (!fixture) {
            return res.status(404).json({ error: 'Fixture not found.' });
        }

        // Fetch standings to get home/away team stats
        const standings = await fetchFootballData({ action: 'get_standings', league_id: leagueId });
        const homeTeamStats = standings.find(s => s.team_id === fixture.match_hometeam_id);
        const awayTeamStats = standings.find(s => s.team_id === fixture.match_awayteam_id);

        // Fetch head-to-head data
        const h2hResponse = await fetchFootballData({
            action: 'get_H2H',
            firstTeamId: fixture.match_hometeam_id,
            secondTeamId: fixture.match_awayteam_id
        });
        const h2hData = Array.isArray(h2hResponse) ? h2hResponse.slice(0, 5) : [];

        // Fetch recent match data for each team
        const homeTeamRecentForm = await fetchFootballData({
            action: 'get_events',
            from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            to: new Date().toISOString().slice(0, 10),
            team_id: fixture.match_hometeam_id,
        });
        
        const awayTeamRecentForm = await fetchFootballData({
            action: 'get_events',
            from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            to: new Date().toISOString().slice(0, 10),
            team_id: fixture.match_awayteam_id,
        });

        // Helper function to format form string (W, D, L)
        const getFormString = (matches) => {
            if (!Array.isArray(matches)) return 'N/A';
            const results = matches.filter(m => m.match_hometeam_name && m.match_awayteam_name);
            return results.slice(-5).map(m => {
                const homeScore = parseInt(m.match_hometeam_score, 10);
                const awayScore = parseInt(m.match_awayteam_score, 10);
                const teamId = fixture.match_hometeam_id === m.match_hometeam_id ? fixture.match_hometeam_id : fixture.match_awayteam_id;

                if (homeScore > awayScore) {
                    return teamId === m.match_hometeam_id ? 'W' : 'L';
                } else if (homeScore < awayScore) {
                    return teamId === m.match_hometeam_id ? 'L' : 'W';
                } else {
                    return 'D';
                }
            }).join('');
        };

        const homeTeamFormString = getFormString(homeTeamRecentForm);
        const awayTeamFormString = getFormString(awayTeamRecentForm);

        // Fetch players and managers for both teams
        const homeTeamPlayers = await fetchFootballData({
            action: 'get_players',
            team_id: fixture.match_hometeam_id
        });
        const awayTeamPlayers = await fetchFootballData({
            action: 'get_players',
            team_id: fixture.match_awayteam_id
        });

        const homeManager = homeTeamPlayers.find(p => p.player_type === 'Managers') || { player_name: 'N/A' };
        const awayManager = awayTeamPlayers.find(p => p.player_type === 'Managers') || { player_name: 'N/A' };

        const homePlayersString = homeTeamPlayers.filter(p => p.player_type !== 'Managers').map(p => `${p.player_name} (${p.player_type})`).join(', ');
        const awayPlayersString = awayTeamPlayers.filter(p => p.player_type !== 'Managers').map(p => `${p.player_name} (${p.player_type})`).join(', ');

        // Fetch betting odds
        const oddsData = await fetchFootballData({
            action: 'get_odds',
            match_id: fixtureId
        });

        const preMatchOdds = oddsData.length > 0 ? oddsData[0].prematch_odds : {};
        const homeWinOdds = preMatchOdds.filter(o => o.bet_name === 'Home Win')[0]?.odd_value || 'N/A';
        const drawOdds = preMatchOdds.filter(o => o.bet_name === 'Draw')[0]?.odd_value || 'N/A';
        const awayWinOdds = preMatchOdds.filter(o => o.bet_name === 'Away Win')[0]?.odd_value || 'N/A';
        const over25Odds = preMatchOdds.filter(o => o.bet_name === 'Over 2.5 Goals')[0]?.odd_value || 'N/A';
        const under25Odds = preMatchOdds.filter(o => o.bet_name === 'Under 2.5 Goals')[0]?.odd_value || 'N/A';
        
        const prompt = `
            Analyze the following football match and provide a betting recommendation.
            
            Match Details:
            - Home Team: ${fixture.match_hometeam_name}
            - Away Team: ${fixture.match_awayteam_name}
            - Date: ${fixture.match_date}
            - Venue: ${fixture.match_stadium || 'N/A'}
            - Referee: ${fixture.match_referee || 'N/A'}

            Pre-Match Betting Odds:
            - Home Win: ${homeWinOdds}
            - Draw: ${drawOdds}
            - Away Win: ${awayWinOdds}
            - Over 2.5 Goals: ${over25Odds}
            - Under 2.5 Goals: ${under25Odds}

            Head-to-Head (last 5 matches):
            ${h2hData.length > 0 ? h2hData.map(match => `  - ${match.match_hometeam_name} ${match.match_hometeam_score} - ${match.match_awayteam_score} ${match.match_awayteam_name}`).join('\n') : '  - No recent head-to-head data available.'}
            
            Home Team Information:
            - Manager: ${homeManager.player_name}
            - League Position: ${homeTeamStats ? homeTeamStats.overall_league_position : 'N/A'}
            - Recent Form (last 5 matches): ${homeTeamFormString}
            - Overall Points: ${homeTeamStats ? homeTeamStats.overall_league_PTS : 'N/A'}
            - Goals For: ${homeTeamStats ? homeTeamStats.overall_league_GF : 'N/A'}
            - Goals Against: ${homeTeamStats ? homeTeamStats.overall_league_GA : 'N/A'}
            - Key Players: ${homePlayersString.length > 0 ? homePlayersString : 'N/A'}

            Away Team Information:
            - Manager: ${awayManager.player_name}
            - League Position: ${awayTeamStats ? awayTeamStats.overall_league_position : 'N/A'}
            - Recent Form (last 5 matches): ${awayTeamFormString}
            - Overall Points: ${awayTeamStats ? awayTeamStats.overall_league_PTS : 'N/A'}
            - Goals For: ${awayTeamStats ? awayTeamStats.overall_league_GF : 'N/A'}
            - Goals Against: ${awayTeamStats ? awayTeamStats.overall_league_GA : 'N/A'}
            - Key Players: ${awayPlayersString.length > 0 ? awayPlayersString : 'N/A'}
            
            Based on this data, provide a structured JSON response with a predicted outcome (e.g., "Home Win", "Away Win", "Draw"), a recommended bet (e.g., "Moneyline - Home Team", "Over 2.5 Goals"), and a confidence score (from 0 to 100).
        `;

        const chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });

        // Define the JSON schema for the response
        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "predictedOutcome": { "type": "STRING" },
                        "recommendedBet": { "type": "STRING" },
                        "confidenceScore": { "type": "NUMBER" }
                    },
                    "propertyOrdering": ["predictedOutcome", "recommendedBet", "confidenceScore"]
                }
            }
        };

        const geminiApiKey = GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

        const aiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!aiResponse.ok) {
            const errorBody = await aiResponse.text();
            throw new Error(`AI API call failed with status ${aiResponse.status}: ${errorBody}`);
        }

        const aiResult = await aiResponse.json();

        if (aiResult.candidates && aiResult.candidates.length > 0 &&
            aiResult.candidates[0].content && aiResult.candidates[0].content.parts &&
            aiResult.candidates[0].content.parts.length > 0) {
            const jsonString = aiResult.candidates[0].content.parts[0].text;
            const analysis = JSON.parse(jsonString);
            res.json(analysis);
        } else {
            throw new Error('Invalid response structure from Gemini API.');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
