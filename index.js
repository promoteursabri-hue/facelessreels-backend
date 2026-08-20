const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const Creatomate = require("creatomate");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy",
});

const creatomate = new Creatomate.Client(process.env.CREATOMATE_API_KEY);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FacelessReels API is running!" });
});

// 1. GENERATE SCRIPT & AUDIO
app.post("/api/generate-script", async (req, res) => {
  return res.status(200).json({
    success: true,
    script: {
      title: "The Whispering Shadows",
      hook: "Did you know some whispers aren't just in your head?",
      body: "In 1920, an abandoned lighthouse started broadcasting mysterious unknown signals.",
      cta: "Follow for more unexplained mysteries!",
      hashtags: ["#scary", "#mystery"],
      audioUrl: "https://cdn.creatomate.com/demo/sample.mp3",
      estimatedDuration: "30s",
    },
  });
});

// 2. RENDER MP4 VIDEO
app.post("/api/render-video", async (req, res) => {
  try {
    console.log("Template ID being used:", process.env.CREATOMATE_TEMPLATE_ID);
    console.log("API Key present:", !!process.env.CREATOMATE_API_KEY);

    // Render without modifications first to verify template & API keys work
    const renders = await creatomate.render({
      templateId: process.env.CREATOMATE_TEMPLATE_ID,
    });

    console.log("Creatomate Render Response:", renders);

    return res.status(200).json({
      success: true,
      videoUrl: renders[0].url,
    });
  } catch (error) {
    // Print full error details to Railway logs
    console.error("Creatomate Execution Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to render video",
      details: error.response?.data || null,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
