// atlas-ui/react/static/js/Components/AllySection.tsx
import React, { useState } from "react";
import { ALLY_PREFIX, AllySystem, MAX_ALLIES } from "../Utils/AllySystem.tsx";

const AllySection: React.FC = () => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState("");

  const alliance = AllySystem.current();
  const members = AllySystem.members();

  const create = () => {
    setInvite(AllySystem.create(name));
    setMessage("联盟已建立，把邀请码发给队友");
  };

  const join = () => {
    const result = AllySystem.join(code);
    setMessage(result.ok ? `已加入「${result.name}」` : result.reason ?? "加入失败");
  };

  return (
    <div className="rounded-lg border border-amber-500/20 bg-white/5 p-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-200">联盟（离线邀请码）</span>
        <span className="text-amber-300">成员 {members.length}/{MAX_ALLIES} · 采集 +{Math.round((AllySystem.bonus() - 1) * 100)}%</span>
      </div>

      {alliance ? (
        <>
          <div className="text-[11px] text-gray-300">
            「{alliance.name}」 · {members.map((member) => member.name).join("、")}
          </div>
          {invite && <div className="text-[10px] text-gray-500 break-all bg-black/40 rounded p-1">{invite}</div>}
          <div className="flex gap-2">
            <button onClick={() => setInvite(AllySystem.inviteCode())} className="px-2 py-1 rounded text-[11px] bg-amber-600/80 hover:bg-amber-500 text-white">
              显示邀请码
            </button>
            <button
              onClick={() => {
                AllySystem.leave();
                setInvite("");
                setMessage("已退出联盟");
              }}
              className="px-2 py-1 rounded text-[11px] bg-white/10 hover:bg-white/20 text-gray-300"
            >
              退出
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="联盟名称"
              className="flex-1 min-w-0 text-[11px] bg-black/40 rounded px-2 py-1 text-gray-200"
            />
            <button onClick={create} className="px-2 py-1 rounded text-[11px] bg-amber-600/80 hover:bg-amber-500 text-white shrink-0">
              创建
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={`粘贴 ${ALLY_PREFIX}… 邀请码`}
              className="flex-1 min-w-0 text-[11px] bg-black/40 rounded px-2 py-1 text-gray-200"
            />
            <button onClick={join} className="px-2 py-1 rounded text-[11px] bg-white/10 hover:bg-white/20 text-white shrink-0">
              加入
            </button>
          </div>
        </>
      )}

      {message && <p className="text-[11px] text-amber-300">{message}</p>}
    </div>
  );
};

export default AllySection;
