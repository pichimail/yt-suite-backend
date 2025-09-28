import express from "express";
import { spawn, exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger middleware
app.use((req, res, next) => {
  console.log(`➡️ [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Helper: safe delete
const safeUnlink = (filePath) => {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

// Helper: safe directory removal
const safeRmdir = (dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Error removing directory ${dirPath}:`, error);
  }
};

// Helper: detect if URL is a playlist
const isPlaylistUrl = (url) => {
  return url.includes('list=') || url.includes('/playlist');
};

// ====================
// Individual Video Downloader (MP4)
// ====================
app.get("/video", (req, res) => {
  const url = req.query.url;
  const quality = req.query.quality || "720"; // Default 720p
  
  if (!url) return res.status(400).send("❌ No video URL provided");

  // Create unique temp directory
  const timestamp = Date.now();
  const tempDir = path.join(__dirname, `video_tmp_${timestamp}`);
  
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create temp directory:", error);
    return res.status(500).send("Failed to create temporary directory");
  }

  console.log(`🎬 Downloading single video (${quality}p MP4) from: ${url}`);

  // yt-dlp command for single video
  const command = `yt-dlp -f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]" -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;

  exec(command, { timeout: 300000 }, (err, stdout, stderr) => { // 5 minute timeout for single video
    if (err) {
      console.error("❌ yt-dlp error:", stderr);
      safeRmdir(tempDir);
      return res.status(500).send("Video download failed: " + err.message);
    }

    try {
      // Find the downloaded MP4 file
      const files = fs.readdirSync(tempDir).filter(file => file.endsWith(".mp4"));
      
      if (files.length === 0) {
        console.log("No MP4 file found in temp directory");
        safeRmdir(tempDir);
        return res.status(404).send("No video was downloaded");
      }

      const videoFile = files[0]; // Should be only one file
      const filePath = path.join(tempDir, videoFile);
      
      console.log(`📹 Sending video file: ${videoFile}`);

      // Set headers for file download
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${videoFile}"`);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      // Cleanup after sending
      fileStream.on('end', () => {
        setTimeout(() => {
          safeRmdir(tempDir);
          console.log("🧹 Video temp files cleaned up");
        }, 1000);
      });

      fileStream.on('error', (streamErr) => {
        console.error("Stream error:", streamErr);
        safeRmdir(tempDir);
      });

    } catch (error) {
      console.error("Error processing downloaded video:", error);
      safeRmdir(tempDir);
      if (!res.headersSent) {
        res.status(500).send("Failed to process downloaded video");
      }
    }
  });

  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected, cleaning up...');
    safeRmdir(tempDir);
  });
});

// ====================
// Individual Audio Downloader (MP3)
// ====================
app.get("/audio", (req, res) => {
  const url = req.query.url;
  const quality = req.query.quality || "192"; // Default 192kbps
  
  if (!url) return res.status(400).send("❌ No audio URL provided");

  const timestamp = Date.now();
  const tempDir = path.join(__dirname, `audio_tmp_${timestamp}`);
  
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create temp directory:", error);
    return res.status(500).send("Failed to create temporary directory");
  }

  console.log(`🎵 Downloading audio (${quality}kbps MP3) from: ${url}`);

  // yt-dlp command for audio extraction
  const command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality ${quality}K -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;

  exec(command, { timeout: 300000 }, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ yt-dlp error:", stderr);
      safeRmdir(tempDir);
      return res.status(500).send("Audio download failed: " + err.message);
    }

    try {
      const files = fs.readdirSync(tempDir).filter(file => file.endsWith(".mp3"));
      
      if (files.length === 0) {
        console.log("No MP3 file found in temp directory");
        safeRmdir(tempDir);
        return res.status(404).send("No audio was downloaded");
      }

      const audioFile = files[0];
      const filePath = path.join(tempDir, audioFile);
      
      console.log(`🎵 Sending audio file: ${audioFile}`);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${audioFile}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('end', () => {
        setTimeout(() => {
          safeRmdir(tempDir);
          console.log("🧹 Audio temp files cleaned up");
        }, 1000);
      });

    } catch (error) {
      console.error("Error processing downloaded audio:", error);
      safeRmdir(tempDir);
      if (!res.headersSent) {
        res.status(500).send("Failed to process downloaded audio");
      }
    }
  });

  req.on('close', () => {
    console.log('Client disconnected, cleaning up...');
    safeRmdir(tempDir);
  });
});

