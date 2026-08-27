import {
  MatchResult,
  SCORING_PRESETS,
  ScoringSystem,
  StandingRow,
  Tournament,
  TournamentMatch,
  TournamentPlayer,
  TournamentRound,
  TournamentStructure,
} from '../models/tournament.model';

export function createMatchId(): string {
  return crypto.randomUUID();
}

export function createPlayerId(): string {
  return crypto.randomUUID();
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) {
    p *= 2;
  }
  return p;
}

export function suggestedSwissRounds(playerCount: number): number {
  if (playerCount < 2) {
    return 0;
  }
  return Math.max(3, Math.ceil(Math.log2(playerCount)));
}

export function suggestedRoundCount(structure: TournamentStructure, playerCount: number): number {
  switch (structure) {
    case 'swiss':
      return suggestedSwissRounds(playerCount);
    case 'round-robin':
      return playerCount % 2 === 0 ? playerCount - 1 : playerCount;
    case 'single-elim':
      return Math.log2(nextPowerOfTwo(playerCount));
    case 'double-elim':
      return Math.log2(nextPowerOfTwo(playerCount)) * 2 - 1;
  }
}

function activePlayers(players: TournamentPlayer[]): TournamentPlayer[] {
  return players.filter((p) => !p.dropped);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function playedPairs(matches: TournamentMatch[]): Set<string> {
  const pairs = new Set<string>();
  for (const match of matches) {
    if (!match.player1Id || !match.player2Id || match.isBye) {
      continue;
    }
    pairs.add(pairKey(match.player1Id, match.player2Id));
  }
  return pairs;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function hasPlayed(pairs: Set<string>, a: string, b: string): boolean {
  return pairs.has(pairKey(a, b));
}

export function computeStandings(tournament: Tournament): StandingRow[] {
  const scoring = SCORING_PRESETS[tournament.scoring];
  const stats = new Map<
    string,
    { points: number; wins: number; losses: number; draws: number; byes: number; opponents: string[] }
  >();

  for (const player of tournament.players) {
    stats.set(player.id, { points: 0, wins: 0, losses: 0, draws: 0, byes: 0, opponents: [] });
  }

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.result === 'pending') {
        continue;
      }

      if (match.isBye && match.player1Id) {
        const row = stats.get(match.player1Id)!;
        row.byes += 1;
        if (scoring.byeAsWin) {
          row.wins += 1;
          row.points += scoring.win;
        }
        continue;
      }

      if (!match.player1Id || !match.player2Id) {
        continue;
      }

      const p1 = stats.get(match.player1Id)!;
      const p2 = stats.get(match.player2Id)!;
      p1.opponents.push(match.player2Id);
      p2.opponents.push(match.player1Id);

      if (match.result === 'player1') {
        p1.wins += 1;
        p1.points += scoring.win;
        p2.losses += 1;
        p2.points += scoring.loss;
      } else if (match.result === 'player2') {
        p2.wins += 1;
        p2.points += scoring.win;
        p1.losses += 1;
        p1.points += scoring.loss;
      } else {
        p1.draws += 1;
        p2.draws += 1;
        p1.points += scoring.draw;
        p2.points += scoring.draw;
      }
    }
  }

  const winRate = (id: string): number => {
    const row = stats.get(id);
    if (!row) {
      return 0;
    }
    const played = row.wins + row.losses + row.draws;
    return played === 0 ? 0 : row.wins / played;
  };

  const rows: StandingRow[] = tournament.players.map((player) => {
    const row = stats.get(player.id)!;
    const omwOpponents = row.opponents.filter((id) => stats.has(id));
    const omw =
      omwOpponents.length === 0
        ? 0
        : omwOpponents.reduce((sum, id) => sum + winRate(id), 0) / omwOpponents.length;
    const played = row.wins + row.losses + row.draws + row.byes;
    const gw = played === 0 ? 0 : row.wins / played;

    return {
      playerId: player.id,
      points: row.points,
      matchWins: row.wins,
      matchLosses: row.losses,
      matchDraws: row.draws,
      byes: row.byes,
      omw,
      gw,
    };
  });

  return rows.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (b.omw !== a.omw) {
      return b.omw - a.omw;
    }
    if (b.gw !== a.gw) {
      return b.gw - a.gw;
    }
    return b.matchWins - a.matchWins;
  });
}

