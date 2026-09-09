import { useSyncExternalStore } from "react";
let messages: string[] = [];
const listeners = new Set<() => void>();
const record = (value: string) => {
  if (!messages.includes(value)) {
    messages = [...messages, value];
    listeners.forEach((fn) => fn());
  }
};
window.addEventListener("error", (event) => record(event.message));
window.addEventListener("unhandledrejection", (event) =>
  record(String(event.reason)),
);
const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  record(
    args.map((v) => (v instanceof Error ? v.message : String(v))).join(" "),
  );
  originalError(...args);
};
export const useErrors = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => messages,
  );
