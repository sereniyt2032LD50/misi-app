import { Alert, AlertGroup } from "../types";
import { format } from "date-fns";
import { AlertCircle, Activity, User, ShieldAlert, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AlertLogProps {
  groups: AlertGroup[];
}

export function AlertLog({ groups }: AlertLogProps) {
  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.2em] font-mono text-white/40">Safety Log</h2>
        <span className="text-[10px] font-mono text-white/20">{groups.length} Active Groups</span>
      </div>

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
          groups.map((group) => (
            <motion.div
              key={group.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4 text-white/60" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white/80">{group.title}</h3>
                    <p className="text-[10px] font-mono text-white/30">
                      Last updated {format(group.lastUpdated, "HH:mm:ss")}
                    </p>
                  </div>
                </div>
                <div className="px-2 py-1 rounded-full bg-white/5 text-[10px] font-mono text-white/40">
                  {group.alerts.length} events
                </div>
              </div>
              
              <div className="divide-y divide-white/5">
                {group.alerts.map((alert) => (
                  <div key={alert.id} className="p-4 flex items-start gap-4 hover:bg-white/[0.01] transition-colors">
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                      alert.severity === 'high' ? 'bg-red-500' : 
                      alert.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/70 leading-relaxed">{alert.message}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-[10px] font-mono text-white/20">
                          {format(alert.timestamp, "HH:mm:ss")}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                          {alert.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}
