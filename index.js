const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");
const https = require("https");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

// Serve generated video files publicly
app.use("/videos", express.static(path.join(__dirname, "public/videos")));

// Ensure temp and video output directories exist
const publicDir = path.join(__dirname, "public/videos");
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy",
});

// Helper function to download files
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
  res.json({ status: "ok", message: "FFmpeg Native Engine Running" });
});

app.post("/api/generate-script", async (req, res) => {
  const { theme, desc } = req.body;
  try {
    const prompt = `Create an engaging short video script about theme "${theme || "General"}". Description: ${desc || "Facts"}.
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

// NATIVE FFMPEG RENDER ENGINE (NO CREATOMATE / NO ELEVENLABS / NO STABILITY AI)
app.post("/api/render-video", async (req, res) => {
  const timestamp = Date.now();
  const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
  const imagePath = path.join(tempDir, `bg_${timestamp}.jpg`);
  const outputFileName = `reel_${timestamp}.mp4`;
  const outputPath = path.join(publicDir, outputFileName);

  try {
    const { script, audioUrl } = req.body;
    const bgImageUrl = "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1080&q=1920";

    console.log("Downloading audio and background assets...");
    await downloadFile(audioUrl || "https://cdn.creatomate.com/demo/sample.mp3", audioPath);
    await downloadFile(bgImageUrl, imagePath);

    console.log("Building 9:16 vertical video with native FFmpeg...");

    const subtitleText = `${script?.hook || ''}\n\n${script?.body || ''}`.replace(/'/g, "");

    ffmpeg()
      .input(imagePath)
      .loop(10) // 10 seconds duration
      .input(audioPath)
      .outputOptions([
        "-c:v libx264",
        "-tune stillimage",
        "-c:a aac",
        "-b:a 1920k",
        "-pix_fmt yuv420p",
        "-shortest",
        // Format to 9:16 vertical video (1080x1920) with overlaid white subtitles
        `-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawtext=text='${subtitleText}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.6:boxborderw=10`
      ])
      .save(outputPath)
      .on("end", () => {
        console.log("FFmpeg Render Complete:", outputFileName);

        // Cleanup temp files
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.get("host");
        const videoUrl = `${protocol}://${host}/videos/${outputFileName}`;

        return res.status(200).json({
          success: true,
          videoUrl: videoUrl,
        });
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        throw err;
      });

  } catch (error) {
    console.error("Render failure:", error.message);
    return res.status(500).json({
      success: false,
      error: "FFmpeg render failed: " + error.message,
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
