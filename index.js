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
  "https://files.catbox.moe/1q6rj9.mp3",
  "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939ae0221.mp3?filename=scary-forest-123826.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-scary-suspense-2509.mp3"
];

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Faceless Engine Active" });
});

app.post("/api/generate-script", async (req, res) => {
  const { customIdea } = req.body;
  const userIdea = customIdea && customIdea.trim() !== "" ? customIdea : "A smart security camera catching an unknown figure inside the house at 3 AM";

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.6-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    // Hardcoded structure & length — ONLY the idea is injected
    const prompt = `Write a 30 sec viral TikTok horror story script based on this idea: "${userIdea}".

STRICT CREATIVE GUIDELINES:
1. Write in the FIRST PERSON ("I", "my"). Make it feel like a real warning or confession.
2. Hook (0-3s): Start immediately with an unsettling situation.
3. Escalation (3-15s): Build visceral fear through sensory details (silence, shadows, cold air, soft breathing).
4. Twist Ending (15-30s): Deliver a devastating, unnerving realization.
5. Target length: Approximately 65-75 words total for a 30-second voiceover. Write short, punchy sentences for dramatic pauses.

Respond ONLY with a JSON object:
{
  "title": "CREEPY HOOK TITLE",
  "fullStory": "Your terrifying 30-second first-person horror story goes here."
}`;

    const result = await model.generateContent(prompt);
    const scriptData = JSON.parse(result.response.text());
    const words = scriptData.fullStory.split(" ");

    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    let selectedVoiceId = "pNInz6obpgDQGcFmaJgB";

    if (process.env.ELEVENLABS_API_KEY) {
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
        console.warn("Using default voice ID fallback.");
      }

      const response = await axios({
        method: "post",
        url: `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(),
          "Content-Type": "application/json"
        },
        data: {
          text: scriptData.fullStory,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.25,
            similarity_boost: 0.85,
            style: 0.45,
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

    return res.status(200).json({
      success: true,
      script: {
        ...scriptData,
        words: words,
        audioUrl: audioUrl,
        bgAudioUrl: BACKGROUND_MUSIC[0]
      }
    });

  } catch (error) {
    console.error("Pipeline Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

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
