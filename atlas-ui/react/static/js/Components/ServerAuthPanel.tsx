// atlas-ui/react/static/js/Components/ServerAuthPanel.tsx
// Small server-mode account panel: login/register/logout, no separate page.

import React, { useEffect, useState } from "react";
import { ServerApi } from "../Utils/ServerApi.tsx";

const ServerAuthPanel: React.FC = () => {
  const status = ServerApi.accountStatus();
  const loggedIn = status !== "guest";
  const [open, setOpen] = useState(!loggedIn);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const requireLogin = () => setOpen(true);
    window.addEventListener("atlas:login-required", requireLogin);
    return () => window.removeEventListener("atlas:login-required", requireLogin);
  }, []);

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (tab === "login") {
        await ServerApi.login(email.trim(), password);
      } else {
        await ServerApi.register(email.trim(), password, displayName.trim());
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "认证失败");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await ServerApi.logout();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-[70] px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/90 border border-cyan-500/40 text-cyan-200 hover:bg-slate-800 shadow-lg"
      >
        {loggedIn ? `账号 · ${status}` : "登录 / 注册"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-sm rounded-xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-cyan-200">服务端账号</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            {loggedIn ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-300">当前已登录（{status}）。</p>
                <button
                  onClick={() => void logout()}
                  disabled={busy}
                  className="w-full py-2 rounded bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-40"
                >
                  退出登录
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1 rounded bg-white/5 p-1">
                  <button
                    onClick={() => setTab("login")}
                    className={`py-1 rounded text-xs ${tab === "login" ? "bg-cyan-600 text-white" : "text-gray-400"}`}
                  >
                    登录
                  </button>
                  <button
                    onClick={() => setTab("register")}
                    className={`py-1 rounded text-xs ${tab === "register" ? "bg-cyan-600 text-white" : "text-gray-400"}`}
                  >
                    注册
                  </button>
                </div>

                {tab === "register" && (
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="舰长名（必填）"
                    maxLength={24}
                    className="w-full text-xs bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-100"
                  />
                )}
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="邮箱"
                  type="email"
                  className="w-full text-xs bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-100"
                />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={tab === "register" ? "密码（至少 10 位）" : "密码"}
                  type="password"
                  className="w-full text-xs bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-100"
                />
                <button
                  onClick={() => void submit()}
                  disabled={busy || !email.trim() || !password || (tab === "register" && !displayName.trim())}
                  className="w-full py-2 rounded bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold disabled:opacity-40"
                >
                  {busy ? "处理中…" : tab === "login" ? "登录" : "注册并登录"}
                </button>
                <p className="text-[10px] text-gray-500">
                  可以先关闭窗口浏览；采集、扫描、交易、战斗等操作会要求登录。
                </p>
              </div>
            )}

            {message && <p className="mt-2 text-[11px] text-red-300">{message}</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default ServerAuthPanel;
