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
      "INSERT INTO links (link, destination) VALUES ($1, $2) RETURNING id",
      [link, destination]
    );
    res.send(`Tracking link created: ${link}`);
  } catch (err) {
    console.error("Error creating link:", err);
    res.status(500).send("Error creating link");
  }
});

// Route to list all links and their clicks
app.get("/stats", async (req, res) => {
  try {
    // Retrieve all links and their click counts from the database
    const result = await pool.query(
      "SELECT l.link, l.destination, COUNT(ce.id) AS clicks FROM links l LEFT JOIN click_events ce ON l.id = ce.link_id GROUP BY l.link, l.destination"
    );

    // Send response with the list of links and clicks
    res.json(result.rows);
  } catch (err) {
    console.error("Error retrieving links:", err);
    res.status(500).send("Error retrieving links");
  }
});


// Route to track, increment click count, and redirect
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
    await pool.query(
      "INSERT INTO click_events (link_id) VALUES ((SELECT id FROM links WHERE link = $1))",
      [link]
    );

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
      "SELECT l.destination, COUNT(ce.id) AS clicks FROM links l LEFT JOIN click_events ce ON l.id = ce.link_id WHERE l.link = $1 GROUP BY l.destination",
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
