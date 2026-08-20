const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { Anthropic } = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const PORT = process.env.PORT || 3000;
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Initialize Anthropic SDK Client
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

let db = {
  series: [],
  tokens: {},
  jobs: [],
};

const dbPath = "/tmp/db.json";
const loadDb = () => {
  try {
    if (fs.existsSync(dbPath)) db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {}
};
const saveDb = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
loadDb();

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "FacelessReels backend running", version: "1.0.0" }));

// ── AI SCRIPT GENERATION ──────────────────────────────────────────────────────
app.post("/api/generate-script", async (req, res) => {
  try {
    const { theme, artStyle, voice, themeLabel, themeDesc } = req.body;
    const promptTheme = themeLabel || theme || "General Knowledge";
    const promptDesc = themeDesc || "";

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Generate a compelling 45-60 second faceless reel script for theme: "${promptTheme} — ${promptDesc}".
Art style: ${artStyle || "cinematic"}. Voice tone: ${voice || "engaging"}.
Return ONLY valid JSON (no markdown formatting or backticks):
{
  "title": "punchy video title",
  "hook": "first 2-3 sentences to grab attention",
  "body": "main story 4-6 sentences",
  "cta": "call to action 1-2 sentences",
  "hashtags": ["tag1","tag2","tag3","tag4","tag5"],
  "imagePrompts": ["scene 1 description for AI image","scene 2","scene 3"],
  "estimatedDuration": "52s"
}`,
        },
      ],
    });

    const raw = response.content.map((b) => b.text || "").join("");
    const clean = raw.replace(/```json|```/g, "").trim();
    const script = JSON.parse(clean);
    res.json({ success: true, script });
  } catch (err) {
    console.error("Error generating script:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── SERIES CRUD ───────────────────────────────────────────────────────────────
app.post("/api/series", async (req, res) => {
  try {
    const series = {
      id: Date.now().toString(),
      ...req.body,
      status: "active",
      videosGenerated: 0,
      totalViews: 0,
      createdAt: new Date().toISOString(),
      nextPost: getNextPostTime(req.body.schedule),
    };
    db.series.push(series);
    saveDb();
    scheduleSeriesJob(series);
    res.json({ success: true, series });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/series", (req, res) => res.json({ success: true, series: db.series }));

app.put("/api/series/:id/pause", (req, res) => {
  const s = db.series.find((s) => s.id === req.params.id);
  if (!s) return res.status(404).json({ error: "Not found" });
  s.status = s.status === "active" ? "paused" : "active";
  saveDb();
  res.json({ success: true, series: s });
});

app.delete("/api/series/:id", (req, res) => {
  db.series = db.series.filter((s) => s.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ── TIKTOK OAUTH ──────────────────────────────────────────────────────────────
app.get("/auth/tiktok", (req, res) => {
  const scope = "user.info.basic,video.upload";
  const state = req.query.seriesId || "default";
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(BASE_URL + "/auth/tiktok/callback")}&state=${state}`;
  res.redirect(url);
});

app.get("/auth/tiktok/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: BASE_URL + "/auth/tiktok/callback",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const { access_token, refresh_token, open_id } = response.data;
    db.tokens.tiktok = { access_token, refresh_token, open_id, connectedAt: new Date().toISOString() };
    saveDb();
    res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#a855f7">✓ TikTok Connected!</h2><p>You can close this window.</p></div></body></html>`);
  } catch (err) {
    res.status(500).send(`TikTok auth failed: ${err.message}`);
  }
});

// ── YOUTUBE OAUTH ─────────────────────────────────────────────────────────────
app.get("/auth/youtube", (req, res) => {
  const scope = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(BASE_URL + "/auth/youtube/callback")}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  res.redirect(url);
});

app.get("/auth/youtube/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: BASE_URL + "/auth/youtube/callback",
    });
    const { access_token, refresh_token } = response.data;
    db.tokens.youtube = { access_token, refresh_token, connectedAt: new Date().toISOString() };
    saveDb();
    res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#a855f7">✓ YouTube Connected!</h2><p>You can close this window.</p></div></body></html>`);
  } catch (err) {
    res.status(500).send(`YouTube auth failed: ${err.message}`);
  }
});

app.get("/api/auth/status", (req, res) => {
  res.json({
    tiktok: !!db.tokens.tiktok,
    youtube: !!db.tokens.youtube,
    tiktokConnectedAt: db.tokens.tiktok?.connectedAt,
    youtubeConnectedAt: db.tokens.youtube?.connectedAt,
  });
});

// ── TOKEN REFRESH ─────────────────────────────────────────────────────────────
const refreshTikTokToken = async () => {
  if (!db.tokens.tiktok?.refresh_token) return;
  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: db.tokens.tiktok.refresh_token,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    db.tokens.tiktok.access_token = response.data.access_token;
    if (response.data.refresh_token) db.tokens.tiktok.refresh_token = response.data.refresh_token;
    saveDb();
  } catch (err) {
    console.error("TikTok token refresh failed:", err.message);
  }
};

const refreshYouTubeToken = async () => {
  if (!db.tokens.youtube?.refresh_token) return;
  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: db.tokens.youtube.refresh_token,
      grant_type: "refresh_token",
    });
    db.tokens.youtube.access_token = response.data.access_token;
    saveDb();
  } catch (err) {
    console.error("YouTube token refresh failed:", err.message);
  }
};

