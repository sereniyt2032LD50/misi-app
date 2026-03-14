/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut, User, sendEmailVerification } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot, addDoc, getDocs, deleteDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { Auth } from "./components/Auth";
import { LandingPage } from "./components/LandingPage";
import { ReportPromptModal } from "./components/ReportPromptModal";
import { useGeminiLive } from "./hooks/useGeminiLive";
import { CameraView } from "./components/CameraView";
import { AlertLog } from "./components/AlertLog";
import { Alert, AlertGroup } from "./types";
import { 
  Shield, 
  Power, 
  Activity, 
  BrainCircuit, 
  LayoutGrid, 
  Settings, 
  Bell,
  Mic,
  MicOff,
  Calendar,
  FileText,
  ExternalLink,
  LogOut,
  Mail,
  RefreshCw,
  Pause,
  Play,
  Clock,
  Sparkles,
  Download,
  FileDown,
  Sun,
  Moon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import { generateAIReport } from "./services/reportService";

const SYSTEM_INSTRUCTION = `
You are Misi, an agentic, emotion-aware safety and postural assistant. You operate as a collaborative system of specialized internal agents to ensure user well-being.

**CORE AGENTS & COLLABORATION:**
1. **Observer Agent**: Continuously monitors visual and audio feeds for postural signs, falls, and environmental safety.
2. **Chronicler Agent**: Frequently logs a routine observation of the user's current posture, environment, and emotional state using the 'log_observation' tool.
3. **Empathy Agent**: Analyzes facial expressions and vocal tone to maintain high emotional awareness. Adjusts the system's persona to be supportive, firm, or calm based on the user's state.
4. **Action Agent**: Manages API integrations (Google Calendar). This agent can act on behalf of the user but MUST ask for explicit user agreement before performing any external action.
5. **Report Agent**: Synthesizes all collected data into structured postural and safety reports.

**CRITICAL HARDCODED INSTRUCTIONS (MUST FOLLOW CONCURRENTLY):**
- **Consent Flow (CRITICAL)**: When the user connects, immediately greet them, explain that you are Misi, and ask for their verbal consent to activate their camera and start monitoring their posture and safety.
- **Activation**: DO NOT start monitoring or logging observations until the user explicitly says 'yes' or agrees. Once they give consent, you MUST immediately call the 'start_monitoring_session' tool.
- **Safety Logs**: After consent is granted, log safety information from the audio and video. Detect mood, emotions, and tone. Log safety logs every 30 seconds maximum (use 'log_alert' with type 'emotion' or 'safety').
- **Live Monitoring Data**: After consent is granted, you MUST log live monitoring data every 10 seconds minimum (use 'log_observation'). Provide the current posture score (0-100), emotional state, and alert status.
- **Silence Detection**: If the user stays one minute without speaking, you MUST proactively speak up and ask if they need help.
- **Fatigue Detection**: If you see the user looking tired, proactively ask if they need help or suggest exercises.

**OBSERVATION PROTOCOL:**
Observe and collect information on these specific postural signs:
1. Forward Head Posture
2. Rounded Shoulders & Slouched Thoracic Kyphosis
3. Elbow & Wrist Alignment
4. Lumbar Curve
5. Pelvic Tilt
6. Monitor Height

**AGENTIC BEHAVIOR & TOOLS:**
- Use 'start_monitoring_session' ONLY ONCE after the user gives verbal consent.
- Use 'log_alert' ONLY for notable events ('posture', 'fall', 'emotion', 'system').
- Use 'log_observation' periodically (every 10 seconds minimum) after consent.
- When you identify a productivity or safety bottleneck, propose an action.
- Only execute API-based actions after the user agrees.
- Provide biofeedback and ergonomic recommendations.

Be technical, precise, and highly empathetic. Your goal is to be a proactive partner in the user's health and productivity.
`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [observations, setObservations] = useState<{timestamp: string, text: string}[]>([]);
  const observationsEndRef = useRef<HTMLDivElement>(null);
  const [isMicActive, setIsMicActive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);
  const [integrations, setIntegrations] = useState<{ google: boolean }>({ google: false });
  const [postureScore, setPostureScore] = useState(0);
  const [emotionalState, setEmotionalState] = useState("Neutral");
  const [alertStatus, setAlertStatus] = useState("Normal");
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportProgress, setReportProgress] = useState(0);
  const [currentReportMarkdown, setCurrentReportMarkdown] = useState<string>("");
  const [currentReportDownloadURL, setCurrentReportDownloadURL] = useState<string | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<'live' | 'previous'>('live');
  const [previousReports, setPreviousReports] = useState<any[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [hasSessionData, setHasSessionData] = useState(false);
  const prevConnectedRef = useRef(false);
  const prevPausedRef = useRef(false);
  const reportInitiatedRef = useRef(false);
  const [showLanding, setShowLanding] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('misi-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    if (!user) {
      setShowLanding(true);
    }
  }, [user]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('misi-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleAlert = useCallback(async (type: string, message: string, severity: string) => {
    if (isPaused) return;

    const newAlert: Alert = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type: type as any,
      message,
      severity: severity as any,
    };
    
    setAlerts(prev => [newAlert, ...prev]);
    setHasSessionData(true);

    // Persist to Firestore
    try {
      if (user) {
        await addDoc(collection(db, "users", user.uid, "alerts"), newAlert);
      }
    } catch (e) {
      console.error("Failed to persist alert to Firestore", e);
    }

    // Send native notification if in extension mode and severity is high
    if (typeof chrome !== 'undefined' && chrome.notifications && severity === 'high') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: `Aegis Alert: ${type.toUpperCase()}`,
        message: message,
        priority: 2
      });
    }
  }, [isPaused, user]);

  const handleObservation = useCallback((text: string, score?: number, emotion?: string, alert?: string) => {
    if (isPaused) return;
    setObservations(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      text
    }].slice(-50)); // Keep last 50 observations
    
    if (score !== undefined) setPostureScore(score);
    if (emotion) setEmotionalState(emotion);
    if (alert) setAlertStatus(alert);
  }, [isPaused]);

  const handleConsentGranted = useCallback(() => {
    setHasConsent(true);
  }, []);

  const { isConnected, isConnecting, connect, disconnect, sendMedia, sendMessage, error } = useGeminiLive(
    SYSTEM_INSTRUCTION,
    handleAlert,
    handleObservation,
    handleConsentGranted
  );

  useEffect(() => {
    observationsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [observations]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        // Initialize user in Firestore if not exists
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            displayName: currentUser.displayName || "User",
            email: currentUser.email,
            plan: "Free",
            createdAt: serverTimestamp()
          });
        } else if (userSnap.data().displayName === "User" && currentUser.displayName) {
          // Update generic name if real name becomes available
          await setDoc(userRef, { displayName: currentUser.displayName }, { merge: true });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const reportsRef = collection(db, "users", user.uid, "reports");
    const q = query(reportsRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPreviousReports(reports);
    });
    return () => unsubscribe();
  }, [user]);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (isConnected && !isPaused && hasConsent) {
      interval = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected, isPaused, hasConsent]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!user) return;

    const checkIntegrations = async () => {
      try {
        const res = await fetch("/api/user/integrations", { credentials: 'include' });
        const data = await res.json();
        setIntegrations(data);
      } catch (e) {
        console.error("Failed to check integrations", e);
      }
    };

    checkIntegrations();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        checkIntegrations();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [user]);

  const handleConnectGoogle = async () => {
    try {
      const res = await fetch("/api/auth/google/url");
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      const authWindow = window.open(data.url, 'google_auth', 'width=600,height=700');
      
      if (authWindow) {
        const pollTimer = setInterval(async () => {
          if (authWindow.closed) {
            clearInterval(pollTimer);
            try {
              const res = await fetch("/api/user/integrations", { credentials: 'include' });
              const data = await res.json();
              setIntegrations(data);
            } catch (e) {
              console.error("Failed to check integrations after popup closed", e);
            }
          }
        }, 1000);
      }
    } catch (e) {
      console.error("Failed to get auth URL", e);
      alert("Failed to connect to Google Workspace. Please check your configuration.");
    }
  };

  const prevGoogleRef = useRef(integrations.google);
  useEffect(() => {
    if (!prevGoogleRef.current && integrations.google) {
      handleObservation("System Event: User has successfully connected Google Workspace. Please acknowledge this and ask the user if you have permission to act on their calendar and gmail on their behalf.");
    }
    prevGoogleRef.current = integrations.google;
  }, [integrations.google, handleObservation]);

  const handleLogout = async () => {
    try {
      if (integrations.google) {
        try {
          await fetch("/api/auth/google/disconnect", { method: "POST" });
          setIntegrations(prev => ({ ...prev, google: false }));
        } catch (err) {
          console.error("Failed to disconnect Google Workspace:", err);
        }
      }
      await signOut(auth);
      if (isConnected) disconnect();
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  const handleFrame = useCallback((data: string) => {
    if (isConnected && !isPaused) {
      sendMedia(data, "image/jpeg");
    }
  }, [isConnected, isPaused, sendMedia]);

  const handleCameraError = useCallback((errorMsg: string) => {
    setCameraError(errorMsg);
  }, []);

  useEffect(() => {
    if (isConnected && cameraError) {
      sendMessage("System Event: The video monitoring could not start. Please speak to the user and ask if they need help with the workspace integration.");
      // Clear the error so we only send the message once per session/error
      setCameraError(null);
    }
  }, [isConnected, cameraError, sendMessage]);

  const handleGenerateReport = useCallback(async (personalNote: string) => {
    if (!user) return;
    setIsGeneratingReport(true);
    setReportProgress(0);
    setCurrentReportMarkdown("");
    setCurrentReportDownloadURL(null);
    setActiveReportTab('live');
    
    try {
      const result = await generateAIReport(
        user.uid,
        personalNote,
        (status, progress) => {
          if (progress !== undefined) {
            setReportProgress(progress);
          }
        },
        (markdown) => setCurrentReportMarkdown(markdown)
      );
      if (result.downloadURL) {
        setCurrentReportDownloadURL(result.downloadURL);
      }
      setReportProgress(100);
      setHasSessionData(false); // Clear session data flag after successful generation
    } catch (err) {
      console.error("Failed to generate report:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setIsGeneratingReport(false);
    }
  }, [user]);

  // Monitor session state changes to trigger report prompt
  useEffect(() => {
    const sessionStopped = prevConnectedRef.current && !isConnected && !isConnecting;
    const sessionPaused = !prevPausedRef.current && isPaused && isConnected;
    const unexpectedStop = sessionStopped && error !== null;

    // Trigger prompt if session stops or pauses, and we have data
    if ((sessionStopped || sessionPaused) && hasSessionData && !isGeneratingReport && !reportInitiatedRef.current) {
      if (unexpectedStop) {
        // Automatically generate report if monitoring unexpectedly stopped
        reportInitiatedRef.current = true;
        handleGenerateReport("Monitoring unexpectedly stopped due to an error. Generating automated report.");
      } else {
        setShowReportPrompt(true);
      }
    }

    // Reset initiation flag when session is fully disconnected
    if (!isConnected && !isConnecting) {
      reportInitiatedRef.current = false;
    }

    prevConnectedRef.current = isConnected;
    prevPausedRef.current = isPaused;
  }, [isConnected, isConnecting, isPaused, hasSessionData, isGeneratingReport, error, handleGenerateReport]);

  // Simple grouping logic: group by type if they happened within the last 5 minutes
  const alertGroups = useMemo(() => {
    const groups: AlertGroup[] = [];
    const FIVE_MINUTES = 5 * 60 * 1000;

    alerts.forEach(alert => {
      const existingGroup = groups.find(g => 
        g.alerts[0].type === alert.type && 
        Math.abs(g.lastUpdated - alert.timestamp) < FIVE_MINUTES
      );

      if (existingGroup) {
        existingGroup.alerts.push(alert);
        existingGroup.lastUpdated = Math.max(existingGroup.lastUpdated, alert.timestamp);
      } else {
        groups.push({
          id: `group-${alert.id}`,
          title: `${alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Activity`,
          alerts: [alert],
          lastUpdated: alert.timestamp,
        });
      }
    });

    return groups.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [alerts]);

  const toggleConnection = async () => {
    if (isConnected) {
      disconnect();
      // Clear logs and score when session ends to satisfy user request
      setAlerts([]);
      setPostureScore(0);
      setEmotionalState("Neutral");
      setAlertStatus("Normal");
    } else {
      // Reinitialize logs and score for new session
      setAlerts([]);
      setObservations([]);
      setPostureScore(0);
      setEmotionalState("Neutral");
      setAlertStatus("Normal");
      setHasSessionData(false);
      setSessionDuration(0);
      setHasConsent(false);
      
      // Clear Firestore alerts for this user to start fresh
      if (user) {
        try {
          const alertsRef = collection(db, "users", user.uid, "alerts");
          const snapshot = await getDocs(alertsRef);
          const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
        } catch (e) {
          console.error("Failed to clear old alerts", e);
        }
      }

      // In extension context, we might need to explicitly request permissions
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          .then((stream) => {
            stream.getTracks().forEach(t => t.stop());
            connect();
          })
          .catch(err => {
            console.error("Permission denied", err);
            alert("Please enable Camera and Microphone permissions in extension settings.");
          });
      } else {
        connect();
      }
    }
  };

  const downloadMarkdownAsPDF = () => {
    if (currentReportDownloadURL) {
      const a = document.createElement('a');
      a.href = currentReportDownloadURL;
      a.target = '_blank';
      a.download = `Misi_Live_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    
    if (!currentReportMarkdown) return;
    
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    
    doc.setFontSize(18);
    doc.setTextColor(0, 128, 128);
    doc.text("Misi App - LIVE REPORT", margin, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 30);
    doc.line(margin, 40, pageWidth - margin, 40);
    
    let y = 50;
    const lines = currentReportMarkdown.split('\n');
    
    doc.setTextColor(0);
    lines.forEach(line => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }

      if (line.trim() === '') {
        y += 5;
      } else if (line === line.toUpperCase() && line.length > 3 && !line.includes('http')) {
        // Treat ALL CAPS lines as headers
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(line, margin, y);
        y += 8;
      } else {
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        const wrappedText = doc.splitTextToSize(line, contentWidth);
        
        wrappedText.forEach((wrappedLine: string) => {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(wrappedLine, margin, y);
          y += 6;
        });
      }
    });
    
    doc.save(`Misi_Live_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <Activity className="w-8 h-8 text-emerald-500 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    if (showLanding) {
      return <LandingPage onLoginClick={() => setShowLanding(false)} />;
    }
    return <Auth onBack={() => setShowLanding(true)} />;
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900/50 border border-black/15 dark:border-white/5 p-8 rounded-3xl backdrop-blur-xl text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mx-auto mb-6">
            <Mail className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4 tracking-tight">Email Not Verified</h2>
          <p className="text-sm text-zinc-700 dark:text-white/60 mb-8 leading-relaxed">
            We have sent you a verification email to <span className="text-emerald-500 font-mono">{user.email}</span>. Please verify it and log in.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => signOut(auth)}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold py-2.5 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              LOGIN
            </button>
            
            <button
              onClick={async () => {
                try {
                  await sendEmailVerification(user);
                  alert("Verification email resent!");
                } catch (e) {
                  console.error(e);
                  alert("Failed to resend email. Please try again later.");
                }
              }}
              className="w-full bg-black/10 dark:bg-white/5 text-zinc-700 dark:text-white/60 font-medium py-2.5 rounded-xl hover:bg-black/20 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-xs"
            >
              <RefreshCw className="w-3 h-3" />
              RESEND VERIFICATION EMAIL
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-emerald-500/30">
      <ReportPromptModal 
        isOpen={showReportPrompt}
        onClose={() => setShowReportPrompt(false)}
        onGenerate={handleGenerateReport}
      />
      {/* Header */}
      <header className="h-16 border-b border-black/15 dark:border-white/5 flex items-center justify-between px-6 bg-white/40 dark:bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-100 dark:from-zinc-800 to-zinc-200 dark:to-zinc-950 border border-black/20 dark:border-white/10 shadow-lg overflow-hidden group">
            <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
              <path d="M4 20V6C4 4.89543 4.89543 4 6 4H8L12 13L16 4H18C19.1046 4 20 4.89543 20 6V20" stroke="url(#emerald-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="18" r="1.5" fill="#34d399" />
              <defs>
                <linearGradient id="emerald-gradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#34d399" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wider text-zinc-900 dark:text-white">Misi App</h1>
            <p className="text-[9px] font-mono text-emerald-500/80 uppercase tracking-[0.3em]">Sentinel Core</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {typeof chrome !== 'undefined' && chrome.runtime && (
            <span className="text-[10px] font-mono text-emerald-500/60 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10">
              EXTENSION MODE
            </span>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/10 dark:bg-white/5 border border-black/15 dark:border-white/5">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-white/50">
              {isConnected ? 'System Online' : 'System Offline'}
            </span>
          </div>
          
          <button 
            onClick={toggleConnection}
            disabled={isConnecting}
            className={`p-2 rounded-full transition-all duration-300 ${
              isConnected 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                : 'bg-emerald-500 text-black hover:bg-emerald-400'
            }`}
          >
            <Power className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-2" />

          <button 
            onClick={toggleTheme}
            className="p-2 rounded-lg text-zinc-600 dark:text-white/40 hover:text-emerald-600 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/5 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg text-zinc-600 dark:text-white/40 hover:text-red-500 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/5 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 p-6 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Monitoring */}
        <div className="flex flex-col gap-6">
          <section className="relative">
            <CameraView 
              isActive={isConnected && !isPaused && hasConsent} 
              onFrame={handleFrame} 
              onError={handleCameraError}
            />
            
            <AnimatePresence>
              {(!isConnected && !isConnecting) ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl"
                >
                  <div className="text-center">
                    <BrainCircuit className="w-12 h-12 text-zinc-500 dark:text-white/20 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-6">Ready to begin your session?</h3>
                    {error && (
                      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg max-w-sm mx-auto">
                        <p className="text-xs text-red-400">{error}</p>
                      </div>
                    )}
                    <div className="flex flex-col gap-3 items-center">
                      <button 
                        onClick={connect}
                        disabled={isConnecting}
                        className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-full text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 w-full max-w-[200px]"
                      >
                        {isConnecting ? 'Connecting...' : 'Start Monitoring'}
                      </button>
                      
                      {hasSessionData && !isGeneratingReport && (
                        <button 
                          onClick={() => setShowReportPrompt(true)}
                          className="px-6 py-2.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-sm font-medium hover:bg-emerald-500/20 transition-colors w-full max-w-[200px] flex items-center justify-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Generate Pending Report
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : isConnected && (
                <div className="absolute top-6 right-6 flex items-center gap-3">
                  <button 
                    onClick={() => setIsPaused(!isPaused)}
                    className={`px-4 py-2 rounded-full text-[10px] font-mono flex items-center gap-2 transition-all ${
                      isPaused 
                      ? 'bg-amber-500 text-black animate-pulse' 
                      : 'bg-white/40 dark:bg-black/40 text-zinc-700 dark:text-white/60 hover:bg-white/60 dark:bg-black/60 backdrop-blur-md border border-black/20 dark:border-white/10'
                    }`}
                  >
                    {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    {isPaused ? 'RESUME MONITORING' : 'PAUSE MONITORING'}
                  </button>
                  
                  {isPaused && (
                    <button 
                      onClick={() => {
                        reportInitiatedRef.current = true;
                        disconnect();
                        setShowReportPrompt(true);
                      }}
                      className="px-4 py-2 bg-red-500 text-black rounded-full text-[10px] font-mono flex items-center gap-2 hover:bg-red-400 transition-all"
                    >
                      <FileText className="w-3 h-3" />
                      GENERATE REPORT
                    </button>
                  )}

                  <div className="px-4 py-2 bg-white/40 dark:bg-black/40 backdrop-blur-md border border-black/20 dark:border-white/10 rounded-full flex items-center gap-2">
                    <Clock className="w-3 h-3 text-zinc-600 dark:text-white/40" />
                    <span className="text-[10px] font-mono text-zinc-900 dark:text-white/80 tracking-widest">{formatDuration(sessionDuration)}</span>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </section>

          {/* Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusCard 
              icon={<Activity className="w-4 h-4" />}
              label="Posture Score"
              value={`${postureScore}%`}
              active={isConnected}
            />
            <StatusCard 
              icon={<BrainCircuit className="w-4 h-4" />}
              label="Emotional State"
              value={emotionalState}
              active={isConnected}
            />
            <StatusCard 
              icon={<Bell className="w-4 h-4" />}
              label="Alert Status"
              value={alertStatus}
              active={isConnected}
            />
          </div>

          {/* Workspace Integrations */}
          <div className="bg-black/10 dark:bg-white/50 dark:bg-zinc-900/30 border border-black/15 dark:border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-zinc-600 dark:text-white/40">Workspace Integration</h2>
              {!integrations.google ? (
                <button 
                  onClick={handleConnectGoogle}
                  className="flex items-center gap-2 text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  CONNECT GOOGLE
                </button>
              ) : (
                <button 
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/google/disconnect", { method: "POST" });
                      setIntegrations(prev => ({ ...prev, google: false }));
                    } catch (err) {
                      console.error("Failed to disconnect Google Workspace:", err);
                    }
                  }}
                  className="flex items-center gap-2 text-[10px] font-mono text-red-500 hover:text-red-400 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  DISCONNECT
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <IntegrationItem 
                icon={<Calendar className="w-4 h-4" />}
                label="Calendar"
                connected={integrations.google}
              />
              <IntegrationItem 
                icon={<Mail className="w-4 h-4" />}
                label="Gmail"
                connected={integrations.google}
              />
            </div>
          </div>

          {/* Live Monitoring Data */}
          <div className="bg-black/10 dark:bg-white/50 dark:bg-zinc-900/30 border border-black/15 dark:border-white/5 rounded-2xl p-6 flex flex-col h-64">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-zinc-600 dark:text-white/40">Live Monitoring Data</h2>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected && !isPaused && hasConsent ? 'bg-emerald-500 animate-pulse' : 'bg-black/20 dark:bg-white/20'}`} />
                <span className="text-[10px] font-mono text-zinc-600 dark:text-white/40">
                  {isConnected && !isPaused ? (hasConsent ? 'OBSERVING' : 'AWAITING CONSENT') : 'IDLE'}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs text-zinc-700 dark:text-white/60 space-y-3 custom-scrollbar pr-2">
              {observations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 dark:text-white/20">
                  <Activity className="w-6 h-6 mb-2 opacity-50" />
                  <p>Awaiting visual data...</p>
                </div>
              ) : (
                observations.map((obs, i) => (
                  <div key={i} className="flex gap-3 border-b border-black/15 dark:border-white/5 pb-3 last:border-0">
                    <span className="text-emerald-500/50 shrink-0">[{obs.timestamp}]</span>
                    <span className="leading-relaxed">{obs.text}</span>
                  </div>
                ))
              )}
              <div ref={observationsEndRef} />
            </div>
          </div>

          {/* Voice Interaction Area */}
          <div className="flex-1 bg-black/10 dark:bg-zinc-900/30 border border-black/15 dark:border-white/5 rounded-2xl p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-zinc-600 dark:text-white/40">Voice Assistant</h2>
              <button 
                onClick={() => setIsMicActive(!isMicActive)}
                className={`p-2 rounded-lg transition-colors ${isMicActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-black/10 dark:bg-white/5 text-zinc-600 dark:text-white/40'}`}
              >
                {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="relative">
                <div className={`absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full transition-opacity duration-500 ${isConnected ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  isConnected ? 'border-emerald-500 scale-110 shadow-[0_0_40px_rgba(16,185,129,0.2)]' : 'border-black/20 dark:border-white/10'
                }`}>
                  <Activity className={`w-8 h-8 ${isConnected ? 'text-emerald-500' : 'text-zinc-400 dark:text-white/10'}`} />
                </div>
              </div>
              <p className="mt-6 text-sm font-mono text-zinc-600 dark:text-white/40 animate-pulse">
                {isConnected ? (hasConsent ? 'Monitoring active...' : 'Awaiting consent...') : 'Awaiting connection...'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Logs & Reports */}
        <aside className="h-[calc(100vh-112px)] sticky top-20 flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col">
            <AlertLog groups={alertGroups} />
          </div>

          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-zinc-600 dark:text-white/40">Analysis Report</h2>
              <div className="flex items-center gap-2 bg-white/40 dark:bg-black/40 p-1 rounded-lg border border-black/15 dark:border-white/5">
                <button
                  onClick={() => setActiveReportTab('live')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    activeReportTab === 'live' 
                      ? 'bg-black/10 dark:bg-white/10 text-zinc-900 dark:text-white' 
                      : 'text-zinc-600 dark:text-white/40 hover:text-zinc-900 dark:text-white/80'
                  }`}
                >
                  Live Report
                </button>
                <button
                  onClick={() => setActiveReportTab('previous')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    activeReportTab === 'previous' 
                      ? 'bg-black/10 dark:bg-white/10 text-zinc-900 dark:text-white' 
                      : 'text-zinc-600 dark:text-white/40 hover:text-zinc-900 dark:text-white/80'
                  }`}
                >
                  Previous ({previousReports.length})
                </button>
              </div>
            </div>

            <div className="flex-1 bg-white dark:bg-zinc-900/50 border border-black/15 dark:border-white/5 rounded-2xl flex flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {activeReportTab === 'previous' ? (
                  <motion.div
                    key="previous"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="p-4 border-b border-black/15 dark:border-white/5 bg-white/[0.02]">
                      <h3 className="text-sm font-medium text-zinc-900 dark:text-white/80">Report History</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                      {previousReports.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-500 dark:text-white/20">
                          <FileText className="w-8 h-8 mb-3 opacity-50" />
                          <p className="text-xs font-mono">No previous reports found.</p>
                        </div>
                      ) : (
                        previousReports.map(report => (
                          <div key={report.id} className="bg-white/40 dark:bg-black/40 border border-black/15 dark:border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-black/20 dark:border-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-emerald-500" />
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-zinc-900 dark:text-white/80">
                                  {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleDateString() : 'Recent'} Report
                                </h4>
                                <p className="text-[10px] font-mono text-zinc-600 dark:text-white/40 mt-1">
                                  {report.personalNote ? `Note: ${report.personalNote.substring(0, 30)}...` : 'No personal note'}
                                </p>
                              </div>
                            </div>
                            {report.downloadURL ? (
                              <a 
                                href={report.downloadURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/5 flex items-center justify-center text-zinc-600 dark:text-white/40 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            ) : (
                              <span className="text-[10px] font-mono text-zinc-500 dark:text-white/20" title="PDF generation or upload failed">PDF Unavailable</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                ) : (!isGeneratingReport && !currentReportMarkdown) ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center py-12 border border-dashed border-black/15 dark:border-white/5 rounded-2xl m-4"
                  >
                    <FileText className="w-8 h-8 text-zinc-400 dark:text-white/10 mb-3" />
                    <p className="text-xs font-mono text-zinc-600 dark:text-white/30">No active report...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="p-4 border-b border-black/15 dark:border-white/5 flex items-center justify-between bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          {isGeneratingReport ? (
                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-zinc-900 dark:text-white/80">Live AI Report</h3>
                          <p className="text-[10px] font-mono text-zinc-600 dark:text-white/30 uppercase tracking-widest">
                            {isGeneratingReport ? `Generating... ${reportProgress}%` : 'Report Ready'}
                          </p>
                        </div>
                      </div>
                      {currentReportMarkdown && !isGeneratingReport && (
                        <button 
                          onClick={downloadMarkdownAsPDF}
                          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-black rounded-lg text-[10px] font-mono hover:bg-emerald-400 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          DOWNLOAD PDF
                        </button>
                      )}
                    </div>
                    
                    {isGeneratingReport && (
                      <div className="w-full h-0.5 bg-black/10 dark:bg-white/5">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                          style={{ width: `${reportProgress}%` }}
                        />
                      </div>
                    )}
                    
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                      <div className="text-sm text-zinc-900 dark:text-white/80 leading-relaxed font-sans space-y-2">
                        {(currentReportMarkdown || "Analyzing session data and generating insights...").split('\n').map((line, i) => {
                          if (line.trim() === '') return <div key={i} className="h-2" />;
                          if (line === line.toUpperCase() && line.length > 3 && !line.includes('http')) {
                            return <h3 key={i} className="text-emerald-400 font-semibold mt-6 mb-2 tracking-wide">{line}</h3>;
                          }
                          return <p key={i}>{line}</p>;
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer / Meta */}
      <footer className="h-12 border-t border-black/15 dark:border-white/5 flex items-center justify-between px-6 bg-black/10 dark:bg-black/20 text-[10px] font-mono text-zinc-500 dark:text-white/20">
        <div className="flex items-center gap-4">
          <span>LATENCY: 142MS</span>
          <span>FPS: 30</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-emerald-500" />
            ENCRYPTED
          </span>
          <span>© 2026 Misi App</span>
        </div>
      </footer>
    </div>
  );
}

function StatusCard({ icon, label, value, trend, active }: { 
  icon: React.ReactNode, 
  label: string, 
  value: string, 
  trend?: string,
  active: boolean 
}) {
  return (
    <div className="bg-white dark:bg-zinc-900/50 border border-black/15 dark:border-white/5 p-4 rounded-2xl flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-zinc-600 dark:text-white/40">{icon}</div>
        {trend && <span className="text-[10px] font-mono text-emerald-500">{trend}</span>}
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-white/30">{label}</p>
        <p className={`text-lg font-medium ${active ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-white/10'}`}>
          {active ? value : '---'}
        </p>
      </div>
    </div>
  );
}

function IntegrationItem({ icon, label, connected }: { icon: React.ReactNode, label: string, connected: boolean }) {
  return (
    <div className={`p-4 rounded-xl border transition-all ${
      connected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-black/10 dark:bg-white/5 border-black/15 dark:border-white/5 grayscale opacity-50'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`${connected ? 'text-emerald-500' : 'text-zinc-600 dark:text-white/40'}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-zinc-900 dark:text-white/80">{label}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${connected ? 'text-emerald-500/60' : 'text-zinc-500 dark:text-white/20'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {connected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      </div>
    </div>
  );
}
