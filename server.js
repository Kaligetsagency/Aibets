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
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;


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

        // 2. Construct the prompt for Gemini AI
        const prompt = `
            You are an expert sports betting analyst. Your task is to provide a betting recommendation for an upcoming sports match.
            Analyze the provided data and return a single, minified JSON object with three keys: "suggestedBet", "confidenceLevel", and "justification".
            Do not include any other text, markdown formatting, or explanations outside of the JSON object.

            Match Details:
            - Home Team: ${game.home_team}
            - Away Team: ${game.away_team}
            - Sport: ${game.sport_title}

            Available Betting Odds (from DraftKings, if available):
            - Head-to-Head (Moneyline): ${JSON.stringify(game.bookmakers.find(b => b.key === 'draftkings')?.markets.find(m => m.key === 'h2h')?.outcomes)}
            - Point Spread: ${JSON.stringify(game.bookmakers.find(b => b.key === 'draftkings')?.markets.find(m => m.key === 'spreads')?.outcomes)}
            - Totals (Over/Under): ${JSON.stringify(game.bookmakers.find(b => b.key === 'draftkings')?.markets.find(m => m.key === 'totals')?.outcomes)}

            Based on this data, provide your expert analysis and generate the JSON output. Consider factors like which team is favored and the value presented by the odds.
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
