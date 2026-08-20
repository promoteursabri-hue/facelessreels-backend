const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FacelessReels API is running!" });
});

// Phase 1: Script & Audio Voiceover Generation Endpoint
app.post("/api/generate-script", async (req, res) => {
  try {
    const { theme, desc, voice = "nova" } = req.body;

    // 1. Generate script using GPT-4o
    const prompt = `Create an engaging 40-50 second viral short-form video script about theme "${theme || "General"}". 
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

    // Combine sections into full spoken narrative
    const fullSpeechText = `${scriptData.hook} ${scriptData.body} ${scriptData.cta}`;

    // 2. Generate Audio Voiceover using OpenAI TTS
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice.toLowerCase() || "nova",
      input: fullSpeechText,
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    const audioBase64 = `data:audio/mp3;base64,${audioBuffer.toString("base64")}`;

    // Send complete payload back to frontend
    return res.status(200).json({
      success: true,
      script: {
        ...scriptData,
        audioUrl: audioBase64,
        estimatedDuration: "45s",
      },
    });
  } catch (error) {
    console.error("Phase 1 Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate script and voiceover",
    });
  }
});

// Series creation endpoint
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
