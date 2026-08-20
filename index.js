const express = require("express");
const cors = require("cors");

const app = express();

// Enable CORS so your React frontend can talk to Railway
app.use(cors());
app.use(express.json());

// Set up the POST endpoint matching your React app
app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;

  try {
    // Replace this placeholder with your actual LLM / Anthropic call
    const script = {
      title: `${theme}: Untold Secrets`,
      hook: `Did you know this about ${theme}?`,
      body: `Here is a fascinating look into ${desc || theme}...`,
      cta: "Follow for more daily stories!",
      hashtags: ["#storytime", "#viral", "#fyp"],
      estimatedDuration: "45s",
    };

    return res.json({ success: true, script });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "Failed to generate script" });
  }
});

// Also define the series creation endpoint from your frontend
app.post("/api/series", async (req, res) => {
  const seriesData = req.body;
  
  // Save to database logic here...
  
  return res.json({
    success: true,
    series: {
      id: Date.now(),
      ...seriesData,
      status: "active",
      videosGenerated: 0,
      totalViews: 0,
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
