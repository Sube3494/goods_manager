"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Lock, Mail, ArrowRight, CheckCircle2, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => setTimer((p) => p - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
        showToast("请输入邮箱地址", "error");
        return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setStep("code");
        setTimer(60);
        showToast("验证码已发送，请查收邮件", "success");
      } else {
        showToast(data.error || "发送失败", "error");
      }
    } catch {
      showToast("网络错误，请稍后重试", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
        showToast("请输入6位验证码", "error");
        return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast("登录成功", "success");
        // Use window.location for hard refresh to ensure all states (sidebar, middleware) are clean
        window.location.href = "/"; 
      } else {
        showToast(data.error || "登录失败", "error");
      }
    } catch {
      showToast("网络错误，请稍后重试", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background relative overflow-hidden">
        {/* Dynamic Background */}
        <div className="absolute inset-0 w-full h-full bg-grid-white/[0.02] -z-10" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div 
                animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                    rotate: [0, 90, 0]
                }}
                transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                className="absolute -top-[20%] -left-[10%] w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] transform-gpu will-change-transform" 
            />
            <motion.div 
                animate={{ 
                    scale: [1, 1.1, 1],
                    opacity: [0.2, 0.4, 0.2],
                    x: [0, 50, 0],
                    y: [0, -50, 0]
                }}
                transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[40%] right-[10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px] transform-gpu will-change-transform" 
            />
            <motion.div 
                 animate={{ 
                    opacity: [0.1, 0.3, 0.1],
                    scale: [1, 1.3, 1]
                }}
                transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-[20%] left-[20%] w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] transform-gpu will-change-transform hidden md:block" 
            />
        </div>

      {/* Back Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute top-6 left-4 sm:top-8 sm:left-8 z-20"
      >
        <Link 
            href="/gallery" 
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group px-4 py-2 rounded-full hover:bg-white/5 backdrop-blur-sm border border-transparent hover:border-white/10"
        >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">返回实物相册</span>
        </Link>
      </motion.div>

      {/* Theme Toggle */}
      <div className="absolute top-6 right-4 sm:top-8 sm:right-8 z-20">
        <ThemeToggle />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10 px-4"
      >
        <div className="relative glass border-white/10 shadow-2xl rounded-[2.5rem] p-10 overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-blue-600 mb-6 shadow-lg shadow-blue-500/30"
            >
              <Lock className="h-8 w-8 text-white" />
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70"
            >
              PickNote Admin
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-3 text-muted-foreground text-lg"
            >
              安全登录您的管理控制台
            </motion.p>
          </div>

          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {step === "email" ? (
                <motion.form 
                    key="email-form"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    onSubmit={handleSendCode} 
                    className="space-y-6"
                >
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground/60 ml-1">管理员邮箱</label>
                    <div className="relative group/input">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/input:text-primary transition-colors" size={18} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl bg-white/5 pl-12 pr-4 py-4 text-foreground outline-none border border-white/10 transition-all focus:bg-white/10 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/30"
                        placeholder="name@company.com"
                        autoFocus
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full overflow-hidden rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
                  >
                    <div className="relative z-10 flex items-center justify-center gap-2">
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>发送验证码...</span>
                            </>
                        ) : (
                            <>
                                <span>获取验证码</span>
                                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
                            </>
                        )}
                    </div>
                    <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent z-0" />
                  </button>
                    
                  <p className="text-center text-xs text-muted-foreground/60 mt-4">
                        未注册邮箱将无法获取验证码，请联系管理员。
                  </p>
                </motion.form>
              ) : (
                <motion.form 
                    key="code-form"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    onSubmit={handleLogin} 
                    className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">验证身份</h3>
                            <p className="text-xs text-muted-foreground">已发送至 {email}</p>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => setStep("email")}
                            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20"
                        >
                            更换
                        </button>
                    </div>
                    
                    <div className="relative group/input">
                      <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/input:text-primary transition-colors" size={18} />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full rounded-2xl bg-white/5 font-mono text-2xl tracking-[0.5em] text-center py-4 text-foreground outline-none border border-white/10 transition-all focus:bg-white/10 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/20"
                        placeholder="000000"
                        autoFocus
                      />
                    </div>
                    
                    <div className="flex justify-center">
                        {timer > 0 ? (
                            <div className="text-xs text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full flex items-center gap-2">
                                <Loader2 size={12} className="animate-spin text-primary" />
                                <span>{timer} 秒后可重新发送</span>
                            </div>
                        ) : (
                            <button 
                                type="button"
                                onClick={handleSendCode}
                                className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 font-medium transition-colors group/retry"
                            >
                                <RefreshCw size={12} className="group-hover/retry:rotate-180 transition-transform duration-500" />
                                重新发送验证码
                            </button>
                        )}
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full overflow-hidden rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
                  >
                     <div className="relative z-10 flex items-center justify-center gap-2">
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>验证登录中...</span>
                            </>
                        ) : (
                            <>
                                <span>进入系统</span>
                                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
                            </>
                        )}
                    </div>
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center"
        >
            <p className="text-xs text-muted-foreground opacity-60">
                &copy; {new Date().getFullYear()} PickNote · 此系统仅限授权人员访问
            </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
