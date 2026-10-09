// ── Unified AI Service Layer ───────────────────────────────────────────────
// Centralized service for all Gemini API calls with consistent error handling,
// retry logic, timeout management, and cancellation support.
//
// This addresses BUG-016: No unified AI service layer
// Each component was calling API directly with inconsistent error handling.

import { getApiBase, DEFAULT_AI_MODEL, normalizeModel } from "./apiConfig.js";
import { uiMessage } from "./core/errors.js";
import aiDataStorage from "./aiDataStorage.js";

const API_BASE = getApiBase();
// ── Models ──────────────────────────────────────────────────────────────
// Danh sách model còn hỗ trợ — giữ đồng bộ với MODEL_OPTIONS trong apiConfig.js
const AVAILABLE_MODELS = {
  GEMINI_2_5_FLASH: DEFAULT_AI_MODEL,
};

const DEFAULT_MODEL = DEFAULT_AI_MODEL;
// ── Configuration ───────────────────────────────────────────────────────
const DEFAULT_TIMEOUT = 90000; // 90 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1500; // Base delay for exponential backoff (ms)
const RETRYABLE_STATUS_CODES = [429, 503, 500, 502, 504];

// ── Error Types ───────────────────────────────────────────────────────────
class AIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.code = code;
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────
function getFriendlyErrorMessage(status, message) {
  // Chuẩn hóa: API có thể trả object {message} — không bao giờ để object/tiếng Anh thô lọt ra UI.
  // Chi tiết Việt (có dấu) giữ nguyên; tiếng Anh kỹ thuật → fallback Việt (xem uiMessage).
  const raw = typeof message === "string" ? message : String(message?.message ?? message ?? "");
  const detail = raw.trim();
  const safeDetail = (fallback) => uiMessage(detail, fallback);
  // Include detail for 400 (invalid request / bad key format) — previously fell through to generic
  if (status === 400) {
    if (detail && detail.includes("API Key không hợp lệ")) return detail;
    if (detail) return safeDetail("Yêu cầu không hợp lệ. Hãy kiểm tra lại API Key và thử lại nhé!");
    return "Yêu cầu không hợp lệ. Hãy kiểm tra lại API Key và thử lại nhé!";
  }
  if (status === 429)
    return detail && detail.includes("quá tải")
      ? detail
      : "AI đang bận quá! Hãy đợi 30 giây rồi thử lại nhé.";
  if (status === 401 || status === 403)
    return "API Key không hợp lệ hoặc hết hạn. Hãy kiểm tra lại trong Cài đặt AI nhé!";
  if (status === 404)
    return "Máy chủ Gemini không tìm thấy model. Hãy kiểm tra kết nối internet rồi thử lại nhé!";
  if (status === 502 || status === 503)
    return "Máy chủ Gemini đang bận. Hãy thử lại sau vài phút nhé!";
  if (status === 504) return "AI trả lời quá chậm. Hãy thử lại sau nhé!";
  if (status === 500) {
    // Giữ chi tiết Việt để chẩn đoán; chi tiết Anh → câu chung (raw vẫn log ở console bởi caller)
    if (detail) return `Lỗi máy chủ AI: ${safeDetail("hãy thử lại sau vài phút")}`;
    return "Lỗi máy chủ AI. Hãy thử lại sau nhé!";
  }
  if (detail) return safeDetail("Có lỗi xảy ra khi gọi AI. Hãy thử lại nhé!");
  return "Có lỗi xảy ra khi gọi AI. Hãy thử lại nhé!";
}

function delay(ms, controller) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const signal = controller?.signal;
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      // Timer timeout cũng abort → phải báo TIMEOUT, không phải "đã dừng"
      if (controller.cancelled) reject(new AIError("Đã dừng yêu cầu AI.", 499, "CANCELLED"));
      else reject(new AIError("AI trả lời quá lâu rồi! Hãy thử lại sau nhé.", 504, "TIMEOUT"));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS_CODES.includes(status);
}

// thinkingBudget phải < maxOutputTokens, nếu không Gemini trả 400/rỗng
function clampThinkingBudget(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const budget = cfg?.thinkingConfig?.thinkingBudget;
  const maxOut = Number(cfg.maxOutputTokens);
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(maxOut)) return cfg;
  if (budget < maxOut) return cfg;
  return {
    ...cfg,
    thinkingConfig: { ...cfg.thinkingConfig, thinkingBudget: Math.max(0, Math.floor(maxOut * 0.5)) },
  };
}