function createByeMatch(round: number, playerId: string, table: number): TournamentMatch {
  return {
    id: createMatchId(),
    round,
    player1Id: playerId,
    player2Id: null,
    isBye: true,
    result: 'player1',
    table,
  };
}

function createPairMatch(
  round: number,
  player1Id: string,
  player2Id: string,
  table: number,
  slot?: number,
): TournamentMatch {
  return {
    id: createMatchId(),
    round,
    slot,
    player1Id,
    player2Id,
    isBye: false,
    result: 'pending',
    table,
  };
}

function standingsFromMatches(
  players: TournamentPlayer[],
  scoring: ScoringSystem,
  previousRounds: TournamentRound[],
): StandingRow[] {
  return computeStandings({
    id: '',
    name: '',
    structure: 'swiss',
    scoring,
    swissRounds: previousRounds.length,
    phase: 'active',
    players,
    rounds: previousRounds,
    createdAt: '',
  });
}

function comparePlayersByStandings(
  a: TournamentPlayer,
  b: TournamentPlayer,
  standings: StandingRow[],
): number {
  const sa = standings.find((s) => s.playerId === a.id)!;
  const sb = standings.find((s) => s.playerId === b.id)!;
  if (sb.points !== sa.points) {
    return sb.points - sa.points;
  }
  if (sb.omw !== sa.omw) {
    return sb.omw - sa.omw;
  }
  return a.seed - b.seed;
}

function groupByScore(
  ranked: TournamentPlayer[],
  standings: StandingRow[],
): TournamentPlayer[][] {
  const groups: TournamentPlayer[][] = [];
  for (const player of ranked) {
    const points = standings.find((s) => s.playerId === player.id)!.points;
    const last = groups[groups.length - 1];
    if (!last) {
      groups.push([player]);
      continue;
    }
    const lastPoints = standings.find((s) => s.playerId === last[0]!.id)!.points;
    if (points === lastPoints) {
      last.push(player);
    } else {
      groups.push([player]);
    }
  }
  return groups;
}

function byeCount(standings: StandingRow[], playerId: string): number {
  return standings.find((s) => s.playerId === playerId)?.byes ?? 0;
}

/** Pair everyone in the pool without rematches; returns pairs and one downfloat if odd. */
function pairPoolNoRematch(
  pool: TournamentPlayer[],
  played: Set<string>,
  standings: StandingRow[],
): { pairs: Array<[string, string]>; downfloat: TournamentPlayer | null } {
  if (pool.length === 0) {
    return { pairs: [], downfloat: null };
  }
  if (pool.length === 1) {
    return { pairs: [], downfloat: pool[0]! };
  }

  const sorted = [...pool].sort((a, b) => a.seed - b.seed);

  if (pool.length % 2 === 0) {
    const result = pairPoolBacktrack(sorted, played, []);
    if (result) {
      return { pairs: result.pairs, downfloat: null };
    }
    return { pairs: [], downfloat: null };
  }

  // Odd pool: pick a downfloat that allows valid pairings; prefer players without a prior bye.
  if (pool.length % 2 === 1) {
    let best: { pairs: Array<[string, string]>; downfloat: TournamentPlayer; score: number } | null =
      null;

    for (let d = sorted.length - 1; d >= 0; d--) {
      const downfloat = sorted[d]!;
      const rest = sorted.filter((p) => p.id !== downfloat.id);
      const result = pairPoolBacktrack(rest, played, []);
      if (!result) {
        continue;
      }
      const score = byeCount(standings, downfloat.id) * 1000 - downfloat.seed;
      if (!best || score < best.score) {
        best = { pairs: result.pairs, downfloat, score };
      }
    }

    if (best) {
      return { pairs: best.pairs, downfloat: best.downfloat };
    }
  }

  return { pairs: [], downfloat: sorted[sorted.length - 1] ?? null };
}

