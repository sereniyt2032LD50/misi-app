import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X, MessageSquare, Loader2, Square } from "lucide-react";
import { generateAIReport } from "../services/reportService";

interface ReportPromptModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onGeneratingStateChange?: (isGenerating: boolean) => void;
  onMarkdownUpdate?: (markdown: string) => void;
}

export function ReportPromptModal({ 
  userId, 
  isOpen, 
  onClose, 
  onSuccess,
  onGeneratingStateChange,
  onMarkdownUpdate
}: ReportPromptModalProps) {
  const [personalNote, setPersonalNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    onGeneratingStateChange?.(false);
    setError("Report generation stopped by user.");
  };

  const handleGenerate = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    onGeneratingStateChange?.(true);
    setError(null);
    try {
      await generateAIReport(userId, personalNote, setStatus, onMarkdownUpdate, controller.signal);
      onSuccess();
      onClose();
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(err.message || "Failed to generate report");
        setIsGenerating(false);
        onGeneratingStateChange?.(false);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
        onGeneratingStateChange?.(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={!isGenerating ? onClose : undefined}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-[100px] rounded-full" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Sparkles className="w-6 h-6 text-emerald-500" />
                </div>
                {!isGenerating && (
                  <button 
                    onClick={onClose}
                    className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <h2 className="text-2xl font-semibold text-white mb-2 tracking-tight">Generate Session Report?</h2>
              <p className="text-sm text-white/40 mb-8 leading-relaxed">
                Your monitoring session has ended. Would you like Misi to analyze your postural patterns and generate a detailed health report?
              </p>

              <div className="space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-mono text-white/20 uppercase tracking-widest mb-3">
                    <MessageSquare className="w-3 h-3" />
                    Add Personal Note (Optional)
                  </label>
                  <textarea 
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    disabled={isGenerating}
                    placeholder="e.g., I felt some neck strain today..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/10 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none h-24"
                  />
                </div>

                {error && (
                  <p className="text-[10px] font-mono text-red-500 uppercase">{error}</p>
                )}

                {isGenerating ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-emerald-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-[10px] font-mono uppercase tracking-widest animate-pulse">
                          {status}
                        </span>
                      </div>
                      <button 
                        onClick={handleStop}
                        className="flex items-center gap-2 text-[10px] font-mono text-red-500 hover:text-red-400 transition-colors"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        STOP
                      </button>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 10, ease: "linear" }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={handleGenerate}
                      className="w-full py-4 bg-emerald-500 text-black rounded-2xl text-sm font-semibold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10"
                    >
                      Generate AI Report
                    </button>
                    <button 
                      onClick={onClose}
                      className="w-full py-4 bg-white/5 text-white/60 rounded-2xl text-sm font-medium hover:bg-white/10 transition-all"
                    >
                      Skip for now
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
