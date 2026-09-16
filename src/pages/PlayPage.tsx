import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  cloudConnect4Move,
  cloudCreateConnect4,
  cloudCreateTicTacToe,
  cloudDeleteGame,
  cloudJoinGame,
  cloudTicTacToeMove,
  getFirebaseAuth,
  subscribeGames,
} from '../lib/firebase';
import { applyMove, isInfiniteTtt, winningLine } from '../lib/ticTacToe';
import {
  applyConnect4Move,
  C4_COLS,
  C4_ROWS,
  connect4WinningCells,
  dropRow,
  gameTitle,
} from '../lib/connect4';
import { fireConfetti } from '../lib/confetti';
import { cn } from '../lib/cn';
import type {
  Connect4Game,
  FamilyGame,
  Member,
  TicCell,
  TicTacToeGame,
} from '../types';

function isTtt(g: FamilyGame): g is TicTacToeGame {
  return g.type === 'tictactoe' || g.type === 'tictactoe_infinite';
}
function isC4(g: FamilyGame): g is Connect4Game {
  return g.type === 'connect4';
}

export function PlayPage() {
  const { currentUser, familyId, getMember } = useApp();
  const me = currentUser;
  const authUid = getFirebaseAuth()?.currentUser?.uid || null;

  const [games, setGames] = useState<FamilyGame[]>([]);
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
  const finished = games.filter((g) => g.status === 'finished').slice(0, 10);

  const startTtt = async (mode: 'tictactoe' | 'tictactoe_infinite') => {
    if (!familyId || !me || !authUid) {
      setErr('Sign in with your own account to play across devices.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const g = await cloudCreateTicTacToe(familyId, { memberId: me.id, uid: authUid }, mode);
      setActiveId(g.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startC4 = async () => {
    if (!familyId || !me || !authUid) {
      setErr('Sign in with your own account to play across devices.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const g = await cloudCreateConnect4(familyId, { memberId: me.id, uid: authUid });
      setActiveId(g.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const joinGame = async (g: FamilyGame) => {
    if (!familyId || !me || !authUid) return;
    if (g.hostMemberId === me.id) {
      setActiveId(g.id);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await cloudJoinGame(familyId, g.id, { memberId: me.id, uid: authUid });
      setActiveId(g.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const playTttCell = async (index: number) => {
    if (!familyId || !me || !authUid || !active || !isTtt(active)) return;
    if (active.status !== 'active' || active.board[index]) return;
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

  const playC4Col = async (col: number) => {
    if (!familyId || !me || !authUid || !active || !isC4(active)) return;
    if (active.status !== 'active') return;
    const amHost = active.hostMemberId === me.id;
    const amGuest = active.guestMemberId === me.id;
    if (!amHost && !amGuest) return;
    const myMark = amHost ? 'R' : 'Y';
    if (active.turn !== myMark) return;
    if (dropRow(active.board, col) < 0) return;
    let result;
    try {
      result = applyConnect4Move(active, col);
    } catch {
      return;
    }
    setBusy(true);
    try {
      await cloudConnect4Move(familyId, active.id, result);
      if (result.winner && result.winner === myMark) {
        fireConfetti({ count: 140, power: 15, origin: { x: 0.5, y: 0.35 } });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelGame = async (g: FamilyGame) => {
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
    <div className="max-w-xl mx-auto p-4 space-y-5 pb-16">
      <div>
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-accent" /> Play
        </h1>
        <p className="text-sm text-muted mt-1">
          Games for two devices — start a lobby, sibling joins from their phone.
        </p>
      </div>

      {err && (
        <p className="text-sm text-warn bg-warn/10 rounded-lg px-3 py-2">{err}</p>
      )}

      {/* Start new */}
      <Card className="p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-fg">Tic-Tac-Toe</h2>
          <p className="text-xs text-muted mt-0.5">
            Classic is normal 3-in-a-row. Infinite: only 3 marks each — your 4th removes the oldest.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" onClick={() => void startTtt('tictactoe')} disabled={busy}>
              Classic Tic-Tac-Toe
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void startTtt('tictactoe_infinite')}
              disabled={busy}
            >
              Infinite Tic-Tac-Toe
            </Button>
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <h2 className="text-sm font-bold text-fg">Connect 4</h2>
          <p className="text-xs text-muted mt-0.5">
            Drop discs in a column — first to get four in a row wins. Host is red, guest is yellow.
          </p>
          <div className="mt-2">
            <Button size="sm" onClick={() => void startC4()} disabled={busy}>
              New Connect 4
            </Button>
          </div>
        </div>
      </Card>

      {active && isTtt(active) && (
        <TttBoard
          game={active}
          me={me}
          getMember={getMember}
          onCell={(i) => void playTttCell(i)}
          onClose={() => setActiveId(null)}
          onCancel={() => void cancelGame(active)}
          busy={busy}
        />
      )}
      {active && isC4(active) && (
        <C4Board
          game={active}
          me={me}
          getMember={getMember}
          onCol={(c) => void playC4Col(c)}
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
          <Card className="p-4 text-sm text-muted">No open games. Start one above.</Card>
        ) : (
          waiting
            .filter((g) => g.hostMemberId !== me.id)
            .map((g) => (
              <Card key={g.id} className="p-3 flex items-center gap-3">
                <Avatar {...(getMember(g.hostMemberId) || { name: '?' })} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-fg truncate">{gameTitle(g.type)}</p>
                  <p className="text-xs text-muted">
                    {getMember(g.hostMemberId)?.name || 'Someone'} · waiting · you&apos;ll join as{' '}
                    {isC4(g) ? 'yellow' : 'O'}
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
  game: FamilyGame;
  getMember: (id: string) => Member | undefined;
  meId: string;
  onOpen: () => void;
  onCancel?: () => void;
}) {
  const host = getMember(game.hostMemberId);
  const guest = game.guestMemberId ? getMember(game.guestMemberId) : null;
  const title = gameTitle(game.type);
  let result = '';
  if (game.status === 'waiting') result = 'Waiting…';
  else if (game.status === 'finished') {
    if (game.winner === 'draw') result = 'Draw';
    else if (isTtt(game)) {
      result = game.winner === 'X' ? `${host?.name || 'Host'} won` : `${guest?.name || 'Guest'} won`;
    } else {
      result = game.winner === 'R' ? `${host?.name || 'Host'} won` : `${guest?.name || 'Guest'} won`;
    }
  } else result = 'In progress';

  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="flex -space-x-2">
        <Avatar {...(host || { name: '?' })} size="sm" />
        {guest ? <Avatar {...guest} size="sm" /> : null}
      </div>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-fg truncate">{title}</p>
        <p className="text-xs text-muted truncate">
          {host?.name || '?'} vs {guest?.name || '…'} · {result}
        </p>
      </button>
      {onCancel &&
        (game.hostMemberId === meId || game.guestMemberId === meId) &&
        game.status !== 'finished' && (
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
  const fadingIndex = infinite && myTurn && myMoves.length >= 3 ? myMoves[0]! : null;

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
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-center">
            <Avatar {...(host || { name: '?' })} size="md" />
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
        {gameTitle(game.type)}
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
                isWin ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-surface-2/50 text-fg',
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

function C4Board({
  game,
  me,
  getMember,
  onCol,
  onClose,
  onCancel,
  busy,
}: {
  game: Connect4Game;
  me: Member;
  getMember: (id: string) => Member | undefined;
  onCol: (c: number) => void;
  onClose: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const host = getMember(game.hostMemberId);
  const guest = game.guestMemberId ? getMember(game.guestMemberId) : null;
  const amHost = game.hostMemberId === me.id;
  const amGuest = game.guestMemberId === me.id;
  const myMark = amHost ? 'R' : amGuest ? 'Y' : null;
  const myTurn = game.status === 'active' && myMark !== null && game.turn === myMark;
  const win = connect4WinningCells(game.board);

  let statusText = '';
  if (game.status === 'waiting') statusText = 'Waiting for someone to join…';
  else if (game.status === 'finished') {
    if (game.winner === 'draw') statusText = "It's a draw!";
    else if (game.winner === myMark) statusText = 'You win! 🎉';
    else statusText = `${game.winner === 'R' ? host?.name : guest?.name} wins`;
  } else if (myTurn) statusText = 'Your turn — tap a column';
  else statusText = `${game.turn === 'R' ? host?.name : guest?.name}'s turn`;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-center">
            <Avatar {...(host || { name: '?' })} size="md" />
            <p className="text-[10px] mt-1 font-bold text-red-400">Red</p>
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
            <p className="text-[10px] mt-1 font-bold text-amber-400">Yellow</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-center text-[10px] font-bold uppercase tracking-wide text-muted">
        {gameTitle(game.type)}
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

      {/* Column drop targets */}
      <div className="max-w-[320px] mx-auto space-y-1">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: C4_COLS }, (_, col) => {
            const can = myTurn && !busy && dropRow(game.board, col) >= 0;
            return (
              <button
                key={col}
                type="button"
                disabled={!can}
                onClick={() => onCol(col)}
                className={cn(
                  'h-7 rounded-md text-[10px] font-bold',
                  can
                    ? 'bg-accent/20 text-accent hover:bg-accent/30'
                    : 'bg-surface-2/40 text-faint cursor-default',
                )}
                title={can ? `Drop in column ${col + 1}` : undefined}
              >
                ▼
              </button>
            );
          })}
        </div>
        <div
          className="grid grid-cols-7 gap-1 p-2 rounded-xl bg-blue-900/40 border border-blue-700/30"
          style={{ gridTemplateRows: `repeat(${C4_ROWS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: C4_ROWS }, (_, row) =>
            Array.from({ length: C4_COLS }, (_, col) => {
              const i = row * C4_COLS + col;
              const cell = game.board[i];
              const isWin = win?.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!(myTurn && !busy && dropRow(game.board, col) >= 0)}
                  onClick={() => onCol(col)}
                  className={cn(
                    'aspect-square rounded-full border-2 flex items-center justify-center transition-transform',
                    !cell && 'bg-surface/80 border-border/50',
                    cell === 'R' && 'bg-red-500 border-red-300 shadow-md',
                    cell === 'Y' && 'bg-amber-400 border-amber-200 shadow-md',
                    isWin && 'ring-2 ring-accent scale-105',
                  )}
                />
              );
            }),
          )}
        </div>
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
