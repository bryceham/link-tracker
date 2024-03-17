const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// PostgreSQL connection configuration
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Route to create a new tracking link
app.post("/create", async (req, res) => {
  const { link, destination } = req.body;
  if (!link || !destination) {
    return res
      .status(400)
      .send("Missing required parameters: link or destination");
  }

  try {
    // Insert new link into the database
    const result = await pool.query(
      "INSERT INTO links (link, destination, clicks) VALUES ($1, $2, $3)",
      [link, destination, 0]
    );
    res.send(`Tracking link created: ${link}`);
  } catch (err) {
    console.error("Error creating link:", err);
    res.status(500).send("Error creating link");
  }
});

// Route to track and redirect
app.get("/:link", async (req, res) => {
  const { link } = req.params;
  try {
    // Retrieve link info from the database
    const result = await pool.query(
      "SELECT destination FROM links WHERE link = $1",
      [link]
    );
    if (result.rows.length === 0) {
      return res.status(404).send("Link not found");
    }

    // Record click event
    await pool.query("INSERT INTO click_events (link) VALUES ($1)", [link]);

    // Increment click count
    await pool.query("UPDATE links SET clicks = clicks + 1 WHERE link = $1", [
      link,
    ]);

    // Redirect to destination
    res.redirect(result.rows[0].destination);
  } catch (err) {
    console.error("Error redirecting:", err);
    res.status(500).send("Error redirecting");
  }
});

// Route to get link click statistics
app.get("/:link/stats", async (req, res) => {
  const { link } = req.params;
  try {
    // Retrieve link info from the database
    const result = await pool.query(
      "SELECT destination, clicks FROM links WHERE link = $1",
      [link]
    );
    if (result.rows.length === 0) {
      return res.status(404).send("Link not found");
    }

    res.json({
      link,
      destination: result.rows[0].destination,
      clicks: result.rows[0].clicks,
    });
  } catch (err) {
    console.error("Error getting statistics:", err);
    res.status(500).send("Error getting statistics");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
