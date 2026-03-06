import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'aegis-secret-key'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: 'none',
  httpOnly: true,
}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/google/callback`
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/documents.readonly'
];

// API Routes
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/user/integrations", (req, res) => {
  res.json({
    google: !!req.session?.tokens
  });
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
