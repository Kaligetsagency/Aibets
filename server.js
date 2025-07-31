// server.js
// Backend Express server for the sports betting analysis application.

const express = require('express');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables
dotenv.config();

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ODDS_API_URL = 'https://api.the-odds-api.com/v4';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;


// Endpoint to get the list of sports
app.get('/api/sports', async (req, res) => {
    try {
        const response = await fetch(`${ODDS_API_URL}/sports/?apiKey=${ODDS_API_KEY}`);
        if (!response.ok) {
            throw new Error(`The Odds API responded with status: ${response.status}`);
        }
        const sports = await response.json();
        res.json(sports);
    } catch (error) {
        console.error('Error fetching sports:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to get upcoming games for a specific sport
app.get('/api/games', async (req, res) => {
    const { sport } = req.query;
    if (!sport) {
        return res.status(400).json({ error: 'Sport parameter is required.' });
    }
    try {
        const response = await fetch(`${ODDS_API_URL}/sports/${sport}/odds/?regions=us&oddsFormat=american&markets=h2h,spreads,totals&apiKey=${ODDS_API_KEY}`);
        if (!response.ok) {
            throw new Error(`The Odds API responded with status: ${response.status}`);
        }
        const games = await response.json();
        res.json(games);
    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to analyze a specific game
app.post('/api/analyze', async (req, res) => {
    const { gameId, sportKey, homeTeam, awayTeam } = req.body;

    if (!gameId || !sportKey || !homeTeam || !awayTeam) {
        return res.status(400).json({ error: 'Game ID, sport key, and team names are required.' });
    }

    try {
        // 1. Fetch the latest odds for the specific game
        const oddsResponse = await fetch(`${ODDS_API_URL}/sports/${sportKey}/odds/?regions=us&oddsFormat=american&markets=h2h,spreads,totals&apiKey=${ODDS_API_KEY}`);
        if (!oddsResponse.ok) throw new Error(`The Odds API request failed: ${oddsResponse.statusText}`);
        
        const allGames = await oddsResponse.json();
        const game = allGames.find(g => g.id === gameId);

        if (!game) {
            return res.status(404).json({ error: 'Game not found in the latest odds data.' });
        }
        
        // **NEW**: Fetch additional stats (this is a placeholder for a real stats API call)
        const additionalData = {
            homeTeamForm: "W, W, L, W, W",
            awayTeamForm: "L, W, L, L, W",
            headToHead: `${homeTeam} won 3 of the last 5 meetings.`,
            teamNews: `Key player for ${awayTeam} is questionable with an injury.`
        };

        // 2. Construct a more detailed prompt for Gemini AI
        const prompt = `
            You are a professional sports betting analyst. Your goal is to provide a comprehensive and precise betting recommendation based on a wide range of data.
            
            **Task**: Analyze the provided data and return a single, minified JSON object with the following keys: "suggestedBet", "confidenceLevel", "justification", "riskAssessment", and "alternativeBet".
            Do not include any other text, markdown formatting, or explanations outside of the JSON object.

            **Analysis Data:**
            - **Match**: ${game.home_team} (Home) vs. ${game.away_team} (Away)
            - **Sport**: ${game.sport_title}
            
            **Contextual Data:**
            - **Home Team Form (Last 5)**: ${additionalData.homeTeamForm}
            - **Away Team Form (Last 5)**: ${additionalData.awayTeamForm}
            - **Head-to-Head History**: ${additionalData.headToHead}
            - **Key Team News**: ${additionalData.teamNews}

            **Betting Odds (DraftKings):**
            - **Moneyline**: ${JSON.stringify(game.bookmakers.find(b => b.key === 'draftkings')?.markets.find(m => m.key === 'h2h')?.outcomes)}
            - **Point Spread**: ${JSON.stringify(game.bookmakers.find(b => b.key === 'draftkings')?.markets.find(m => m.key === 'spreads')?.outcomes)}
            - **Totals (Over/Under)**: ${JSON.stringify(game.bookmakers.find(b => b.key === 'draftkings')?.markets.find(m => m.key === 'totals')?.outcomes)}

            **Instructions for Analysis:**
            1.  **Synthesize All Data**: Weigh the betting odds against the contextual data (form, H2H, news). Don't rely only on the odds.
            2.  **Identify Value**: Determine if the odds offer good value relative to the statistical probability of the outcome.
            3.  **Justify your Decision**: In the 'justification', clearly explain WHY you chose the bet, referencing specific data points (e.g., "Given the home team's strong form and the away team's key injury...").
            4.  **Assess Risk**: In 'riskAssessment', describe the primary risks associated with your suggested bet.
            5.  **Provide an Alternative**: In 'alternativeBet', suggest a secondary, perhaps safer, bet based on the data.

            Generate the JSON output now.
        `;

        // 3. Call the Gemini API
        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`Gemini API request failed: ${errorBody}`);
        }

        const geminiResult = await geminiResponse.json();
        const responseText = geminiResult.candidates[0].content.parts[0].text;
        
        // Clean the response to ensure it's valid JSON
        const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(jsonString);

        res.json(analysis);

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
