interface KeyStatus {
  hasKey: boolean;
  source: 'stored' | 'env' | 'none';
  maskedKey: string | null;
}

interface SaveResult {
  success: boolean;
  error?: string;
}

interface SettingsAPI {
  getKeyStatus: () => Promise<KeyStatus>;
  saveApiKey: (key: string) => Promise<SaveResult>;
  deleteApiKey: () => Promise<SaveResult>;
  close: () => void;
  openExternal: (url: string) => Promise<void>;
}

// Access the API exposed by preload script
const settingsAPI = (window as unknown as { settingsAPI: SettingsAPI }).settingsAPI;

const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const toggleVisibilityBtn = document.getElementById('toggle-visibility') as HTMLButtonElement;
const visibilityIcon = document.getElementById('visibility-icon') as HTMLSpanElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const deleteButton = document.getElementById('delete-button') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const messageDiv = document.getElementById('message') as HTMLDivElement;
const getKeyLink = document.getElementById('get-key-link') as HTMLAnchorElement;

let isPasswordVisible = false;

async function loadKeyStatus(): Promise<void> {
  const status = await settingsAPI.getKeyStatus();
  updateStatusDisplay(status);
}

function updateStatusDisplay(status: KeyStatus): void {
  statusDiv.className = 'status ' + status.source;

  if (status.source === 'stored') {
    statusDiv.textContent = `API key is securely stored: ${status.maskedKey}`;
    deleteButton.disabled = false;
  } else if (status.source === 'env') {
    statusDiv.textContent = `Using key from environment variable: ${status.maskedKey}`;
    deleteButton.disabled = true;
  } else {
    statusDiv.textContent = 'No API key configured';
    deleteButton.disabled = true;
  }
}

function showMessage(text: string, type: 'success' | 'error'): void {
  messageDiv.textContent = text;
  messageDiv.className = 'message ' + type;

  setTimeout(() => {
    messageDiv.textContent = '';
    messageDiv.className = 'message';
  }, 3000);
}

function validateApiKey(key: string): boolean {
  return key.startsWith('sk-or-') && key.length > 10;
}

toggleVisibilityBtn.addEventListener('click', () => {
  isPasswordVisible = !isPasswordVisible;
  apiKeyInput.type = isPasswordVisible ? 'text' : 'password';
  visibilityIcon.textContent = isPasswordVisible ? 'Hide' : 'Show';
});

saveButton.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    showMessage('Please enter an API key', 'error');
    return;
  }

  if (!validateApiKey(key)) {
    showMessage('Invalid API key format (should start with sk-or-)', 'error');
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';

  const result = await settingsAPI.saveApiKey(key);

  saveButton.disabled = false;
  saveButton.textContent = 'Save';

  if (result.success) {
    apiKeyInput.value = '';
    showMessage('API key saved successfully', 'success');
    await loadKeyStatus();
  } else {
    showMessage(result.error || 'Failed to save API key', 'error');
  }
});

deleteButton.addEventListener('click', async () => {
  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting...';

  const result = await settingsAPI.deleteApiKey();

  deleteButton.textContent = 'Delete';

  if (result.success) {
    showMessage('API key deleted', 'success');
    await loadKeyStatus();
  } else {
    deleteButton.disabled = false;
    showMessage(result.error || 'Failed to delete API key', 'error');
  }
});

getKeyLink.addEventListener('click', (e) => {
  e.preventDefault();
  settingsAPI.openExternal('https://openrouter.ai/keys');
});

// Handle Enter key in input
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    saveButton.click();
  }
});

// Load initial status
loadKeyStatus();
