const express = require('express');
const { chromium } = require('playwright-chromium');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 2123;

app.use(express.json());
app.set('json spaces', 2);

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const validateInput = (url, device) => {
  if (!url) return 'URL parameter is required';
  try {
    new URL(url);
  } catch (err) {
    return 'Invalid URL format';
  }
  const validDevices = ['phone', 'tablet', 'laptop', 'desktop', 'full'];
  if (device && !validDevices.includes(device)) {
    return `Invalid device. Must be one of: ${validDevices.join(', ')}`;
  }
  return null;
};

const deviceConfigs = {
  phone: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
  full: null
};

function cleanupTempFiles() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  try {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > thirtyMinutes) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (error) {}
}

setInterval(cleanupTempFiles, 30 * 60 * 1000);

app.get('/api/screenshot', async (req, res) => {
  const { url, device = 'desktop' } = req.query;
  const validationError = validateInput(url, device);
  if (validationError) return res.status(400).json({ error: validationError });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    if (device !== 'full') await page.setViewportSize(deviceConfigs[device]);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const screenshotOptions = { type: 'png', fullPage: device === 'full', animations: 'disabled' };
    const screenshot = await page.screenshot(screenshotOptions);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="gifted_ssweb-${device}-${Date.now()}.png"`);
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ 
      status: 500,
      success: 'false',
      creator: 'chamod nimsara',
      error: 'Error creating screenshot', 
      message: err.message 
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/api/screenrecord', async (req, res) => {
  const { url, device = 'desktop', duration = '10' } = req.query;
  const validationError = validateInput(url, device);
  if (validationError) return res.status(400).json({ error: validationError });

  let browser;
  let context;
  const recordingId = Date.now().toString();
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    context = await browser.newContext({
      recordVideo: {
        dir: tempDir,
        size: device !== 'full' ? deviceConfigs[device] : { width: 1920, height: 1080 }
      }
    });

    const page = await context.newPage();
    if (device !== 'full') await page.setViewportSize(deviceConfigs[device]);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const recordDuration = Math.min(parseInt(duration) || 10, 30);
    await page.waitForTimeout(recordDuration * 1000);

    await context.close();
    await new Promise(resolve => setTimeout(resolve, 2000));

    const videoFiles = fs.readdirSync(tempDir).filter(file => file.endsWith('.webm'));
    const videoFile = videoFiles.find(file => fs.statSync(path.join(tempDir, file)).mtime.getTime() > Date.now() - 10000);
    
    if (!videoFile) throw new Error('Video file not found');
    
    const videoPath = path.join(tempDir, videoFile);
    const videoBuffer = fs.readFileSync(videoPath);
    
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `inline; filename="gifted_ssweb_rec-${device}-${recordingId}.webm"`);
    res.send(videoBuffer);
    
    fs.unlinkSync(videoPath);
    
  } catch (err) {
    if (context) await context.close();
    res.status(500).json({ 
      status: 500,
      success: 'false',
      creator: 'chamod nimsara',
      error: 'Error creating screen recording', 
      message: err.message 
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 200,
    success: true,
    info: 'online', 
    creator: 'chamod nimsara',
    timestamp: new Date().toISOString() 
  });
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Screenshot & Screen Recording API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .button { display: inline-block; padding: 10px 20px; margin: 10px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
        .button:hover { background: #0056b3; }
        .endpoint { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Screenshot & Screen Recording API</h1>
    <p>Creator: whiteshadow</p>
    
    <div class="endpoint">
        <h3>Screenshot Endpoint</h3>
        <p><strong>URL:</strong> /api/screenshot</p>
        <p><strong>Parameters:</strong> url, device (optional)</p>
        <a class="button" href="/api/screenshot?url=https://github.com/mauricegift&device=laptop" target="_blank">Try Screenshot</a>
    </div>
    
    <div class="endpoint">
        <h3>Screen Recording Endpoint</h3>
        <p><strong>URL:</strong> /api/screenrecord</p>
        <p><strong>Parameters:</strong> url, device (optional), duration (optional)</p>
        <a class="button" href="/api/screenrecord?url=https://api.giftedtech.co.ke/docs&device=desktop&duration=15" target="_blank">Try Screen Record</a>
    </div>
    
    <div class="endpoint">
        <h3>Defaults</h3>
        <p><strong>Device:</strong> desktop (options: phone, tablet, laptop, full)</p>
        <p><strong>Duration:</strong> 10 seconds (max: 30 seconds)</p>
    </div>
    
    <a class="button" href="/health">Health Check</a>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
