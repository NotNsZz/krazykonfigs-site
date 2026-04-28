const axios = require('axios');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const client = new MongoClient(process.env.MONGODB_URI);

export default async function handler(req, res) {
    const { code } = req.query;

    if (!code) return res.status(400).json({ error: 'No code provided' });

    try {
        // 1. Exchange code for access token from Discord
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'http://localhost:3000/login.html', // Update this for Vercel later
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        // 2. Get User Info from Discord
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
        });

        const discordUser = userResponse.data;

        // 3. Check/Update user in KrazyVault
        await client.connect();
        const db = client.db('KrazyVault');
        const users = db.collection('users');

        let user = await users.findOne({ discordId: discordUser.id });
        
        if (!user) {
            // New user - default role is guest
            user = {
                discordId: discordUser.id,
                username: discordUser.username,
                avatar: discordUser.avatar,
                role: 'guest'
            };
            await users.insertOne(user);
        }

        // 4. Create a secure JWT token for the session
        const sessionToken = jwt.sign(
            { id: user.discordId, role: user.role, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 5. Send user home with their token
        res.status(200).json({ token: sessionToken, user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Authentication failed' });
    } finally {
        await client.close();
    }
}
