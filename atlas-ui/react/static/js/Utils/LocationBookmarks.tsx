// atlas-ui/react/static/js/Utils/LocationBookmarks.tsx
import { DailyChallengesManager } from "./DailyChallenges.tsx";
import { getItem, setItem, removeItem } from "./b64.tsx";

export interface SavedLocation {
  id: string;
  name: string;
  type: "galaxy" | "system" | "planet";
  timestamp: number;
  stargateUrl: string;
}

export class LocationBookmarks {
  private static readonly STORAGE_KEY = "_atlasLocations";
  private static readonly BASE_MAX_LOCATIONS = 5;
  private static readonly BONUS_PER_COMPLETION = 5;
  private static readonly ABSOLUTE_MAX_LOCATIONS = 999;

  public static getLocations(): SavedLocation[] {
    try {
      const data = getItem(this.STORAGE_KEY);
      if (!data) return [];

      const locations = JSON.parse(data);
      return Array.isArray(locations) ? locations : [];
    } catch (error) {
      console.error("Error reading saved locations:", error);
      return [];
    }
  }

  private static normalizeStargateUrl(url: string): string {
    const stargateIndex = url.indexOf("/stargate/");
    return stargateIndex !== -1 ? url.substring(stargateIndex) : url;
  }

  private static decodeStargateUrl(url: string): string {
    try {
      const match = url.match(/\/stargate\/([A-Za-z0-9\-_]+)/);
      if (!match) return url;

      const encoded = match[1];
      const decoded = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));

      if (decoded.includes("&system=") || decoded.includes("&planet=")) {
        return decoded.replace(/&page=\d+/, "");
      }

