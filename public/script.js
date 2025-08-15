document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('match-file');
    const loadingDiv = document.getElementById('loading');
    const resultDiv = document.getElementById('analysis-result');
    const contentPre = document.getElementById('analysis-content');

    if (fileInput.files.length === 0) {
        alert('Please select a file to upload.');
        return;
    }

    loadingDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');

    const formData = new FormData();
    formData.append('matchFile', fileInput.files[0]);

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to get analysis from the server.');
        }

        const data = await response.json();
        contentPre.textContent = data.analysis;
        resultDiv.classList.remove('hidden');

    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during the analysis. Please try again.');
    } finally {
        loadingDiv.classList.add('hidden');
    }
});
                                                        
