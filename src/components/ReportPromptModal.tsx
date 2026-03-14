import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X, MessageSquare } from "lucide-react";

interface ReportPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (personalNote: string) => void;
}

export function ReportPromptModal({ 
  isOpen, 
  onClose, 
  onGenerate
}: ReportPromptModalProps) {
  const [personalNote, setPersonalNote] = useState("");

  const handleGenerate = () => {
    onGenerate(personalNote);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-black/20 dark:border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-[100px] rounded-full" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Sparkles className="w-5 h-5 text-emerald-500" />
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-black/10 dark:hover:bg-white/5 rounded-xl text-zinc-500 dark:text-white/20 hover:text-zinc-900 dark:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2 tracking-tight">Generate Session Report?</h2>
              <p className="text-sm text-zinc-600 dark:text-white/40 mb-6 leading-relaxed">
                Would you like to add additional information before generating the report?
              </p>

              <div className="space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 dark:text-white/20 uppercase tracking-widest mb-2">
                    <MessageSquare className="w-3 h-3" />
                    Additional Information (Optional)
                  </label>
                  <textarea 
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    placeholder="e.g., I felt some neck strain today..."
                    className="w-full bg-black/10 dark:bg-white/5 border border-black/20 dark:border-white/10 rounded-2xl p-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:text-white/10 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none h-20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <button 
                    onClick={handleGenerate}
                    className="w-full py-3 bg-emerald-500 text-black rounded-2xl text-sm font-semibold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10"
                  >
                    Generate Report
                  </button>
                  <button 
                    onClick={onClose}
                    className="w-full py-3 bg-black/10 dark:bg-white/5 text-zinc-700 dark:text-white/60 rounded-2xl text-sm font-medium hover:bg-black/20 dark:hover:bg-white/10 transition-all"
                  >
                    Skip for now (Generate later)
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
