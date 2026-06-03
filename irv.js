/*
 * irv.js — Instant-Runoff Voting (IRV) algorithm + results renderer.
 *
 * Plain old global functions, no modules. Include with a <script> tag.
 * Exposes: runIRV(ballots, options, threshold), formatResultsHTML(result, meta)
 */

/*
 * runIRV
 *   ballots:   array of ballots. Each ballot is an array of {option, rank}.
 *              Only ranked options are present. Superseded ballots must be
 *              excluded by the caller.
 *   options:   array of all option name strings.
 *   threshold: a number, e.g. 50 means a candidate must exceed 50% to win.
 *
 * Returns:
 *   { winner: string|null, tie: string[]|undefined, rounds: [...], winnerRound: number|null }
 *
 *   Each round: { tally: [{option, votes, percent}], totalActive, eliminated: string[] }
 */
function runIRV(ballots, options, threshold) {
  let remainingOptions = [...options];
  let rounds = [];

  while (true) {
    // Count first preferences among remaining options for each ballot.
    let counts = {};
    let totalActive = 0;
    for (let option of remainingOptions) counts[option] = 0;

    for (let ballot of ballots) {
      let ranked = ballot
        .filter(p => remainingOptions.includes(p.option))
        .sort((a, b) => a.rank - b.rank);
      if (ranked.length > 0) {
        counts[ranked[0].option]++;
        totalActive++;
      }
    }

    let tally = remainingOptions.map(opt => ({
      option: opt,
      votes: counts[opt],
      percent: totalActive > 0 ? (counts[opt] / totalActive * 100) : 0
    })).sort((a, b) => b.votes - a.votes);

    let round = { tally, totalActive, eliminated: [] };
    rounds.push(round);

    // Winner check: strictly greater than threshold.
    let winner = tally.find(r => r.percent > threshold);
    if (winner) {
      return { winner: winner.option, rounds, winnerRound: rounds.length };
    }

    // Tie for last among ALL remaining → declare a tie.
    let minVotes = Math.min(...tally.map(r => r.votes));
    let eliminated = tally.filter(r => r.votes === minVotes);
    if (eliminated.length === remainingOptions.length) {
      return { winner: null, tie: eliminated.map(r => r.option), rounds, winnerRound: null };
    }

    // Eliminate last place (all tied for last if there's a tie there).
    let toEliminate = eliminated.map(r => r.option);
    round.eliminated = toEliminate;
    remainingOptions = remainingOptions.filter(o => !toEliminate.includes(o));

    if (remainingOptions.length === 0) {
      return { winner: null, tie: options, rounds, winnerRound: null };
    }
  }
}

/*
 * formatResultsHTML — render an IRV result as period-accurate HTML.
 *   result: the object returned by runIRV
 *   meta:   { totalBallots, eligible } — counts for the footer
 */
function formatResultsHTML(result, meta) {
  meta = meta || {};
  let pct = n => n.toFixed(0);
  let html = '';

  if (result.winner) {
    let wr = result.rounds[result.winnerRound - 1];
    let wRow = wr.tally.find(r => r.option === result.winner);
    html += '<h2>RESULT: ' + escapeHTML(result.winner) + ' wins!</h2>';
    html += '<p>(Reached ' + pct(wRow.percent) + '% of votes in round ' +
            result.winnerRound + ')</p>';
  } else if (result.tie) {
    html += '<h2>RESULT: it’s a tie.</h2>';
    html += '<p>Tied between: ' +
            result.tie.map(escapeHTML).join(', ') + '. No option reached the threshold.</p>';
  } else {
    html += '<h2>RESULT: no winner.</h2>';
  }

  html += '<hr>';
  html += '<h3>Round-by-round breakdown:</h3>';

  let pre = '';
  result.rounds.forEach((round, i) => {
    pre += 'Round ' + (i + 1) + ':\n';
    round.tally.forEach(r => {
      let line = '  ' + r.option + ' — ' + r.votes + ' vote' +
                 (r.votes === 1 ? '' : 's') + ' (' + pct(r.percent) + '%)';
      if (result.winner && (i + 1) === result.winnerRound && r.option === result.winner) {
        line += '  ← WINNER';
      } else if (round.eliminated.includes(r.option)) {
        line += '  ← eliminated';
      }
      pre += line + '\n';
    });
    pre += '\n';
  });

  html += '<pre>' + escapeHTML(pre) + '</pre>';
  html += '<hr>';
  if (meta.totalBallots != null) {
    html += '<p>Total ballots cast: ' + meta.totalBallots + '<br>';
    html += 'Eligible voters who ranked at least one option: ' +
            (meta.eligible != null ? meta.eligible : meta.totalBallots) + '</p>';
  }
  return html;
}

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
