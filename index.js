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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Faceless Engine Active" });
});

// Deep English Voice Generator (Google Engine)
function downloadTTS(text, filePath) {
  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(text.substring(0, 250));
    // tl=en-uk produces a deeper cinematic tone
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en-uk&client=tw-ob`;

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

function generateFallbackStory() {
  const hooks = [
    "Never look out your window after 3 AM.",
    "Did you know some whispers aren't inside your head?",
    "If you hear your name called in an empty house, do not reply.",
    "An abandoned radio tower began broadcasting last night."
  ];
  const stories = [
    "Security footage caught a dark silhouette standing near the forest line, staring directly into the lens for hours.",
    "A lost hiker sent one final text containing an audio clip of heavy breathing coming from right behind him.",
    "Local legends say if you whistle in these woods, a voice copies your melody from high in the trees.",
    "In 1920, a forgotten lighthouse transmitted Morse code distress signals despite being completely vacant."
  ];
  const idx = Math.floor(Math.random() * hooks.length);
  return {
    title: "Creepy Story #" + Math.floor(Math.random() * 900 + 100),
    hook: hooks[idx],
    body: stories[idx],
    cta: "Follow for more real creepy encounters!"
  };
}

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  let scriptData;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("No API Key");
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Write a terrifying 15-second horror story for a viral Reel. 
Theme: "${theme || "Scary Stories"}". 
Respond ONLY with JSON matching this exact structure:
{
  "title": "Creepy Title",
  "hook": "Spooky hook sentence",
  "body": "Detailed 2-sentence scary story",
  "cta": "Follow for more horror!"
}`;

    const result = await model.generateContent(prompt);
    scriptData = JSON.parse(result.response.text());

  } catch (error) {
    scriptData = generateFallbackStory();
  }

  try {
    const speechText = `${scriptData.hook}. ... ${scriptData.body}`;
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

// Dynamic HD Vertical Video MP4 Stream Pool
app.post("/api/render-video", async (req, res) => {
  const videos = [
    "https://cdn.coverr.co/videos/coverr-dark-foggy-forest-5544/1080p.mp4",
    "https://cdn.coverr.co/videos/coverr-scary-haunted-house-at-night-8492/1080p.mp4",
    "https://cdn.coverr.co/videos/coverr-creepy-dark-tunnel-4198/1080p.mp4",
    "https://cdn.coverr.co/videos/coverr-misty-night-street-9182/1080p.mp4"
  ];
  
  const selectedVideo = videos[Math.floor(Math.random() * videos.length)];

  return res.status(200).json({
    success: true,
    videoUrl: selectedVideo
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
