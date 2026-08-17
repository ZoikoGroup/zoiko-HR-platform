import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation, listConversations, deleteConversation, renameConversation,
  listTurns, createTurn, streamTurn, getCapabilities, getTeamScope,
} from "../../../service/assistantService";

/**
 * Shared engine behind every assistant surface (WF-01 docked panel, WF-02
 * full workspace, WF-03 mobile) so they present the same conversation state
 * through different layouts rather than three divergent implementations.
 */
export function useAssistantConversation(active = true) {
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [turns, setTurns] = useState([]);
  const [scope, setScope] = useState(null); // null = self; otherwise {id, full_name}
  const [teamMembers, setTeamMembers] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [streamingTurnId, setStreamingTurnId] = useState(null);
  const [streamingText, setStreamingText] = useState("");
  const [degradedMessage, setDegradedMessage] = useState(null);
  const stopStreamRef = useRef(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await listConversations();
      setConversations(res.items || []);
      return res.items || [];
    } catch {
      return [];
    }
  }, []);

  const openConversation = useCallback(async (id) => {
    setLoadingConversation(true);
    setDegradedMessage(null);
    try {
      const res = await listTurns(id);
      setConversationId(id);
      setTurns(res.items || []);
    } catch (e) {
      setDegradedMessage(e.message || "Could not open that conversation.");
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const startNewConversation = useCallback(async () => {
    setLoadingConversation(true);
    setDegradedMessage(null);
    try {
      const conv = await createConversation();
      setConversationId(conv.id);
      setTurns([]);
      await refreshConversations();
      return conv.id;
    } catch (e) {
      setDegradedMessage(e.message || "Could not start a conversation.");
      return null;
    } finally {
      setLoadingConversation(false);
    }
  }, [refreshConversations]);

  const removeConversation = useCallback(async (id) => {
    await deleteConversation(id);
    await refreshConversations();
    if (id === conversationId) {
      setConversationId(null);
      setTurns([]);
    }
  }, [conversationId, refreshConversations]);

  const renameCurrentConversation = useCallback(async (id, title) => {
    await renameConversation(id, title);
    await refreshConversations();
  }, [refreshConversations]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!active || initializedRef.current) return;
    initializedRef.current = true;
    (async () => {
      const items = await refreshConversations();
      if (items.length > 0) {
        await openConversation(items[0].id);
      } else {
        await startNewConversation();
      }
      try {
        setCapabilities(await getCapabilities());
      } catch {
        // Advisory only.
      }
      try {
        const res = await getTeamScope();
        setTeamMembers(res.members || []);
      } catch {
        // No team = individual contributor; ScopeSelector just won't render.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const send = useCallback(async (text) => {
    const messageText = (text || "").trim();
    if (!messageText || !conversationId || sending) return;
    setSending(true);
    setDegradedMessage(null);

    const placeholder = {
      id: `pending-${Date.now()}`, user_input_text: messageText, status: "accepted",
      answer_text: null, sources: [], next_actions: [], completed_at: null,
    };
    setTurns((prev) => [...prev, placeholder]);

    try {
      const turn = await createTurn(conversationId, messageText, scope?.id);
      setTurns((prev) => prev.map((t) => (t === placeholder ? turn : t)));
      refreshConversations();

      if (turn.answer_text) {
        setStreamingTurnId(turn.id);
        setStreamingText("");
        const stop = streamTurn(turn.id, (eventName, data) => {
          if (eventName === "text.delta") setStreamingText(data.delta);
          if (eventName === "turn.completed" || eventName === "error") {
            setStreamingTurnId(null);
            setTurns((prev) => prev.map((t) => (t.id === turn.id ? { ...t, ...(data.id ? data : {}) } : t)));
            stop();
          }
        });
        stopStreamRef.current = stop;
      }
    } catch (e) {
      setTurns((prev) => prev.map((t) => (t === placeholder ? { ...t, status: "failed", error_message: e.message } : t)));
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, scope, refreshConversations]);

  useEffect(() => () => { stopStreamRef.current?.(); }, []);

  return {
    conversationId, conversations, turns, scope, setScope, teamMembers, capabilities,
    sending, loadingConversation, streamingTurnId, streamingText, degradedMessage,
    send, openConversation, startNewConversation, removeConversation, renameCurrentConversation,
  };
}
