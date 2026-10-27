// atlas-ui/react/static/js/Utils/ResourceEventManager.tsx

export type ResourceEventType = "resources_updated" | "mining_completed" | "codex_completed";

export interface ResourceEvent {
  type: ResourceEventType;
  data?: any;
}

export class ResourceEventManager {
  private static listeners: Map<ResourceEventType, Array<(data?: any) => void>> = new Map();

  static subscribe(event: ResourceEventType, callback: (data?: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(callback);

    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  static emit(event: ResourceEventType, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.warn("Error in resource event callback:", error);
        }
      });
    }
  }

  static clear(): void {
    this.listeners.clear();
  }
}