// ── VIDEO GENERATION ──────────────────────────────────────────────────────────
const generateAndPostVideo = async (series) => {
  console.log(`[${new Date().toISOString()}] Generating video for series: ${series.seriesName}`);

  try {
    const scriptRes = await axios.post(`http://localhost:${PORT}/api/generate-script`, {
      theme: series.theme,
      artStyle: series.artStyle,
      voice: series.voice,
    });

    if (!scriptRes.data.success) throw new Error("Script generation failed");
    const script = scriptRes.data.script;

    const job = {
      id: Date.now().toString(),
      seriesId: series.id,
      script,
      status: "processing",
      createdAt: new Date().toISOString(),
      platforms: series.platforms,
    };
    db.jobs.push(job);
    saveDb();

    const results = {};

    if (series.platforms?.includes("tiktok") && db.tokens.tiktok) {
      try {
        await refreshTikTokToken();
        results.tiktok = await postToTikTok(script, series);
      } catch (e) {
        results.tiktok = { error: e.message };
        console.error("TikTok post failed:", e.message);
      }
    }

    if (series.platforms?.includes("youtube") && db.tokens.youtube) {
      try {
        await refreshYouTubeToken();
        results.youtube = await postToYouTube(script, series);
      } catch (e) {
        results.youtube = { error: e.message };
        console.error("YouTube post failed:", e.message);
      }
    }

    const seriesIdx = db.series.findIndex((s) => s.id === series.id);
    if (seriesIdx !== -1) {
      db.series[seriesIdx].videosGenerated++;
      db.series[seriesIdx].nextPost = getNextPostTime(series.schedule);
      db.series[seriesIdx].lastPosted = new Date().toISOString();
    }

    job.status = "completed";
    job.results = results;
    saveDb();

    console.log(`[${new Date().toISOString()}] Video posted for: ${series.seriesName}`, results);
  } catch (err) {
    console.error(`Failed to generate/post for series ${series.id}:`, err.message);
  }
};

// ── TIKTOK POSTING ────────────────────────────────────────────────────────────
const postToTikTok = async (script, series) => {
  const token = db.tokens.tiktok.access_token;

  const initRes = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      post_info: {
        title: `${script.title} ${script.hashtags.join(" ")}`.slice(0, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: `${BASE_URL}/api/placeholder-video`,
        video_size: 1000000,
        chunk_size: 1000000,
        total_chunk_count: 1,
      },
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );

  return { publishId: initRes.data.data?.publish_id, status: "submitted" };
};

// ── YOUTUBE POSTING ───────────────────────────────────────────────────────────
const postToYouTube = async (script, series) => {
  const token = db.tokens.youtube.access_token;

  const description = `${script.hook}\n\n${script.body}\n\n${script.cta}\n\n${script.hashtags.join(" ")}`;

  const metaRes = await axios.post(
    "https://www.googleapis.com/youtube/v3/videos?part=snippet,status",
    {
      snippet: {
        title: script.title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: script.hashtags.map((h) => h.replace("#", "")),
        categoryId: "24",
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );

  return { videoId: metaRes.data.id, status: "uploaded" };
};

// ── SCHEDULER ─────────────────────────────────────────────────────────────────
const scheduleMap = {
  "1x": "0 12 * * *",
  "2x": "0 9,21 * * *",
  "3x": "0 8,14,20 * * *",
  weekly: "0 12 * * 1,3,5",
};

const activeJobs = {};

const scheduleSeriesJob = (series) => {
  if (activeJobs[series.id]) activeJobs[series.id].stop();
  const cronExpr = scheduleMap[series.schedule] || "0 12 * * *";
  activeJobs[series.id] = cron.schedule(cronExpr, () => {
    const current = db.series.find((s) => s.id === series.id);
    if (current && current.status === "active") generateAndPostVideo(current);
  });
  console.log(`Scheduled series "${series.seriesName}" with cron: ${cronExpr}`);
};

const getNextPostTime = (schedule) => {
  const intervals = { "1x": 24, "2x": 12, "3x": 8, weekly: 48 };
  const hours = intervals[schedule] || 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
};

// Restore jobs on startup
db.series.filter((s) => s.status === "active").forEach(scheduleSeriesJob);

// Refresh tokens every 6 hours
cron.schedule("0 */6 * * *", () => {
  refreshTikTokToken();
  refreshYouTubeToken();
});

// ── MANUAL TRIGGER ────────────────────────────────────────────────────────────
app.post("/api/series/:id/post-now", async (req, res) => {
  const series = db.series.find((s) => s.id === req.params.id);
  if (!series) return res.status(404).json({ error: "Series not found" });
  generateAndPostVideo(series);
  res.json({ success: true, message: "Video generation started" });
});

app.get("/api/jobs", (req, res) => res.json({ success: true, jobs: db.jobs.slice(-50) }));

app.get("/api/placeholder-video", (req, res) => {
  res.setHeader("Content-Type", "video/mp4");
  res.send(Buffer.alloc(1000));
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`FacelessReels backend running on port ${PORT}`);
  console.log(`TikTok OAuth: ${BASE_URL}/auth/tiktok`);
  console.log(`YouTube OAuth: ${BASE_URL}/auth/youtube`);
});
