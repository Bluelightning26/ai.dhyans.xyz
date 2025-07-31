const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const path = require('path');
const session = require('express-session');
const { marked } = require('marked');

const app = express();

// Configure marked for security
marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false, // We'll handle sanitization if needed
    highlight: function(code, lang) {
        // Optional: Add syntax highlighting here if you want server-side highlighting
        return code;
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'api-key-goes-here',
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// Add endpoint to serve marked library
app.get('/marked.min.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'marked', 'marked.min.js'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.post('/chat', async (req, res) => {
    if (!req.session.conversations) req.session.conversations = {};
    if (!req.session.currentConversation) req.session.currentConversation = Date.now().toString();
    if (!req.session.conversations[req.session.currentConversation]) {
        req.session.conversations[req.session.currentConversation] = [];
    }

    const currentMessages = req.session.conversations[req.session.currentConversation];

    // Save the original message for the UI
    const originalMessage = req.body.message;

    // Modify message if noThinking is enabled
    let messageToSend = originalMessage;
    if (req.session.noThinking) {
        messageToSend = "/no_think " + messageToSend;
    }

    // Save original message to conversation history
    currentMessages.push({ role: 'user', content: originalMessage });

    try {
        const response = await fetch('https://ai.hackclub.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive'
            },
            body: JSON.stringify({
                messages: currentMessages.map((msg, index) => {
                    // Only modify the last user message
                    if (index === currentMessages.length - 1 && msg.role === 'user') {
                        return { ...msg, content: messageToSend };
                    }
                    return msg;
                })
            })
        });

        const data = await response.json();

        if (data.choices?.[0]?.message?.content) {
            currentMessages.push({ role: 'assistant', content: data.choices[0].message.content });
        }

        res.json(data);
    } catch (error) {
        console.error('Chat completion error:', error);
        res.status(500).json({ error: 'Failed to communicate with AI service' });
    }
});

app.get('/thinking-mode', (req, res) => {
    if (req.session.noThinking === undefined) req.session.noThinking = false;
    res.json({ noThinking: req.session.noThinking });
});

app.post('/thinking-mode', (req, res) => {
    req.session.noThinking = req.body.noThinking;
    res.json({ noThinking: req.session.noThinking });
});

app.post('/new-conversation', (req, res) => {
    if (!req.session.conversations) req.session.conversations = {};
    req.session.currentConversation = Date.now().toString();
    req.session.conversations[req.session.currentConversation] = [];
    res.json({ id: req.session.currentConversation });
});

app.get('/conversations', (req, res) => {
    if (!req.session.conversations) req.session.conversations = {};
    res.json({
        conversations: Object.keys(req.session.conversations),
        current: req.session.currentConversation
    });
});

app.post('/switch-conversation', (req, res) => {
    const { id } = req.body;
    if (req.session.conversations && req.session.conversations[id]) {
        req.session.currentConversation = id;
        res.json({ messages: req.session.conversations[id] });
    } else {
        res.status(404).json({ error: 'Conversation not found' });
    }
});

app.get('/model', async (req, res) => {
    try {
        const response = await fetch('https://ai.hackclub.com/model', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive'
            }
        });

        if (response.ok) {
            const modelName = await response.text();
            res.send(modelName);
        } else {
            console.error('Model API returned status:', response.status);
            res.status(200).send('Hack Club AI'); // Fallback
        }
    } catch (error) {
        console.error('Error fetching model:', error);
        res.status(200).send('Hack Club AI'); // Fallback
    }
});

app.delete('/conversation/:id', (req, res) => {
    const { id } = req.params;
    if (req.session.conversations && req.session.conversations[id]) {
        delete req.session.conversations[id];
        if (req.session.currentConversation === id) {
            const conversations = Object.keys(req.session.conversations);
            req.session.currentConversation = conversations.length ? conversations[0] : null;
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Conversation not found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});