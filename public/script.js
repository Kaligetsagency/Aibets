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
            // Updated fetch call to use the same host as the front-end
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ homeTeam, awayTeam })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Unknown server error.' }));
                throw new Error(error.error || 'Something went wrong with the server.');
            }

            const data = await response.json();
            resultJson.textContent = JSON.stringify(data, null, 2);
            resultDiv.classList.remove('hidden');

        } catch (error) {
            console.error('Error:', error);
            // Display a more user-friendly error message
            resultJson.textContent = `Error: ${error.message}. Please check if the server is running and the entered team names are valid.`;
            resultDiv.classList.remove('hidden');
        } finally {
            // Hide loading spinner
            loadingDiv.classList.add('hidden');
        }
    });
});
