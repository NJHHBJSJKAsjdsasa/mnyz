// atlas-ui/react/static/js/Components/ServerAuthPanel.tsx
// Server-mode account panel: login / register / logout, no separate page.
//
// 2026-10-29 (B 组换壳, 05 §3):
//   * the dialog is now `ui/Modal` — same overlay token as every other dialog,
//     Esc closes it, focus is trapped, and it no longer re-implements a backdrop;
//   * it starts **closed**. It used to start open for every guest, so the very
//     first thing a new player saw on the home page was a login box covering the
//     coordinate selector — the page could not be used until it was dismissed.
//     Guests still get it forced open the moment an action needs auth, via the
//     existing `atlas:login-required` event;
//   * inputs and the submit button come from `ui/`, so the form matches the panels.

import React, { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal } from "../ui/Modal.tsx";

let mountedRoot: Root | null = null;

/**
 * Mount the account dialog on a page that does not render it declaratively.
 *
 * Only `__main__` used to include `<ServerAuthPanel/>`, so on `/galaxy`,
 * `/system/<n>` and `/planet/<name>` the `atlas:login-required` event had **no
 * listener at all** — a guest clicking "next galaxy" got nothing: no request, no
 * dialog, no toast. Game pages now call this next to `ensureEconomyShell()`.
 */
export function ensureAuthPanel(): void {
  if (mountedRoot || typeof document === "undefined") return;
  if (document.getElementById("atlas-auth-panel")) return;
  const host = document.createElement("div");
  host.id = "atlas-auth-panel";
  document.body.appendChild(host);
  mountedRoot = createRoot(host);
  mountedRoot.render(<ServerAuthPanel />);
}

/** Open the account dialog from anywhere (header trigger, 401 handler, …). */
export const openAuthDialog = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("atlas:login-required"));
};

/** The header's account entry. Lives next to the dialog so both read one status. */
export const AuthButton: React.FC = () => {
  const status = ServerApi.accountStatus();
  const loggedIn = status !== "guest";
  return (
    <Button
      size="sm"
      variant={loggedIn ? "secondary" : "primary"}
      onClick={openAuthDialog}
      title={loggedIn ? `已登录：${status}` : "登录或注册服务端账号"}
    >
      {loggedIn ? `账号 · ${status}` : "登录 / 注册"}
    </Button>
  );
};

const ServerAuthPanel: React.FC = () => {
  const status = ServerApi.accountStatus();
  const loggedIn = status !== "guest";
  const [open, setOpen] = useState(false);
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

  const canSubmit = Boolean(email.trim() && password && (tab === "login" || displayName.trim()));

  return (
    <>
      <Modal
        open={open}
        title="服务端账号"
        onClose={() => setOpen(false)}
        width={360}
        dismissible={!busy}
        footer={
          loggedIn ? null : (
            <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
              可以先关闭窗口浏览；采集、扫描、交易、战斗等操作会要求登录。
            </span>
          )
        }
      >
        {loggedIn ? (
          <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
            <p style={{ fontSize: "var(--atlas-t-small)", color: "var(--atlas-n-800)" }}>
              当前已登录（{status}）。
            </p>
            <Button variant="danger" block loading={busy} onClick={() => void logout()}>
              退出登录
            </Button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
            <div
              role="tablist"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
                padding: 2,
                background: "var(--atlas-plate-2)",
                borderRadius: "var(--atlas-r-md)",
              }}
            >
              {(["login", "register"] as const).map((id) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  style={{
                    height: 26,
                    border: "none",
                    borderRadius: "var(--atlas-r-sm)",
                    background: tab === id ? "var(--atlas-signal)" : "transparent",
                    color: tab === id ? "var(--atlas-void)" : "var(--atlas-n-700)",
                    fontFamily: "var(--atlas-font)",
                    fontSize: "var(--atlas-t-small)",
                    fontWeight: tab === id ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {id === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>

            {tab === "register" ? (
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="舰长名（必填）"
                maxLength={24}
                aria-label="舰长名"
              />
            ) : null}
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="邮箱"
              type="email"
              aria-label="邮箱"
            />
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={tab === "register" ? "密码（至少 10 位）" : "密码"}
              type="password"
              aria-label="密码"
            />
            <Button block loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
              {tab === "login" ? "登录" : "注册并登录"}
            </Button>
            {message ? (
              <span role="alert" style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>
                {message}
              </span>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
};

export default ServerAuthPanel;
