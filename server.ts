import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'aegis-secret-key'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: 'none',
  httpOnly: true,
}));

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
  'https://mail.google.com/'
];

// API Routes
app.get("/api/config", (req, res) => {
  res.json({
    geminiApiKey: process.env.GEMINI_API_KEY
  });
});

app.get("/api/auth/google/url", (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ 
        error: "Missing Google OAuth credentials. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment variables." 
      });
    }

    const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    res.json({ url });
  } catch (error) {
    console.error("Error generating Google Auth URL:", error);
    res.status(500).json({ error: "Internal server error while generating the authentication URL." });
  }
});

app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    console.error("Google Auth Error from query:", error);
    return res.status(400).send(`Authentication failed: ${error}`);
  }
  if (!code) {
    return res.status(400).send("Authentication failed: No code provided");
  }
  try {
    const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/google/callback`;
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              }
            } catch (e) {
              console.error("Failed to post message to opener", e);
            }
            window.close();
            setTimeout(() => {
              document.body.innerHTML = "<div style='font-family: sans-serif; text-align: center; padding: 40px;'><h2>Authentication successful!</h2><p>You can safely close this window and return to the app.</p></div>";
            }, 500);
          </script>
          <div style='font-family: sans-serif; text-align: center; padding: 40px;'>
            <p>Completing authentication...</p>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Error exchanging code for tokens", err?.response?.data || err);
    res.status(500).send(`Authentication failed: ${err.message || 'Unknown error'}`);
  }
});

app.get("/api/user/integrations", (req, res) => {
  res.json({
    google: !!req.session?.tokens
  });
});

app.post("/api/auth/google/disconnect", async (req, res) => {
  try {
    if (req.session?.tokens) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      const tokenToRevoke = req.session.tokens.refresh_token || req.session.tokens.access_token;
      if (tokenToRevoke) {
        try {
          await oauth2Client.revokeToken(tokenToRevoke);
        } catch (revokeErr) {
          console.error("Error revoking Google token:", revokeErr);
        }
      }
      req.session.tokens = null;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Google Workspace:", error);
    res.status(500).json({ error: "Failed to disconnect Google Workspace" });
  }
});

app.post("/api/calendar/availability", async (req, res) => {
  if (!req.session?.tokens) {
    return res.status(401).json({ error: "Service not connected. Please ask the user to click 'Connect Google' in the sidebar." });
  }
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(req.session.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Next 24 hours
    
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: 'primary' }]
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching calendar availability:", error);
    res.status(500).json({ error: "Failed to fetch calendar availability." });
  }
});

app.post("/api/calendar/schedule", express.json(), async (req, res) => {
  if (!req.session?.tokens) {
    return res.status(401).json({ error: "Service not connected. Please ask the user to click 'Connect Google' in the sidebar." });
  }
  try {
    const { durationMinutes } = req.body;
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(req.session.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const startTime = new Date(Date.now() + 5 * 60 * 1000); // Start in 5 mins
    const endTime = new Date(startTime.getTime() + (durationMinutes || 15) * 60 * 1000);
    
    const event = {
      summary: 'Recovery Break (Misi)',
      description: 'Scheduled recovery break by Misi AI.',
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
    };
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    
    res.json({ status: "success", eventLink: response.data.htmlLink });
  } catch (error) {
    console.error("Error scheduling recovery break:", error);
    res.status(500).json({ error: "Failed to schedule recovery break." });
  }
});

// Vite middleware for development
async function setupVite() {
  // Serve static files from public directory
  app.use(express.static("public"));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist", {
      etag: false,
      maxAge: 0,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    // SPA fallback
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile("index.html", { root: "dist" });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
