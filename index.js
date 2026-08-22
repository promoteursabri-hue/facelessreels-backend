const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");
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

// Initialize Google Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Free Gemini & TTS Server Active" });
});

// Helper function to fetch audio from Google TTS via HTTPS
function downloadTTS(text, filePath) {
  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(text.substring(0, 200));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
    }).on("error", (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Write a completely unique, terrifying short scary story for a video reel. 
Theme: "${theme || "Scary Stories"}". Context: ${desc || "Unexplained events"}.
Respond ONLY with a valid JSON object strictly matching this schema:
{
  "title": "Creepy Title",
  "hook": "Attention grabbing first line",
  "body": "The terrifying story details in 2 short sentences",
  "cta": "Follow for more!"
}`;

    // 1. Generate new unique script using free Gemini
    const result = await model.generateContent(prompt);
    const scriptData = JSON.parse(result.response.text());
    const speechText = `${scriptData.hook}. ${scriptData.body}`;

    // 2. Synthesize free TTS audio using native HTTPS request
    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    await downloadTTS(speechText, filePath);

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
