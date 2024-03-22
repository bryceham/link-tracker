const express = require("express");
const { Pool } = require("pg");
const path = require("path");

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

// Route to serve the HTML page
app.get("/stats", async (req, res) => {
  try {
    const htmlPath = path.join(__dirname, "public", "link-statistics.html");
    res.sendFile(htmlPath);
  } catch (err) {
    console.error("Error serving HTML file:", err);
    res.status(500).send("Error serving HTML file");
  }
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

// Route to list all links and their clicks including statistics for all time, last 24 hours, and last 7 days
app.get("/api/all", async (req, res) => {
  try {
    const query = `
      SELECT 
        l.link, 
        l.destination, 
        SUM(CASE WHEN ce.clicked_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS "7d",
        SUM(CASE WHEN ce.clicked_at >= NOW() - INTERVAL '1 day' THEN 1 ELSE 0 END) AS "24h",
        COUNT(ce.id) AS allTime
      FROM 
        links l 
        LEFT JOIN click_events ce ON l.id = ce.link_id 
      GROUP BY 
        l.link, l.destination;
    `;

    const result = await pool.query(query);
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

    // Record click event (non-blocking)
    pool.query(
      "INSERT INTO click_events (link_id) VALUES ((SELECT id FROM links WHERE link = $1))",
      [link]
    ).catch(err => {
      console.error("Error recording click event:", err);
    });

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

// Route to get daily click statistics
app.get("/api/daily/:link", async (req, res) => {
  const { link } = req.params;
  try {
    const query = `
      SELECT 
        TO_CHAR(DATE_TRUNC('day', ce.clicked_at AT TIME ZONE 'Australia/Sydney'), 'YYYY-MM-DD') AS date,
        COUNT(ce.id) AS clicks
      FROM 
        links l
        LEFT JOIN click_events ce ON l.id = ce.link_id
      WHERE 
        l.link = $1
      GROUP BY 
        date
      ORDER BY 
        date;
    `;
    const result = await pool.query(query, [link]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error getting daily statistics:", err);
    res.status(500).send("Error getting daily statistics");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
