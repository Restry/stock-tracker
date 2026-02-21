const { Client } = require('pg');

const client = new Client({
  connectionString: "postgresql://jarvis:9YMjTVB9EQYTRXzjSwHZP2k@52.175.79.6:25432/dashboard?connect_timeout=10&sslmode=disable",
});

async function testConnection() {
  try {
    console.log("Connecting to DB...");
    await client.connect();
    console.log("Successfully connected!");
    const res = await client.query('SELECT NOW()');
    console.log("Current time from DB:", res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("Connection error:", err.message);
    process.exit(1);
  }
}

testConnection();
