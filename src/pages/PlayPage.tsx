import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  cloudBattleshipFire,
  cloudBattleshipReady,
  cloudBattleshipResolve,
  cloudConnect4Move,
  cloudCreateBattleship,
  cloudCreateConnect4,
  cloudCreateTicTacToe,
  cloudDeleteGame,
  cloudJoinGame,
  cloudLoadFleet,
  cloudSaveFleet,
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
import {
  BS_SIZE,
  SHIP_LABEL,
  SHIP_ORDER,
  SHIP_SIZES,
  hitCellsFromShots,
  isFleetSunk,
  isValidPlacement,
  occupiedSet,
  randomFleet,
  resolveShotFull,
  shipCells,
} from '../lib/battleship';
import { fireConfetti } from '../lib/confetti';
import { cn } from '../lib/cn';
import type {
  BattleshipGame,
  Connect4Game,
  FamilyGame,
  Fleet,
  Member,
  ShipType,
  TicCell,
  TicTacToeGame,
} from '../types';

function isTtt(g: FamilyGame): g is TicTacToeGame {
  return g.type === 'tictactoe' || g.type === 'tictactoe_infinite';
}
function isC4(g: FamilyGame): g is Connect4Game {
  return g.type === 'connect4';
}
function isBs(g: FamilyGame): g is BattleshipGame {
  return g.type === 'battleship';
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

  const startBs = async () => {
    if (!familyId || !me || !authUid) {
      setErr('Sign in with your own account to play across devices.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const g = await cloudCreateBattleship(familyId, { memberId: me.id, uid: authUid });
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
      await cloudJoinGame(
        familyId,
        g.id,
        { memberId: me.id, uid: authUid },
        g.type === 'battleship' ? 'placing' : 'active',
      );
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
        <div className="border-t border-border pt-3">
          <h2 className="text-sm font-bold text-fg">Battleship</h2>
          <p className="text-xs text-muted mt-0.5">
            Hide your fleet, take turns firing. Ship positions stay private — only you can see yours.
          </p>
          <div className="mt-2">
            <Button size="sm" onClick={() => void startBs()} disabled={busy}>
              New Battleship
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
      {active && isBs(active) && familyId && authUid && (
        <BsBoard
          game={active}
          me={me}
          familyId={familyId}
          authUid={authUid}
          getMember={getMember}
          onClose={() => setActiveId(null)}
          onCancel={() => void cancelGame(active)}
          setErr={setErr}
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
                    {isC4(g) ? 'yellow' : isBs(g) ? 'opponent' : 'O'}
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
  else if (game.status === 'placing') result = 'Placing ships…';
  else if (game.status === 'finished') {
    if (game.winner === 'draw') result = 'Draw';
    else if (isTtt(game)) {
      result = game.winner === 'X' ? `${host?.name || 'Host'} won` : `${guest?.name || 'Guest'} won`;
    } else if (isBs(game)) {
      result =
        game.winner === 'host'
          ? `${host?.name || 'Host'} won`
          : `${guest?.name || 'Guest'} won`;
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

function BsBoard({
  game,
  me,
  familyId,
  authUid,
  getMember,
  onClose,
  onCancel,
  setErr,
}: {
  game: BattleshipGame;
  me: Member;
  familyId: string;
  authUid: string;
  getMember: (id: string) => Member | undefined;
  onClose: () => void;
  onCancel: () => void;
  setErr: (s: string | null) => void;
}) {
  const host = getMember(game.hostMemberId);
  const guest = game.guestMemberId ? getMember(game.guestMemberId) : null;
  const amHost = game.hostMemberId === me.id;
  const amGuest = game.guestMemberId === me.id;
  const role: 'host' | 'guest' | null = amHost ? 'host' : amGuest ? 'guest' : null;
  const myReady = amHost ? game.hostReady : amGuest ? game.guestReady : false;
  const theirReady = amHost ? game.guestReady : game.hostReady;

  const [ships, setShips] = useState<Fleet['ships']>([]);
  const [placingType, setPlacingType] = useState<ShipType | null>('carrier');
  const [horizontal, setHorizontal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fleetLoaded, setFleetLoaded] = useState(false);

  // Load own fleet when placing/active
  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    void (async () => {
      try {
        const f = await cloudLoadFleet(familyId, game.id, authUid);
        if (!cancelled && f?.ships?.length) {
          setShips(f.ships);
          setPlacingType(null);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setFleetLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, game.id, authUid, role]);

  // Defender resolves pending shots aimed at us
  useEffect(() => {
    if (!role || game.status !== 'active' || !game.pendingShot) return;
    const pending = game.pendingShot;
    const iAmDefender =
      (pending.shooter === 'host' && role === 'guest') ||
      (pending.shooter === 'guest' && role === 'host');
    if (!iAmDefender) return;

    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        let fleet = await cloudLoadFleet(familyId, game.id, authUid);
        if (!fleet?.ships?.length) {
          // Should not happen mid-game
          setErr('Could not load your fleet to resolve the shot.');
          return;
        }
        const shotsAgainstMe = role === 'host' ? game.guestShots : game.hostShots;
        const priorHits = hitCellsFromShots(shotsAgainstMe);
        const resolved = resolveShotFull(fleet, pending.cell, priorHits);

        const hostShots = [...game.hostShots];
        const guestShots = [...game.guestShots];
        if (pending.shooter === 'host') {
          hostShots.push({
            cell: pending.cell,
            result: resolved.result,
            sunkShip: resolved.sunkShip,
          });
        } else {
          guestShots.push({
            cell: pending.cell,
            result: resolved.result,
            sunkShip: resolved.sunkShip,
          });
        }

        const shotsNowAgainstMe = role === 'host' ? guestShots : hostShots;
        const allSunk = isFleetSunk(fleet, shotsNowAgainstMe);
        const winner = allSunk ? pending.shooter : null;
        let lastEvent = resolved.result === 'miss' ? 'Miss!' : 'Hit!';
        if (resolved.sunkShip) {
          lastEvent = `Sunk — ${SHIP_LABEL[resolved.sunkShip]}!`;
        }
        if (allSunk) {
          lastEvent = `${pending.shooter === 'host' ? host?.name || 'Host' : guest?.name || 'Guest'} wins!`;
        }

        if (cancelled) return;
        await cloudBattleshipResolve(familyId, game.id, {
          hostShots,
          guestShots,
          pendingShot: null,
          turn: allSunk ? pending.shooter : role,
          status: allSunk ? 'finished' : 'active',
          winner,
          lastEvent,
        });
        if (allSunk && pending.shooter !== role) {
          // we lost — no confetti
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    game.pendingShot?.cell,
    game.pendingShot?.shooter,
    game.status,
    role,
    familyId,
    game.id,
    authUid,
  ]);

  // Confetti when we win
  useEffect(() => {
    if (game.status !== 'finished' || !role) return;
    if (game.winner === role) {
      fireConfetti({ count: 160, power: 16, origin: { x: 0.5, y: 0.35 } });
    }
  }, [game.status, game.winner, role]);

  const placeAt = (cell: number) => {
    if (myReady) return;
    if (!placingType) {
      setErr('Select a ship above (or tap Randomize), then tap the board.');
      return;
    }
    const len = SHIP_SIZES[placingType];
    const cells = shipCells(cell, len, horizontal);
    if (!cells) {
      setErr('Ship does not fit there — try another cell or rotate.');
      return;
    }
    const others = ships.filter((s) => s.type !== placingType);
    const occ = occupiedSet(others);
    if (cells.some((c) => occ.has(c))) {
      setErr('Overlaps another ship — pick empty water.');
      return;
    }
    setErr(null);
    const next = [...others, { type: placingType, cells }];
    setShips(next);
    const placed = new Set(next.map((s) => s.type));
    const nextType = SHIP_ORDER.find((t) => !placed.has(t)) || null;
    setPlacingType(nextType);
  };

  const onRandomize = () => {
    if (myReady) return;
    setShips(randomFleet());
    setPlacingType(null);
  };

  const onReady = async () => {
    if (!role || !isValidPlacement(ships)) {
      setErr('Place all five ships without overlapping.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await cloudSaveFleet(familyId, game.id, authUid, ships);
      const otherReady = role === 'host' ? game.guestReady : game.hostReady;
      await cloudBattleshipReady(familyId, game.id, role, otherReady);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fireAt = async (cell: number) => {
    if (!role || game.status !== 'active' || game.pendingShot) return;
    if (game.turn !== role) {
      setErr('Not your turn yet.');
      return;
    }
    const myShots = role === 'host' ? game.hostShots : game.guestShots;
    if (myShots.some((s) => s.cell === cell)) return;
    setErr(null);
    setBusy(true);
    try {
      await cloudBattleshipFire(familyId, game.id, role, cell);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const myShots = role === 'host' ? game.hostShots : game.guestShots;
  const theirShots = role === 'host' ? game.guestShots : game.hostShots;
  const myOcc = occupiedSet(ships);
  const incomingHits = new Set(hitCellsFromShots(theirShots));
  const myShotMap = new Map(myShots.map((s) => [s.cell, s]));

  const iAmShooterPending =
    game.pendingShot && role && game.pendingShot.shooter === role;
  const iAmDefenderPending =
    game.pendingShot &&
    role &&
    ((game.pendingShot.shooter === 'host' && role === 'guest') ||
      (game.pendingShot.shooter === 'guest' && role === 'host'));

  let statusText = '';
  if (game.status === 'waiting') statusText = 'Waiting for opponent to join…';
  else if (game.status === 'placing') {
    if (myReady && !theirReady) statusText = 'Fleet locked — waiting for opponent…';
    else if (!myReady) statusText = 'Place your ships, then Ready';
    else statusText = 'Both ready…';
  } else if (game.status === 'finished') {
    statusText =
      game.winner === role
        ? 'You win! 🎉'
        : `${game.winner === 'host' ? host?.name : guest?.name} wins`;
  } else if (iAmShooterPending) statusText = 'Shot pending — waiting for result…';
  else if (iAmDefenderPending) statusText = 'Resolving incoming shot…';
  else if (role && game.turn === role) statusText = 'Your turn — fire!';
  else statusText = `${game.turn === 'host' ? host?.name : guest?.name}'s turn`;

  if (!role) {
    return (
      <Card className="p-4 text-sm text-muted">
        Spectating Battleship — join as a player to place ships and fire.
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar {...(host || { name: '?' })} size="md" />
          <span className="text-muted text-sm">vs</span>
          {guest ? (
            <Avatar {...guest} size="md" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            </div>
          )}
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
          game.status === 'active' && role === game.turn && !game.pendingShot && 'text-accent',
          game.status === 'finished' && game.winner === role && 'text-success',
        )}
      >
        {statusText}
      </p>
      {game.lastEvent && game.status !== 'waiting' && (
        <p className="text-center text-xs text-muted">{game.lastEvent}</p>
      )}

      {/* Placement */}
      {(game.status === 'placing' || game.status === 'waiting') && !myReady && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            {SHIP_ORDER.map((t) => {
              const placed = ships.some((s) => s.type === t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={placed}
                  onClick={() => setPlacingType(t)}
                  className={cn(
                    'text-[10px] px-2 py-1 rounded-lg border font-semibold',
                    placingType === t
                      ? 'border-accent bg-accent/15 text-accent'
                      : placed
                        ? 'border-border text-faint opacity-50'
                        : 'border-border text-muted hover:border-accent/40',
                  )}
                >
                  {SHIP_LABEL[t]} ({SHIP_SIZES[t]})
                </button>
              );
            })}
            <Button size="sm" variant="secondary" onClick={() => setHorizontal((h) => !h)}>
              {horizontal ? 'Horizontal' : 'Vertical'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onRandomize}>
              Randomize
            </Button>
          </div>
          <BsGrid
            size={BS_SIZE}
            onCell={(i) => placeAt(i)}
            cellClass={(i) => {
              const hasShip = myOcc.has(i);
              return hasShip
                ? 'bg-cyan-400 border-cyan-200 shadow-sm'
                : 'bg-slate-700/80 border-slate-500 hover:bg-accent/40 hover:border-accent';
            }}
          />
          <div className="flex justify-center gap-2">
            <Button
              size="sm"
              disabled={busy || !isValidPlacement(ships) || !fleetLoaded}
              onClick={() => void onReady()}
            >
              Ready
            </Button>
          </div>
        </div>
      )}

      {game.status === 'placing' && myReady && (
        <p className="text-center text-sm text-muted py-6">
          Your fleet is locked. Waiting for {theirReady ? 'battle to start…' : 'opponent…'}
        </p>
      )}

      {/* Active / finished dual boards */}
      {(game.status === 'active' || game.status === 'finished') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-muted mb-1 text-center">Your fleet</p>
            <BsGrid
              size={BS_SIZE}
              cellClass={(i) => {
                const ship = myOcc.has(i);
                const hit = incomingHits.has(i);
                const miss = theirShots.some((s) => s.cell === i && s.result === 'miss');
                if (ship && hit) return 'bg-red-500 border-red-300';
                if (ship) return 'bg-cyan-400 border-cyan-200';
                if (miss) return 'bg-slate-500/70 border-slate-400';
                return 'bg-slate-700/70 border-slate-600';
              }}
            />
          </div>
          <div>
            <p className="text-xs font-bold text-muted mb-1 text-center">Enemy waters</p>
            <BsGrid
              size={BS_SIZE}
              onCell={(i) => {
                const shot = myShotMap.get(i);
                const canFire =
                  game.status === 'active' &&
                  role === game.turn &&
                  !game.pendingShot &&
                  !shot;
                if (canFire) void fireAt(i);
              }}
              cellClass={(i) => {
                const shot = myShotMap.get(i);
                const canFire =
                  game.status === 'active' &&
                  role === game.turn &&
                  !game.pendingShot &&
                  !shot;
                const pendingHere =
                  game.pendingShot?.shooter === role && game.pendingShot.cell === i;
                if (shot?.result === 'hit') return 'bg-red-500 border-red-300';
                if (shot?.result === 'miss') return 'bg-slate-400/60 border-slate-300';
                if (pendingHere) return 'bg-accent/40 border-accent ring-2 ring-accent animate-pulse';
                if (canFire) return 'bg-slate-700/80 border-slate-500 hover:bg-accent/35 hover:border-accent cursor-pointer';
                return 'bg-slate-800/60 border-slate-700 cursor-default';
              }}
            />
          </div>
        </div>
      )}

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

/** 10×10 (or N×N) board — cells are real buttons with fixed min size so taps work on mobile. */
function BsGrid({
  size,
  onCell,
  cellClass,
}: {
  size: number;
  onCell?: (index: number) => void;
  cellClass: (index: number) => string;
}) {
  return (
    <div
      className="grid gap-1 w-full max-w-[min(100%,320px)] mx-auto select-none"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        // Force square cells: each row height matches column width.
        gridAutoRows: '1fr',
        aspectRatio: `1 / 1`,
      }}
    >
      {Array.from({ length: size * size }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCell?.(i);
          }}
          className={cn(
            'min-h-0 min-w-0 w-full h-full rounded-sm border-2 touch-manipulation',
            cellClass(i),
          )}
        />
      ))}
    </div>
  );
}
