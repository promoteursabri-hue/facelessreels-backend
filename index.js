const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

const publicDir = path.join(__dirname, "public/audio");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

app.use("/audio", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Content-Type", "audio/mpeg");
  next();
}, express.static(publicDir));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ElevenLabs Voice: Adam (Deep, Ominous Narration)
const ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; 

// High Quality Royalty-Free Dark Ambient Background Music Tracks
const BACKGROUND_MUSIC = [
  "https://assets.mixkit.co/music/preview/mixkit-creepy-ambience-2506.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-horror-drone-2508.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-scary-suspense-2509.mp3"
];

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Faceless Engine Active" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme } = req.body;
  const currentTheme = theme || "Urban Legends";

  try {
    // Updated active model name to gemini-2.5-flash
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Write an intense 15-second viral horror story for a video reel.
Sub-genre/Theme: "${currentTheme}".
Respond ONLY with a JSON object strictly matching this schema:
{
  "title": "Creepy Title",
  "fullStory": "First hook line. Second terrifying line. Third final creepy sentence."
}`;

    const result = await model.generateContent(prompt);
    const scriptData = JSON.parse(result.response.text());
    
    // Split story into individual words for kinetic subtitles
    const words = scriptData.fullStory.split(" ");

    // 1. Synthesize ElevenLabs Horror Audio
    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    if (process.env.ELEVENLABS_API_KEY) {
      const response = await axios({
        method: "post",
        url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        data: {
          text: scriptData.fullStory,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.35, // Lower stability = erratic/emotional horror voice
            similarity_boost: 0.75
          }
        },
        responseType: "arraybuffer"
      });
      fs.writeFileSync(filePath, response.data);
    } else {
      throw new Error("ELEVENLABS_API_KEY missing in Railway variables");
    }

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.get("host");
    const audioUrl = `${protocol}://${host}/audio/${fileName}`;
    const bgAudioUrl = BACKGROUND_MUSIC[Math.floor(Math.random() * BACKGROUND_MUSIC.length)];

    return res.status(200).json({
      success: true,
      script: {
        ...scriptData,
        words: words,
        audioUrl: audioUrl,
        bgAudioUrl: bgAudioUrl
      }
    });

  } catch (error) {
    console.error("Pipeline Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch HD Vertical Dark Video from Pexels API
app.post("/api/render-video", async (req, res) => {
  try {
    const queries = ["dark forest", "foggy night", "creepy hallway", "scary house", "abandoned building"];
    const query = queries[Math.floor(Math.random() * queries.length)];

    let videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-dark-43286-large.mp4";

    if (process.env.PEXELS_API_KEY) {
      const pexelsRes = await axios.get(
        `https://api.pexels.com/videos/search?query=${query}&orientation=portrait&per_page=15`,
        { headers: { Authorization: process.env.PEXELS_API_KEY } }
      );

      if (pexelsRes.data.videos && pexelsRes.data.videos.length > 0) {
        const randomVid = pexelsRes.data.videos[Math.floor(Math.random() * pexelsRes.data.videos.length)];
        const hdFile = randomVid.video_files.find(f => f.quality === "hd" || f.width >= 720);
        if (hdFile) videoUrl = hdFile.link;
      }
    }

    return res.status(200).json({ success: true, videoUrl: videoUrl });
  } catch (err) {
    return res.status(200).json({ 
      success: true, 
      videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-dark-43286-large.mp4" 
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
