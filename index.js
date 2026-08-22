const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "AI Voice & Script Server Active" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  try {
    // 1. Generate scary story text script
    const prompt = `Create a short scary video script about theme "${theme || "Scary Stories"}". Description: ${desc || "Creepy facts"}.
Respond ONLY with a JSON object: {"title":"Title","hook":"Hook line","body":"Story text","cta":"Follow for more!"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const scriptData = JSON.parse(completion.choices[0].message.content);
    const fullSpeechText = `${scriptData.hook} ... ${scriptData.body} ... ${scriptData.cta}`;

    // 2. Synthesize Real Spoken Voice Narration using OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx", // Deep, creepy narration voice
      input: fullSpeechText,
    });

    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer);

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
    console.error("Pipeline generation error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "AI Voice & Script Server Active" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  try {
    // 1. Generate scary story text script
    const prompt = `Create a short scary video script about theme "${theme || "Scary Stories"}". Description: ${desc || "Creepy facts"}.
Respond ONLY with a JSON object: {"title":"Title","hook":"Hook line","body":"Story text","cta":"Follow for more!"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const scriptData = JSON.parse(completion.choices[0].message.content);
    const fullSpeechText = `${scriptData.hook} ... ${scriptData.body} ... ${scriptData.cta}`;

    // 2. Synthesize Real Spoken Voice Narration using OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx", // Deep, creepy narration voice
      input: fullSpeechText,
    });

    const timestamp = Date.now();
    const fileName = `voice_${timestamp}.mp3`;
    const filePath = path.join(publicDir, fileName);

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer);

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
    console.error("Pipeline generation error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
