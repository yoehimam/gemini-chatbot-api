import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/', 'application/pdf'];
    const isValidType = allowedTypes.some(type => file.mimetype.startsWith(type));
    if (isValidType) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Only audio and PDF files are allowed.'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Initialize Google Generative AI
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set in the .env file');
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Helper function to convert file to base64
function fileToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString('base64');
}

// Helper function to get mime type
function getMimeType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return `audio/${ext === 'm4a' ? 'mp4' : ext}`;
  return 'application/octet-stream';
}

// POST endpoint for chat with file support
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { history, message } = req.body;
    const file = req.file;

    // Check if we have either message or file
    if (!message && !file) {
      return res.status(400).json({ error: 'Message or file is required' });
    }

    // Convert history format for Gemini API
    // Note: We don't store file data in history (too large), only text messages
    let chatHistory = [];
    if (history && Array.isArray(history) && history.length > 0) {
      chatHistory = history.map(msg => {
        if (msg.role === 'user') {
          // For history, we only store text (file metadata is for display only)
          const text = msg.file 
            ? `${msg.text || ''} [File: ${msg.file.name || 'uploaded file'}]`.trim()
            : String(msg.text || msg.message || '');
          
          return {
            role: 'user',
            parts: [{ text: text }]
          };
        } else if (msg.role === 'model') {
          return {
            role: 'model',
            parts: [{ text: String(msg.text || msg.message || '') }]
          };
        }
        return null;
      }).filter(msg => msg !== null && msg.parts[0].text.length > 0);
    }

    // Start chat with history
    const chatConfig = {};
    if (chatHistory.length > 0) {
      chatConfig.history = chatHistory;
    }

    const chat = model.startChat(chatConfig);

    // Prepare message parts
    const parts = [];
    
    // Add file if uploaded (file should come first for better context)
    if (file) {
      const fileData = fileToBase64(file.path);
      const mimeType = getMimeType(file.path);
      
      parts.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      });
    }
    
    // Add text message if provided
    if (message) {
      parts.push({ text: message });
    } else if (file) {
      // If only file without message, add a default prompt
      parts.push({ text: 'Please analyze this file and provide insights.' });
    }

    // Send message and get response
    const result = await chat.sendMessage(parts);
    const response = await result.response;
    const text = response.text();
    
    // Clean up uploaded file after processing
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    res.json({ message: text });
  } catch (error) {
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Chat API error:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test if API key is valid by making a simple request
    const testModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await testModel.generateContent('Hello');
    res.json({ 
      status: 'ok', 
      message: 'API key is valid',
      model: 'gemini-2.5-flash'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'API key validation failed',
      error: error.message 
    });
  }
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`API Key status: ${process.env.GEMINI_API_KEY ? 'Set' : 'NOT SET'}`);
  if (process.env.GEMINI_API_KEY) {
    console.log(`API Key preview: ${process.env.GEMINI_API_KEY.substring(0, 10)}...`);
  }
});
