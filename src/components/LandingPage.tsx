import { motion } from "motion/react";
import { Shield, Activity, BrainCircuit, ArrowRight } from "lucide-react";

interface LandingPageProps {
  onLoginClick: () => void;
}

export function LandingPage({ onLoginClick }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-20 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-xl z-50 flex items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-b from-zinc-100 dark:from-zinc-800 to-zinc-200 dark:to-zinc-950 border border-black/20 dark:border-white/10 shadow-lg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
              <path d="M4 20V6C4 4.89543 4.89543 4 6 4H8L12 13L16 4H18C19.1046 4 20 4.89543 20 6V20" stroke="url(#emerald-gradient-nav)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="18" r="1.5" fill="#34d399" />
              <defs>
                <linearGradient id="emerald-gradient-nav" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#34d399" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider">Misi App</h1>
            <p className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.2em]">Sentinel Core</p>
          </div>
        </div>
        <button 
          onClick={onLoginClick}
          className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-full text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center gap-2"
        >
          Sign In
          <ArrowRight className="w-4 h-4" />
        </button>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-6 md:px-12 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono uppercase tracking-widest mb-8 border border-emerald-500/20"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          AI-Powered Postural Assistant
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold tracking-tight mb-8 max-w-4xl"
        >
          Your intelligent partner for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">health and productivity</span>.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-12 max-w-2xl leading-relaxed"
        >
          Misi App uses advanced AI to monitor your posture, analyze your emotional state, and seamlessly integrate with your workspace to keep you focused and healthy.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <button 
            onClick={onLoginClick}
            className="px-8 py-4 bg-emerald-500 text-black rounded-full text-lg font-semibold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-3"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 md:px-12 bg-zinc-100/50 dark:bg-zinc-900/50 border-y border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Core Capabilities</h2>
            <p className="text-zinc-600 dark:text-zinc-400">Everything you need to maintain a healthy workspace.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 p-8 rounded-3xl">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
                <Activity className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Postural Monitoring</h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Continuously analyzes your posture in real-time, detecting forward head posture, rounded shoulders, and providing immediate biofeedback.
              </p>
            </div>

            <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 p-8 rounded-3xl">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
                <BrainCircuit className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Emotion Awareness</h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Analyzes facial expressions and vocal tone to maintain high emotional awareness, adjusting its persona to be supportive when you need it.
              </p>
            </div>

            <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 p-8 rounded-3xl">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Workspace Integration</h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Connects with Google Calendar to act on your behalf, checking your availability and scheduling recovery breaks when you need them.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 md:px-12 border-t border-black/10 dark:border-white/10 text-center text-zinc-500 dark:text-zinc-400 text-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 Misi App. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="/privacy.html" className="hover:text-emerald-500 transition-colors">Privacy Policy</a>
            <a href="/terms.html" className="hover:text-emerald-500 transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
