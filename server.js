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
            const errorText = await response.text();
            throw new Error(`Football API error! Status: ${response.status}, Message: ${errorText}`);
        }

        const data = await response.json();

        // The API can return an error object, check for that
        if (data.error) {
            console.error('Football API returned an error:', data.error, data.message);
            throw new Error(`Football API Error: ${data.message || data.error}`);
        }
        
        // Handle cases where API returns a string message instead of an array for "not found" etc.
        if (Array.isArray(data) && data.length === 1 && typeof data[0] === 'string') {
            return [];
        }


        return data;
    } catch (error) {
        console.error('An error occurred during API fetch:', error);
        return null; // Return null on error to handle it gracefully in the main logic
    }
}

/**
 * Endpoint to get a list of all countries with football leagues.
 */
app.get('/api/countries', async (req, res) => {
    try {
        const countries = await fetchFootballData({ action: 'get_countries' });
        if (!countries) throw new Error("Could not fetch countries.");
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
        if (!leagues) throw new Error("Could not fetch leagues for the selected country.");
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

        if (!fixtures) throw new Error("Could not fetch fixtures.");
        const fixtureList = Array.isArray(fixtures) ? fixtures : [];

        const upcomingFixtures = fixtureList
            .filter(fixture => fixture.match_status === '' || !fixture.match_status)
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


// ===================================================================================
// AI ANALYSIS ENDPOINT - REWRITTEN WITH ENHANCED DATA FETCHING
// ===================================================================================
app.post('/api/analyze', async (req, res) => {
    const { fixtureId, leagueId } = req.body;

    if (!fixtureId || !leagueId) {
        return res.status(400).json({ error: 'Missing required parameters for analysis.' });
    }

    try {
        // ===========================================================================
        // 1. FETCH ALL REQUIRED DATA IN PARALLEL FOR EFFICIENCY
        // ===========================================================================
        const [
            fixtureResponse,
            standings,
            h2hResponse,
            oddsData,
            predictionsData,
            lineupsData
        ] = await Promise.all([
            fetchFootballData({ action: 'get_events', match_id: fixtureId }),
            fetchFootballData({ action: 'get_standings', league_id: leagueId }),
            fetchFootballData({ action: 'get_H2H', firstTeamId: fixtureId.match_hometeam_id, secondTeamId: fixtureId.match_awayteam_id }),
            fetchFootballData({ action: 'get_odds', match_id: fixtureId }),
            fetchFootballData({ action: 'get_predictions', match_id: fixtureId }),
            fetchFootballData({ action: 'get_lineups', match_id: fixtureId })
        ]);

        const fixture = fixtureResponse && fixtureResponse.length > 0 ? fixtureResponse[0] : {};
        if (!fixture.match_hometeam_id) {
            return res.status(404).json({ error: 'Fixture details could not be found.' });
        }
        
        // Fetch recent matches for both teams
        const [homeTeamRecentForm, awayTeamRecentForm] = await Promise.all([
            fetchFootballData({
                action: 'get_events',
                from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // Wider window for more data
                to: new Date().toISOString().slice(0, 10),
                team_id: fixture.match_hometeam_id,
            }),
            fetchFootballData({
                action: 'get_events',
                from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                to: new Date().toISOString().slice(0, 10),
                team_id: fixture.match_awayteam_id,
            })
        ]);

        // ===========================================================================
        // 2. PROCESS AND FORMAT THE FETCHED DATA
        // ===========================================================================

        // --- Basic fixture and standings info ---
        const homeTeamStats = standings.find(s => s.team_id === fixture.match_hometeam_id) || {};
        const awayTeamStats = standings.find(s => s.team_id === fixture.match_awayteam_id) || {};
        const h2hData = Array.isArray(h2hResponse?.firstTeam_VS_secondTeam) ? h2hResponse.firstTeam_VS_secondTeam.slice(0, 5) : [];
        
        // --- Process Odds ---
        const oddsBookmaker = oddsData && oddsData.length > 0 ? oddsData[0] : {};

        // --- Process API Predictions ---
        const prediction = predictionsData && predictionsData.length > 0 ? predictionsData[0] : {};
        const providerPredictionPrompt = `
            Provider's Mathematical Prediction:
            - Home Win Probability: ${prediction.prob_HW || 'N/A'}%
            - Draw Probability: ${prediction.prob_D || 'N/A'}%
            - Away Win Probability: ${prediction.prob_AW || 'N/A'}%
            - Over 2.5 Goals Probability: ${prediction.prob_O || 'N/A'}%
            - Both Teams to Score Probability: ${prediction.prob_bts || 'N/A'}%
        `;

        // --- Process Lineups ---
        const lineupInfo = lineupsData ? lineupsData[fixtureId] : null;
        const formatLineup = (teamLineup) => {
            if (!teamLineup) return 'N/A';
            const starters = teamLineup.starting_lineups?.map(p => p.lineup_player).join(', ') || 'Not available';
            const missing = teamLineup.missing_players?.map(p => p.lineup_player).join(', ') || 'None reported';
            return `Starting XI: ${starters}\n  - Missing Players: ${missing}`;
        };
        const lineupPrompt = `
            Team Lineup and Status:
            - ${fixture.match_hometeam_name}: ${formatLineup(lineupInfo?.home)}
            - ${fixture.match_awayteam_name}: ${formatLineup(lineupInfo?.away)}
        `;

        // --- Calculate Average Stats from Recent Games ---
        const calculateAverageStats = (matches, teamId) => {
            if (!Array.isArray(matches) || matches.length === 0) return { form: 'N/A', avgPossession: 'N/A', avgShotsOnGoal: 'N/A', avgCorners: 'N/A' };
            
            let possessionSum = 0, shotsOnGoalSum = 0, cornersSum = 0, validMatches = 0;
            const form = [];

            const recentMatches = matches.filter(m => m.match_status === 'Finished').slice(-5);

            for (const match of recentMatches) {
                const isHome = match.match_hometeam_id === teamId;
                if (match.statistics && match.statistics.length > 0) {
                    const possession = match.statistics.find(s => s.type === 'Ball Possession');
                    const shotsOnGoal = match.statistics.find(s => s.type === 'Shots On Goal');
                    const corners = match.statistics.find(s => s.type === 'Corners');

                    if (possession) {
                        possessionSum += parseInt(isHome ? possession.home : possession.away, 10);
                    }
                    if (shotsOnGoal) {
                        shotsOnGoalSum += parseInt(isHome ? shotsOnGoal.home : shotsOnGoal.away, 10);
                    }
                    if (corners) {
                        cornersSum += parseInt(isHome ? corners.home : corners.away, 10);
                    }
                    validMatches++;
                }
                
                // Calculate form (W/D/L)
                const homeScore = parseInt(match.match_hometeam_score, 10);
                const awayScore = parseInt(match.match_awayteam_score, 10);
                if (homeScore === awayScore) {
                    form.push('D');
                } else if ((isHome && homeScore > awayScore) || (!isHome && awayScore > homeScore)) {
                    form.push('W');
                } else {
                    form.push('L');
                }
            }

            return {
                form: form.join(''),
                avgPossession: validMatches > 0 ? (possessionSum / validMatches).toFixed(1) + '%' : 'N/A',
                avgShotsOnGoal: validMatches > 0 ? (shotsOnGoalSum / validMatches).toFixed(1) : 'N/A',
                avgCorners: validMatches > 0 ? (cornersSum / validMatches).toFixed(1) : 'N/A'
            };
        };

        const homeAvgStats = calculateAverageStats(homeTeamRecentForm, fixture.match_hometeam_id);
        const awayAvgStats = calculateAverageStats(awayTeamRecentForm, fixture.match_awayteam_id);

        // ===========================================================================
        // 3. CONSTRUCT THE NEW, COMPREHENSIVE PROMPT
        // ===========================================================================
        const prompt = `
            Analyze the following football match for a betting recommendation. Consider all available data points, including the provider's own mathematical predictions and team lineups, to make a well-rounded decision.

            Match Details:
            - Match: ${fixture.match_hometeam_name || 'N/A'} vs ${fixture.match_awayteam_name || 'N/A'}
            - Competition: ${fixture.league_name || 'N/A'}
            - Date & Time: ${fixture.match_date || 'N/A'} at ${fixture.match_time || 'N/A'}
            - Venue: ${fixture.match_stadium || 'N/A'}
            - Referee: ${fixture.match_referee || 'N/A'}

            ${lineupPrompt}

            ${providerPredictionPrompt}

            Pre-Match Betting Odds (from ${oddsBookmaker.odd_bookmakers || 'various bookmakers'}):
            - Home Win (1): ${oddsBookmaker.odd_1 || 'N/A'}
            - Draw (X): ${oddsBookmaker.odd_x || 'N/A'}
            - Away Win (2): ${oddsBookmaker.odd_2 || 'N/A'}
            - Over 2.5 Goals: ${oddsBookmaker['o+2.5'] || 'N/A'}
            - Under 2.5 Goals: ${oddsBookmaker['u+2.5'] || 'N/A'}
            
            Head-to-Head (last 5 matches):
            ${h2hData.length > 0 ? h2hData.map(match => `- ${match.match_date}: ${match.match_hometeam_name} ${match.match_hometeam_score} - ${match.match_awayteam_score} ${match.match_awayteam_name}`).join('\n') : '- No recent head-to-head data available.'}
            
            Home Team Analysis: ${fixture.match_hometeam_name}
            - League Position: ${homeTeamStats.overall_league_position || 'N/A'} (Overall), ${homeTeamStats.home_league_position || 'N/A'} (Home)
            - Points: ${homeTeamStats.overall_league_PTS || 'N/A'}
            - Goals Scored/Conceded (Home): ${homeTeamStats.home_league_GF || 'N/A'} / ${homeTeamStats.home_league_GA || 'N/A'}
            - Recent Performance (Last 5 Games):
              - Form: ${homeAvgStats.form}
              - Average Ball Possession: ${homeAvgStats.avgPossession}
              - Average Shots on Goal: ${homeAvgStats.avgShotsOnGoal}
              - Average Corners: ${homeAvgStats.avgCorners}

            Away Team Analysis: ${fixture.match_awayteam_name}
            - League Position: ${awayTeamStats.overall_league_position || 'N/A'} (Overall), ${awayTeamStats.away_league_position || 'N/A'} (Away)
            - Points: ${awayTeamStats.overall_league_PTS || 'N/A'}
            - Goals Scored/Conceded (Away): ${awayTeamStats.away_league_GF || 'N/A'} / ${awayTeamStats.away_league_GA || 'N/A'}
            - Recent Performance (Last 5 Games):
              - Form: ${awayAvgStats.form}
              - Average Ball Possession: ${awayAvgStats.avgPossession}
              - Average Shots on Goal: ${awayAvgStats.avgShotsOnGoal}
              - Average Corners: ${awayAvgStats.avgCorners}
            
            Based on a holistic analysis of ALL the data provided, output a structured JSON response with your final conclusion: a predicted outcome (e.g., "Home Win", "Draw"), a specific recommended bet (e.g., "Moneyline - Home Team", "Over 2.5 Goals", "Both Teams to Score - Yes"), and a confidence score (from 0 to 100) for your recommendation.
        `;

        // ===========================================================================
        // 4. SEND PROMPT TO GEMINI AND RETURN RESPONSE
        // ===========================================================================
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "predictedOutcome": { "type": "STRING" },
                        "recommendedBet": { "type": "STRING" },
                        "confidenceScore": { "type": "NUMBER" }
                    },
                    "required": ["predictedOutcome", "recommendedBet", "confidenceScore"]
                }
            }
        };

        const geminiApiKey = GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

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
        
        if (aiResult.candidates && aiResult.candidates.length > 0) {
            const jsonString = aiResult.candidates[0].content.parts[0].text;
            const analysis = JSON.parse(jsonString);
            res.json(analysis);
        } else {
            console.error("Invalid response from Gemini:", aiResult);
            throw new Error('Invalid or empty response structure from the AI model.');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
