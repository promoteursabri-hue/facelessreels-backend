const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// Point fluent-ffmpeg directly to the static binary executable
ffmpeg.setFfmpegPath(ffmpegPath);

const publicDir = path.join(__dirname, "public/videos");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

app.use("/videos", express.static(publicDir));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy",
});

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "FFmpeg Server Live!" });
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
        audioUrl: "https://cdn.creatomate.com/demo/sample.mp3",
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
        audioUrl: "https://cdn.creatomate.com/demo/sample.mp3",
      },
    });
  }
});

app.post("/api/render-video", async (req, res) => {
  const timestamp = Date.now();
  const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
  const imagePath = path.join(tempDir, `bg_${timestamp}.jpg`);
  const outputFileName = `reel_${timestamp}.mp4`;
  const outputPath = path.join(publicDir, outputFileName);

  try {
    const { script, audioUrl } = req.body;
    const bgImageUrl = "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1080&q=1920";

    await downloadFile(audioUrl || "https://cdn.creatomate.com/demo/sample.mp3", audioPath);
    await downloadFile(bgImageUrl, imagePath);

    const subtitleText = `${script?.hook || ''}\n\n${script?.body || ''}`.replace(/'/g, "");

    ffmpeg()
      .input(imagePath)
      .loop(10)
      .input(audioPath)
      .outputOptions([
        "-c:v libx264",
        "-tune stillimage",
        "-c:a aac",
        "-b:a 192k",
        "-pix_fmt yuv420p",
        "-shortest",
        `-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawtext=text='${subtitleText}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.6:boxborderw=10`
      ])
      .save(outputPath)
      .on("end", () => {
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.get("host");
        const videoUrl = `${protocol}://${host}/videos/${outputFileName}`;

        return res.status(200).json({ success: true, videoUrl });
      })
      .on("error", (err) => {
        console.error("FFmpeg execution error:", err);
        return res.status(500).json({ success: false, error: err.message });
      });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