// ====================
// Playlist Downloader (ZIP Bundle)
// ====================
app.get("/playlist", (req, res) => {
  const url = req.query.url;
  const quality = req.query.quality || "720";
  const format = req.query.format || "video"; // "video" or "audio"
  
  if (!url) return res.status(400).send("❌ No playlist URL provided");

  const timestamp = Date.now();
  const tempDir = path.join(__dirname, `playlist_tmp_${timestamp}`);
  
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create temp directory:", error);
    return res.status(500).send("Failed to create temporary directory");
  }

  let command;
  let fileExtension;
  let zipFilename;

  if (format === "audio") {
    console.log(`🎵 Downloading playlist audio (${quality}kbps MP3) from: ${url}`);
    command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality ${quality}K -o "${tempDir}/%(playlist_index)s - %(title)s.%(ext)s" "${url}"`;
    fileExtension = ".mp3";
    zipFilename = `playlist-audio-${quality}k.zip`;
  } else {
    console.log(`🎬 Downloading playlist videos (${quality}p MP4) from: ${url}`);
    command = `yt-dlp -f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]" -o "${tempDir}/%(playlist_index)s - %(title)s.%(ext)s" "${url}"`;
    fileExtension = ".mp4";
    zipFilename = `playlist-${quality}p.zip`;
  }

  exec(command, { timeout: 1200000 }, (err, stdout, stderr) => { // 20 minute timeout for playlists
    if (err) {
      console.error("❌ yt-dlp error:", stderr);
      safeRmdir(tempDir);
      return res.status(500).send("Playlist download failed: " + err.message);
    }

    try {
      const files = fs.readdirSync(tempDir).filter(file => file.endsWith(fileExtension));
      
      if (files.length === 0) {
        console.log(`No ${fileExtension} files found in temp directory`);
        safeRmdir(tempDir);
        return res.status(404).send("No files were downloaded");
      }

      console.log(`📁 Found ${files.length} ${fileExtension} files to zip`);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename=${zipFilename}`);

      const archive = archiver("zip", { 
        zlib: { level: 9 },
        forceLocalTime: true
      });

      archive.on('error', (err) => {
        console.error('Archive error:', err);
        safeRmdir(tempDir);
        if (!res.headersSent) {
          res.status(500).send('Failed to create archive');
        }
      });

      archive.pipe(res);

      files.forEach((file) => {
        const filePath = path.join(tempDir, file);
        try {
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: file });
          }
        } catch (error) {
          console.error(`Error adding file ${file} to archive:`, error);
        }
      });

      archive.finalize();

      archive.on("end", () => {
        console.log("📦 Archive sent successfully");
        setTimeout(() => {
          safeRmdir(tempDir);
          console.log("🧹 Playlist temp files cleaned up");
        }, 1000);
      });

    } catch (error) {
      console.error("Error processing downloaded files:", error);
      safeRmdir(tempDir);
      if (!res.headersSent) {
        res.status(500).send("Failed to process downloaded files");
      }
    }
  });

  req.on('close', () => {
    console.log('Client disconnected, cleaning up...');
    safeRmdir(tempDir);
  });
});

// ====================
// Smart Download (Auto-detect)
// ====================
app.get("/download", (req, res) => {
  const url = req.query.url;
  const format = req.query.format || "video"; // "video" or "audio"
  const quality = req.query.quality || (format === "audio" ? "192" : "720");
  
  if (!url) return res.status(400).send("❌ No URL provided");

  // Auto-detect if it's a playlist or single video
  if (isPlaylistUrl(url)) {
    console.log("🔍 Detected playlist URL, redirecting to playlist endpoint");
    req.url = `/playlist?url=${encodeURIComponent(url)}&format=${format}&quality=${quality}`;
    return app._router.handle(req, res);
  } else {
    console.log("🔍 Detected single video URL, redirecting to appropriate endpoint");
    if (format === "audio") {
      req.url = `/audio?url=${encodeURIComponent(url)}&quality=${quality}`;
    } else {
      req.url = `/video?url=${encodeURIComponent(url)}&quality=${quality}`;
    }
    return app._router.handle(req, res);
  }
});

// ====================
// Health check with API info
// ====================
app.get("/", (req, res) => {
  res.json({
    status: "✅ YouTube Downloader API is running!",
    endpoints: {
      "/video": "Download single video (MP4) - ?url=VIDEO_URL&quality=720",
      "/audio": "Download single audio (MP3) - ?url=VIDEO_URL&quality=192", 
      "/playlist": "Download playlist as ZIP - ?url=PLAYLIST_URL&format=video&quality=720",
      "/download": "Smart download (auto-detect) - ?url=ANY_URL&format=video&quality=720"
    },
    parameters: {
      "quality (video)": "360, 480, 720, 1080",
      "quality (audio)": "128, 192, 256, 320",
      "format": "video, audio"
    }
  });
});

// ====================
// Error handling middleware
// ====================
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).send('Internal server error');
});

// ====================
// Start server
// ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET / - API documentation`);
  console.log(`   GET /video?url=<url>&quality=720 - Download single video`);
  console.log(`   GET /audio?url=<url>&quality=192 - Download single audio`);
  console.log(`   GET /playlist?url=<url>&format=video&quality=720 - Download playlist`);
  console.log(`   GET /download?url=<url>&format=video&quality=720 - Smart download`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  try {
    const tempDirs = fs.readdirSync(__dirname).filter(dir => 
      dir.startsWith('playlist_tmp_') || 
      dir.startsWith('video_tmp_') || 
      dir.startsWith('audio_tmp_')
    );
    tempDirs.forEach(dir => {
      safeRmdir(path.join(__dirname, dir));
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  process.exit(0);
});