const jwt = require('jsonwebtoken');
require('dotenv').config();

export default async function handler(req, res) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Decode the "pass" we gave them during login
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Return their user data (including their role: admin or guest)
        res.status(200).json({ 
            authenticated: true, 
            username: decoded.username, 
            role: decoded.role 
        });
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired session' });
    }
}
