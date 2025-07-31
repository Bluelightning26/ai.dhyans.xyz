const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'api-key-goes-here',
    resave: false,
    saveUninitialized: true
}));

app.post('/chat', async (req, res) => {
    if (!req.session.conversations) req.session.conversations = {};
    if (!req.session.currentConversation) req.session.currentConversation = Date.now().toString();
    if (!req.session.conversations[req.session.currentConversation]) {
        req.session.conversations[req.session.currentConversation] = [];
    }

    const currentMessages = req.session.conversations[req.session.currentConversation];
    currentMessages.push({ role: 'user', content: req.body.message });

    const response = await fetch('https://ai.hackclub.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: currentMessages })
    });
    const data = await response.json();

    if (data.choices?.[0]?.message?.content) {
        currentMessages.push({ role: 'assistant', content: data.choices[0].message.content });
    }

    res.json(data);
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
        const response = await fetch('https://ai.hackclub.com/model');
        console.log('Model Response Status:', response.status);
        const text = await response.text();
        console.log('Model Response Body:', text);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        res.send(text);
    } catch (error) {
        console.error('Model fetch error:', error);
        res.status(500).send(error.message);
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