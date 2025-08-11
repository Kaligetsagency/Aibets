document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analysis-form');
    const resultDiv = document.getElementById('result');
    const resultJson = document.getElementById('result-json');
    const loadingDiv = document.getElementById('loading');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const homeTeam = document.getElementById('homeTeam').value;
        const awayTeam = document.getElementById('awayTeam').value;

        // Show loading spinner
        loadingDiv.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        resultJson.textContent = '';

        try {
            const response = await fetch('http://localhost:3000/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ homeTeam, awayTeam })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Something went wrong with the server.');
            }

            const data = await response.json();
            resultJson.textContent = JSON.stringify(data, null, 2);
            resultDiv.classList.remove('hidden');

        } catch (error) {
            console.error('Error:', error);
            resultJson.textContent = `Error: ${error.message}`;
            resultDiv.classList.remove('hidden');
        } finally {
            // Hide loading spinner
            loadingDiv.classList.add('hidden');
        }
    });
});
