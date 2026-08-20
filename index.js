const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const Creatomate = require("creatomate");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const creatomate = new Creatomate.Client(process.env.CREATOMATE_API_KEY);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FacelessReels API is running!" });
});

// 1. GENERATE SCRIPT & AUDIO VOICEOVER
app.post("/api/generate-script", async (req, res) => {
  try {
    const { theme, desc, voice = "nova" } = req.body;

    const prompt = `Create an engaging 30-second viral short-form video script about theme "${theme || "General"}". 
Description: ${desc || "Interesting facts"}.
Respond ONLY with a raw JSON object containing these keys:
{
  "title": "Short title",
  "hook": "Attention grabbing opening line",
  "body": "The main narration text",
  "cta": "Call to action line",
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const scriptData = JSON.parse(completion.choices[0].message.content);
    const fullSpeechText = `${scriptData.hook} ${scriptData.body} ${scriptData.cta}`;

    // Generate Audio Voiceover using OpenAI TTS
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice.toLowerCase() || "nova",
      input: fullSpeechText,
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    const audioBase64 = `data:audio/mp3;base64,${audioBuffer.toString("base64")}`;

    return res.status(200).json({
      success: true,
      script: {
        ...scriptData,
        audioUrl: audioBase64,
        estimatedDuration: "30s",
      },
    });
  } catch (error) {
    console.error("Script Generation Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate script",
    });
  }
});

// 2. RENDER MP4 VIDEO VIA CREATOMATE
app.post("/api/render-video", async (req, res) => {
  try {
    const { script, audioUrl } = req.body;

    const renders = await creatomate.render({
      templateId: process.env.CREATOMATE_TEMPLATE_ID,
      modifications: {
        "Voiceover": audioUrl || "",
        "Subtitles": script?.body || "FacelessReels Generated Video",
      },
    });

    return res.status(200).json({
      success: true,
      videoUrl: renders[0].url,
    });
  } catch (error) {
    console.error("Video Render Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to render video",
    });
  }
});

// 3. SERIES MANAGEMENT
app.post("/api/series", async (req, res) => {
  try {
    const seriesData = req.body;
    const newSeries = {
      id: Date.now(),
      ...seriesData,
      status: "active",
      videosGenerated: 0,
      totalViews: 0,
      createdAt: new Date().toISOString(),
    };
    return res.status(201).json({ success: true, series: newSeries });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to create series" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