function pairPoolBacktrack(
  remaining: TournamentPlayer[],
  played: Set<string>,
  pairs: Array<[string, string]>,
): { pairs: Array<[string, string]> } | null {
  if (remaining.length === 0) {
    return { pairs };
  }

  const current = remaining[0]!;
  const rest = remaining.slice(1);

  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i]!;
    if (hasPlayed(played, current.id, partner.id)) {
      continue;
    }
    const nextRest = [...rest.slice(0, i), ...rest.slice(i + 1)];
    const result = pairPoolBacktrack(nextRest, played, [...pairs, [current.id, partner.id]]);
    if (result) {
      return result;
    }
  }

  return null;
}

function chooseByePlayer(
  candidates: TournamentPlayer[],
  standings: StandingRow[],
): TournamentPlayer {
  return [...candidates].sort((a, b) => {
    const ba = byeCount(standings, a.id);
    const bb = byeCount(standings, b.id);
    if (ba !== bb) {
      return ba - bb;
    }
    const sa = standings.find((s) => s.playerId === a.id)!;
    const sb = standings.find((s) => s.playerId === b.id)!;
    if (sa.points !== sb.points) {
      return sa.points - sb.points;
    }
    return b.seed - a.seed;
  })[0]!;
}

/** Swiss pairing by score groups with rematch avoidance (Dutch-style, simplified). */
function generateSwissRound(
  players: TournamentPlayer[],
  roundNumber: number,
  previousRounds: TournamentRound[],
  scoring: ScoringSystem,
): TournamentMatch[] {
  const active = activePlayers(players);
  const previousMatches = previousRounds.flatMap((r) => r.matches);
  const standings =
    roundNumber === 1
      ? players.map((p) => ({
          playerId: p.id,
          points: 0,
          matchWins: 0,
          matchLosses: 0,
          matchDraws: 0,
          byes: 0,
          omw: 0,
          gw: 0,
        }))
      : standingsFromMatches(players, scoring, previousRounds);

  if (roundNumber === 1) {
    const shuffled = shuffle(active);
    const played = playedPairs(previousMatches);
    const { pairs, downfloat } = pairPoolNoRematch(shuffled, played, standings);
    return buildSwissMatches(roundNumber, pairs, downfloat, standings, active);
  }

  const ranked = [...active].sort((a, b) => comparePlayersByStandings(a, b, standings));
  const groups = groupByScore(ranked, standings);
  const played = playedPairs(previousMatches);

  let downfloat: TournamentPlayer | null = null;
  const allPairs: Array<[string, string]> = [];

  for (const group of groups) {
    const pool = downfloat ? [downfloat, ...group] : [...group];
    downfloat = null;

    const { pairs, downfloat: nextFloat } = pairPoolNoRematch(pool, played, standings);
    allPairs.push(...pairs);
    downfloat = nextFloat;
  }

  return buildSwissMatches(roundNumber, allPairs, downfloat, standings, active);
}

function buildSwissMatches(
  roundNumber: number,
  pairs: Array<[string, string]>,
  downfloat: TournamentPlayer | null,
  standings: StandingRow[],
  active: TournamentPlayer[],
): TournamentMatch[] {
  const matches: TournamentMatch[] = [];
  let table = 1;

  for (const [p1, p2] of pairs) {
    matches.push(createPairMatch(roundNumber, p1, p2, table++));
  }

  if (downfloat) {
    const byePlayer = chooseByePlayer([downfloat], standings);
    matches.push(createByeMatch(roundNumber, byePlayer.id, table++));
  } else if (active.length % 2 === 1) {
    const pairedIds = new Set(pairs.flat());
    const unpaired = active.filter((p) => !pairedIds.has(p.id));
    if (unpaired.length > 0) {
      const byePlayer = chooseByePlayer(unpaired, standings);
      matches.push(createByeMatch(roundNumber, byePlayer.id, table++));
    }
  }

  return matches;
}

