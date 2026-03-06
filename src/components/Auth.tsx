import { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile
} from "firebase/auth";
import { auth } from "../firebase";
import { Shield, Mail, Lock, Loader2, CheckCircle, User as UserIcon } from "lucide-react";
import { motion } from "motion/react";

export function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        await sendEmailVerification(userCredential.user);
        await signOut(auth); // Sign out immediately as per requirement
        setVerificationSent(true);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth error:", err.code, err.message);
      if (err.code === "auth/email-already-in-use") {
        setError("User already exists. Please sign in");
      } else if (
        err.code === "auth/invalid-credential" || 
        err.code === "auth/user-not-found" || 
        err.code === "auth/wrong-password"
      ) {
        setError("Email or password is incorrect");
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-zinc-900/50 border border-white/5 p-8 rounded-3xl backdrop-blur-xl text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-4 tracking-tight">Verify Your Email</h2>
          <p className="text-sm text-white/60 mb-8 leading-relaxed">
            We have sent you a verification email to <span className="text-emerald-500 font-mono">{email}</span>. Please verify it and log in.
          </p>
          <button
            onClick={() => {
              setVerificationSent(false);
              setIsSignUp(false);
            }}
            className="w-full bg-white text-black font-semibold py-2.5 rounded-xl hover:bg-zinc-200 transition-all"
          >
            RETURN TO LOGIN
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900/50 border border-white/5 p-8 rounded-3xl backdrop-blur-xl"
      >
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Shield className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-white">MISI</h1>
            <p className="text-xs font-mono text-white/30 uppercase tracking-widest">Safety Sentinel v2.5</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/40 ml-1">Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  placeholder="John Doe"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] font-mono text-red-400 text-center uppercase tracking-wider"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-black font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              isSignUp ? "CREATE ACCOUNT" : "SIGN IN"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
