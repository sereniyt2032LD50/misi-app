# Misi: Emotion-Aware Safety Assistant

**Misi** is an emotion-aware AI guardian designed to solve the "tech neck" epidemic by safeguarding your body’s long-term physiological health.

While millions spend hours hunched over screens—causing chronic **spinal degradation** and restricted **circulatory flow**—Misi acts as a proactive health partner. Using the **Gemini Live API**, she provides sub-second biofeedback to ensure **spinal integrity** and optimal **respiratory efficiency**. She doesn't just watch your posture; she senses emotional stress and physical exhaustion, understanding the deep link between your physical alignment and your nervous system's health.

---

## 🚀 Key Features

- **Real-time Postural Biofeedback**: Sub-second detection of slumping, leaning, or poor ergonomics.
- **Emotional Intelligence**: Senses mood and fatigue to adjust feedback tone and intensity.
- **Workspace Integration**: Automatically schedules recovery breaks in Google Calendar when fatigue is detected.
- **AI Health Reports**: Synthesizes biomechanical data into professional, downloadable PDF reports.
- **Privacy First**: Local processing of video frames with secure, encrypted cloud storage for reports.

---

## 🛠 Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, Motion, Recharts.
- **Backend**: Express (Node.js), Google Gemini Live API.
- **Database/Auth**: Firebase Firestore & Authentication.
- **Integrations**: Google Workspace (Calendar, Gmail).

---

## 🧪 Reproducible Testing Instructions

To ensure the application is functioning correctly, follow these testing scenarios:

### 1. Postural Biofeedback Test
- **Action**: Start the monitoring session and intentionally slump or lean forward significantly.
- **Expected Result**: The "Posture Score" in the dashboard should drop below 70%, and the "Alert Status" should change to "Warning" or "Poor". You should hear/see a biofeedback cue from Misi.

### 2. Emotional State Detection
- **Action**: Smile broadly or look visibly frustrated/tired during a session.
- **Expected Result**: The "Emotional State" card should update to reflect the detected mood (e.g., "Happy", "Stressed", "Fatigued").

### 3. Workspace Integration (Calendar)
- **Action**: Maintain a "Poor" posture or "Fatigued" state for more than 2 minutes while Google Workspace is connected.
- **Expected Result**: Check your Google Calendar. Misi should have automatically created a "Postural Recovery Break" event.

### 4. Report Generation
- **Action**: Complete a session of at least 5 minutes, then click "Generate Report".
- **Expected Result**: An AI-synthesized report should appear in the "Live Report" tab. Verify that you can download the PDF and that it contains accurate observations from your session.

### 5. Thumbnail Generation
- **Action**: Scroll to the footer and click "GENERATE THUMBNAIL".
- **Expected Result**: A professional app thumbnail should be generated using Gemini. Verify the "DOWNLOAD THUMBNAIL" link appears and works.

---

## 📦 Installation & Setup

1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Configure Environment Variables**:
   Create a `.env` file based on `.env.example` and add your:
   - `GEMINI_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - Firebase configuration (via `firebase-applet-config.json`)

3. **Run the development server**:
   ```bash
   npm run dev
   ```

---

## 🛡 Security & Privacy

Misi implements strict Firebase Security Rules to ensure that your health data and reports are only accessible by you. All video processing is handled in real-time and frames are not stored permanently unless explicitly requested for report generation.


### APP built with Google AI studio