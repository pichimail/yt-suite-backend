app.get("/playlist", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("❌ No playlist URL provided");

  const tempDir = path.join(__dirname, "playlist_tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  console.log(`🎶 Downloading playlist (720p MP4) from: ${url}`);

  // yt-dlp: force MP4, best ≤ 720p
  const command = `yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]" -o "${tempDir}/%(playlist_index)s - %(title)s.%(ext)s" "${url}"`;

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ yt-dlp error:", stderr);
      return res.status(500).send("Playlist download failed: " + err.message);
    }

    // Prepare ZIP response
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=playlist-720p.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    // Add all MP4 files in tempDir
    fs.readdirSync(tempDir).forEach((file) => {
      const filePath = path.join(tempDir, file);
      if (file.endsWith(".mp4")) {
        archive.file(filePath, { name: file });
      }
    });

    archive.finalize();

    // Cleanup after sending
    archive.on("end", () => {
      fs.readdirSync(tempDir).forEach((file) => {
        safeUnlink(path.join(tempDir, file));
      });
      fs.rmdirSync(tempDir);
      console.log("🧹 Playlist temp files cleaned up");
    });
  });
});
