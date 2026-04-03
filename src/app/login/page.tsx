"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, ArrowRight, CheckCircle2, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import md5 from "blueimp-md5";
import { SessionUser } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

export default function LoginPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  const triggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const tokenEmail = params.get("email");
        const token = params.get("token");
        if (tokenEmail) setEmail(tokenEmail);
        
        // 如果有 email 和 token，且尚未进入验证码步骤，且从未触发过
        if (tokenEmail && token && step === "email" && !isLoading && !triggeredRef.current) {
            triggeredRef.current = true;
            const autoTrigger = async () => {
                setIsLoading(true);
                try {
                    const res = await fetch("/api/auth/send-code", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: tokenEmail }),
                    });
                    if (res.ok) {
                        setStep("code");
                        setTimer(60);
                        showToast("欢迎加入！验证码已发送至您的邮箱", "success");
                    }
                } finally {
                    setIsLoading(false);
                }
            };
            autoTrigger();
        }
    }
  }, [isLoading, showToast, step]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => setTimer((p) => p - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

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
        if (res.status === 401) {
            setIsContactModalOpen(true);
        } else {
            showToast(data.error || "发送失败", "error");
        }
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
        // 获取 URL 里的 callbackUrl
        const params = new URLSearchParams(window.location.search);
        let targetUrl = params.get("callbackUrl");

        if (!targetUrl) {
            // 如果没有明确的目的地，查一下当前用户的权限决定默认去哪
            try {
                const meRes = await fetch("/api/auth/me");
                if (meRes.ok) {
                    const meData = await meRes.json();
                    const user = meData.user;
                    if (user) {
                        const hasProductRead = hasPermission(user as SessionUser, "product:read");
                        
                        // 只有超管或具备查看商品权限的才能进后台首页，否则默认进相册
                        targetUrl = hasProductRead ? "/" : "/gallery";
                    } else {
                        targetUrl = "/gallery";
                    }
                } else {
                    targetUrl = "/gallery";
                }
            } catch {
                targetUrl = "/gallery";
            }
        }
        
        // Use window.location for hard refresh to ensure all states (sidebar, middleware) are clean
        window.location.href = targetUrl || "/"; 
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
    <div className="flex flex-col min-h-dvh w-full sm:items-center items-start justify-center bg-background relative overflow-y-auto overflow-x-hidden py-10 sm:py-0">
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10 px-4 mt-16 sm:mt-0"
      >
        <div className="relative glass border-white/10 shadow-2xl rounded-[2.5rem] p-10 overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className="inline-flex items-center justify-center mb-6"
            >
              <Image 
                src="/picknote.png" 
                alt="PickNote 图标" 
                width={140} 
                height={50} 
                priority
                className="object-contain drop-shadow-md hover:scale-105 transition-transform duration-300" 
              />
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70"
            >
              PickNote
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-3 text-muted-foreground text-lg"
            >
              安全登录您的账户
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
                    <label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground/60 ml-1">登录邮箱</label>
                    <div className="relative group/input">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/input:text-primary transition-colors" size={18} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl bg-white/5 pl-12 pr-4 py-4 text-foreground outline-none border border-white/10 transition-all focus:bg-white/10 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/30"
                        placeholder="admin@example.com"
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
                    
                  <div className="text-center text-xs text-muted-foreground/60 mt-4 flex flex-col items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span>未注册邮箱将无法获取验证码，</span>
                        <button 
                            type="button"
                            onClick={() => setIsContactModalOpen(true)}
                            className="text-primary/70 hover:text-primary transition-colors border-b border-primary/30 hover:border-primary border-dashed pb-0.5 active:scale-95"
                        >
                            请联系管理员
                        </button>
                      </div>


                  </div>

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
                                <span>正在同步空间...</span>
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

      {/* Contact Admin Modal */}
      <AnimatePresence>
        {isContactModalOpen && (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-100 flex items-center justify-center p-4 backdrop-blur-sm sm:backdrop-blur-xl bg-black/20 dark:bg-black/60"
                onClick={() => setIsContactModalOpen(false)}
            >
                  <motion.div 
                      initial={{ scale: 0.9, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.9, opacity: 0, y: 20 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-sm bg-background/80 dark:bg-zinc-900/90 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 shadow-3xl rounded-[2.5rem] px-8 pt-8 pb-6 flex flex-col items-center gap-5 relative overflow-hidden"
                  >
                      <div className="absolute inset-0 bg-linear-to-b from-primary/10 to-transparent pointer-events-none" />
                      
                      <div className="relative">
                          <div className="w-[76px] h-[76px] rounded-full border-4 border-primary/20 p-1 shadow-2xl shadow-primary/20">
                              <div className="relative w-full h-full rounded-full overflow-hidden bg-primary/10">
                                <Image 
                                    src={`https://cravatar.cn/avatar/${md5("2237608602@qq.com")}?d=mp`} 
                                    alt="管理员头像"
                                    fill
                                    sizes="80px"
                                    className="object-cover"
                                />
                              </div>
                          </div>
                          <div className="absolute -bottom-1 -right-1 bg-green-500 w-[18px] h-[18px] rounded-full border-[3px] border-white dark:border-zinc-900" />
                      </div>

                      <div className="text-center space-y-1.5 relative z-10">
                          <h2 className="text-2xl font-black tracking-tighter text-foreground">联系管理员</h2>
                          <p className="text-sm text-muted-foreground px-4 leading-relaxed font-medium">
                            您的<span className="font-black text-foreground">邮箱</span>尚未获得访问授权
                            <br />
                            请添加<span className="font-black text-foreground">管理员微信</span>进行申请
                          </p>
                      </div>

                      <div className="w-full space-y-3.5 relative z-10">
                          <div className="bg-zinc-50 dark:bg-white/5 rounded-2xl px-4 py-3.5 border border-zinc-100 dark:border-white/5 flex flex-col items-center gap-1.5 group/wechat">
                              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/60">管理员微信号</span>
                              <span className="text-xl font-mono font-bold text-primary select-all tracking-wider">Sube3494</span>
                          </div>

                          <div className="relative aspect-square w-full max-w-[156px] mx-auto bg-white rounded-2xl p-2.5 shadow-2xl group/qr ring-1 ring-zinc-100 dark:ring-white/10">
                               <Image 
                                  src="/wechat.png" 
                                  alt="微信二维码" 
                                  fill 
                                  sizes="156px" 
                                  className="object-cover rounded-xl" 
                                  priority
                                  unoptimized 
                              />
                          </div>
                      </div>

                      <button 
                          onClick={() => setIsContactModalOpen(false)}
                          className="mt-1 w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                      >
                          知道了
                      </button>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
