const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const chatBox = document.getElementById('chat-box');
let chatHistory = [];
let selectedFile = null;

// Load chat history from sessionStorage on page load
function loadChatHistory() {
  try {
    const savedHistory = sessionStorage.getItem('geminiChatHistory');
    if (savedHistory) {
      chatHistory = JSON.parse(savedHistory);
      // Display all saved messages
      chatHistory.forEach(msg => {
        if (msg.file) {
          appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.text, false, msg.file);
        } else {
          appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.text);
        }
      });
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
    chatHistory = [];
  }
}

// Save chat history to sessionStorage
function saveChatHistory() {
  try {
    sessionStorage.setItem('geminiChatHistory', JSON.stringify(chatHistory));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

// Clear chat history
function clearChatHistory() {
  chatHistory = [];
  sessionStorage.removeItem('geminiChatHistory');
  chatBox.innerHTML = '';
  clearFilePreview();
}

// File input handler
fileInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    selectedFile = file;
    showFilePreview(file);
  }
});

function showFilePreview(file) {
  filePreview.innerHTML = '';
  const preview = document.createElement('div');
  preview.className = 'file-preview-item';
  
  const fileName = document.createElement('span');
  fileName.className = 'file-name';
  fileName.textContent = file.name;
  
  const fileSize = document.createElement('span');
  fileSize.className = 'file-size';
  fileSize.textContent = formatFileSize(file.size);
  
  const removeBtn = document.createElement('button');
  removeBtn.className = 'file-remove';
  removeBtn.textContent = '✕';
  removeBtn.onclick = () => {
    selectedFile = null;
    fileInput.value = '';
    filePreview.innerHTML = '';
  };
  
  preview.appendChild(fileName);
  preview.appendChild(fileSize);
  preview.appendChild(removeBtn);
  filePreview.appendChild(preview);
}

function clearFilePreview() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.innerHTML = '';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Load chat history when page loads
loadChatHistory();

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  
  // Check if we have either message or file
  if (!userMessage && !selectedFile) {
    alert('Silakan ketik pesan atau pilih file (Audio/PDF)');
    return;
  }

  // Disable form while processing
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  input.disabled = true;
  fileInput.disabled = true;

  // Display user message with file if any
  if (selectedFile) {
    appendMessage('user', userMessage || `File: ${selectedFile.name}`, false, {
      name: selectedFile.name,
      type: selectedFile.type,
      size: selectedFile.size
    });
  } else {
    appendMessage('user', userMessage);
  }

  const messageText = userMessage;
  const fileToSend = selectedFile;
  
  // Clear input
  input.value = '';
  clearFilePreview();

  // Show loading indicator
  const loadingId = appendMessage('bot', 'Memproses...', true);

  try {
    // Prepare FormData for file upload
    const formData = new FormData();
    if (messageText) {
      formData.append('message', messageText);
    }
    if (fileToSend) {
      formData.append('file', fileToSend);
    }
    formData.append('history', JSON.stringify(chatHistory));

    // Send message to API
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.details || data.error || 'Failed to get response';
      throw new Error(errorMsg);
    }

    // Remove loading message
    removeMessage(loadingId);

    // Display bot response
    appendMessage('bot', data.message);

    // Update chat history
    const historyEntry = {
      role: 'user',
      text: messageText || `File: ${fileToSend?.name || ''}`
    };
    
    if (fileToSend) {
      // For history, we store file metadata
      historyEntry.file = {
        name: fileToSend.name,
        type: fileToSend.type,
        size: fileToSend.size
      };
    }
    
    chatHistory.push(
      historyEntry,
      { role: 'model', text: data.message }
    );
    
    // Save chat history to sessionStorage
    saveChatHistory();
  } catch (error) {
    // Remove loading message
    removeMessage(loadingId);

    // Display error message
    appendMessage('bot', `Error: ${error.message}`);
    console.error('Chat error:', error);
  } finally {
    // Re-enable form
    submitButton.disabled = false;
    input.disabled = false;
    fileInput.disabled = false;
    input.focus();
  }
});

function appendMessage(sender, text, isLoading = false, file = null) {
  const msg = document.createElement('div');
  const messageId = 'msg-' + Date.now() + '-' + Math.random();
  msg.id = messageId;
  msg.classList.add('message', sender);
  
  if (isLoading) {
    msg.classList.add('loading');
  }
  
  // Add file info if present
  if (file) {
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    
    const fileIcon = document.createElement('span');
    fileIcon.className = 'file-icon';
    fileIcon.textContent = file.type?.startsWith('audio/') ? '🎵' : '📄';
    
    const fileName = document.createElement('span');
    fileName.className = 'file-name-display';
    fileName.textContent = file.name || 'File';
    
    fileInfo.appendChild(fileIcon);
    fileInfo.appendChild(fileName);
    msg.appendChild(fileInfo);
    
    if (text) {
      const textDiv = document.createElement('div');
      textDiv.className = 'message-text';
      textDiv.textContent = text;
      msg.appendChild(textDiv);
    }
  } else {
    msg.textContent = text;
  }
  
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
  
  return messageId;
}

function removeMessage(messageId) {
  const msg = document.getElementById(messageId);
  if (msg) {
    msg.remove();
  }
}

// Clear chat button
const clearBtn = document.getElementById('clear-btn');
clearBtn.addEventListener('click', function() {
  if (confirm('Apakah Anda yakin ingin menghapus semua chat?')) {
    clearChatHistory();
  }
});

// Focus input on load
input.focus();
