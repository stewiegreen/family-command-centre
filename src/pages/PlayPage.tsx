import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  cloudCreateTicTacToe,
  cloudDeleteGame,
  cloudJoinTicTacToe,
  cloudTicTacToeMove,
  getFirebaseAuth,
  subscribeGames,
} from '../lib/firebase';
import { applyMove, gameModeLabel, isInfiniteTtt, winningLine } from '../lib/ticTacToe';
import { fireConfetti } from '../lib/confetti';
import { cn } from '../lib/cn';
import type { GameType, Member, TicCell, TicTacToeGame } from '../types';

export function PlayPage() {
  const { data, currentUser, familyId, getMember } = useApp();
  const me = currentUser;
  const authUid = getFirebaseAuth()?.currentUser?.uid || null;

  const [games, setGames] = useState<TicTacToeGame[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId || !authUid) {
      setGames([]);
      return;
    }
    return subscribeGames(
      familyId,
      (list) => setGames(list),
      (e) => setErr(e.message),
    );
  }, [familyId, authUid]);

  const active = useMemo(
    () => games.find((g) => g.id === activeId) || null,
    [games, activeId],
  );

  const waiting = games.filter((g) => g.status === 'waiting');
  const mineLive = games.filter(
    (g) =>
      (g.status === 'active' || g.status === 'waiting') &&
      me &&
      (g.hostMemberId === me.id || g.guestMemberId === me.id),
  );
  const finished = games.filter((g) => g.status === 'finished').slice(0, 8);

  const others = data.members.filter((m) => m.id !== me?.id && m.role !== 'media');

  const startGame = async (mode: GameType = 'tictactoe') => {
    if (!familyId || !me || !authUid) {
      setErr('Sign in with your own account to play across devices.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const g = await cloudCreateTicTacToe(
        familyId,
        { memberId: me.id, uid: authUid },
        mode,
      );
      setActiveId(g.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const joinGame = async (g: TicTacToeGame) => {
    if (!familyId || !me || !authUid) return;
    if (g.hostMemberId === me.id) {
      setActiveId(g.id);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await cloudJoinTicTacToe(familyId, g.id, { memberId: me.id, uid: authUid });
      setActiveId(g.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const playCell = async (index: number) => {
    if (!familyId || !me || !authUid || !active) return;
    if (active.status !== 'active') return;
    if (active.board[index]) return;

    const amHost = active.hostMemberId === me.id;
    const amGuest = active.guestMemberId === me.id;
    if (!amHost && !amGuest) return;

    const myMark: TicCell = amHost ? 'X' : 'O';
    if (active.turn !== myMark) return;

    let result;
    try {
      result = applyMove(active, index);
    } catch {
      return;
    }

    setBusy(true);
    try {
      await cloudTicTacToeMove(familyId, active.id, {
        board: result.board,
        turn: result.turn,
        winner: result.winner,
        status: result.status,
        xMoves: result.xMoves,
        oMoves: result.oMoves,
      });
      if (result.winner && result.winner === myMark) {
        fireConfetti({ count: 120, power: 14, origin: { x: 0.5, y: 0.4 } });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelGame = async (g: TicTacToeGame) => {
    if (!familyId || !me) return;
    if (g.hostMemberId !== me.id && g.guestMemberId !== me.id) return;
    setBusy(true);
    try {
      await cloudDeleteGame(familyId, g.id);
      if (activeId === g.id) setActiveId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!me) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <Card className="p-6 text-center text-muted">Sign in to play.</Card>
      </div>
    );
  }

  if (!familyId || !authUid) {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-3">
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-accent" /> Play
        </h1>
        <Card className="p-4 text-sm text-muted">
          Multiplayer needs cloud sync and each player signed in on their own device.
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4 pb-16">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-accent" /> Play
        </h1>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Button size="sm" onClick={() => void startGame('tictactoe')} disabled={busy}>
            Classic
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void startGame('tictactoe_infinite')} disabled={busy}>
            Infinite
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted -mt-1">
        Classic is normal 3-in-a-row. <strong className="text-fg font-medium">Infinite</strong>: each
        player only keeps 3 marks — your 4th placement removes your oldest. Games rarely draw.
      </p>

      {err && (
        <p className="text-sm text-warn bg-warn/10 rounded-lg px-3 py-2">{err}</p>
      )}

      {active && (
        <TttBoard
          game={active}
          me={me}
          getMember={getMember}
          onCell={(i) => void playCell(i)}
          onClose={() => setActiveId(null)}
          onCancel={() => void cancelGame(active)}
          busy={busy}
        />
      )}

      {mineLive.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Your games</h2>
          {mineLive.map((g) => (
            <GameRow
              key={g.id}
              game={g}
              getMember={getMember}
              meId={me.id}
              onOpen={() => setActiveId(g.id)}
              onCancel={() => void cancelGame(g)}
            />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Open lobbies</h2>
        {waiting.filter((g) => g.hostMemberId !== me.id).length === 0 ? (
          <Card className="p-4 text-sm text-muted">
            No open games. Start one and wait for a sibling to join.
            {others.length > 0 && (
              <span className="block mt-1 text-xs">
                Playing with: {others.map((m) => m.name).join(', ')}
              </span>
            )}
          </Card>
        ) : (
          waiting
            .filter((g) => g.hostMemberId !== me.id)
            .map((g) => (
              <Card key={g.id} className="p-3 flex items-center gap-3">
                <Avatar {...(getMember(g.hostMemberId) || { name: "?" })} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-fg truncate">
                    {getMember(g.hostMemberId)?.name || 'Someone'}&apos;s game
                  </p>
                  <p className="text-xs text-muted">
                    {gameModeLabel(g.type)} · waiting · you&apos;ll be O
                  </p>
                </div>
                <Button size="sm" onClick={() => void joinGame(g)} disabled={busy}>
                  <UserPlus className="w-4 h-4 mr-1" /> Join
                </Button>
              </Card>
            ))
        )}
      </section>

      {finished.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Recent</h2>
          {finished.map((g) => (
            <GameRow
              key={g.id}
              game={g}
              getMember={getMember}
              meId={me.id}
              onOpen={() => setActiveId(g.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function GameRow({
  game,
  getMember,
  meId,
  onOpen,
  onCancel,
}: {
  game: TicTacToeGame;
  getMember: (id: string) => Member | undefined;
  meId: string;
  onOpen: () => void;
  onCancel?: () => void;
}) {
  const host = getMember(game.hostMemberId);
  const guest = game.guestMemberId ? getMember(game.guestMemberId) : null;
  const mode = gameModeLabel(game.type);
  const label =
    game.status === 'waiting'
      ? `${mode} · Waiting…`
      : game.status === 'finished'
        ? game.winner === 'draw'
          ? `${mode} · Draw`
          : game.winner === 'X'
            ? `${mode} · ${host?.name || 'Host'} won`
            : `${mode} · ${guest?.name || 'Guest'} won`
        : `${mode} · In progress`;

  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="flex -space-x-2">
        <Avatar {...(host || { name: "?" })} size="sm" />
        {guest ? <Avatar {...guest} size="sm" /> : null}
      </div>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-fg truncate">
          {host?.name || '?'} vs {guest?.name || '…'}
        </p>
        <p className="text-xs text-muted">{label}</p>
      </button>
      {onCancel && (game.hostMemberId === meId || game.guestMemberId === meId) && game.status !== 'finished' && (
        <button
          type="button"
          className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10"
          title="Cancel game"
          onClick={onCancel}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </Card>
  );
}

function TttBoard({
  game,
  me,
  getMember,
  onCell,
  onClose,
  onCancel,
  busy,
}: {
  game: TicTacToeGame;
  me: Member;
  getMember: (id: string) => Member | undefined;
  onCell: (i: number) => void;
  onClose: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const host = getMember(game.hostMemberId);
  const guest = game.guestMemberId ? getMember(game.guestMemberId) : null;
  const amHost = game.hostMemberId === me.id;
  const amGuest = game.guestMemberId === me.id;
  const myMark: TicCell | null = amHost ? 'X' : amGuest ? 'O' : null;
  const myTurn = game.status === 'active' && myMark !== null && game.turn === myMark;
  const win = winningLine(game.board);

  const infinite = isInfiniteTtt(game.type);
  const myMoves = myMark === 'X' ? game.xMoves || [] : myMark === 'O' ? game.oMoves || [] : [];
  /** Oldest mark will vanish on the next place (infinite, already 3 on board). */
  const fadingIndex =
    infinite && myTurn && myMoves.length >= 3 ? myMoves[0]! : null;

  let statusText = '';
  if (game.status === 'waiting') statusText = 'Waiting for someone to join…';
  else if (game.status === 'finished') {
    if (game.winner === 'draw') statusText = "It's a draw!";
    else if (game.winner === myMark) statusText = 'You win! 🎉';
    else statusText = `${game.winner === 'X' ? host?.name : guest?.name} wins`;
  } else if (myTurn) {
    statusText =
      infinite && myMoves.length >= 3
        ? 'Your turn — next mark removes your oldest'
        : 'Your turn';
  } else statusText = `${game.turn === 'X' ? host?.name : guest?.name}'s turn`;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-center">
            <Avatar {...(host || { name: "?" })} size="md" />
            <p className="text-[10px] mt-1 text-muted font-bold">X</p>
          </div>
          <span className="text-muted text-sm">vs</span>
          <div className="text-center">
            {guest ? (
              <Avatar {...guest} size="md" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted" />
              </div>
            )}
            <p className="text-[10px] mt-1 text-muted font-bold">O</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-center text-[10px] font-bold uppercase tracking-wide text-muted">
        {gameModeLabel(game.type)} Tic-Tac-Toe
        {infinite ? ' · max 3 marks each' : ''}
      </p>
      <p
        className={cn(
          'text-center text-sm font-semibold',
          myTurn ? 'text-accent' : 'text-fg',
          game.status === 'finished' && game.winner === myMark && 'text-success',
        )}
      >
        {statusText}
      </p>

      <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto aspect-square">
        {game.board.map((cell, i) => {
          const isWin = win?.includes(i);
          const canPlay = myTurn && !cell && !busy;
          return (
            <button
              key={i}
              type="button"
              disabled={!canPlay}
              onClick={() => onCell(i)}
              className={cn(
                'rounded-xl border-2 flex items-center justify-center text-4xl font-black transition-colors',
                isWin
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-border bg-surface-2/50 text-fg',
                canPlay && 'hover:border-accent/60 hover:bg-accent/10 cursor-pointer',
                !canPlay && 'cursor-default',
                fadingIndex === i && 'opacity-45 ring-2 ring-dashed ring-warn/60',
              )}
            >
              {cell === 'X' ? (
                <span className={cn('text-sky-400', fadingIndex === i && 'line-through decoration-2')}>X</span>
              ) : cell === 'O' ? (
                <span className={cn('text-rose-400', fadingIndex === i && 'line-through decoration-2')}>O</span>
              ) : (
                <span className="opacity-0">·</span>
              )}
            </button>
          );
        })}
      </div>

      {(amHost || amGuest) && game.status !== 'finished' && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted">
            Cancel game
          </Button>
        </div>
      )}
    </Card>
  );
}
