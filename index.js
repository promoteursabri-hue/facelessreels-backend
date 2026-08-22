const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const gTTS = require("gtts");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

const publicDir = path.join(__dirname, "public/audio");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

app.use("/audio", express.static(publicDir));

// Free Google Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Free Gemini & TTS Server Active" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  try {
    const prompt = `Write a completely unique, terrifying short scary story for a video reel. 
Theme: "${theme || "Scary Stories"}". Context: ${desc || "Unexplained events"}.
Respond ONLY with a valid JSON object strictly matching this schema:
{
  "title": "Creepy Title",
  "hook": "Attention grabbing first line",
  "body": "The terrifying story details (2-3 sentences max)",
  "cta": "Follow for more!"
}`;

    // 1. Generate new script using Free Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const scriptData = JSON.parse(response.text);
    const speechText = `${scriptData.hook} ... ${scriptData.body} ... ${scriptData.cta}`;

    // 2. Synthesize Free Audio Narration using gTTS
    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    const gtts = new gTTS(speechText, "en");
    
    await new Promise((resolve, reject) => {
      gtts.save(filePath, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.get("host");
    const audioUrl = `${protocol}://${host}/audio/${fileName}`;

    return res.status(200).json({
      success: true,
      script: {
        ...scriptData,
        audioUrl: audioUrl
      }
    });

  } catch (error) {
    console.error("Free pipeline error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate free story/audio: " + error.message
    });
  }
});

app.post("/api/render-video", async (req, res) => {
  const { script } = req.body;
  return res.status(200).json({
    success: true,
    videoUrl: script?.audioUrl || "ready"
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
