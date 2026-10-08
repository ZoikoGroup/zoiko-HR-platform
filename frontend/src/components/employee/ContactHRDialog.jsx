import { useState, useEffect, useRef } from "react";
import { X, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { CONTACT_HR_TOPICS, validateContactHRForm, MAX_MESSAGE_LENGTH } from "../../utils/contactHRForm";
import { contactHR } from "../../service/employee";

/**
 * Contact HR Dialog
 * - topic select (default "Leave balance not set up" when no balances)
 * - message textarea with field-level errors and character count
 * - Send button (disabled while sending)
 * - confirmation "sent to the HR team"
 * - error shown inside dialog (including 400 "No HR contact" and 429 rate-limit)
 */
export default function ContactHRDialog({
  isOpen,
  onClose,
  defaultTopic = "Leave balance not set up",
  onSuccess,
}) {
  const [topic, setTopic] = useState(defaultTopic);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({ topicError: null, messageError: null });
  const [serverError, setServerError] = useState(null);
  const textareaRef = useRef(null);
  const focusRef = useRef(null);
  const autoCloseTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    };
  }, []);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTopic(defaultTopic);
      setMessage("");
      setErrors({ topicError: null, messageError: null });
      setServerError(null);
      setSending(false);
      setSent(false);
      setTimeout(() => focusRef.current?.focus(), 0);
    }
  }, [isOpen, defaultTopic]);

  const handleTopicChange = (e) => {
    const value = e.target.value;
    setTopic(value);
    const err = validateContactHRForm(value, message).topicError;
    setErrors((prev) => ({ ...prev, topicError: err }));
  };

  const handleMessageChange = (e) => {
    const value = e.target.value;
    setMessage(value);
    const err = validateContactHRForm(topic, value).messageError;
    setErrors((prev) => ({ ...prev, messageError: err }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateContactHRForm(topic, message);
    if (validation.topicError || validation.messageError) {
      setErrors({ topicError: validation.topicError, messageError: validation.messageError });
      return;
    }
    setSending(true);
    setServerError(null);
    try {
      await contactHR(topic, validation.normalizedMessage);
      setSent(true);
      onSuccess?.();
      // Auto-close after showing success
      autoCloseTimer.current = setTimeout(() => {
        onClose();
        setSent(false);
      }, 2000);
    } catch (err) {
      setSending(false);
      if (err.status === 400 && err.message?.includes("No HR contact")) {
        setServerError("No HR contact is set up for your organization yet. Please speak to your manager.");
      } else if (err.status === 429) {
        setServerError("Too many requests. Please wait a while before trying again.");
      } else {
        setServerError(err.message || "Failed to send message. Please try again.");
      }
    }
  };

  const charCount = validateContactHRForm(topic, message).normalizedMessage.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="contact-hr-title">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="contact-hr-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Contact HR Department</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Message sent</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your message has been sent to the HR team.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {serverError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm">{serverError}</p>
              </div>
            )}

            <div>
              <label htmlFor="contact-hr-topic" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Topic</label>
              <select
                ref={focusRef}
                id="contact-hr-topic"
                value={topic}
                onChange={handleTopicChange}
                disabled={sending}
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-colors ${
                  errors.topicError
                    ? "border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20"
                    : "border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
                } focus:ring-2 focus:outline-none`}
                aria-invalid={!!errors.topicError}
                aria-describedby={errors.topicError ? "topic-error" : undefined}
              >
                {CONTACT_HR_TOPICS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errors.topicError && (
                <p id="topic-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">{errors.topicError}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="contact-hr-message" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Message</label>
                <span className={`text-xs font-mono ${charCount > MAX_MESSAGE_LENGTH ? "text-red-500" : "text-slate-400"}`}>
                  {charCount}/{MAX_MESSAGE_LENGTH}
                </span>
              </div>
              <textarea
                id="contact-hr-message"
                value={message}
                onChange={handleMessageChange}
                disabled={sending}
                rows={5}
                className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-y transition-colors ${
                  errors.messageError
                    ? "border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20"
                    : "border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
                } focus:ring-2 focus:outline-none`}
                placeholder="Describe your question or concern..."
                aria-invalid={!!errors.messageError}
                aria-describedby={errors.messageError ? "message-error" : "message-hint"}
              />
              {errors.messageError ? (
                <p id="message-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">{errors.messageError}</p>
              ) : (
                <p id="message-hint" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Minimum 10 characters. HR will reply to your email on file.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}