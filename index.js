const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Root health check route (solves Cannot GET /)
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FacelessReels API is running!" });
});

// Script Generation Endpoint
app.post("/api/generate-script", async (req, res) => {
  try {
    const { theme, desc } = req.body;

    const script = {
      title: `${theme || "Viral"}: Untold Secrets`,
      hook: `Did you know this about ${theme || "this topic"}?`,
      body: `Deep in the archives, researchers discovered shocking details about ${
        desc || theme || "this event"
      }. Most people have no idea this actually happened...`,
      cta: "Follow for more daily stories. Like if this blew your mind!",
      hashtags: ["#faceless", "#storytime", "#mindblown", "#viral", "#fyp"],
      estimatedDuration: "50s",
    };

    return res.status(200).json({ success: true, script });
  } catch (error) {
    console.error("Error generating script:", error);
    return res.status(500).json({ success: false, error: "Failed to generate script" });
  }
});

// Series Creation Endpoint
app.post("/api/series", async (req, res) => {
  try {
    const seriesData = req.body;

    const newSeries = {
      id: Date.now(),
      ...seriesData,
      status: "active",
      videosGenerated: 0,
      totalViews: 0,
      createdAt: new Date().toISOString(),
      nextPost: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };

    return res.status(201).json({ success: true, series: newSeries });
  } catch (error) {
    console.error("Error creating series:", error);
    return res.status(500).json({ success: false, error: "Failed to create series" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
