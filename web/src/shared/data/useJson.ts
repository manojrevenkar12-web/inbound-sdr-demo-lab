import { useCallback, useEffect, useState } from "react";

export type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: T };

/** Fetches a generated JSON file. Every view renders all three states. */
export function useJson<T>(url: string | null): Load<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState({ status: "loading" });
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} answered ${res.status}`);
        return (await res.json()) as T;
      })
      .then((data) => { if (alive) setState({ status: "ready", data }); })
      .catch((err: Error) => { if (alive) setState({ status: "error", message: err.message, retry }); });
    return () => { alive = false; };
  }, [url, attempt, retry]);

  return state;
}
