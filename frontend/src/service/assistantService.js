import { api, API_BASE_URL, getAccessToken } from "./api";

// ── Conversations ─────────────────────────────────────────────────────────
export const listConversations = () => api.get("/assistant/conversations");
export const createConversation = (title) => api.post("/assistant/conversations", { title });
export const getConversation = (id) => api.get(`/assistant/conversations/${id}`);
export const renameConversation = (id, title) => api.patch(`/assistant/conversations/${id}`, { title });
export const deleteConversation = (id) => api.delete(`/assistant/conversations/${id}`);
export const listTurns = (conversationId) => api.get(`/assistant/conversations/${conversationId}/turns`);

// ── Turns ─────────────────────────────────────────────────────────────────
export const createTurn = (conversationId, text, subjectEmployeeId, attachmentId) =>
  api.post(`/assistant/conversations/${conversationId}/turns`, {
    text, subject_employee_id: subjectEmployeeId || undefined, attachment_id: attachmentId || undefined,
  });
export const getTurn = (turnId) => api.get(`/assistant/turns/${turnId}`);

// ── Manager/delegated scope ──────────────────────────────────────────────────
export const getTeamScope = () => api.get("/assistant/scope/team");

// ── Attachments ──────────────────────────────────────────────────────────────
export const uploadAttachment = (conversationId, file) => {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("file", file);
  return api.post("/assistant/attachments", formData);
};
export const deleteAttachment = (id) => api.delete(`/assistant/attachments/${id}`);

// ── Data-subject rights (export / delete / restrict my assistant data) ──────
export const listPrivacyRequests = () => api.get("/assistant/privacy-requests");
export const createPrivacyRequest = (requestType) =>
  api.post("/assistant/privacy-requests", { request_type: requestType });
export const liftRestriction = () => api.post("/assistant/privacy-requests/unrestrict", {});

// ── Capabilities / feedback / handoff ───────────────────────────────────────
export const getCapabilities = () => api.get("/assistant/capabilities");
export const submitFeedback = (turnId, rating, reasonCode, comment) =>
  api.post("/assistant/feedback", { turn_id: turnId, rating, reason_code: reasonCode, comment });
export const createHandoff = (conversationId, turnId, reason, issueSummary) =>
  api.post("/assistant/handoffs", {
    conversation_id: conversationId, turn_id: turnId, reason, issue_summary: issueSummary,
  });

// ── Workflows (action engine) ───────────────────────────────────────────────
export const getWorkflow = (id) => api.get(`/assistant/workflows/${id}`);
export const updateWorkflowFields = (id, updates) => api.patch(`/assistant/workflows/${id}`, updates);
export const validateWorkflow = (id) => api.post(`/assistant/workflows/${id}/validate`, {});
export const confirmWorkflow = (id, confirmationToken) =>
  api.post(`/assistant/workflows/${id}/confirm`, { confirmation_token: confirmationToken });
export const executeWorkflow = (id, idempotencyKey) =>
  api.post(`/assistant/workflows/${id}/execute`, {}, { headers: { "Idempotency-Key": idempotencyKey } });
export const cancelWorkflow = (id) => api.post(`/assistant/workflows/${id}/cancel`, {});

// ── Admin: knowledge base ────────────────────────────────────────────────────
export const listKnowledgeSources = (params) => api.get("/assistant/admin/knowledge/sources", { params });
export const createKnowledgeSource = (payload) => api.post("/assistant/admin/knowledge/sources", payload);
export const publishKnowledgeSource = (id) => api.post(`/assistant/admin/knowledge/sources/${id}/publish`, {});
export const retireKnowledgeSource = (id) => api.post(`/assistant/admin/knowledge/sources/${id}/retire`, {});
export const suspendKnowledgeSource = (id) => api.post(`/assistant/admin/knowledge/sources/${id}/suspend`, {});
export const listKnowledgeVersions = (id) => api.get(`/assistant/admin/knowledge/sources/${id}/versions`);

// ── Admin: operational controls (kill switches) ─────────────────────────────
export const listControls = () => api.get("/assistant/admin/controls");
export const setControl = (controlType, isEnabled) =>
  api.post("/assistant/admin/controls", { control_type: controlType, is_enabled: isEnabled });

/**
 * Streams a turn's answer via SSE. `onEvent(eventName, data)` is called for
 * each server-sent event. Returns an abort function.
 *
 * `apiRequest` (service/api.js) always resolves the whole response body, so
 * this uses a raw fetch + ReadableStream reader instead — the first
 * streaming consumer in the frontend.
 */
export function streamTurn(turnId, onEvent) {
  const controller = new AbortController();

  (async () => {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/assistant/turns/${turnId}/stream`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      onEvent("error", { message: `Stream failed with status ${res.status}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          let eventName = "message";
          let dataLine = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (dataLine) {
            try {
              onEvent(eventName, JSON.parse(dataLine));
            } catch {
              onEvent(eventName, dataLine);
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") onEvent("error", { message: err.message });
    }
  })();

  return () => controller.abort();
}