/** Berger table for round-robin (circle method). */
function generateRoundRobinRound(players: TournamentPlayer[], roundNumber: number): TournamentMatch[] {
  const active = activePlayers(players);
  const list = [...active];
  if (list.length % 2 === 1) {
    list.push({ id: '__bye__', name: 'BYE', seed: 9999, dropped: false });
  }

  const n = list.length;
  const rounds = n - 1;
  const normalizedRound = ((roundNumber - 1) % rounds) + 1;

  const fixed = list[0]!;
  const rotating = list.slice(1);
  const rotated = [...rotating];
  for (let r = 1; r < normalizedRound; r++) {
    rotated.unshift(rotated.pop()!);
  }

  const pairings: Array<[TournamentPlayer, TournamentPlayer]> = [];
  const left = [fixed, ...rotated.slice(0, n / 2 - 1)];
  const right = [...rotated.slice(n / 2 - 1)].reverse();

  for (let i = 0; i < left.length; i++) {
    pairings.push([left[i]!, right[i]!]);
  }

  const matches: TournamentMatch[] = [];
  let table = 1;
  for (const [a, b] of pairings) {
    if (a.id === '__bye__') {
      if (b.id !== '__bye__') {
        matches.push(createByeMatch(roundNumber, b.id, table++));
      }
    } else if (b.id === '__bye__') {
      matches.push(createByeMatch(roundNumber, a.id, table++));
    } else {
      matches.push(createPairMatch(roundNumber, a.id, b.id, table++));
    }
  }

  return matches;
}

function generateSingleElimRound1(players: TournamentPlayer[]): TournamentMatch[] {
  const active = [...activePlayers(players)].sort((a, b) => a.seed - b.seed);
  const size = nextPowerOfTwo(active.length);

  // Standard seeding: 1 vs size, 2 vs size-1, etc.
  const seeded = new Array<TournamentPlayer | null>(size).fill(null);
  for (let i = 0; i < active.length; i++) {
    seeded[i] = active[i]!;
  }

  const bracketOrder = buildBracketSeedOrder(size);
  const ordered: Array<TournamentPlayer | null> = bracketOrder.map((idx) => seeded[idx] ?? null);

  const matches: TournamentMatch[] = [];
  let table = 1;
  for (let i = 0; i < ordered.length; i += 2) {
    const p1 = ordered[i];
    const p2 = ordered[i + 1];
    const slot = i / 2;

    if (p1 && !p2) {
      matches.push({ ...createByeMatch(1, p1.id, table++), slot, result: 'player1' });
    } else if (!p1 && p2) {
      matches.push({ ...createByeMatch(1, p2.id, table++), slot, result: 'player1' });
    } else if (p1 && p2) {
      matches.push(createPairMatch(1, p1.id, p2.id, table++, slot));
    }
  }

  return matches;
}

function buildBracketSeedOrder(size: number): number[] {
  if (size === 2) {
    return [0, 1];
  }
  const half = buildBracketSeedOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(size - 1 - seed);
  }
  return result;
}

function winnerOfMatch(match: TournamentMatch): string | null {
  if (match.isBye) {
    return match.player1Id;
  }
  if (match.result === 'player1') {
    return match.player1Id;
  }
  if (match.result === 'player2') {
    return match.player2Id;
  }
  return null;
}

