document.getElementById('analyzeButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('matchesFile');
    const file = fileInput.files[0];
    const resultsDiv = document.getElementById('results');
    const resultsText = document.getElementById('resultsText');
    const loadingDiv = document.getElementById('loading');

    if (!file) {
        alert('Please select a file first.');
        return;
    }

    const formData = new FormData();
    formData.append('matchesFile', file);

    // Show loading indicator and hide previous results
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    resultsText.textContent = '';

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            resultsText.textContent = data.result;
        } else {
            resultsText.textContent = `Error: ${data.error}`;
        }
    } catch (error) {
        resultsText.textContent = `An unexpected error occurred: ${error.message}`;
    } finally {
        // Hide loading indicator and show results
        loadingDiv.classList.add('hidden');
        resultsDiv.classList.remove('hidden');
    }
});
