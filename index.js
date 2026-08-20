// 3. STEP 3: RENDER MP4 VIDEO VIA CREATOMATE (WITH RENDER WAIT POLLING)
app.post("/api/render-video", async (req, res) => {
  try {
    const { script, audioUrl } = req.body;

    console.log("Submitting render request to Creatomate...");

    const bgImage = "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1080&q=80";

    // Request render
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

    const renderId = initialRenders[0].id;
    console.log(`Render submitted (ID: ${renderId}). Waiting for processing to complete...`);

    // Poll status until Creatomate finishes processing the MP4
    let renderStatus = initialRenders[0].status;
    let finalRender = initialRenders[0];
    let attempts = 0;

    while (renderStatus !== "succeeded" && renderStatus !== "failed" && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      const statusCheck = await creatomate.getRender(renderId);
      renderStatus = statusCheck.status;
      finalRender = statusCheck;
      attempts++;
      console.log(`Processing... Status: ${renderStatus} (Attempt ${attempts})`);
    }

    if (renderStatus === "failed") {
      throw new Error(`Creatomate rendering failed: ${finalRender.errorMessage || "Unknown rendering error"}`);
    }

    console.log("Render completed successfully! Output URL:", finalRender.url);

    return res.status(200).json({
      success: true,
      videoUrl: finalRender.url,
    });
  } catch (error) {
    console.error("Creatomate Execution Error:", error);

    return res.status(200).json({
      success: false,
      error: error.message || "Failed to render video",
      details: error.response?.data || null,
    });
  }
});
