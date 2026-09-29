import type {
  CreateSaleInput,
  SaleDto,
  SaleSummaryDto,
} from "@shared/schemas";
import { api } from "./client";

export interface CreatedSale {
  id: string;
  seq: number;
  saleNo: string;
  totalCents: number;
  changeCents: number;
  createdAt: number;
}

export interface SaleListParams {
  from?: number;
  to?: number;
  cashierId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

function toSearch(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const salesApi = {
  create: (input: CreateSaleInput) =>
    api.post<{ sale: CreatedSale }>("/sales", input),

  list: (params: SaleListParams = {}) =>
    api.get<{
      sales: SaleSummaryDto[];
      hasMore: boolean;
      limit: number;
      offset: number;
    }>(`/sales${toSearch(params)}`),

  get: (id: string) => api.get<{ sale: SaleDto }>(`/sales/${id}`),
};
