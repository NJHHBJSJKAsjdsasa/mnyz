// atlas-ui/react/static/js/Components/TaskPanel.tsx
import React, { useState, useEffect } from "react";
import { TaskSystem, Task } from "../Utils/TaskSystem.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

interface TaskPanelProps {
  className?: string;
}

const TaskPanel: React.FC<TaskPanelProps> = ({ className = "" }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const serverMode = ServerApi.mode() === "server";

  const updateTasks = (newTasks?: Task[]) => {
    if (newTasks) {
      setTasks(newTasks);
    } else {
      setTasks(TaskSystem.getTasks());
    }
  };

  const refreshServer = async () => {
    try {
      const data = await ServerApi.tasks();
      setTasks(
        (data?.tasks || []).map((task: any) => ({
          id: task.code,
          title: task.title,
          description: task.description,
          type: task.metric === "antimatterCollected" ? "mining" : "exploration",
          status:
            task.status === "claimed" ? "claimed" : task.progress >= task.target ? "completed" : "active",
          requirements: { [task.metric]: Number(task.target || 1) },
          progress: { [task.metric]: Number(task.progress || 0) },
          rewards: task.reward || {},
          createdAt: 0,
        })) as Task[],
      );
    } catch (error) {
      console.warn("[atlas-server] tasks load failed", error);
    }
  };

  useEffect(() => {
    if (serverMode) {
      void refreshServer();
      return;
    }
    TaskSystem.initialize();
    updateTasks();
    TaskSystem.addListener(updateTasks);
    return () => {
      TaskSystem.removeListener(updateTasks);
    };
  }, [serverMode]);

  useEffect(() => {
    if (serverMode && isOpen) void refreshServer();
  }, [isOpen]);

  const completeTask = async (taskId: string) => {
    if (serverMode) {
      try {
        const result = await ServerApi.claimTask(taskId);
        SpaceshipResourceManager.addResources(result?.reward || {});
        await refreshServer();
      } catch (error) {
        console.warn("[atlas-server] task claim failed", error);
      }
      return;
    }
    const completedTask = TaskSystem.claimTaskReward(taskId);
    if (completedTask) {
      SpaceshipResourceManager.addResources(completedTask.rewards);
      updateTasks();
    }
  };

  const getTaskTypeColor = (type: string) => {
    switch (type) {
      case "exploration": return "text-blue-400";
      case "mining": return "text-green-400";
      case "trading": return "text-yellow-400";
      case "combat": return "text-red-400";
      case "research": return "text-purple-400";
      default: return "text-gray-400";
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-400";
      case "completed": return "text-blue-400";
      case "failed": return "text-red-400";
      case "expired": return "text-gray-400";
      case "claimed": return "text-purple-400";
      default: return "text-gray-400";
    }
  };

  const calculateProgress = (task: Task) => {
    const totalRequirements = Object.values(task.requirements).reduce((sum, req) => sum + req, 0);
    const totalProgress = Object.values(task.progress).reduce((sum, prog) => sum + prog, 0);
    return totalRequirements > 0 ? (totalProgress / totalRequirements) * 100 : 0;
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {/* 任务按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-gray-800/80 backdrop-blur-lg border border-white/10 rounded-full px-4 py-2 text-white hover:bg-gray-700/80 transition-all"
      >
        <span className="text-xl">📋</span>
        <span className="font-medium">任务</span>
        <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {tasks.filter(t => t.status === "active").length}
        </span>
      </button>

      {/* 任务面板 */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-gray-900/95 backdrop-blur-lg border border-white/10 rounded-lg shadow-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">任务中心</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 max-h-80 overflow-y-auto">
            {tasks.map(task => {
              const progress = calculateProgress(task);
              return (
                <div key={task.id} className="border border-white/10 rounded-lg p-3 bg-gray-800/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold text-white">{task.title}</h4>
                      <p className="text-sm text-gray-400 mb-2">{task.description}</p>
                      <div className="flex items-center gap-2 text-xs mb-2">
                        <span className={`${getTaskTypeColor(task.type)}`}>
                          {task.type === "exploration" && "探索"}
                          {task.type === "mining" && "采矿"}
                          {task.type === "trading" && "交易"}
                          {task.type === "combat" && "战斗"}
                          {task.type === "research" && "研究"}
                        </span>
                        <span className={`${getTaskStatusColor(task.status)}`}>
                          {task.status === "active" && "进行中"}
                          {task.status === "completed" && "已完成"}
                          {task.status === "failed" && "失败"}
                          {task.status === "expired" && "已过期"}
                          {task.status === "claimed" && "已领取"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {task.status === "active" && (
                    <div className="mb-3">
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {Math.round(progress)}% 完成
                      </div>
                    </div>
                  )}

                  {/* 奖励 */}
                  <div className="mt-2">
                    <div className="text-xs text-gray-400 mb-1">奖励：</div>
                    <div className="flex flex-wrap gap-1">
                      {task.rewards.antimatter && (
                        <span className="bg-purple-900/50 text-purple-300 text-xs px-2 py-1 rounded">
                          {task.rewards.antimatter} AM
                        </span>
                      )}
                      {task.rewards.element115 && (
                        <span className="bg-cyan-900/50 text-cyan-300 text-xs px-2 py-1 rounded">
                          {task.rewards.element115} E115
                        </span>
                      )}
                      {task.rewards.deuterium && (
                        <span className="bg-orange-900/50 text-orange-300 text-xs px-2 py-1 rounded">
                          {task.rewards.deuterium} D
                        </span>
                      )}
                      {task.rewards.quantumAlloy && (
                        <span className="bg-green-900/50 text-green-300 text-xs px-2 py-1 rounded">
                          {task.rewards.quantumAlloy} QA
                        </span>
                      )}
                      {task.rewards.plasmaCell && (
                        <span className="bg-red-900/50 text-red-300 text-xs px-2 py-1 rounded">
                          {task.rewards.plasmaCell} PC
                        </span>
                      )}
                      {task.rewards.neuralCircuit && (
                        <span className="bg-yellow-900/50 text-yellow-300 text-xs px-2 py-1 rounded">
                          {task.rewards.neuralCircuit} NC
                        </span>
                      )}
                      {task.rewards.exoticCrystal && (
                        <span className="bg-pink-900/50 text-pink-300 text-xs px-2 py-1 rounded">
                          {task.rewards.exoticCrystal} EC
                        </span>
                      )}
                      {task.rewards.nebulaDust && (
                        <span className="bg-indigo-900/50 text-indigo-300 text-xs px-2 py-1 rounded">
                          {task.rewards.nebulaDust} ND
                        </span>
                      )}
                      {task.rewards.blackHoleFragment && (
                        <span className="bg-gray-900/50 text-gray-300 text-xs px-2 py-1 rounded">
                          {task.rewards.blackHoleFragment} BHF
                        </span>
                      )}
                      {task.rewards.ancientRelic && (
                        <span className="bg-amber-900/50 text-amber-300 text-xs px-2 py-1 rounded">
                          {task.rewards.ancientRelic} AR
                        </span>
                      )}
                      {task.rewards.alienArtifact && (
                        <span className="bg-blue-900/50 text-blue-300 text-xs px-2 py-1 rounded">
                          {task.rewards.alienArtifact} AA
                        </span>
                      )}
                      {task.rewards.dimensionalShard && (
                        <span className="bg-violet-900/50 text-violet-300 text-xs px-2 py-1 rounded">
                          {task.rewards.dimensionalShard} DS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  {task.status === "completed" && (
                    <button
                      onClick={() => void completeTask(task.id)}
                      className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm font-medium transition-colors"
                    >
                      领取奖励
                    </button>
                  )}
                  {task.status === "claimed" && (
                    <div className="mt-3 w-full bg-gray-700 text-gray-300 py-2 rounded text-sm font-medium text-center">
                      已领取
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskPanel;
