export interface ApiResponse<T = unknown, TCategory extends string = string> {
  success: boolean;
  data?: T;
  error?: string;
  errorMessage?: string;
  errorCategory?: TCategory;
  message?: string;
  ruleViolations?: Array<{ ruleCode: string; ruleName: string; message: string; severity: string }>;
  warnings?: Array<{ ruleCode: string; ruleName: string; message: string }>;
  isPrimeTime?: boolean;
}

interface RequestConfig<TCategory extends string = string> {
  baseUrl: string;
  getToken?: () => Promise<string | null> | string | null;
  timeoutMs?: number;
  mapStatusToCategory?: (status: number) => TCategory | undefined;
  mapErrorToCategory?: (error: unknown) => Promise<TCategory | undefined> | TCategory | undefined;
  mapCategoryToMessage?: (category: TCategory) => string | undefined;
}

export function buildApiRequest<TCategory extends string = string>(config: RequestConfig<TCategory>) {
  return async function request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T, TCategory>> {
    const controller = new AbortController();
    const timeout =
      config.timeoutMs && config.timeoutMs > 0
        ? setTimeout(() => controller.abort(), config.timeoutMs)
        : null;

    try {
      const token = config.getToken ? await config.getToken() : null;
      const response = await fetch(`${config.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });

      const contentType = response.headers.get("content-type") || "";
      const statusCategory = config.mapStatusToCategory?.(response.status);
      if (!contentType.includes("application/json")) {
        const errorMessage = `Server error (${response.status}). Please try again.`;
        return {
          success: false,
          error: errorMessage,
          errorMessage,
          ...(statusCategory ? { errorCategory: statusCategory } : {}),
        };
      }

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.error || data.message || "Request failed";
        return {
          success: false,
          error: errorMessage,
          errorMessage,
          ...(statusCategory ? { errorCategory: statusCategory } : {}),
          ...(data.ruleViolations && { ruleViolations: data.ruleViolations }),
          ...(data.warnings && { warnings: data.warnings }),
          ...(data.isPrimeTime !== undefined && { isPrimeTime: data.isPrimeTime }),
        };
      }

      return { success: true, data, message: data.message };
    } catch (error) {
      const category = config.mapErrorToCategory ? await config.mapErrorToCategory(error) : undefined;
      const categoryMessage = category ? config.mapCategoryToMessage?.(category) : undefined;
      let fallbackMessage =
        error instanceof Error ? error.message : "Unable to reach CourtTime right now. Please try again.";
      if (error instanceof Error && /failed to fetch/i.test(error.message)) {
        fallbackMessage =
          "Could not reach the server. Locally: run the API (`npm run dev:server` or `npm run dev`) so port 3001 is up — Vite proxies /api there. Production: confirm the host is up and set VITE_API_BASE_URL if the API is not same-origin.";
      }
      const errorMessage = categoryMessage || fallbackMessage;
      return {
        success: false,
        error: errorMessage,
        errorMessage,
        ...(category ? { errorCategory: category } : {}),
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}
