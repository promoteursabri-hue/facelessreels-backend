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

    // Upgraded prompt engineering for high viral retention and creepy tone
    const prompt = `You are a master viral horror writer for TikTok and Reels.
Write a terrifying, immersive 15 to 20 second horror story.
Theme/Genre: "${currentTheme}".

STRICT RULES:
1. Start immediately with a high-retention curiosity hook (e.g., "If you hear tapping on your window at 3 AM...").
2. Build intense, visceral atmospheric tension in short, dramatic sentences.
3. End with a disturbing, lingering twist ending.
4. Keep the text under 45 total words so the narration sounds paced, creepy, and deliberate.

Respond ONLY with a JSON object strictly matching this schema:
{
  "title": "Short Creepy Title",
  "fullStory": "The short punchy horror narrative text goes here."
}`;

    const result = await model.generateContent(prompt);
    const scriptData = JSON.parse(result.response.text());
    const words = scriptData.fullStory.split(" ");

    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    let selectedVoiceId = "pNInz6obpgDQGcFmaJgB"; // Default fallback (Adam)

    if (process.env.ELEVENLABS_API_KEY) {
      // 1. Find the best deep narrator voice available in the account
      try {
        const voicesRes = await axios.get("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY.trim() }
        });
        
        if (voicesRes.data.voices && voicesRes.data.voices.length > 0) {
          const horrorVoice = voicesRes.data.voices.find(v => 
            ["Marcus", "Adam", "George", "Callum", "Clyde"].includes(v.name)
          );
          selectedVoiceId = horrorVoice ? horrorVoice.voice_id : voicesRes.data.voices[0].voice_id;
        }
      } catch (vErr) {
        console.warn("Using fallback voice ID.");
      }

      // 2. Synthesize with Cinematic Horror Settings
      const response = await axios({
        method: "post",
        url: `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(),
          "Content-Type": "application/json"
        },
        data: {
          text: scriptData.fullStory,
          model_id: "eleven_multilingual_v2", // Richer, more expressive audio quality
          voice_settings: {
            stability: 0.25,        // Lower stability = pitch fluctuations, ominous whisper tones
            similarity_boost: 0.85, // Higher similarity = deeper vocal presence
            style: 0.45,            // Adds dramatic emphasis and tension to performance
            use_speaker_boost: true
          }
        },
        responseType: "arraybuffer"
      });
      fs.writeFileSync(filePath, response.data);
    } else {
      throw new Error("ELEVENLABS_API_KEY missing");
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
    const queries = ["dark fog forest", "spooky shadows night", "scary abandoned house", "creepy dark hallway"];
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
