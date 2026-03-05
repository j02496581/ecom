const express = require("express");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { default: axios } = require("axios");

const app = express();
app.use(express.json());

/* -------------------- WHATSAPP INIT -------------------- */

// Store inside project folder
const SESSION_DIR = path.join(__dirname, "wa-session");
const QR_FILE = path.join(__dirname, "wa-qr.png");



let latestQR = null;
let clientReady = false;
let clients = []; // SSE clients
let client = null;

/* ------------------ INIT WHATSAPP CLIENT ------------------ */
function initClient() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", async (qr) => {
  console.log("[WA] QR RECEIVED");
  clientReady = false;
  latestQR = qr;

  // Show QR in terminal
  qrcode.generate(qr, { small: true });

  if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
  QRCode.toFile(QR_FILE, qr, { width: 300 });

  const qrDataUrl = await QRCode.toDataURL(qr);
  clients.forEach((res) =>
    res.write(`data: ${JSON.stringify({ qr: qrDataUrl })}\n\n`)
  );
});

  client.on("ready", () => {
    clientReady = true;
    console.log("[WA] Client is ready");
    if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
    clients.forEach((res) =>
      res.write(`data: ${JSON.stringify({ ready: true })}\n\n`)
    );
  });

  client.on("authenticated", () => console.log("[WA] Authenticated"));
  client.on("auth_failure", (m) => console.error("[WA] Auth failure:", m));

  client.on("disconnected", async (reason) => {
    console.log("[WA] Disconnected:", reason);
    try {
      await client.destroy();
    } catch (e) {
      console.log("[WA] Destroy error ignored:", e.message);
    }
    setTimeout(() => {
      try {
        fsExtra.removeSync(SESSION_DIR);
      } catch {}
      console.log("[WA] Restarting client...");
      initClient();
    }, 2000);
  });

  client.initialize();
}
initClient();




// Number normalizer
function normalizeTo(to) {
  let x = String(to).replace(/\D/g, "");
  if (x.startsWith("0")) x = x.slice(1);
  if (x.length <= 10) x = "91" + x; // default India
  return x;
}

/* -------------------- CONFIG -------------------- */

// 10 random messages
const messages = [
  "பல ஆண்கள் தனிப்பட்ட ஆரோக்கிய பிரச்சனைகளை சந்திக்கிறார்கள். இலவச ஆலோசனைக்கு டெலிகிராமில் நிபுணர்களை அணுகுங்கள்: https://t.me/gfdr55ygfdfl07",
  "ஆண்களின் ஆரோக்கிய பிரச்சனை பற்றி யாரிடமும் பேச முடியவில்லையா? டெலிகிராமில் நிபுணர்களுடன் இலவசமாக பேசுங்கள்: https://t.me/gfdr55ygfdfl07",
  "2100+ ஆண்களுக்கு ஆஃப்லைனில் உதவி செய்த நிபுணர்கள். இப்போது ஆன்லைனிலும் உதவ தயாராக உள்ளனர்: https://t.me/gfdr55ygfdfl07",
  "உங்கள் பிரச்சனையை தனியாக சமாளிக்க வேண்டாம். டெலிகிராமில் சுகாதார நிபுணர்களிடம் இலவசமாக பேசுங்கள்: https://t.me/gfdr55ygfdfl07",
  "நம்பிக்கை குறைவு அல்லது செயல்திறன் பிரச்சனை உள்ளதா? நிபுணர்களிடம் வழிகாட்டல் பெறுங்கள்: https://t.me/gfdr55ygfdfl07",
  "பலர் ஆஃப்லைனில் உதவி பெற்றுள்ளனர். இப்போது அதே உதவி ஆன்லைனில் கிடைக்கும்: https://t.me/gfdr55ygfdfl07",
  "ஆண்களின் ஆரோக்கியம் முக்கியம். உங்கள் கேள்விகளை டெலிகிராமில் நிபுணர்களிடம் கேளுங்கள்: https://t.me/gfdr55ygfdfl07",
  "சந்தேகம் இருந்தாலும் பேசுங்கள். டெலிகிராமில் இலவச சுகாதார ஆலோசனை: https://t.me/gfdr55ygfdfl07",
  "முதல் படி பேசுவது தான். உங்கள் பிரச்சனையை நிபுணர்களுடன் பகிருங்கள்: https://t.me/gfdr55ygfdfl07",
  "ஆஃப்லைனில் பலருக்கு உதவிய நிபுணர்கள் இப்போது ஆன்லைனில். டெலிகிராம் சேனலில் சேருங்கள்: https://t.me/gfdr55ygfdfl07"
];

