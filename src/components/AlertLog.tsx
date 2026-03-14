import { Alert, AlertGroup } from "../types";
import { format } from "date-fns";
import { AlertCircle, Activity, User, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

interface AlertLogProps {
  groups: AlertGroup[];
}

function AlertGroupItem({ group, defaultExpanded = false }: { group: AlertGroup, defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden flex flex-col"
    >
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left w-full"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4 text-white/60" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white/80 truncate">{group.title}</h3>
            <p className="text-[10px] font-mono text-white/30 truncate">
              Last updated {format(group.lastUpdated, "HH:mm:ss")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 pl-2">
          <div className="px-2 py-1 rounded-full bg-white/5 text-[10px] font-mono text-white/40">
            {group.alerts.length} events
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </div>
      </button>
      
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
              {group.alerts.map((alert) => (
                <div key={alert.id} className="p-4 flex items-start gap-4 hover:bg-white/[0.01] transition-colors">
                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    alert.severity === 'high' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                    alert.severity === 'medium' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 leading-relaxed break-words">{alert.message}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-[10px] font-mono text-white/30">
                        {format(alert.timestamp, "HH:mm:ss")}
                      </span>
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                        alert.severity === 'high' ? 'bg-red-500/10 text-red-400' : 
                        alert.severity === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {alert.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function AlertLog({ groups }: AlertLogProps) {
  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-white/40">Safety Log</h2>
        <span className="text-[10px] font-mono text-white/20">{groups.length} Active Groups</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {groups.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 border border-dashed border-white/5 rounded-2xl"
            >
              <Activity className="w-8 h-8 text-white/10 mb-3" />
              <p className="text-xs font-mono text-white/30">Monitoring for activity...</p>
            </motion.div>
          ) : (
            groups.map((group, index) => (
              <AlertGroupItem key={group.id} group={group} defaultExpanded={index === 0} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
