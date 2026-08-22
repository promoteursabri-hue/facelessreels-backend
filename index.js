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

// Serve static audio files with proper headers for web players
app.use("/audio", express.static(publicDir, {
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Content-Type", "audio/mpeg");
  }
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Faceless Engine Active" });
});

// Download reliable TTS stream
function downloadTTS(text, filePath) {
  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(text.substring(0, 200));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    };

    const file = fs.createWriteStream(filePath);
    https.get(url, options, (response) => {
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

function generateFallbackStory() {
  const hooks = [
    "Never look under your bed after 3 AM.",
    "Did you know some whispers aren't inside your head?",
    "If you hear your name called in an empty room, ignore it.",
    "An abandoned station started broadcasting signals yesterday."
  ];
  const stories = [
    "Security footage caught a dark silhouette standing near the forest line, staring directly into the lens for hours.",
    "A lost hiker sent one final text containing an audio clip of heavy breathing coming from right behind him.",
    "Local legends say if you whistle in these woods, a voice copies your melody from high in the trees.",
    "In 1920, an abandoned lighthouse broadcast Morse code distress signals despite being completely vacant."
  ];
  const idx = Math.floor(Math.random() * hooks.length);
  return {
    title: "Creepy Encounter #" + Math.floor(Math.random() * 900 + 100),
    hook: hooks[idx],
    body: stories[idx],
    cta: "Follow for more real horror stories!"
  };
}

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  let scriptData;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("No API key provided");
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Write a short terrifying horror story for a video reel. 
Theme: "${theme || "Scary Stories"}".
Respond ONLY with a JSON object strictly matching this schema:
{
  "title": "Creepy Title",
  "hook": "Attention grabbing first line",
  "body": "The terrifying story details in 2 short sentences",
  "cta": "Follow for more!"
}`;

    const result = await model.generateContent(prompt);
    scriptData = JSON.parse(result.response.text());

  } catch (error) {
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
    return res.status(500).json({ success: false, error: ttsError.message });
  }
});

// Guaranteed 9:16 background motion assets
app.post("/api/render-video", async (req, res) => {
  const videoPool = [
    {
      video: "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-dark-43286-large.mp4",
      poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1080&q=1920"
    },
    {
      video: "https://assets.mixkit.co/videos/preview/mixkit-trees-in-a-dark-forest-43285-large.mp4",
      poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1080&q=1920"
    },
    {
      video: "https://assets.mixkit.co/videos/preview/mixkit-mysterious-fog-in-a-dark-forest-43287-large.mp4",
      poster: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1080&q=1920"
    }
  ];

  const selected = videoPool[Math.floor(Math.random() * videoPool.length)];

  return res.status(200).json({
    success: true,
    videoUrl: selected.video,
    posterUrl: selected.poster
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
