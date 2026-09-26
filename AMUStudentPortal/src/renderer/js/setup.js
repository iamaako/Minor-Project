const btnBrowse = document.getElementById('btnBrowse');
const statusPanel = document.getElementById('statusPanel');
const statusMsg = document.getElementById('statusMsg');
const inputSystemNumber = document.getElementById('inputSystemNumber');

// Pre-fill system number from existing config or hostname
if (window.examAPI && window.examAPI.getSystemNumber) {
    window.examAPI.getSystemNumber().then(num => {
        if (inputSystemNumber && num) {
            inputSystemNumber.value = num;
        }
    }).catch(() => {});
}

async function persistCurrentSystemNumber() {
    if (inputSystemNumber && window.examAPI && window.examAPI.saveSystemNumber) {
        const val = inputSystemNumber.value.trim();
        if (val) {
            await window.examAPI.saveSystemNumber(val);
        }
    }
}

btnBrowse.addEventListener('click', async () => {
    try {
        resetStatus();
        await persistCurrentSystemNumber();
        const sysVal = inputSystemNumber ? inputSystemNumber.value.trim() : '';
        const success = await window.examAPI.manualLicenseBrowse(sysVal);
        if (success) {
            handleSuccess();
        } else {
            showError('Operation cancelled or invalid file.');
        }
    } catch (err) {
        showError(err.message);
    }
});

window.examAPI.onUsbInserted(async () => {
    await persistCurrentSystemNumber();
    statusMsg.textContent = 'USB Inserted! Scanning for License Token...';
    statusMsg.className = '';
});

window.examAPI.onLicenseProcessing(async () => {
    await persistCurrentSystemNumber();
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
