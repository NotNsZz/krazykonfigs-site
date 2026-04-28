// Load the tools we installed via npm
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Pull the URI from your .env file
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
    // Only allow GET requests (fetching data)
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        await client.connect();
        
        // Connect to your specific Database and Collection
        const database = client.db('KrazyVault');
        const configs = database.collection('configs');

        // Fetch all config documents (High, Mid, Low ping)
        const allConfigs = await configs.find({}).toArray();

        // Send the data back to your index.html
        res.status(200).json(allConfigs);
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: "Failed to connect to KrazyVault" });
    } finally {
        await client.close();
    }
}
