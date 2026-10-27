/**
 * hooks/useNotificationSound.js
 * -----------------------------
 * Monitors unread notification count. When count increases (new notification arrived),
 * plays a notification chime if sound is enabled.
 */
import { useEffect, useRef, useState } from "react";
import { playNotificationSound } from "../utils/notificationSound";

const SOUND_PREF_KEY = "zoiko_notification_sound_enabled";

export function useNotificationSound(count) {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved !== null ? saved === "true" : true;
  });

  const prevCountRef = useRef(null);
  const isInitialMount = useRef(true);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, String(next));
      if (next) {
        playNotificationSound();
      }
      return next;
    });
  };

  useEffect(() => {
    const currentCount = Number(count) || 0;

    // Skip playing chime on initial component mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevCountRef.current = currentCount;
      return;
    }

    // Play chime when new notifications arrive
    if (prevCountRef.current !== null && currentCount > prevCountRef.current) {
      if (soundEnabled) {
        playNotificationSound();
      }
    }

    prevCountRef.current = currentCount;
  }, [count, soundEnabled]);

  return { soundEnabled, toggleSound };
}

