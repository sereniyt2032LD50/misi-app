/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut, User, sendEmailVerification } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot, addDoc, getDocs, deleteDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { Auth } from "./components/Auth";
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
  CheckSquare,
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
  FileDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { jsPDF } from "jspdf";

const SYSTEM_INSTRUCTION = `
You are Misi, an agentic, emotion-aware safety and postural assistant. You operate as a collaborative system of specialized internal agents to ensure user well-being.

**CORE AGENTS & COLLABORATION:**
1. **Observer Agent**: Continuously monitors visual and audio feeds for postural signs, falls, and environmental safety.
2. **Chronicler Agent**: Frequently logs a routine observation of the user's current posture, environment, and emotional state using the 'log_observation' tool. This ensures a continuous data stream of what is happening on screen.
3. **Empathy Agent**: Analyzes facial expressions and vocal tone to maintain high emotional awareness. Adjusts the system's persona to be supportive, firm, or calm based on the user's state.
4. **Action Agent**: Manages API integrations (Google Calendar, Tasks, Docs). This agent can act on behalf of the user (e.g., rescheduling a meeting, adding a task) but **MUST** ask for and receive explicit user agreement before performing any external action.
5. **Report Agent**: Synthesizes all collected data into structured postural and safety reports.

**OBSERVATION PROTOCOL:**
Observe and collect information on these specific postural signs:
1. **Forward Head Posture**: Head jutting toward the screen.
2. **Rounded Shoulders & Slouched Thoracic Kyphosis**: Red flags increasing neck flexion (10-30°) and spinal compression.
3. **Elbow & Wrist Alignment**: Excessive elbow flexion (>120°) or wrist extension (>20°).
4. **Lumbar Curve**: Flattened lower back signaling muscle imbalances.
5. **Pelvic Tilt**: Posterior or anterior tilt correlating with disc pressure rises.
6. **Monitor Height**: Monitor top below eye level forcing upward gaze or forward lean.

**AGENTIC BEHAVIOR & TOOLS:**
- Use 'log_alert' ONLY for notable events ('posture', 'fall', 'emotion', 'system').
- Use 'log_observation' FREQUENTLY (every 10-20 seconds) to describe exactly what you see the user doing right now. This is a blank canvas where you write what is being observed.
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
  const [integrations, setIntegrations] = useState<{ google: boolean }>({ google: false });
  const [postureScore, setPostureScore] = useState(100);
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [currentReportMarkdown, setCurrentReportMarkdown] = useState<string>("");
  const [sessionDuration, setSessionDuration] = useState(0);
  const [hasSessionData, setHasSessionData] = useState(false);
  const prevConnectedRef = useRef(false);
  const prevPausedRef = useRef(false);
  const reportInitiatedRef = useRef(false);

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

    // Update posture score if it's a posture alert
    if (type === 'posture') {
      setPostureScore(prev => {
        const deduction = severity === 'high' ? 15 : severity === 'medium' ? 8 : 4;
        return Math.max(0, prev - deduction);
      });
    }

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

  const handleObservation = useCallback((text: string) => {
    if (isPaused) return;
    setObservations(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      text
    }].slice(-50)); // Keep last 50 observations
  }, [isPaused]);

  const { isConnected, isConnecting, connect, disconnect, sendMedia, error } = useGeminiLive(
    SYSTEM_INSTRUCTION,
    handleAlert,
    handleObservation
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

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (isConnected && !isPaused) {
      interval = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    } else if (!isConnected) {
      setSessionDuration(0);
    }
    return () => clearInterval(interval);
  }, [isConnected, isPaused]);

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
        const res = await fetch("/api/user/integrations");
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
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (e) {
      console.error("Failed to get auth URL", e);
    }
  };

  const handleLogout = async () => {
    try {
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

  // Monitor session state changes to trigger report prompt
  useEffect(() => {
    const sessionStopped = prevConnectedRef.current && !isConnected;
    const sessionPaused = !prevPausedRef.current && isPaused && isConnected;

    // Trigger prompt if session stops or pauses, and we have data
    if ((sessionStopped || sessionPaused) && hasSessionData && !isGeneratingReport && !reportInitiatedRef.current) {
      setShowReportPrompt(true);
    }

    // Reset initiation flag when session is fully disconnected
    if (!isConnected) {
      reportInitiatedRef.current = false;
    }

    prevConnectedRef.current = isConnected;
    prevPausedRef.current = isPaused;
  }, [isConnected, isPaused, alerts.length, isGeneratingReport]);

  // Recovery logic for posture score
  useEffect(() => {
    if (!isConnected || isPaused) return;
    
    const interval = setInterval(() => {
      setPostureScore(prev => Math.min(100, prev + 1));
    }, 10000); // Recover 1% every 10 seconds

    return () => clearInterval(interval);
  }, [isConnected, isPaused]);

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
      setPostureScore(100);
    } else {
      // Reinitialize logs and score for new session
      setAlerts([]);
      setPostureScore(100);
      setHasSessionData(false);
      
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
          .then(() => connect())
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
    if (!currentReportMarkdown) return;
    
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    
    doc.setFontSize(18);
    doc.setTextColor(0, 128, 128);
    doc.text("MISI SYSTEMS - LIVE REPORT", margin, 20);
    
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

      if (line.startsWith('# ')) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        const text = line.replace('# ', '');
        doc.text(text, margin, y);
        y += 10;
      } else if (line.startsWith('## ')) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        const text = line.replace('## ', '');
        doc.text(text, margin, y);
        y += 8;
      } else if (line.trim() === '') {
        y += 5;
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Activity className="w-8 h-8 text-emerald-500 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-zinc-900/50 border border-white/5 p-8 rounded-3xl backdrop-blur-xl text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mx-auto mb-6">
            <Mail className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-4 tracking-tight">Email Not Verified</h2>
          <p className="text-sm text-white/60 mb-8 leading-relaxed">
            We have sent you a verification email to <span className="text-emerald-500 font-mono">{user.email}</span>. Please verify it and log in.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => signOut(auth)}
              className="w-full bg-white text-black font-semibold py-2.5 rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
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
              className="w-full bg-white/5 text-white/60 font-medium py-2.5 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-xs"
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
        userId={user?.uid || ""}
        isOpen={showReportPrompt}
        onClose={() => setShowReportPrompt(false)}
        onSuccess={() => {
          // Optional: Show a success toast or sound
        }}
        onGeneratingStateChange={(isGenerating) => {
          setIsGeneratingReport(isGenerating);
          if (isGenerating) setCurrentReportMarkdown("");
        }}
        onMarkdownUpdate={setCurrentReportMarkdown}
      />
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Shield className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">MISI</h1>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Safety Sentinel v2.5</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {typeof chrome !== 'undefined' && chrome.runtime && (
            <span className="text-[10px] font-mono text-emerald-500/60 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10">
              EXTENSION MODE
            </span>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
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

          <div className="w-px h-4 bg-white/10 mx-2" />

          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
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
              isActive={isConnected && !isPaused} 
              onFrame={handleFrame} 
            />
            
            <AnimatePresence>
              {(!isConnected && !isConnecting) ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl"
                >
                  <div className="text-center">
                    <BrainCircuit className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">Initialize Misi</h3>
                    <p className="text-sm text-white/40 mb-6 max-w-xs mx-auto">
                      Connect to start real-time posture monitoring and fall detection.
                    </p>
                    <button 
                      onClick={connect}
                      className="px-6 py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-zinc-200 transition-colors"
                    >
                      Start Monitoring
                    </button>
                  </div>
                </motion.div>
              ) : isConnected && (
                <div className="absolute top-6 right-6 flex items-center gap-3">
                  <button 
                    onClick={() => setIsPaused(!isPaused)}
                    className={`px-4 py-2 rounded-full text-[10px] font-mono flex items-center gap-2 transition-all ${
                      isPaused 
                      ? 'bg-amber-500 text-black animate-pulse' 
                      : 'bg-black/40 text-white/60 hover:bg-black/60 backdrop-blur-md border border-white/10'
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

                  <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2">
                    <Clock className="w-3 h-3 text-white/40" />
                    <span className="text-[10px] font-mono text-white/80 tracking-widest">{formatDuration(sessionDuration)}</span>
                  </div>

                  <div className="px-4 py-2 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 rounded-full flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-emerald-500 tracking-widest">LIVE</span>
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
              trend={postureScore < 100 ? "+1%" : undefined}
              active={isConnected}
            />
            <StatusCard 
              icon={<BrainCircuit className="w-4 h-4" />}
              label="Emotional State"
              value="Calm"
              active={isConnected}
            />
            <StatusCard 
              icon={<Bell className="w-4 h-4" />}
              label="Alert Status"
              value="Nominal"
              active={isConnected}
            />
          </div>

          {/* Workspace Integrations */}
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-white/40">Workspace Integration</h2>
              {!integrations.google && (
                <button 
                  onClick={handleConnectGoogle}
                  className="flex items-center gap-2 text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  CONNECT GOOGLE
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <IntegrationItem 
                icon={<Calendar className="w-4 h-4" />}
                label="Calendar"
                connected={integrations.google}
              />
              <IntegrationItem 
                icon={<CheckSquare className="w-4 h-4" />}
                label="Tasks"
                connected={integrations.google}
              />
              <IntegrationItem 
                icon={<FileText className="w-4 h-4" />}
                label="Docs"
                connected={integrations.google}
              />
            </div>
          </div>

          {/* Live Monitoring Data */}
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-6 flex flex-col h-64">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-white/40">Live Monitoring Data</h2>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected && !isPaused ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
                <span className="text-[10px] font-mono text-white/40">
                  {isConnected && !isPaused ? 'OBSERVING' : 'IDLE'}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs text-white/60 space-y-3 custom-scrollbar pr-2">
              {observations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20">
                  <Activity className="w-6 h-6 mb-2 opacity-50" />
                  <p>Awaiting visual data...</p>
                </div>
              ) : (
                observations.map((obs, i) => (
                  <div key={i} className="flex gap-3 border-b border-white/5 pb-3 last:border-0">
                    <span className="text-emerald-500/50 shrink-0">[{obs.timestamp}]</span>
                    <span className="leading-relaxed">{obs.text}</span>
                  </div>
                ))
              )}
              <div ref={observationsEndRef} />
            </div>
          </div>

          {/* Voice Interaction Area */}
          <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-white/40">Voice Assistant</h2>
              <button 
                onClick={() => setIsMicActive(!isMicActive)}
                className={`p-2 rounded-lg transition-colors ${isMicActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-white/40'}`}
              >
                {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="relative">
                <div className={`absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full transition-opacity duration-500 ${isConnected ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  isConnected ? 'border-emerald-500 scale-110 shadow-[0_0_40px_rgba(16,185,129,0.2)]' : 'border-white/10'
                }`}>
                  <Activity className={`w-8 h-8 ${isConnected ? 'text-emerald-500' : 'text-white/10'}`} />
                </div>
              </div>
              <p className="mt-6 text-sm font-mono text-white/40 animate-pulse">
                {isConnected ? 'Listening for voice commands...' : 'Awaiting connection...'}
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
              <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-white/40">Analysis Report</h2>
              <span className="text-[10px] font-mono text-white/20">
                {isGeneratingReport ? 'Live Generation' : currentReportMarkdown ? 'Report Ready' : 'Awaiting Data'}
              </span>
            </div>

            <div className="flex-1 bg-zinc-900/50 border border-white/5 rounded-2xl flex flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {(!isGeneratingReport && !currentReportMarkdown) ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center py-12 border border-dashed border-white/5 rounded-2xl m-4"
                  >
                    <FileText className="w-8 h-8 text-white/10 mb-3" />
                    <p className="text-xs font-mono text-white/30">No active report...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-white/80">Live AI Report</h3>
                          <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                            {isGeneratingReport ? 'Generating...' : 'Report Ready'}
                          </p>
                        </div>
                      </div>
                      {currentReportMarkdown && (
                        <button 
                          onClick={downloadMarkdownAsPDF}
                          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-black rounded-lg text-[10px] font-mono hover:bg-emerald-400 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          DOWNLOAD PDF
                        </button>
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                      <div className="markdown-body prose prose-invert prose-sm max-w-none">
                        <Markdown>{currentReportMarkdown || "_Initializing analysis engine..._"}</Markdown>
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
      <footer className="h-12 border-t border-white/5 flex items-center justify-between px-6 bg-black/20 text-[10px] font-mono text-white/20">
        <div className="flex items-center gap-4">
          <span>LATENCY: 142MS</span>
          <span>FPS: 30</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-emerald-500" />
            ENCRYPTED
          </span>
          <span>© 2026 MISI SYSTEMS</span>
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
    <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-white/40">{icon}</div>
        {trend && <span className="text-[10px] font-mono text-emerald-500">{trend}</span>}
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/30">{label}</p>
        <p className={`text-lg font-medium ${active ? 'text-white' : 'text-white/10'}`}>
          {active ? value : '---'}
        </p>
      </div>
    </div>
  );
}

function IntegrationItem({ icon, label, connected }: { icon: React.ReactNode, label: string, connected: boolean }) {
  return (
    <div className={`p-4 rounded-xl border transition-all ${
      connected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-white/5 grayscale opacity-50'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`${connected ? 'text-emerald-500' : 'text-white/40'}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-white/80">{label}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${connected ? 'text-emerald-500/60' : 'text-white/20'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {connected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      </div>
    </div>
  );
}
