import express from "express";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Downloader endpoint
app.get("/download", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("No URL provided");

  const output = path.join(__dirname, "video.mp4");
  exec(`yt-dlp -f mp4 -o "${output}" "${url}"`, (err) => {
    if (err) return res.status(500).send(err.message);
    res.download(output, "video.mp4", () => {
      fs.unlinkSync(output); // delete after sending
    });
  });
});

// Processor endpoint (simple resize)
app.get("/process", (req, res) => {
  const input = path.join(__dirname, "video.mp4");
  const output = path.join(__dirname, "processed.mp4");

  exec(`ffmpeg -i "${input}" -vf "scale=1280:720" "${output}"`, (err) => {
    if (err) return res.status(500).send(err.message);
    res.download(output, "processed.mp4", () => {
      fs.unlinkSync(output);
    });
  });
});

app.listen(3000, () => console.log("✅ Backend running on http://localhost:3000"));