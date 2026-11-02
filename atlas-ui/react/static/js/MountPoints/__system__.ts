// atlas-ui/react/static/js/MountPoints/__system__.ts
// Thin mount since P2 (16-shell-unification, 2026-10-31). See `__galaxy__.ts`.
import React from 'react';
import { createRoot } from 'react-dom/client';
import GameRouter from '../Shell/GameRouter.tsx';
import { ensureAuthPanel } from '../Components/ServerAuthPanel.tsx';
import { viewFromCurrentDocument } from '../Shell/viewData.ts';

document.addEventListener('DOMContentLoaded', () => {
  // 登录框必须在游戏页存在，否则 401 的 atlas:login-required 无人接收。
  ensureAuthPanel();

  const container = document.getElementById('atlas-react-root');
  const view = viewFromCurrentDocument();

  if (!container) return;

  if (!view) {
    container.textContent = '此页面缺少数据块，请刷新重试。';
    return;
  }

  createRoot(container).render(React.createElement(GameRouter, { initial: view }));
});
