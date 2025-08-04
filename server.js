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

    try {
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
    } catch (error) {
        console.error('An error occurred during API fetch:', error);
        return []; // Return an empty array on error to prevent application crash
    }
}

/**
 * Endpoint for AI analysis.
 * Takes fixture name as input.
 * Searches for the fixture, fetches data, constructs a prompt, and sends to Gemini.
 */
app.post('/api/analyze', async (req, res) => {
    const { fixtureName } = req.body;

    if (!fixtureName) {
        return res.status(400).json({ error: 'Fixture name is required for analysis.' });
    }

    try {
        // Search for the fixture by name to get its ID and league ID
        const searchResults = await fetchFootballData({ action: 'get_events', match_name: fixtureName });
        
        if (!searchResults || searchResults.length === 0) {
            return res.status(404).json({ error: `No fixture found for the name: "${fixtureName}".` });
        }

        // Take the first result as the most relevant match
        const fixture = searchResults[0];
        const fixtureId = fixture.match_id;
        const leagueId = fixture.league_id;

        // Fetch standings to get home/away team stats
        const standings = await fetchFootballData({ action: 'get_standings', league_id: leagueId });
        const homeTeamStats = standings.find(s => s.team_id === fixture.match_hometeam_id) || {};
        const awayTeamStats = standings.find(s => s.team_id === fixture.match_awayteam_id) || {};

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
        const getFormString = (matches, teamId) => {
            if (!Array.isArray(matches)) return 'N/A';
            const results = matches.filter(m => m.match_hometeam_name && m.match_awayteam_name);
            return results.slice(-5).map(m => {
                const homeScore = parseInt(m.match_hometeam_score, 10);
                const awayScore = parseInt(m.match_awayteam_score, 10);
                if (homeScore > awayScore) {
                    return teamId === m.match_hometeam_id ? 'W' : 'L';
                } else if (homeScore < awayScore) {
                    return teamId === m.match_hometeam_id ? 'L' : 'W';
                } else {
                    return 'D';
                }
            }).join('');
        };

        const homeTeamFormString = getFormString(homeTeamRecentForm, fixture.match_hometeam_id);
        const awayTeamFormString = getFormString(awayTeamRecentForm, fixture.match_awayteam_id);

        // Fetch head-to-head data
        const h2hResponse = await fetchFootballData({
            action: 'get_H2H',
            firstTeamId: fixture.match_hometeam_id,
            secondTeamId: fixture.match_awayteam_id
        });
        const h2hData = Array.isArray(h2hResponse) ? h2hResponse.slice(0, 5) : [];

        // Fetch players, managers and top scorers for both teams
        const homeTeamPlayers = await fetchFootballData({ action: 'get_players', team_id: fixture.match_hometeam_id });
        const awayTeamPlayers = await fetchFootballData({ action: 'get_players', team_id: fixture.match_awayteam_id });
        const leagueTopScorers = await fetchFootballData({ action: 'get_topscorers', league_id: leagueId });

        const homeManager = homeTeamPlayers.find(p => p.player_type === 'Managers') || { player_name: 'N/A' };
        const awayManager = awayTeamPlayers.find(p => p.player_type === 'Managers') || { player_name: 'N/A' };

        // Identify key players from top scorers list
        const homeTopPlayers = leagueTopScorers
            .filter(p => p.team_id === fixture.match_hometeam_id)
            .map(p => `${p.player_name} (${p.goals || 0} goals)`);

        const awayTopPlayers = leagueTopScorers
            .filter(p => p.team_id === fixture.match_awayteam_id)
            .map(p => `${p.player_name} (${p.goals || 0} goals)`);

        // Fetch betting odds
        const oddsData = await fetchFootballData({ action: 'get_odds', match_id: fixtureId });
        const preMatchOdds = oddsData.length > 0 && oddsData[0].prematch_odds ? oddsData[0].prematch_odds : [];
        
        const getOdds = (betName) => preMatchOdds.find(o => o.bet_name === betName)?.odd_value || 'N/A';

        // Construct the detailed prompt
        const prompt = `
            Analyze the following football match and provide a betting recommendation.
            
            Match Details:
            - Home Team: ${fixture.match_hometeam_name || 'N/A'}
            - Away Team: ${fixture.match_awayteam_name || 'N/A'}
            - Date: ${fixture.match_date || 'N/A'}
            - Time: ${fixture.match_time || 'N/A'}
            - Venue: ${fixture.match_stadium || 'N/A'}
            - Referee: ${fixture.match_referee || 'N/A'}

            Pre-Match Betting Odds:
            - Home Win: ${getOdds('Home Win')}
            - Draw: ${getOdds('Draw')}
            - Away Win: ${getOdds('Away Win')}
            - Over 2.5 Goals: ${getOdds('Over 2.5 Goals')}
            - Under 2.5 Goals: ${getOdds('Under 2.5 Goals')}
            - Both Teams to Score: ${getOdds('Both Teams to Score')}
            
            Head-to-Head (last 5 matches):
            ${h2hData.length > 0 ? h2hData.map(match => `  - ${match.match_hometeam_name} ${match.match_hometeam_score} - ${match.match_awayteam_score} ${match.match_awayteam_name}`).join('\n') : '  - No recent head-to-head data available.'}
            
            Home Team Information:
            - Manager: ${homeManager.player_name}
            - Overall League Position: ${homeTeamStats.overall_league_position || 'N/A'}
            - Home League Position: ${homeTeamStats.home_league_position || 'N/A'}
            - Recent Form (last 5 matches): ${homeTeamFormString}
            - Overall Points: ${homeTeamStats.overall_league_PTS || 'N/A'}
            - Home Goals For: ${homeTeamStats.home_league_GF || 'N/A'}
            - Home Goals Against: ${homeTeamStats.home_league_GA || 'N/A'}
            - Key Player(s): ${homeTopPlayers.length > 0 ? homeTopPlayers.join(', ') : 'N/A'}

            Away Team Information:
            - Manager: ${awayManager.player_name}
            - Overall League Position: ${awayTeamStats.overall_league_position || 'N/A'}
            - Away League Position: ${awayTeamStats.away_league_position || 'N/A'}
            - Recent Form (last 5 matches): ${awayTeamFormString}
            - Overall Points: ${awayTeamStats.overall_league_PTS || 'N/A'}
            - Away Goals For: ${awayTeamStats.away_league_GF || 'N/A'}
            - Away Goals Against: ${awayTeamStats.away_league_GA || 'N/A'}
            - Key Player(s): ${awayTopPlayers.length > 0 ? awayTopPlayers.join(', ') : 'N/A'}
            
            Based on this data, provide a structured JSON response with a predicted outcome (e.g., "Home Win", "Away Win", "Draw"), a recommended bet (e.g., "Moneyline - Home Team", "Over 2.5 Goals"), and a confidence score (from 0 to 100).
        `;

        const chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });

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