function generateEliminationNextRound(
  previousRound: TournamentRound,
  roundNumber: number,
): TournamentMatch[] {
  const sorted = [...previousRound.matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const winners: Array<string | null> = sorted.map((m) => winnerOfMatch(m));

  if (winners.length <= 1) {
    return [];
  }

  const matches: TournamentMatch[] = [];
  let table = 1;
  for (let i = 0; i < winners.length; i += 2) {
    const p1 = winners[i] ?? null;
    const p2 = winners[i + 1] ?? null;
    const slot = i / 2;

    if (p1 && !p2) {
      matches.push({ ...createByeMatch(roundNumber, p1, table++), slot, result: 'player1' });
    } else if (!p1 && p2) {
      matches.push({ ...createByeMatch(roundNumber, p2, table++), slot, result: 'player1' });
    } else if (p1 && p2) {
      matches.push(createPairMatch(roundNumber, p1, p2, table++, slot));
    } else {
      matches.push({
        id: createMatchId(),
        round: roundNumber,
        slot,
        player1Id: null,
        player2Id: null,
        isBye: false,
        result: 'pending',
        table: table++,
      });
    }
  }

  return matches;
}

export function generateInitialRound(tournament: Tournament): TournamentRound {
  const roundNumber = 1;
  let matches: TournamentMatch[] = [];

  switch (tournament.structure) {
    case 'swiss':
      matches = generateSwissRound(tournament.players, roundNumber, [], tournament.scoring);
      break;
    case 'round-robin':
      matches = generateRoundRobinRound(tournament.players, roundNumber);
      break;
    case 'single-elim':
    case 'double-elim':
      matches = generateSingleElimRound1(tournament.players);
      break;
  }

  return { number: roundNumber, matches, status: 'active' };
}

export function generateNextRound(tournament: Tournament): TournamentRound | null {
  const current = tournament.rounds[tournament.rounds.length - 1];
  if (!current || current.status !== 'completed') {
    return null;
  }

  const roundNumber = current.number + 1;
  let matches: TournamentMatch[] = [];

  switch (tournament.structure) {
    case 'swiss':
      if (roundNumber > tournament.swissRounds) {
        return null;
      }
      matches = generateSwissRound(
        tournament.players,
        roundNumber,
        tournament.rounds,
        tournament.scoring,
      );
      break;
    case 'round-robin': {
      const total = suggestedRoundCount('round-robin', activePlayers(tournament.players).length);
      if (roundNumber > total) {
        return null;
      }
      matches = generateRoundRobinRound(tournament.players, roundNumber);
      break;
    }
    case 'single-elim':
      matches = generateEliminationNextRound(current, roundNumber);
      if (matches.length <= 1 && matches[0]?.player2Id === null) {
        return null;
      }
      break;
    case 'double-elim':
      // Simplified: winners bracket flow like single elim for MVP visual
      matches = generateEliminationNextRound(current, roundNumber);
      if (matches.length === 0) {
        return null;
      }
      break;
  }

  if (matches.length === 0) {
    return null;
  }

  return { number: roundNumber, matches, status: 'active' };
}

export function isRoundComplete(round: TournamentRound): boolean {
  return round.matches.every((m) => {
    if (m.isBye) {
      return true;
    }
    if (!m.player1Id || !m.player2Id) {
      return false;
    }
    return m.result !== 'pending';
  });
}

export function canAdvanceRound(tournament: Tournament): boolean {
  const current = tournament.rounds[tournament.rounds.length - 1];
  if (!current || current.status !== 'active') {
    return false;
  }
  return isRoundComplete(current);
}

export function isTournamentComplete(tournament: Tournament): boolean {
  if (tournament.rounds.length === 0) {
    return false;
  }
  const last = tournament.rounds[tournament.rounds.length - 1]!;
  if (last.status !== 'completed') {
    return false;
  }
  return generateNextRound({ ...tournament, rounds: tournament.rounds }) === null;
}

export function applyMatchResult(
  tournament: Tournament,
  matchId: string,
  result: MatchResult,
): Tournament {
  const rounds = tournament.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      if (match.id !== matchId) {
        return match;
      }
      if (match.isBye) {
        return match;
      }
      if (!match.player1Id || !match.player2Id) {
        return match;
      }
      return { ...match, result };
    }),
  }));

  return { ...tournament, rounds };
}

export function advanceRoundIfReady(tournament: Tournament): Tournament {
  const current = tournament.rounds[tournament.rounds.length - 1];
  if (!current || !canAdvanceRound(tournament)) {
    return tournament;
  }

  const completedRounds = tournament.rounds.map((r, idx) =>
    idx === tournament.rounds.length - 1 ? { ...r, status: 'completed' as const } : r,
  );

  const withCompleted = { ...tournament, rounds: completedRounds };
  const next = generateNextRound(withCompleted);

  if (!next) {
    return { ...withCompleted, phase: 'completed' };
  }

  return {
    ...withCompleted,
    rounds: [...completedRounds, next],
    phase: 'active',
  };
}

export function playerName(tournament: Tournament, playerId: string | null): string {
  if (!playerId) {
    return '—';
  }
  return tournament.players.find((p) => p.id === playerId)?.name ?? '—';
}
