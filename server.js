const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = './data.json';

// In-memory active views (To prevent bypass)
const activeSessions = {};

// Helper functions
async function getLinks() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) { return []; }
}

function generateToken() {
    return crypto.randomBytes(6).toString('hex');
}

// 1. Creation Route
app.get('/create', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/create', async (req, res) => {
    const { url } = req.body;
    const links = await getLinks();
    const id = generateToken();
    
    links.push({ id, originalUrl: url, createdAt: new Date() });
    await fs.writeFile(DATA_FILE, JSON.stringify(links, null, 2));
    
    res.json({ shortUrl: `/s/${id}` });
});

// 2. Initial Click - Setup Random Steps & Redirect to first secure token
app.get('/s/:id', async (req, res) => {
    const links = await getLinks();
    const link = links.find(l => l.id === req.params.id);
    
    if (!link) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); // Updated to show 404 page

    // Randomize process (3 to 5 steps, random wait times)
    const totalSteps = Math.floor(Math.random() * 3) + 3; 
    const firstToken = generateToken();

    activeSessions[firstToken] = {
        linkId: link.id,
        currentStep: 1,
        totalSteps: totalSteps,
        waitTime: Math.floor(Math.random() * 10) + 10, // 10 to 20 seconds
        startTime: Date.now(),
        originalUrl: link.originalUrl
    };

    res.redirect(`/view/${firstToken}`);
});

// 3. Secure Viewer Page
app.get('/view/:token', (req, res) => {
    if (!activeSessions[req.params.token]) {
        return res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); // Updated to show 404 page
    }
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// 4. API to get status of current token
app.get('/api/status/:token', (req, res) => {
    const session = activeSessions[req.params.token];
    if (!session) return res.status(404).json({ error: "Invalid token" });
    
    res.json({
        step: session.currentStep,
        total: session.totalSteps,
        waitTime: session.waitTime
    });
});

// 5. API to move to next step (Server verifies time)
app.post('/api/next', (req, res) => {
    const { token } = req.body;
    const session = activeSessions[token];

    if (!session) return res.status(400).json({ error: "Invalid token" });

    const timePassed = (Date.now() - session.startTime) / 1000;
    
    // Server-side Anti-Cheat Check
    if (timePassed < session.waitTime - 2) { 
        return res.status(403).json({ error: "Don't try to cheat the timer!" });
    }

    // Process Complete
    if (session.currentStep >= session.totalSteps) {
        const targetUrl = session.originalUrl;
        delete activeSessions[token]; // Clear session
        return res.json({ complete: true, url: targetUrl });
    }

    // Generate Next Step
    const nextToken = generateToken();
    activeSessions[nextToken] = {
        ...session,
        currentStep: session.currentStep + 1,
        waitTime: Math.floor(Math.random() * 8) + 8, // 8 to 15 seconds for next steps
        startTime: Date.now()
    };
    
    delete activeSessions[token]; // Destroy old token
    res.json({ complete: false, nextUrl: `/view/${nextToken}` });
});

// ==========================================
// 6. Catch-all route for 404 Page (UPDATED)
// ==========================================
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(3000, () => console.log('Secure Server running on http://localhost:3000/create'));
