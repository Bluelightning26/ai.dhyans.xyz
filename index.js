const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.post('/chat', async (req, res) => {
    if (!req.session.messages) req.session.messages = [];
    req.session.messages.push({ role: 'user', content: req.body.message });

    const response = await fetch('https://ai.hackclub.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: req.session.messages })
    });
    const data = await response.json();
    // Add AI response to session messages
    if (data.choices?.[0]?.message?.content) {
        req.session.messages.push({ role: 'assistant', content: data.choices[0].message.content });
    }

    res.json(data);
});

app.post('/new-conversation', (req, res) => {
    req.session.messages = [];
    res.sendStatus(200);
});

app.get('/model', async (req, res) => {
    const response = await fetch('https://ai.hackclub.com/model');
    const model = await response.text();
    res.send(model);
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});