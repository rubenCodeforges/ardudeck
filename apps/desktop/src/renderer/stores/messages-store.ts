import { create } from 'zustand';
import type { StatusMessage, StatusSeverity } from '../../shared/ipc-channels';

const MAX_MESSAGES = 200;

interface MessagesState {
  /** Deduplicated messages, newest first */
  messages: StatusMessage[];
  /** Add or deduplicate a message (MessagesNG behavior) */
  addMessage: (severity: number, severityLabel: StatusSeverity, text: string) => void;
  /** Clear all messages */
  clear: () => void;
}

export const useMessagesStore = create<MessagesState>((set) => ({
  messages: [],

  addMessage: (severity, severityLabel, text) => {
    set((state) => {
      // MessagesNG behavior: find existing message with same text + severity
      const existingIdx = state.messages.findIndex(
        (m) => m.text === text && m.severity === severity,
      );

      if (existingIdx >= 0) {
        // Update timestamp and bump count, move to top
        const updated = [...state.messages];
        const existing = updated[existingIdx]!;
        updated.splice(existingIdx, 1);
        updated.unshift({
          ...existing,
          timestamp: Date.now(),
          count: existing.count + 1,
        });
        return { messages: updated };
      }

      // New unique message — prepend
      const msg: StatusMessage = {
        severity,
        severityLabel,
        text,
        timestamp: Date.now(),
        count: 1,
      };
      const messages = [msg, ...state.messages].slice(0, MAX_MESSAGES);
      return { messages };
    });
  },

  clear: () => set({ messages: [] }),
}));