      return decoded;
    } catch (error) {
      return url;
    }
  }

  public static isLocationSaved(stargateUrl: string): boolean {
    const normalizedUrl = this.normalizeStargateUrl(stargateUrl);
    const decodedUrl = this.decodeStargateUrl(normalizedUrl);
    const savedLocations = this.getLocations();

    return savedLocations.some((loc) => {
      const savedNormalized = this.normalizeStargateUrl(loc.stargateUrl);
      const savedDecoded = this.decodeStargateUrl(savedNormalized);
      return savedDecoded === decodedUrl;
    });
  }

  public static isGalaxyLocationSavedDifferentPage(stargateUrl: string, type: string): boolean {
    if (type !== "galaxy") return false;

    try {
      const normalizedUrl = this.normalizeStargateUrl(stargateUrl);
      const parts = normalizedUrl.split("/stargate/")[1];
      if (!parts) return false;

      const decoded = atob(parts.replace(/-/g, "+").replace(/_/g, "/"));
      const params = new URLSearchParams(decoded);
      const coordinates = params.get("coordinates");
      const currentPage = params.get("page");

      if (!coordinates || !currentPage) return false;

      const savedLocations = this.getLocations();

      return savedLocations.some((loc) => {
        if (loc.type !== "galaxy") return false;

        try {
          const savedNormalized = this.normalizeStargateUrl(loc.stargateUrl);
          const savedParts = savedNormalized.split("/stargate/")[1];
          if (!savedParts) return false;

          const savedDecoded = atob(savedParts.replace(/-/g, "+").replace(/_/g, "/"));
          const savedParams = new URLSearchParams(savedDecoded);
          const savedCoordinates = savedParams.get("coordinates");
          const savedPage = savedParams.get("page");

          return savedCoordinates === coordinates && savedPage !== currentPage;
        } catch (error) {
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }

  public static async saveLocation(location: Omit<SavedLocation, "id" | "timestamp">): Promise<boolean> {
    try {
      const locations = this.getLocations();
      const currentMaxLocations = this.getCurrentMaxLocations();

      const newUrlDecoded = this.decodeStargateUrl(this.normalizeStargateUrl(location.stargateUrl));
      const existingIndex = locations.findIndex((loc) => {
        const savedDecoded = this.decodeStargateUrl(this.normalizeStargateUrl(loc.stargateUrl));
        return savedDecoded === newUrlDecoded;
      });

      const newLocation: SavedLocation = {
        ...location,
        id: this.generateId(),
        timestamp: Date.now(),
      };

      if (existingIndex !== -1) {
        locations[existingIndex] = newLocation;
        setItem(this.STORAGE_KEY, JSON.stringify(locations));
        return true;
      }

      if (locations.length >= currentMaxLocations) {
        const shouldOverwrite = await this.showSlotFullDialog(currentMaxLocations);
        if (!shouldOverwrite) {
          return false;
        }
      }

      locations.push(newLocation);
      if (locations.length > currentMaxLocations) {
        locations.sort((a, b) => b.timestamp - a.timestamp);
        locations.splice(currentMaxLocations);
      }

      setItem(this.STORAGE_KEY, JSON.stringify(locations));

      window.dispatchEvent(
        new CustomEvent("locationSaved", {
          detail: { location: newLocation },
        })
      );

      return true;
    } catch (error) {
      console.error("Error saving location:", error);
      return false;
    }
  }

  public static saveLocationSync(location: Omit<SavedLocation, "id" | "timestamp">): void {
    const locations = this.getLocations();
    const currentMaxLocations = this.getCurrentMaxLocations();

    const newUrlDecoded = this.decodeStargateUrl(this.normalizeStargateUrl(location.stargateUrl));
    const existingIndex = locations.findIndex((loc) => {
      const savedDecoded = this.decodeStargateUrl(this.normalizeStargateUrl(loc.stargateUrl));
      return savedDecoded === newUrlDecoded;
    });

    const newLocation: SavedLocation = {
      ...location,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    if (existingIndex !== -1) {
      locations[existingIndex] = newLocation;
    } else {
      locations.push(newLocation);
    }

    if (locations.length > currentMaxLocations) {
      locations.sort((a, b) => b.timestamp - a.timestamp);
      locations.splice(currentMaxLocations);
    }

    setItem(this.STORAGE_KEY, JSON.stringify(locations));

    window.dispatchEvent(
      new CustomEvent("locationSaved", {
        detail: { location: newLocation },
      })
    );
  }

  public static removeLocation(id: string): void {
    try {
      const locations = this.getLocations();
      const filteredLocations = locations.filter((loc) => loc.id !== id);

      setItem(this.STORAGE_KEY, JSON.stringify(filteredLocations));
    } catch (error) {
      console.error("Error removing location:", error);
    }
  }

  public static clearAllLocations(): void {
    try {
      removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing locations:", error);
    }
  }

  private static generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private static async showSlotFullDialog(maxSlots: number): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 opacity-0";
      overlay.style.background = "rgba(4, 5, 7, 0.78)";
      overlay.style.backdropFilter = "none";

      const modal = document.createElement("div");
      modal.className = "relative rounded-none p-8 max-w-md mx-4 transition-all duration-300 transform scale-95";
      modal.style.background = "var(--atlas-plate-2)";
      modal.style.border = "1px solid var(--atlas-line-strong)";
      modal.style.borderTopColor = "var(--atlas-signal)";
      modal.style.color = "var(--atlas-n-900)";
      modal.style.backdropFilter = "none";
      modal.style.boxShadow = "0 32px 64px -32px rgba(0, 0, 0, 0.95)";

      const container = document.createElement("div");
      container.className = "text-center";

      const iconContainer = document.createElement("div");
      iconContainer.className = "inline-flex items-center justify-center w-14 h-14 mb-6";
      iconContainer.style.background = "var(--atlas-signal-dim)";
      iconContainer.style.boxShadow = "inset 0 0 0 1px var(--atlas-signal)";

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "w-8 h-8 text-amber-400");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("viewBox", "0 0 24 24");

      const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path1.setAttribute("stroke-linecap", "round");
      path1.setAttribute("stroke-linejoin", "round");
      path1.setAttribute("stroke-width", "2");
      path1.setAttribute("d", "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z");

      const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path2.setAttribute("stroke-linecap", "round");
      path2.setAttribute("stroke-linejoin", "round");
      path2.setAttribute("stroke-width", "2");
      path2.setAttribute("d", "M15 11a3 3 0 11-6 0 3 3 0 016 0z");

      svg.appendChild(path1);
      svg.appendChild(path2);
      iconContainer.appendChild(svg);

      const title = document.createElement("h2");
      title.className = "text-2xl font-bold mb-4 text-white";
      title.textContent = "存储空间已满";

      const tipParagraph = document.createElement("p");
      tipParagraph.className = "text-slate-400 mb-6 text-[10px] bg-slate-800/50 rounded-lg p-3 border border-slate-700/50";
      tipParagraph.textContent = "💡 完成每日挑战以增加您的存储容量";

      const mainParagraph = document.createElement("p");
      mainParagraph.className = "text-slate-300 mb-4 text-base leading-relaxed";
      mainParagraph.textContent = "您已达到最大存储数量 ";

      const maxSlotsSpan = document.createElement("span");
      maxSlotsSpan.className = "font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg";
      maxSlotsSpan.textContent = maxSlots.toString();

      mainParagraph.appendChild(maxSlotsSpan);
      mainParagraph.appendChild(document.createTextNode(" 个已保存位置。"));

      const questionParagraph = document.createElement("p");
      questionParagraph.className = "text-slate-200 mb-8 text-base";
      questionParagraph.textContent = "是否覆盖最早保存的位置？";

      const buttonContainer = document.createElement("div");
      buttonContainer.className = "flex gap-4 justify-center";

      const cancelButton = document.createElement("button");
      cancelButton.id = "cancelSave";
      cancelButton.className = "px-6 py-3 bg-slate-700/80 hover:bg-slate-600/80 border border-slate-600/50 hover:border-slate-500/50 rounded-none transition-all duration-200 font-medium text-slate-200 hover:text-white transform hover:scale-105 hover:shadow-lg";
      cancelButton.textContent = "取消";

      const confirmButton = document.createElement("button");
      confirmButton.id = "confirmOverwrite";
      confirmButton.className = "px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-none transition-all duration-200 font-semibold text-white transform hover:scale-105 hover:shadow-lg border border-amber-400/30";
      confirmButton.textContent = "覆盖";

      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(confirmButton);

      container.appendChild(iconContainer);
      container.appendChild(title);
      container.appendChild(tipParagraph);
      container.appendChild(mainParagraph);
      container.appendChild(questionParagraph);
      container.appendChild(buttonContainer);

      modal.appendChild(container);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        modal.style.transform = "scale(1)";
      });

      const cancelBtn = modal.querySelector("#cancelSave");
      const confirmBtn = modal.querySelector("#confirmOverwrite");

      const cleanup = (result: boolean) => {
        overlay.style.opacity = "0";
        modal.style.transform = "scale(0.95)";

        setTimeout(() => {
          if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
          resolve(result);
        }, 300);
      };

      cancelBtn?.addEventListener("click", () => {
        cleanup(false);
      });

      confirmBtn?.addEventListener("click", () => {
        cleanup(true);
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          cleanup(false);
        }
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", handleKeyDown);
          cleanup(false);
        }
      };
      document.addEventListener("keydown", handleKeyDown);
    });
  }

  public static hasAvailableSlot(): boolean {
    const locations = this.getLocations();
    const maxLocations = this.getCurrentMaxLocations();
    return locations.length < maxLocations;
  }

  public static getAvailableSlots(): number {
    const locations = this.getLocations();
    const maxLocations = this.getCurrentMaxLocations();
    return Math.max(0, maxLocations - locations.length);
  }

  public static getCurrentMaxLocations(): number {
    try {
      const completedDays = this.getCompletedDaysCount();

      const todayCompleted = DailyChallengesManager.getCompletionStatus().allCompleted ? 1 : 0;

      const calculatedMax = this.BASE_MAX_LOCATIONS + (completedDays + todayCompleted) * this.BONUS_PER_COMPLETION;

      return Math.min(calculatedMax, this.ABSOLUTE_MAX_LOCATIONS);
    } catch (error) {
      console.error("Error calculating max locations:", error);
      return this.BASE_MAX_LOCATIONS;
    }
  }

  private static getCompletedDaysCount(): number {
    try {
      const challengesData = getItem("_atlasDailyChallenges");
      if (challengesData) {
        const challenges = JSON.parse(challengesData);
        return challenges.totalCompletedDays || 0;
      }

      return 0;
    } catch (error) {
      console.error("Error getting completion history:", error);
      return 0;
    }
  }

  public static getLocationStats(): { total: number; galaxies: number; systems: number; planets: number; maxAllowed: number; available: number } {
    const locations = this.getLocations();
    const maxAllowed = this.getCurrentMaxLocations();

    return {
      total: locations.length,
      galaxies: locations.filter((loc) => loc.type === "galaxy").length,
      systems: locations.filter((loc) => loc.type === "system").length,
      planets: locations.filter((loc) => loc.type === "planet").length,
      maxAllowed,
      available: Math.max(0, maxAllowed - locations.length),
    };
  }

  public static async saveLocationWithConfirmation(name: string, type: "galaxy" | "system" | "planet", stargateUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      const location = { name, type, stargateUrl };
      const saved = await this.saveLocation(location);

      if (saved) {
        return {
          success: true,
          message: `位置 "${name}" 保存成功！`,
        };
      } else {
        return {
          success: false,
          message: "保存操作被用户取消。",
        };
      }
    } catch (error) {
      console.error("Error saving location with confirmation:", error);
      return {
        success: false,
        message: "保存位置失败。请重试。",
      };
    }
  }
}
