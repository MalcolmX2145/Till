import type {
  AdjustStockInput,
  LowStockDto,
  MovementListQuery,
  StockMovementDto,
} from "@shared/schemas";
import { api } from "./client";

function toSearch(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const inventoryApi = {
  adjust: (input: AdjustStockInput) =>
    api.post<{
      adjustment: { productId: string; delta: number; stockQty: number };
    }>("/inventory/adjust", input),

  movements: (params: Partial<MovementListQuery> = {}) =>
    api.get<{
      movements: StockMovementDto[];
      hasMore: boolean;
      limit: number;
      offset: number;
    }>(`/inventory/movements${toSearch(params)}`),

  lowStock: () => api.get<{ products: LowStockDto[] }>("/inventory/low-stock"),
};
