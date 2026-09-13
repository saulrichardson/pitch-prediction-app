"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import {
  gameDateSchema,
  type CatalogGame,
  type GameAvailability,
  type GameCatalog,
} from "@pitch/domain";
import { ReplayApiError, requestJson } from "./api";
import { teamById } from "./mlb-identity";
import { TeamMark } from "./mlb-media";

const dateLabel = (date: string, style: "short" | "full" = "short") =>
  gameDateSchema.safeParse(date).success
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: style === "full" ? "long" : "short",
        ...(style === "full"
          ? ({ month: "long", day: "numeric" } as const)
          : {}),
      }).format(new Date(`${date}T12:00:00Z`))
    : "Games";

export function GameBrowser({
  date,
  gamePk,
  busy,
  notice,
  onBrowse,
  onOpen,
  onReturn,
}: {
  date: string | null;
  gamePk: string | null;
  busy: boolean;
  notice: string | null;
  onBrowse: (date?: string | null, gamePk?: string | null) => void;
  onOpen: (id: string) => Promise<void>;
  onReturn: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<GameCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{
    game: CatalogGame;
    replay: GameAvailability;
  } | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [retryAllowedAt, setRetryAllowedAt] = useState<string | null>(null);
  const opened = useRef<string | null>(null);
  const preparationPanel = useRef<HTMLElement | null>(null);
  const requestLifetime = useRef<AbortController | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    const controller = new AbortController();
    requestLifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (gamePk) {
      preparationPanel.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
      preparationPanel.current?.focus({ preventScroll: true });
    }
  }, [gamePk]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setListError(null);
      try {
        const result = await requestJson<GameCatalog>(
          `/api/games${date ? `?date=${encodeURIComponent(date)}` : ""}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setCatalog(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setListError(
            error instanceof Error
              ? error.message
              : "The game list couldn’t be reached.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [date, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    opened.current = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const activeDate = date ?? catalog?.date;
    const poll = async () => {
      if (!gamePk || !activeDate || controller.signal.aborted) return;
      try {
        const result = await requestJson<{
          game: CatalogGame;
          replay: GameAvailability;
        }>(
          `/api/games/${encodeURIComponent(gamePk)}?date=${encodeURIComponent(activeDate)}`,
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) return;
        setSelection(result);
        setSelectionError(null);
        if (result.replay.status === "ready") {
          if (opened.current !== result.replay.edition.id) {
            opened.current = result.replay.edition.id;
            void onOpenRef.current(result.replay.edition.id);
          }
        } else if (
          result.replay.status === "queued" ||
          result.replay.status === "preparing"
        )
          timer = setTimeout(poll, 2500);
      } catch (error) {
        if (!controller.signal.aborted)
          setSelectionError(
            error instanceof ReplayApiError && error.status < 500
              ? error.message
              : "Connection interrupted. Preparation continues. Try again to check it.",
          );
      }
    };
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setSelection(null);
      setSelectionError(null);
      return poll();
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [gamePk, date, catalog?.date, refresh]);

  const request = useCallback(
    async (game: CatalogGame) => {
      if (requesting || busy) return;
      const signal = requestLifetime.current?.signal;
      const initialRoute = window.location.search;
      setRequesting(true);
      setSelectionError(null);
      try {
        const result = await requestJson<{ replay: GameAvailability }>(
          `/api/games/${game.gamePk}`,
          { body: { date: game.date }, signal },
        );
        if (signal?.aborted || window.location.search !== initialRoute) return;
        setSelection({ game, replay: result.replay });
        onBrowse(game.date, game.gamePk);
        setRefresh((value) => value + 1);
      } catch (error) {
        if (signal?.aborted || window.location.search !== initialRoute) return;
        setSelection({ game, replay: { status: "available" } });
        onBrowse(game.date, game.gamePk);
        setSelectionError(
          error instanceof Error
            ? error.message
            : "The replay couldn’t be reached.",
        );
      } finally {
        if (!signal?.aborted) setRequesting(false);
      }
    },
    [requesting, busy, onBrowse],
  );

  const selected = selection?.game.gamePk === gamePk ? selection : null;
  const progress = selected?.replay;
  const selectedDate = date ?? catalog?.date;
  const retryAt = progress?.status === "failed" ? progress.retryAt : null;
  useEffect(() => {
    if (!retryAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const checkReset = () => {
      const remaining = Date.parse(retryAt) - Date.now();
      if (remaining <= 0) setRetryAllowedAt(retryAt);
      else timer = setTimeout(checkReset, Math.min(2_147_483_647, remaining));
    };
    timer = setTimeout(checkReset, 0);
    return () => clearTimeout(timer);
  }, [retryAt]);
  const retryBlocked =
    progress?.status === "failed" &&
    (!progress.retryable || Boolean(retryAt && retryAllowedAt !== retryAt));

  return (
    <section className="game-browser" aria-label="Game browser">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">This week in baseball</p>
          <h1>Choose a game.</h1>
          <p>One at-bat. Any team.</p>
        </div>
        <button
          className="text-button catalog-return"
          onClick={onReturn}
          disabled={busy}
          aria-label="Return to replay"
        >
          <ArrowLeft size={15} /> Replay
        </button>
      </div>
      {catalog ? (
        <div className="date-strip" role="group" aria-label="Game date">
          {[...catalog.window.dates].reverse().map((day) => (
            <button
              key={day}
              className={selectedDate === day ? "selected" : ""}
              aria-pressed={selectedDate === day}
              aria-label={dateLabel(day, "full")}
              onClick={() => onBrowse(day)}
              disabled={busy || requesting}
            >
              <span>
                {day === catalog.window.end ? "Today" : dateLabel(day)}
              </span>
              <strong>{Number(day.slice(-2))}</strong>
            </button>
          ))}
        </div>
      ) : null}
      {gamePk ? (
        <section
          ref={preparationPanel}
          tabIndex={-1}
          className="preparation-panel"
          aria-label="Selected game"
          aria-live="polite"
        >
          <div className="preparation-title">
            <div>
              <p className="eyebrow">
                {progress?.status === "ready"
                  ? "Replay ready"
                  : progress?.status === "failed"
                    ? "Preparation paused"
                    : "Your replay"}
              </p>
              <h2>
                {selected
                  ? `${selected.game.away.abbreviation} at ${selected.game.home.abbreviation}`
                  : "Opening game"}
              </h2>
            </div>
            <button
              className="text-button"
              onClick={() => onBrowse(selectedDate)}
              disabled={busy}
            >
              Back to games
            </button>
          </div>
          {selectionError || notice ? (
            <p className="connection-notice">{selectionError ?? notice}</p>
          ) : progress?.status === "failed" ? (
            <p>{progress.message}</p>
          ) : progress?.status === "preparing" ? (
            <p>
              Preparing pitch{" "}
              {Math.min(progress.completed + 1, progress.total ?? 1)}
              {progress.total ? ` of ${progress.total}` : ""}.
            </p>
          ) : progress?.status === "queued" ? (
            <p>Waiting to prepare your replay. You can keep browsing.</p>
          ) : progress?.status === "ready" ? (
            <p>Opening your saved replay.</p>
          ) : (
            <p>Prepare this at-bat once, then play it anytime.</p>
          )}
          {progress &&
          (progress.status === "queued" || progress.status === "preparing") &&
          !selectionError ? (
            <div className="preparation-progress">
              <LoaderCircle className="spinner" size={16} />
              {progress.total ? (
                <progress
                  max={progress.total}
                  value={progress.completed}
                  aria-label="Pitches prepared"
                />
              ) : null}
              <span>
                {progress.total
                  ? `${progress.completed} / ${progress.total} saved`
                  : "Queued"}
              </span>
            </div>
          ) : null}
          {progress?.status === "failed" && progress.retryAt ? (
            <p className="retry-time">
              Available after{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(progress.retryAt))}
              .
            </p>
          ) : null}
          {selectionError ? (
            <button
              className="button secondary"
              onClick={() => setRefresh((v) => v + 1)}
            >
              Check again
            </button>
          ) : progress?.status === "ready" && notice ? (
            <button
              className="button primary"
              onClick={() => onOpen(progress.edition.id)}
              disabled={busy}
            >
              Open replay <ArrowRight size={16} />
            </button>
          ) : selected &&
            (progress?.status === "available" ||
              progress?.status === "failed") ? (
            <button
              className="button primary"
              onClick={() => request(selected.game)}
              disabled={requesting || retryBlocked}
            >
              {requesting
                ? "Starting preparation"
                : progress.status === "failed"
                  ? "Try again"
                  : "Prepare replay"}
              <ArrowRight size={16} />
            </button>
          ) : null}
        </section>
      ) : null}
      <div className="games-heading">
        <h2>{selectedDate ? dateLabel(selectedDate, "full") : "Games"}</h2>
        {catalog && !loading ? (
          <span>
            {catalog.games.length}{" "}
            {catalog.games.length === 1 ? "game" : "games"}
          </span>
        ) : null}
      </div>
      {listError ? (
        <div className="catalog-empty" role="alert">
          <p>{listError}</p>
          <button
            className="button secondary"
            onClick={() => setRefresh((v) => v + 1)}
          >
            Try again
          </button>
          <button className="text-button" onClick={() => onBrowse(null)}>
            Show this week
          </button>
        </div>
      ) : loading ? (
        <div className="catalog-loading" role="status">
          <LoaderCircle className="spinner" size={20} /> Loading games
        </div>
      ) : catalog?.games.length === 0 ? (
        <div className="catalog-empty">
          <h3>No games on this date.</h3>
          <p>Choose another day above.</p>
        </div>
      ) : (
        <div className="game-list">
          {catalog?.games.map((game) => {
            const availability =
              gamePk === game.gamePk && selected
                ? selected.replay
                : game.replay;
            const activePreparation =
              availability.status === "preparing" ||
              availability.status === "queued";
            const action =
              availability.status === "ready"
                ? "open replay"
                : activePreparation
                  ? "view preparation"
                  : "prepare replay";
            return (
              <button
                className={`game-row ${gamePk === game.gamePk ? "is-selected" : ""}`}
                key={game.gamePk}
                disabled={game.status !== "complete" || busy || requesting}
                aria-label={`${game.away.name} at ${game.home.name}${game.doubleheader ? `, game ${game.gameNumber}` : ""}, ${game.status === "complete" ? action : game.statusLabel}`}
                onClick={() =>
                  game.replay.status === "ready"
                    ? onOpen(game.replay.edition.id)
                    : request(game)
                }
              >
                <span className="game-teams">
                  <span className="game-abbreviations">
                    <span className="game-team">
                      <TeamMark team={teamById(game.away.id)} />
                      <b>{game.away.abbreviation}</b>
                    </span>
                    <small>at</small>
                    <span className="game-team">
                      <TeamMark team={teamById(game.home.id)} />
                      <b>{game.home.abbreviation}</b>
                    </span>
                  </span>
                  <span className="game-team-names">
                    {game.away.name} <span>at</span> {game.home.name}
                  </span>
                </span>
                <span className="game-row-detail">
                  {game.doubleheader ? (
                    <span>Game {game.gameNumber}</span>
                  ) : null}
                  <span>
                    {game.status === "complete" ? "Final" : game.statusLabel}
                  </span>
                </span>
                <span className="game-row-action">
                  {game.status === "complete" ? (
                    <>
                      {availability.status === "ready" ? (
                        <>
                          <Check size={14} />
                          <span>Ready</span>
                        </>
                      ) : activePreparation ? (
                        <>
                          <LoaderCircle className="spinner" size={14} />
                          <span>Preparing</span>
                        </>
                      ) : (
                        <span>Prepare replay</span>
                      )}
                      <ArrowRight size={17} />
                    </>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
