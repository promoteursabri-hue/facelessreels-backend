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
  "https://files.catbox.moe/1q6rj9.mp3"
];

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Faceless Engine Active" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme } = req.body;
  const currentTheme = theme || "3 AM Smart Home Warnings";

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.6-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Write a 30 sec viral TikTok horror story script based on this theme: "${currentTheme}".

STRICT CREATIVE GUIDELINES:
1. Write in the FIRST PERSON ("I", "my"). Make it feel like a real warning or confession.
2. Hook (0-3s): Start immediately with an unsettling situation.
3. Escalation (3-15s): Build visceral fear through sensory details (silence, shadows, cold air, soft breathing).
4. Twist Ending (15-30s): Deliver a devastating, unnerving realization.
5. Target length: Approximately 65-75 words total for a 30-second voiceover. Write short, punchy sentences for dramatic pauses.
6. Provide a 2-3 word Pexels animation search query that matches the visual setting of this story (e.g., "dark animation forest", "spooky cartoon room").

Respond ONLY with a JSON object:
{
  "title": "CREEPY HOOK TITLE",
  "fullStory": "Your terrifying 30-second first-person horror story goes here.",
  "visualQuery": "animated cartoon dark scary setting"
}`;

    const result = await model.generateContent(prompt);
    const scriptData = JSON.parse(result.response.text());

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
        url: `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/with-timestamps`,
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
        }
      });

      const audioBuffer = Buffer.from(response.data.audio_base64, "base64");
      fs.writeFileSync(filePath, audioBuffer);

      const alignment = response.data.alignment;
      const wordTimestamps = [];
      let currentWord = "";
      let wordStart = null;

      if (alignment && alignment.characters) {
        alignment.characters.forEach((char, idx) => {
          if (wordStart === null) {
            wordStart = alignment.character_start_times_seconds[idx];
          }

          if (char === " " || idx === alignment.characters.length - 1) {
            if (char !== " ") currentWord += char;
            if (currentWord.trim().length > 0) {
              wordTimestamps.push({
                word: currentWord.trim(),
                start: wordStart,
                end: alignment.character_end_times_seconds[idx]
              });
            }
            currentWord = "";
            wordStart = null;
          } else {
            currentWord += char;
          }
        });
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.get("host");
      const audioUrl = `${protocol}://${host}/audio/${fileName}`;

      return res.status(200).json({
        success: true,
        script: {
          ...scriptData,
          wordTimestamps: wordTimestamps,
          audioUrl: audioUrl,
          bgAudioUrl: BACKGROUND_MUSIC[0]
        }
      });

    } else {
      throw new Error("ELEVENLABS_API_KEY missing");
    }

  } catch (error) {
    console.error("Pipeline Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/render-video", async (req, res) => {
  const { searchQuery } = req.body;
  
  // Forces search term to prioritize cartoon/animation stock clips
  const animationKeywords = ["cartoon animation", "2d animation", "dark animated", "spooky cartoon"];
  const randomPrefix = animationKeywords[Math.floor(Math.random() * animationKeywords.length)];
  const finalQuery = searchQuery ? `${searchQuery} animation` : `${randomPrefix} dark horror`;

  let videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-halloween-spooky-graveyard-animation-41485-large.mp4";

  try {
    if (process.env.PEXELS_API_KEY) {
      const pexelsRes = await axios.get(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(finalQuery)}&orientation=portrait&per_page=15`,
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
      videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-halloween-spooky-graveyard-animation-41485-large.mp4" 
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
