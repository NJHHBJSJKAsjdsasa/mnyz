// atlas-ui/react/static/js/Utils/RefitVoucher.tsx
// Refit vouchers are earned from expedition contracts and halve one refit's cost.

import { getItem, setItem } from "./b64.tsx";

export const VOUCHER_STORAGE_KEY = "_atlasVouchers";

interface VoucherStore {
  count: number;
  earned: number;
}

export class RefitVoucherSystem {
  static count(): number {
    return RefitVoucherSystem.load().count;
  }

  static earned(): number {
    return RefitVoucherSystem.load().earned;
  }

  static earn(amount = 1): void {
    const store = RefitVoucherSystem.load();
    store.count += amount;
    store.earned += amount;
    RefitVoucherSystem.save(store);
  }

  static consume(amount = 1): boolean {
    const store = RefitVoucherSystem.load();
    if (store.count < amount) return false;

    store.count -= amount;
    RefitVoucherSystem.save(store);
    return true;
  }

  private static save(store: VoucherStore): void {
    setItem(VOUCHER_STORAGE_KEY, JSON.stringify(store));
  }

  private static load(): VoucherStore {
    try {
      const raw = getItem(VOUCHER_STORAGE_KEY);
      if (!raw) return { count: 0, earned: 0 };
      const parsed = JSON.parse(raw);
      return { count: Number(parsed?.count) || 0, earned: Number(parsed?.earned) || 0 };
    } catch (error) {
      return { count: 0, earned: 0 };
    }
  }
}
