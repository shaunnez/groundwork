import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { initialDemo, type DemoState } from "./model";
import { screens } from "./catalogue";
const subscribe = (fn: () => void) => {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
};
type Navigate = (
  screen: string,
  scene?: string,
  params?: Record<string, string>,
) => void;
type Context = {
  demo: DemoState;
  setDemo: Dispatch<SetStateAction<DemoState>>;
  page: string;
  scene: string;
  params: URLSearchParams;
  go: Navigate;
  toast: string;
  notify: (text: string) => void;
};
const DemoContext = createContext<Context | null>(null);
function loadDemo(): DemoState {
  try {
    const raw = JSON.parse(localStorage.getItem("procint-demo-v1") || "null");
    if (raw?.schema === 1 && raw.reviews && Array.isArray(raw.decisions))
      return { ...initialDemo(), ...raw };
  } catch {}
  return initialDemo();
}
export function DemoProvider({ children }: { children: ReactNode }) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "#/pursuit",
  );
  const [demo, setDemo] = useState<DemoState>(loadDemo);
  const [toast, setToast] = useState("");
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const page = path || "pursuit";
  const params = new URLSearchParams(query);
  const requested = params.get("state") || "normal";
  const scene = screens.find((s) => s.id === page)?.states.includes(requested)
    ? requested
    : "normal";
  useEffect(() => {
    try {
      localStorage.setItem("procint-demo-v1", JSON.stringify(demo));
    } catch {
      setToast("Demo changes could not be stored in this browser.");
    }
  }, [demo]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const go: Navigate = (screen, state = "normal", extra = {}) => {
    const search = new URLSearchParams({
      ...extra,
      ...(state !== "normal" ? { state } : {}),
    });
    window.location.hash = "/" + screen + (search.size ? "?" + search : "");
    window.scrollTo({ top: 0 });
  };
  return (
    <DemoContext.Provider
      value={{
        demo,
        setDemo,
        page,
        scene,
        params,
        go,
        toast,
        notify: setToast,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export const useDemo = () => {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Missing demo context");
  return context;
};
