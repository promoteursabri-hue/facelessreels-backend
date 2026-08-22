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
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

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

// Random story backup engine if API fails or key is missing
function generateFallbackStory() {
  const hooks = [
    "Never look under your bed after 3 AM.",
    "Did you know some whispers aren't in your head?",
    "If you hear your name called in an empty room, ignore it.",
    "An abandoned station started broadcasting signals yesterday."
  ];
  const stories = [
    "Security cameras captured a silhouette standing at the edge of the woods every night at midnight.",
    "A missing traveler left behind a phone with a three-minute recording of breathing from inside their walls.",
    "Old urban legends say if you whistle inside a cave, something whistles back closer to you.",
    "In 1920, an abandoned lighthouse broadcast Morse code warnings with nobody inside."
  ];
  const randomIndex = Math.floor(Math.random() * hooks.length);
  return {
    title: "Creepy Encounter #" + Math.floor(Math.random() * 1000),
    hook: hooks[randomIndex],
    body: stories[randomIndex],
    cta: "Follow for more real horror stories!"
  };
}

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  let scriptData;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is not set on Railway.");
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Write a unique terrifying short scary story for a video reel. 
Theme: "${theme || "Scary Stories"}". Context: ${desc || "Unexplained events"}.
Respond ONLY with a JSON object matching this schema:
{
  "title": "Creepy Title",
  "hook": "Attention grabbing first line",
  "body": "The terrifying story details in 2 short sentences",
  "cta": "Follow for more!"
}`;

    const result = await model.generateContent(prompt);
    scriptData = JSON.parse(result.response.text());

  } catch (error) {
    console.error("Gemini Generation Error, switching to fallback:", error.message);
    scriptData = generateFallbackStory();
  }

  try {
    const speechText = `${scriptData.hook}. ${scriptData.body}`;
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

  } catch (ttsError) {
    console.error("TTS Error:", ttsError.message);
    return res.status(500).json({
      success: false,
      error: "Audio synthesis failed: " + ttsError.message
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