// Cài đặt → Nâng cao → "Chế độ gỡ lỗi": chỉ khi bật mới hiện log chi tiết retry của AI
function isDebugEnabled() {
  if (globalThis.__SGK_TEST__ === true) return false;
  try {
    const raw = localStorage.getItem("sgk_settings");
    return !!raw && JSON.parse(raw)?.advanced?.debugMode === true;
  } catch {
    return false;
  }
}

// ── Main AI Service ───────────────────────────────────────────────────────
class AIService {
  constructor() {
    this.activeControllers = new Map();
  }

  /**
   * Call Gemini API with retry logic, timeout, and cancellation support
   * @param {Object} options - Request options
   * @param {string} options.apiKey - Gemini API key
   * @param {Array} options.contents - Conversation contents
   * @param {Object} options.systemInstruction - System instruction
   * @param {Object} options.generationConfig - Generation config (temperature, maxOutputTokens, etc.)
   * @param {string} options.model - Model to use (default: gemini-2.5-flash)
   * @param {number} options.timeout - Request timeout in milliseconds (default: 90000)
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {string} options.requestId - Unique request ID for cancellation
   * @returns {Promise<string>} AI response text
   */
  async callAI({
    apiKey,
    contents,
    systemInstruction,
    generationConfig,
    model = DEFAULT_MODEL,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = MAX_RETRIES,
    requestId = null,
  }) {
    if (!apiKey) {
      throw new AIError(
        "Chưa có API Key! Trợ lý cần Gemini AI mới trả lời được.",
        400,
        "NO_API_KEY",
      );
    }

    if (!Array.isArray(contents) || contents.length === 0) {
      throw new AIError(
        "Nội dung gửi lên không hợp lệ. Hãy thử lại nhé!",
        400,
        "INVALID_CONTENTS",
      );
    }

    // Normalize system instruction format
    const normalizedSystemInstruction =
      typeof systemInstruction === "string"
        ? { parts: [{ text: systemInstruction }] }
        : systemInstruction;

    // Ensure unique request ID for cancellation
    const finalRequestId =
      requestId || `ai_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Ép model về danh sách đang hỗ trợ: model retired trả 404 từ Google
    const finalModel = normalizeModel(model);
    const finalGenerationConfig = clampThinkingBudget(generationConfig);

    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      // Register controller for cancellation with unique ID
      this.activeControllers.set(finalRequestId, controller);

      try {
        const response = await fetch(`${API_BASE}/api/gemini`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-key": apiKey,
          },
          body: JSON.stringify({
            model: finalModel,
            contents,
            systemInstruction: normalizedSystemInstruction,
            generationConfig: finalGenerationConfig || {
              temperature: 0.4,
              topP: 0.95,
              maxOutputTokens: 2048,
            },
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const friendlyMsg = getFriendlyErrorMessage(
            response.status,
            data?.error || data?.error?.message,
          );
          const error = new AIError(friendlyMsg, response.status, "API_ERROR");

          // Check if retryable
          if (isRetryableStatus(response.status) && attempt < maxRetries - 1) {
            lastError = error;
            const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt);
            if (isDebugEnabled()) {
              console.debug(
                `AI retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms (status: ${response.status})`,
              );
            }
            await delay(delayMs, controller);
            continue;
          }

          throw error;
        }

        const cand = data?.candidates?.[0];
        const text = cand?.content?.parts?.[0]?.text;
        if (!text) {
          // Chỉ "block" thật khi Gemini chặn nội dung (promptFeedback) hoặc cắt vì hết token.
          // finishReason STOP/OTHER rỗng là lỗi tạm thời → PHẢI được retry.
          const promptBlock = String(data?.promptFeedback?.blockReason || "");
          const finish = String(cand?.finishReason || "").toUpperCase();
          const blockCode = promptBlock || (finish === "MAX_TOKENS" ? "MAX_TOKENS" : "");
          // Mã chặn của Gemini (SAFETY/RECITATION/…) là tiếng Anh kỹ thuật → dịch ra Việt, giữ mã gốc trong console
          const BLOCK_REASON_VI = {
            SAFETY: "bộ lọc an toàn", OTHER: "lý do khác", BLOCKLIST: "danh sách chặn",
            PROHIBITED_CONTENT: "nội dung bị cấm", RECITATION: "trùng lặp nội dung",
            LANGUAGE: "ngôn ngữ chưa được hỗ trợ", MAX_TOKENS: "vượt giới hạn độ dài",
            STOP: "đã dừng", FINISH_REASON_UNSPECIFIED: "không rõ",
          };
          const reasonVi = BLOCK_REASON_VI[blockCode.toUpperCase()] || "không rõ";
          const detail = blockCode ? ` (lý do: ${reasonVi})` : "";
          // Log raw for debugging but don't expose full payload to user
          if (isDebugEnabled()) {
            console.warn(
              "Gemini empty response:",
              JSON.stringify(data).slice(0, 800),
            );
          }
          const error = new AIError(
            `AI không đưa ra câu trả lời nào${detail}. Hãy thử lại nhé!`,
            500,
            "NO_RESPONSE",
          );
          if (!blockCode && attempt < maxRetries - 1) {
            lastError = error;
            const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt);
            if (isDebugEnabled()) {
              console.debug(
                `AI retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms (empty response)`,
              );
            }
            await delay(delayMs, controller);
            continue;
          }
          throw error;
        }

        try { aiDataStorage.recordUsageStats({ requests: 1, successful: 1 }); } catch {}
        return text;
      } catch (err) {
        // Lỗi cuối cùng (không còn lượt retry) mới tính là request thất bại.
        // Người dùng chủ động dừng không phải là lỗi.
        const isFinal =
          err.name === "AbortError" ||
          err instanceof AIError ||
          attempt >= maxRetries - 1;
        const stopped =
          (err.name === "AbortError" && controller.cancelled) ||
          (err instanceof AIError && err.code === "CANCELLED");
        if (isFinal && !stopped) {
          try { aiDataStorage.recordUsageStats({ requests: 1, failed: 1 }); } catch {}
        }
        if (err.name === "AbortError") {
          if (controller.cancelled) {
            throw new AIError("Đã dừng yêu cầu AI.", 499, "CANCELLED");
          }
          throw new AIError(
            "AI trả lời quá lâu rồi! Hãy thử lại sau nhé.",
            504,
            "TIMEOUT",
          );
        }

        if (err instanceof AIError) {
          // Re-throw AI errors (already formatted)
          throw err;
        }

        // Network errors
        if (attempt < maxRetries - 1) {
          lastError = err;
          const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt);
          try {
            await delay(delayMs, controller);
          } catch (delayErr) {
            // Hủy/timeout lúc chờ retry → thoát ngay nhưng vẫn phải ghi stats
            if (delayErr?.code !== "CANCELLED") {
              try { aiDataStorage.recordUsageStats({ requests: 1, failed: 1 }); } catch {}
            }
            throw delayErr;
          }
          continue;
        }

        throw new AIError(
          getFriendlyErrorMessage(null, err.message),
          500,
          "NETWORK_ERROR",
        );
      } finally {
        clearTimeout(timer);
        this.activeControllers.delete(finalRequestId);
      }
    }

    // Should not reach here, but just in case
    throw (
      lastError ||
      new AIError("AI đang bận, hãy thử lại sau nhé!", 500, "UNKNOWN")
    );
  }

  /**
   * Cancel an active AI request by ID
   * @param {string} requestId - Request ID to cancel
   */
  cancelRequest(requestId) {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.cancelled = true;
      controller.abort();
      this.activeControllers.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active AI requests
   */
  cancelAllRequests() {
    this.activeControllers.forEach((controller) => {
      // Đánh dấu là hủy chủ động để AbortError thành CANCELLED, không phải TIMEOUT
      controller.cancelled = true;
      controller.abort();
    });
    this.activeControllers.clear();
  }

  /**
   * Hủy các request đang chạy theo đầu ID (vd: "scan-", "wb-mindmap-").
   * Dùng khi nút Dừng của một màn hình chỉ được dừng đúng việc của nó.
   * @param {string} prefix
   * @returns {number} số request đã hủy
   */
  cancelRequestsByPrefix(prefix) {
    if (!prefix) return 0;
    let n = 0;
    for (const [id, controller] of [...this.activeControllers.entries()]) {
      if (id.startsWith(prefix)) {
        controller.cancelled = true;
        controller.abort();
        this.activeControllers.delete(id);
        n += 1;
      }
    }
    return n;
  }

  /**
   * Get count of active requests
   */
  getActiveRequestCount() {
    return this.activeControllers.size;
  }
}

// ── Export singleton instance ─────────────────────────────────────────────
const aiService = new AIService();

export default aiService;
export { AIError, getFriendlyErrorMessage, AVAILABLE_MODELS, DEFAULT_MODEL };
