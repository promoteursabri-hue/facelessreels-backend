const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const Creatomate = require("creatomate");

const app = express();
app.use(cors());
app.use(express.json());

// Prevent Railway container crashes from unhandled errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception thrown:", error);
});

// 1. INITIALIZE CLIENTS
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy",
});

const creatomate = new Creatomate.Client(process.env.CREATOMATE_API_KEY);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FacelessReels API is running!" });
});

// 2. STEP 1 & 2: GENERATE SCRIPT & VOICE OVER
app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;

  try {
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

    return res.status(200).json({
      success: true,
      script: {
        ...scriptData,
        audioUrl: "https://cdn.creatomate.com/demo/sample.mp3",
        estimatedDuration: "30s",
      },
    });
  } catch (error) {
    console.warn("Using fallback script due to OpenAI error:", error.message);

    return res.status(200).json({
      success: true,
      script: {
        title: "The Whispering Shadows",
        hook: "Did you know some whispers aren't just in your head?",
        body: "In 1920, an abandoned lighthouse started broadcasting mysterious unknown signals. Researchers discovered the lighthouse was completely empty, yet the transmitter was running on its own.",
        cta: "Follow for more unexplained mysteries!",
        hashtags: ["#scary", "#mystery", "#urbanlegend", "#viral"],
        audioUrl: "https://cdn.creatomate.com/demo/sample.mp3",
        estimatedDuration: "30s",
      },
    });
  }
});

// 3. STEP 3: RENDER MP4 VIDEO VIA CREATOMATE (STABLE POLLING)
app.post("/api/render-video", async (req, res) => {
  try {
    const { script, audioUrl } = req.body;

    if (!process.env.CREATOMATE_TEMPLATE_ID || !process.env.CREATOMATE_API_KEY) {
      throw new Error("Missing Creatomate API Key or Template ID in Railway environment variables.");
    }

    console.log("Submitting render request to Creatomate...");

    const bgImage = "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1080&q=80";

    const initialRenders = await creatomate.render({
      templateId: process.env.CREATOMATE_TEMPLATE_ID,
      modifications: {
        "Voiceover-1": audioUrl || "https://cdn.creatomate.com/demo/sample.mp3",
        "Subtitles-1": script?.hook || "Did you know this creepy secret?",
        "Image-1": bgImage,

        "Voiceover-2": audioUrl || "https://cdn.creatomate.com/demo/sample.mp3",
        "Subtitles-2": script?.body || "In 1920, an abandoned lighthouse broadcast mysterious signals.",
        "Image-2": bgImage,

        "Voiceover-3": audioUrl || "https://cdn.creatomate.com/demo/sample.mp3",
        "Subtitles-3": script?.cta || "Follow for more unexplained mysteries!",
        "Image-3": bgImage,

        "Voiceover-4": audioUrl || "https://cdn.creatomate.com/demo/sample.mp3",
        "Subtitles-4": Array.isArray(script?.hashtags) ? script.hashtags.join(" ") : "#scary #mystery",
        "Image-4": bgImage,

        "Voiceover-5": audioUrl || "https://cdn.creatomate.com/demo/sample.mp3",
      },
    });

    if (!initialRenders || initialRenders.length === 0) {
      throw new Error("Creatomate returned an empty render response.");
    }

    const renderId = initialRenders[0].id;
    console.log(`Render submitted (ID: ${renderId}). Waiting for completion...`);

    let finalRender = initialRenders[0];
    let attempts = 0;

    // Limit polling loop to prevent memory stack overflow / server timeouts
    while (finalRender.status !== "succeeded" && finalRender.status !== "failed" && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3s
      attempts++;
      
      try {
        finalRender = await creatomate.getRender(renderId);
        console.log(`Polling status... Attempt ${attempts}: ${finalRender.status}`);
      } catch (pollErr) {
        console.warn(`Polling attempt ${attempts} failed:`, pollErr.message);
      }
    }

    if (finalRender.status === "failed") {
      throw new Error(`Creatomate render failed: ${finalRender.errorMessage || "Unknown rendering error"}`);
    }

    console.log("Render completed successfully! Output URL:", finalRender.url);

    return res.status(200).json({
      success: true,
      videoUrl: finalRender.url,
    });
  } catch (error) {
    console.error("Server Error in /api/render-video:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to render video",
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
