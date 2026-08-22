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

// Default fallback voice ID (Adam)
let ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; 

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
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.6-flash",
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
    const words = scriptData.fullStory.split(" ");

    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    if (process.env.ELEVENLABS_API_KEY) {
      // 1. Get first available valid voice ID dynamically from your account
      try {
        const voicesRes = await axios.get("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }
        });
        if (voicesRes.data.voices && voicesRes.data.voices.length > 0) {
          ELEVENLABS_VOICE_ID = voicesRes.data.voices[0].voice_id;
        }
      } catch (vErr) {
        console.warn("Could not fetch custom voice list, using default fallback ID.");
      }

      // 2. Synthesize Speech
      const response = await axios({
        method: "post",
        url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(),
          "Content-Type": "application/json"
        },
        data: {
          text: scriptData.fullStory,
          model_id: "eleven_turbo_v2_5", // Fast, universal model supported on all tiers
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.75
          }
        },
        responseType: "arraybuffer"
      });
      fs.writeFileSync(filePath, response.data);
    } else {
      throw new Error("ELEVENLABS_API_KEY missing in Railway environment variables");
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
    let errorDetails = error.message;
    if (error.response && error.response.data) {
      try {
        const parsedData = JSON.parse(Buffer.from(error.response.data).toString());
        errorDetails = parsedData.detail?.message || parsedData.message || JSON.stringify(parsedData);
      } catch (e) {
        errorDetails = error.response.statusText || error.message;
      }
    }
    console.error("Pipeline Error:", errorDetails);
    return res.status(500).json({ success: false, error: `ElevenLabs Error: ${errorDetails}` });
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
        { headers: { Authorization: process.env.PEXELS_API_KEY.trim() } }
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
