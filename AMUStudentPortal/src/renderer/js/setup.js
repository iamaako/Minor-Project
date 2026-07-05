const btnBrowse = document.getElementById('btnBrowse');
const statusPanel = document.getElementById('statusPanel');
const statusMsg = document.getElementById('statusMsg');

btnBrowse.addEventListener('click', async () => {
    try {
        resetStatus();
        const success = await window.examAPI.manualLicenseBrowse();
        if (success) {
            handleSuccess();
        } else {
            showError('Operation cancelled or invalid file.');
        }
    } catch (err) {
        showError(err.message);
    }
});

window.examAPI.onUsbInserted(() => {
    statusMsg.textContent = 'USB Inserted! Scanning for License Token...';
    statusMsg.className = '';
});

window.examAPI.onLicenseProcessing(() => {
    statusMsg.textContent = 'Token Detected. Activating Setup...';
    statusMsg.className = '';
});

window.examAPI.onLicenseSuccess(() => {
    handleSuccess();
});

window.examAPI.onLicenseError((msg) => {
    showError(msg);
});

function handleSuccess() {
    btnBrowse.style.display = 'none';
    statusMsg.textContent = 'License Verified! Hardware Locked.';
    statusMsg.className = 'status-success';
    
    // The main process will automatically reload the app
}

function showError(msg) {
    statusMsg.textContent = 'Error: ' + msg;
    statusMsg.className = 'status-error';
}

function resetStatus() {
    statusMsg.textContent = 'Waiting for USB Insertion...';
    statusMsg.className = '';
}
