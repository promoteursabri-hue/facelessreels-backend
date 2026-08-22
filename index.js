const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy",
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Preview Engine Live!" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  try {
    const prompt = `Create a short video script about theme "${theme || "General"}". Description: ${desc || "Facts"}.
Respond ONLY with a JSON object: {"title":"Title","hook":"Hook line","body":"Story text","cta":"Follow!"}`;

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
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      },
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      script: {
        title: "The Whispering Shadows",
        hook: "Did you know some whispers aren't in your head?",
        body: "In 1920, an abandoned lighthouse broadcast signals completely on its own.",
        cta: "Follow for more unexplained mysteries!",
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      },
    });
  }
});

// Fast instant preview route (zero server CPU rendering)
app.post("/api/render-video", async (req, res) => {
  try {
    const { script, audioUrl } = req.body;
    const bgImageUrl = "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1080&q=1920";
    const targetAudio = audioUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

    return res.status(200).json({
      success: true,
      preview: {
        bgImageUrl,
        audioUrl: targetAudio,
        hook: script?.hook || "Check this out",
        body: script?.body || ""
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
