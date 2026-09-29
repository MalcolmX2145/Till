import type {
  CategoryDto,
  CreateProductInput,
  ProductDto,
  UpdateProductInput,
} from "@shared/schemas";
import { api } from "./client";

export interface ProductListParams {
  q?: string;
  categoryId?: string;
  lowStock?: boolean;
  includeInactive?: boolean;
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

export const productsApi = {
  list: (params: ProductListParams = {}) =>
    api.get<{
      products: ProductDto[];
      hasMore: boolean;
      limit: number;
      offset: number;
    }>(`/products${toSearch(params)}`),

  get: (id: string) => api.get<{ product: ProductDto }>(`/products/${id}`),

  lookupBarcode: (barcode: string) =>
    api.get<{ product: ProductDto }>(
      `/products/lookup${toSearch({ barcode })}`,
    ),

  create: (input: CreateProductInput) =>
    api.post<{ product: { id: string } }>("/products", input),

  update: (id: string, input: UpdateProductInput) =>
    api.patch<{ ok: true }>(`/products/${id}`, input),

  deactivate: (id: string) => api.delete<{ ok: true }>(`/products/${id}`),
};

export const categoriesApi = {
  list: () => api.get<{ categories: CategoryDto[] }>("/categories"),
  create: (name: string) =>
    api.post<{ category: CategoryDto }>("/categories", { name }),
  rename: (id: string, name: string) =>
    api.patch<{ category: CategoryDto }>(`/categories/${id}`, { name }),
  remove: (id: string) => api.delete<{ ok: true }>(`/categories/${id}`),
};
