"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditionSummary, ReplayCommand, ReplayView } from "@pitch/domain";
import { ReplayApiError, requestJson } from "./api";
import { unresolvedCommand, type PendingCommand } from "./pending-command";

type Screen =
  | { kind: "loading" }
  | { kind: "intro"; edition: EditionSummary }
  | { kind: "ready"; replay: ReplayView }
  | { kind: "unavailable"; message: string };
const placeKey = "pitch.replay.v1";
const commandKey = "pitch.command.v1";
function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* URL recovery still works when storage is unavailable. */
  }
}
function remembered(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function savePlace(id: string) {
  remember(placeKey, id);
  const url = new URL(window.location.href);
  url.searchParams.set("replay", id);
  window.history.replaceState(null, "", url);
}
function message(error: unknown) {
  if (error instanceof ReplayApiError && error.code === "replay_unavailable")
    return error.message;
  if (error instanceof ReplayApiError && error.status >= 500)
    return "The replay couldn’t be reached. Try again.";
  return "Connection interrupted. Your place is saved.";
}

export function useReplay() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsRetry, setNeedsRetry] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const pending = useRef<PendingCommand | null>(null);
  const accept = useCallback((replay: ReplayView) => {
    savePlace(replay.id);
    pending.current = unresolvedCommand(remembered(commandKey), replay);
    setNeedsRetry(Boolean(pending.current));
    setNotice(pending.current ? "Your last action needs a retry." : null);
    if (!pending.current) remember(commandKey, null);
    setScreen({ kind: "ready", replay });
  }, []);

  const restore = useCallback(
    async (signal?: AbortSignal) => {
      const token = ++generation.current;
      const id =
        new URL(window.location.href).searchParams.get("replay") ??
        remembered(placeKey);
      try {
        if (id && /^[a-f0-9]{64}$/.test(id)) {
          try {
            const { replay } = await requestJson<{ replay: ReplayView }>(
              `/api/replays/${id}`,
              { signal },
            );
            if (!signal?.aborted && token === generation.current)
              accept(replay);
            return;
          } catch (error) {
            if (!(error instanceof ReplayApiError && error.status === 404))
              throw error;
            remember(placeKey, null);
            const url = new URL(window.location.href);
            url.searchParams.delete("replay");
            window.history.replaceState(null, "", url);
          }
        }
        const { edition } = await requestJson<{ edition: EditionSummary }>(
          "/api/replays",
          { signal },
        );
        if (!signal?.aborted && token === generation.current) {
          setScreen({ kind: "intro", edition });
          setNotice(null);
        }
      } catch (error) {
        if (!signal?.aborted && token === generation.current)
          setScreen({ kind: "unavailable", message: message(error) });
      }
    },
    [accept],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Let React finish mounting; an abandoned Strict Mode pass starts no request.
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return restore(controller.signal);
    });
    const onHistory = (event: PopStateEvent | StorageEvent) => {
      if (
        !active.current &&
        (!(event instanceof StorageEvent) ||
          event.key === placeKey ||
          event.key === commandKey)
      )
        void restore(controller.signal);
    };
    window.addEventListener("popstate", onHistory);
    window.addEventListener("storage", onHistory);
    return () => {
      controller.abort();
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("storage", onHistory);
    };
  }, [restore]);

  async function start() {
    if (screen.kind !== "intro" || active.current) return;
    generation.current++;
    active.current = true;
    setBusy(true);
    setNotice(null);
    try {
      // Save intent first: response loss and refresh can reattach to the same session.
      savePlace(screen.edition.id);
      const { replay } = await requestJson<{ replay: ReplayView }>(
        "/api/replays",
        { body: { editionId: screen.edition.id } },
      );
      accept(replay);
    } catch (error) {
      setNotice(message(error));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  async function send(action: ReplayCommand["action"]) {
    if (screen.kind !== "ready" || active.current) return;
    generation.current++;
    const replay = screen.replay;
    const command =
      pending.current?.replayId === replay.id
        ? pending.current.command
        : {
            id: crypto.randomUUID(),
            action,
            expectedRevision: replay.revision,
          };
    pending.current = { replayId: replay.id, command };
    setNeedsRetry(true);
    remember(commandKey, JSON.stringify(pending.current));
    active.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const response = await requestJson<{ replay: ReplayView }>(
        `/api/replays/${replay.id}`,
        { body: command },
      );
      accept(response.replay);
    } catch (error) {
      if (error instanceof ReplayApiError && error.status === 404) {
        pending.current = null;
        setNeedsRetry(false);
        remember(commandKey, null);
        await restore();
        return;
      }
      setNotice("Connection interrupted. Checking your saved place…");
      // A write may have committed even when its response was lost. Read before retrying.
      try {
        const response = await requestJson<{ replay: ReplayView }>(
          `/api/replays/${replay.id}`,
        );
        if (
          response.replay.revision > command.expectedRevision ||
          (error instanceof ReplayApiError && error.status === 409)
        ) {
          accept(response.replay);
          if (error instanceof ReplayApiError && error.status === 409)
            setNotice("Your place is up to date.");
        } else setNotice(message(error));
      } catch {
        setNotice(message(error));
      }
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function reopen() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try {
      await restore();
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { screen, busy, notice, start, send, restore: reopen, needsRetry };
}