// Load numbers from JSON
const numbers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "numbers.json"), "utf-8")
);

// Get all images from folder
const imageFolder = path.join(__dirname, "images");
const images = fs.readdirSync(imageFolder);

/* -------------------- UTIL FUNCTIONS -------------------- */

function randomMessage() {
  return messages[Math.floor(Math.random() * messages.length)];
}

function randomImage() {
  const file = images[Math.floor(Math.random() * images.length)];
  const filePath = path.join(imageFolder, file);
  return MessageMedia.fromFilePath(filePath);
}

function randomDelay() {
  return Math.floor(Math.random() * (360000 - 180000 + 1)) + 180000;
  // 3 min to 6 min
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* -------------------- SEND API -------------------- */
app.post("/api/send-text", async (req, res) => {
  try {
    if (!clientReady)
      return res.status(503).json({ error: "Client not ready. Scan QR." });

    const { to, message } = req.body;
    if (!to || !message)
      return res.status(400).json({ error: "to and message required" });

      const jid = normalizeTo(to) + "@c.us";
      const result = await client.sendMessage(jid, message);
      res.json({ success: true, id: result.id._serialized });
  } catch (err) {
    res.status(500).json({ error: err.message || "send-text failed" });
  }
});



const videoUrls = [
  "https://gitlab.com/shadowmodapi/video/-/raw/main/video-output-77641874-D93F-4410-BDAF-0826A3AE09EE-1.mp4"
];

function randomVideoUrl() {
  return videoUrls[Math.floor(Math.random() * videoUrls.length)];
}


const imageUrls = [
  "https://res.cloudinary.com/dx2isud5e/image/upload/v1772385916/4_ckzhcg.png",
  "https://res.cloudinary.com/dx2isud5e/image/upload/v1772385917/5_lb0a7o.png",
  "https://res.cloudinary.com/dx2isud5e/image/upload/v1772385916/2_k5tseo.png",
  "https://res.cloudinary.com/dx2isud5e/image/upload/v1772385916/1_vng4ni.png",
  "https://res.cloudinary.com/dx2isud5e/image/upload/v1772385916/3_nsieqs.png"
];

// Pick a random image URL
function randomImageUrl() {
  return imageUrls[Math.floor(Math.random() * imageUrls.length)];
}


// Build MessageMedia
async function mediaFrom({ imageUrl, imageBase64, mimeType }) {
  if (imageBase64) {
    if (!mimeType) throw new Error("mimeType required with imageBase64");
    return new MessageMedia(
      mimeType,
      imageBase64.replace(/^data:[^;]+;base64,/, ""),
      "image"
    );
  }
  if (imageUrl) {
    const resp = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const b64 = Buffer.from(resp.data, "binary").toString("base64");
    const mt = mimeType || resp.headers["content-type"] || "image/jpeg";
    return new MessageMedia(
      mt,
      b64,
      path.basename(new URL(imageUrl).pathname) || "image"
    );
  }
  throw new Error("Provide imageUrl or imageBase64");
}

app.post("/api/send-image", async (req, res) => {
  try {
  
      
    if (!clientReady)
      return res.status(503).json({ error: "Client not ready. Scan QR." });

    const { to, caption, imageUrl, imageBase64, mimeType, name } = req.body;
    if (!to) return res.status(400).json({ error: "to is required" });
    if (!imageUrl && !imageBase64)
      return res.status(400).json({ error: "imageUrl or imageBase64 required" });
      
      
      

    const media = await mediaFrom({ imageUrl, imageBase64, mimeType });
    const jid = normalizeTo(to) + "@c.us";
    const result = await client.sendMessage(jid, media, {
      caption: caption || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "send-image enqueue failed" });
  }
});





// Send Video
app.post("/api/send-video", async (req, res) => {
  try {
    if (!clientReady)
      return res.status(503).json({ error: "Client not ready. Scan QR." });

    const { to, caption, videoUrl, videoBase64, mimeType } = req.body;
    if (!to) return res.status(400).json({ error: "to is required" });
    if (!videoUrl && !videoBase64)
      return res.status(400).json({ error: "videoUrl or videoBase64 required" });

    let media;

    if (videoBase64) {
      if (!mimeType) return res.status(400).json({ error: "mimeType required with videoBase64" });
      media = new MessageMedia(
        mimeType,
        videoBase64.replace(/^data:[^;]+;base64,/, ""),
        "video"
      );
    } else {
      const resp = await axios.get(videoUrl, { responseType: "arraybuffer" });
      const b64 = Buffer.from(resp.data, "binary").toString("base64");
      const mt = mimeType || resp.headers["content-type"] || "video/mp4";
      media = new MessageMedia(
        mt,
        b64,
        path.basename(new URL(videoUrl).pathname) || "video.mp4"
      );
    }

    const jid = normalizeTo(to) + "@c.us";
    const result = await client.sendMessage(jid, media, { caption: caption || "" });

    res.json({ success: true, id: result.id._serialized });
  } catch (err) {
    res.status(500).json({ error: err.message || "send-video failed" });
  }
});






/* -------------------- SEND BULK VIDEO -------------------- */
app.post("/api/send-bulk-video", async (req, res) => {
  if (!clientReady) {
    return res.status(503).json({ message: "WhatsApp client not ready" });
  }

  let sentCount = 0;

  for (const entry of numbers) {
    try {
      const num = typeof entry === "string" ? entry : entry.number;
      const chatId = `${normalizeTo(num)}@c.us`;

      const message = randomMessage();
      const videoUrl = randomVideoUrl();

      // Download video
      const resp = await axios.get(videoUrl, { responseType: "arraybuffer" });
      const b64 = Buffer.from(resp.data, "binary").toString("base64");
      const mimeType = resp.headers["content-type"] || "video/mp4";

      const media = new MessageMedia(
        mimeType,
        b64,
        path.basename(new URL(videoUrl).pathname) || "video.mp4"
      );

      await client.sendMessage(chatId, media, { caption: message });

      console.log("Video sent to:", num);
      sentCount++;

      // Random delay 10-20 seconds
      await sleep(randomDelay());

    } catch (err) {
      console.error("Failed to send video to:", entry, err.message);
      continue;
    }
  }

  res.json({ message: `Bulk video sending completed. Total sent: ${sentCount}` });
});



/* -------------------- SEND BULK WITH URL MEDIA -------------------- */
app.post("/api/send-bulk-image", async (req, res) => {
  if (!clientReady) {
    return res.status(503).json({ message: "WhatsApp client not ready" });
  }

  let sentCount = 0;

  for (const entry of numbers) {
    try {
      // Support both object {number: "91..."} or just string
      const num = typeof entry === "string" ? entry : entry.number;
      const chatId = `${normalizeTo(num)}@c.us`;

      const message = randomMessage();
      const imageUrl = randomImageUrl();

      // Use your already working mediaFrom function
      const media = await mediaFrom({ imageUrl });

      await client.sendMessage(chatId, media, { caption: message });
      console.log("Sent to:", num);
      sentCount++;

      // Small random delay to avoid spam limits
      await sleep(randomDelay());
    } catch (err) {
      console.error("Failed to send to:", entry, err.message);
      continue; // continue sending to next number
    }
  }

  res.json({ message: `Bulk sending completed. Total sent: ${sentCount}` });
});

/* -------------------- SERVER -------------------- */

app.listen(3000, () => {
  console.log("Server running on port 3000");
});