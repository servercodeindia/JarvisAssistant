document.addEventListener('DOMContentLoaded', () => {
    const startCallBtn = document.getElementById('startCall');
    const statusMessage = document.getElementById('statusMessage');

    startCallBtn.addEventListener('click', async () => {
        // Reset UI
        startCallBtn.classList.add('loading');
        startCallBtn.disabled = true;
        statusMessage.textContent = 'Processing request...';
        statusMessage.className = 'status-message';

        try {
            const response = await fetch('/api/start-call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                statusMessage.textContent = '🎉 Call initiated successfully!';
                statusMessage.classList.add('success');
            } else {
                let errorMsg = data.error || 'Failed to start call';
                if (data.errors && data.errors.length > 0) {
                    errorMsg = data.errors[0];
                }
                statusMessage.textContent = `❌ ${errorMsg}`;
                statusMessage.classList.add('error');
            }
        } catch (error) {
            statusMessage.textContent = '💥 Connection error. Is the server running?';
            statusMessage.classList.add('error');
        } finally {
            startCallBtn.classList.remove('loading');
            startCallBtn.disabled = false;
        }
    });
});
