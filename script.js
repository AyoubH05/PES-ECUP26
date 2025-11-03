/* script.js - Full tournament logic
   Features:
   - createGroups (6 groups x 4 teams)
   - generateRound (1..3) per group (2 matches per group per round)
   - store matches & groups in localStorage
   - modal for entering scores (homeGoals / awayGoals)
   - compute standings per group (Played,Pts,W,D,L,GF,GA,GD)
   - compute best 4 thirds (Points -> GD -> GF -> name)
   - generate Round of 16 (constrained draw to avoid same-group where possible)
   - save knockout bracket & render it on knockout.html
   - auto-generate R16 when all 36 group matches are played OR when user clicks Go to Knockout
*/

(() => {
  /* ------------------------
     Constants & storage keys
     ------------------------ */
  const KEY_GROUPS = 'ef_groups';
  const KEY_MATCHES = 'ef_matches';
  const KEY_ROUNDS = 'ef_generatedRounds';
  const KEY_KNOCKOUT = 'ef_knockout';

  /* ------------------------
     Helpers
     ------------------------ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const load = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  };

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ------------------------
     ID helpers
     ------------------------ */
  function mkMatchId(groupIndex, round, home, away) {
    return `G${groupIndex}_R${round}_${home.replace(/\s+/g, '_')}__VS__${away.replace(/\s+/g, '_')}`;
  }

  /* ------------------------
     Create / Reset Groups
     ------------------------ */
  function createGroups(randomize = true) {
    // expects global "teams" array (teams.js should define it)
    if (!window.teams || !Array.isArray(window.teams) || window.teams.length < 24) {
      alert('Teams list missing or incomplete (teams.js).');
      return null;
    }
    const order = randomize ? shuffle(window.teams) : window.teams.slice(0, 24);
    const groups = [];
    for (let i = 0; i < 6; i++) {
      groups.push(order.slice(i * 4, i * 4 + 4));
    }
    // save groups, reset matches/rounds/knockout
    save(KEY_GROUPS, groups);
    save(KEY_MATCHES, []);
    save(KEY_ROUNDS, 0);
    save(KEY_KNOCKOUT, null);
    return groups;
  }

  /* ------------------------
     Match generation (round-robin template)
     Round 1: T1 vs T2, T3 vs T4
     Round 2: T1 vs T3, T2 vs T4
     Round 3: T1 vs T4, T2 vs T3
     ------------------------ */
  function makeMatchObj(groupIndex, round, home, away) {
    return {
      id: mkMatchId(groupIndex, round, home, away),
      groupIndex,
      groupName: String.fromCharCode(65 + groupIndex),
      round,
      home,
      away,
      homeGoals: null,
      awayGoals: null,
      status: 'scheduled' // 'scheduled' | 'played'
    };
  }

  function generateRound(roundNumber) {
    if (![1, 2, 3].includes(roundNumber)) return;
    const groups = load(KEY_GROUPS);
    if (!groups) {
      alert('Create groups first.');
      return;
    }
    const matches = load(KEY_MATCHES) || [];
    // avoid generating duplicate matches for same round (idempotent)
    groups.forEach((group, gi) => {
      if (!group || group.length !== 4) return;
      const [T1, T2, T3, T4] = group;
      const candidates = [];
      if (roundNumber === 1) {
        candidates.push(makeMatchObj(gi, 1, T1, T2));
        candidates.push(makeMatchObj(gi, 1, T3, T4));
      } else if (roundNumber === 2) {
        candidates.push(makeMatchObj(gi, 2, T1, T3));
        candidates.push(makeMatchObj(gi, 2, T2, T4));
      } else if (roundNumber === 3) {
        candidates.push(makeMatchObj(gi, 3, T1, T4));
        candidates.push(makeMatchObj(gi, 3, T2, T3));
      }
      candidates.forEach(c => {
        if (!matches.find(m => m.id === c.id)) {
          matches.push(c);
        }
      });
    });
    save(KEY_MATCHES, matches);
    save(KEY_ROUNDS, roundNumber);
    return matches;
  }

  /* ------------------------
     Compute Standings
     returns array of 6 arrays (one per group) sorted:
     each entry: {team, played, w,d,l,gf,ga,gd,pts}
     tie-breakers applied: points -> gd -> gf -> name
     ------------------------ */
  function computeStandings() {
    const groups = load(KEY_GROUPS) || [];
    const matches = load(KEY_MATCHES) || [];
    // init structures
    const statsPerGroup = groups.map(g => {
      return g.map(team => ({
        team,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      }));
    });

    // accumulate from matches (played only)
    matches.forEach(m => {
      if (!m || m.status !== 'played') return;
      const gi = m.groupIndex;
      if (typeof gi !== 'number' || !statsPerGroup[gi]) return;
      const homeObj = statsPerGroup[gi].find(x => x.team === m.home);
      const awayObj = statsPerGroup[gi].find(x => x.team === m.away);
      if (!homeObj || !awayObj) return;
      homeObj.played += 1;
      awayObj.played += 1;
      homeObj.gf += Number(m.homeGoals || 0);
      homeObj.ga += Number(m.awayGoals || 0);
      awayObj.gf += Number(m.awayGoals || 0);
      awayObj.ga += Number(m.homeGoals || 0);
      if (m.homeGoals > m.awayGoals) {
        homeObj.w += 1; homeObj.pts += 3;
        awayObj.l += 1;
      } else if (m.homeGoals < m.awayGoals) {
        awayObj.w += 1; awayObj.pts += 3;
        homeObj.l += 1;
      } else {
        homeObj.d += 1; awayObj.d += 1;
        homeObj.pts += 1; awayObj.pts += 1;
      }
    });

    // compute gd and sort
    const sorted = statsPerGroup.map(arr => {
      arr.forEach(o => o.gd = o.gf - o.ga);
      arr.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.team.localeCompare(b.team);
      });
      return arr.map((r, idx) => ({ ...r, position: idx + 1 }));
    });

    return sorted;
  }

  /* ------------------------
     Render functions (Groups page)
     ------------------------ */
  function renderGroupsPanel() {
    const wrap = $('#standingsWrap');
    if (!wrap) return;
    const groups = load(KEY_GROUPS) || [];
    wrap.innerHTML = '';
    groups.forEach((grp, i) => {
      const container = document.createElement('div');
      container.className = 'group';
      container.innerHTML = `
        <h3>Group ${String.fromCharCode(65 + i)}</h3>
        <ul>
          ${grp.map(t => `<li>${t}</li>`).join('')}
        </ul>
        <div id="stand-${i}" class="table-placeholder"></div>
      `;
      wrap.appendChild(container);
    });
    // compute and render standings tables
    renderStandingsAll();
  }

  function renderStandingsAll() {
    const sorted = computeStandings();
    sorted.forEach((arr, gi) => {
      const container = document.getElementById(`stand-${gi}`);
      if (!container) return;
      container.innerHTML = `
        <table class="small-table">
          <thead>
            <tr>
              <th>#</th><th>Team</th><th>P</th><th>Pts</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map(r => `<tr class="pos-${r.position}"><td>${r.position}</td><td class="name">${r.team}</td><td>${r.played}</td><td>${r.pts}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    });
    updateBestThirdsUI();
  }

  /* ------------------------
     Matches rendering and score input
     ------------------------ */
  function renderMatchesForRound(roundNumber) {
    const matches = (load(KEY_MATCHES) || []).filter(m => m.round === roundNumber);
    const matchesList = $('#matchesList');
    if (!matchesList) return;
    matchesList.innerHTML = '';
    if (matches.length === 0) {
      matchesList.innerHTML = '<p class="muted">No matches for this round. Click "Generate Next Round".</p>';
      return;
    }
    matches.forEach(m => {
      const card = document.createElement('div');
      card.className = 'match';
      const score = m.status === 'played' ? `${m.homeGoals} - ${m.awayGoals}` : '×';
      card.innerHTML = `
        <div class="match-left">${m.home}</div>
        <div class="match-center">${score}</div>
        <div class="match-right">${m.away}</div>
        <div class="match-actions">
          ${m.status === 'played' ? '<span class="played-label">Played</span>' : `<button class="btn small enter-score" data-id="${m.id}">×</button>`}
        </div>
      `;
      matchesList.appendChild(card);
    });
    // attach listeners
    $$('.enter-score').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        openScoreModal(id);
      });
    });
  }

  /* ------------------------
     Modal logic
     ------------------------ */
  let currentEditingId = null;

  function openScoreModal(matchId) {
    currentEditingId = matchId;
    const matches = load(KEY_MATCHES) || [];
    const m = matches.find(x => x.id === matchId);
    if (!m) return;
    const modal = $('#scoreModal');
    $('#modalTitle').textContent = `Result: ${m.groupName} (R${m.round})`;
    $('#homeName').textContent = m.home;
    $('#awayName').textContent = m.away;
    $('#homeGoals').value = m.homeGoals != null ? m.homeGoals : 0;
    $('#awayGoals').value = m.awayGoals != null ? m.awayGoals : 0;
    modal.classList.remove('hidden');
  }

  function closeScoreModal() {
    currentEditingId = null;
    const modal = $('#scoreModal');
    if (modal) modal.classList.add('hidden');
  }

  function saveScoreFromModal() {
    const hg = Number($('#homeGoals').value);
    const ag = Number($('#awayGoals').value);
    if (isNaN(hg) || isNaN(ag) || hg < 0 || ag < 0) {
      alert('Invalid goals input');
      return;
    }
    const matches = load(KEY_MATCHES) || [];
    const idx = matches.findIndex(m => m.id === currentEditingId);
    if (idx === -1) { closeScoreModal(); return; }
    matches[idx].homeGoals = hg;
    matches[idx].awayGoals = ag;
    matches[idx].status = 'played';
    save(KEY_MATCHES, matches);
    closeScoreModal();
    // re-render
    const currentRoundLabel = $('#currentRoundLabel');
    let activeRound = 1;
    if (currentRoundLabel && currentRoundLabel.textContent) {
      const match = currentRoundLabel.textContent.match(/\d+/);
      if (match) activeRound = Number(match[0]);
    }
    renderMatchesForRound(activeRound);
    renderStandingsAll();
    renderPlayedMatches();
    tryAutoGenerateKnockout();
  }

  /* ------------------------
     Played matches list
     ------------------------ */
  function renderPlayedMatches() {
    const matches = (load(KEY_MATCHES) || []).filter(m => m.status === 'played');
    const container = $('#playedContainer');
    if (!container) return;
    if (matches.length === 0) {
      container.innerHTML = '<p class="muted">No played matches yet.</p>';
      return;
    }
    container.innerHTML = matches.map(m => `<div class="played-row"><div class="left">${m.groupName} - ${m.home}</div><div class="score">${m.homeGoals} - ${m.awayGoals}</div><div class="right">${m.away}</div></div>`).join('');
  }

  /* ------------------------
     Best 4 thirds selection
     ------------------------ */
  function getBestFourThirds(sortedStandings) {
    const thirds = [];
    sortedStandings.forEach((arr, gi) => {
      const third = arr.find(el => el.position === 3);
      if (third) thirds.push({ ...third, group: String.fromCharCode(65 + gi) });
    });
    thirds.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if ((b.gf - b.ga) !== (a.gf - a.ga)) return (b.gf - b.ga) - (a.gf - a.ga);
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.localeCompare(b.team);
    });
    return { all: thirds, qualified: thirds.slice(0, 4) };
  }

  function updateBestThirdsUI() {
    const info = $('#roundInfo');
    if (!info) return;
    const sorted = computeStandings();
    const best = getBestFourThirds(sorted);
    info.textContent = `Rounds generated: ${load(KEY_ROUNDS) || 0}/3 · Best 3rd qualified: ${best.qualified.map(x => x.team).join(', ') || '-'}`;
  }

  /* ------------------------
     Knockout generation
     ------------------------ */
  function tryAutoGenerateKnockout() {
    const generatedRounds = load(KEY_ROUNDS) || 0;
    if (generatedRounds < 3) return; // need all rounds generated logically
    const matches = load(KEY_MATCHES) || [];
    const playedCount = matches.filter(m => m.status === 'played').length;
    const totalGroupMatches = 6 * 6; // 36
    if (playedCount < totalGroupMatches) return; // require full group completion
    // if already generated, do nothing
    const existing = load(KEY_KNOCKOUT);
    if (existing && existing.r16 && existing.r16.length) return;
    // compute standings
    const sorted = computeStandings();
    const winners = [], seconds = [];
    sorted.forEach((arr, gi) => {
      winners.push({ team: arr[0].team, group: String.fromCharCode(65 + gi) });
      seconds.push({ team: arr[1].team, group: String.fromCharCode(65 + gi) });
    });
    const bestThirds = getBestFourThirds(sorted).qualified.map(t => ({ team: t.team, group: t.group }));

    // assemble pool
    const pool = [
      ...winners.map(w => ({ ...w, seed: '1st' })),
      ...seconds.map(s => ({ ...s, seed: '2nd' })),
      ...bestThirds.map(b => ({ ...b, seed: '3rd' }))
    ]; // length 16

    // attempt constrained pairing to avoid same-group clashes
    // simple algorithm: shuffle pool, then try to pair homes/aways with minimal same-group collisions by swapping
    let shuffled = shuffle(pool);
    // form two slices
    let homeSlice = shuffled.slice(0, 8);
    let awaySlice = shuffled.slice(8, 16);

    // try to repair same-group conflicts
    for (let i = 0; i < 8; i++) {
      if (homeSlice[i].group === awaySlice[i].group) {
        // find swap in awaySlice to fix
        let swapped = false;
        for (let j = i + 1; j < 8; j++) {
          if (homeSlice[i].group !== awaySlice[j].group && homeSlice[j].group !== awaySlice[i].group) {
            const tmp = awaySlice[j];
            awaySlice[j] = awaySlice[i];
            awaySlice[i] = tmp;
            swapped = true;
            break;
          }
        }
        if (!swapped) {
          // try swap in homeSlice
          for (let j = i + 1; j < 8; j++) {
            if (awaySlice[i].group !== homeSlice[j].group && awaySlice[j].group !== homeSlice[i].group) {
              const tmp = homeSlice[j];
              homeSlice[j] = homeSlice[i];
              homeSlice[i] = tmp;
              swapped = true;
              break;
            }
          }
        }
        // if still not swapped, leave as is (rare)
      }
    }

    const r16 = homeSlice.map((h, idx) => ({
      id: `R16-${idx + 1}`,
      home: h.team,
      away: awaySlice[idx].team,
      homeGoals: null,
      awayGoals: null,
      status: 'scheduled'
    }));

    const bracket = { r16, qf: [], sf: [], final: [] };
    save(KEY_KNOCKOUT, bracket);
    // notify user
    const goBtn = $('#goKnockout');
    if (goBtn) goBtn.style.display = 'inline-block';
    alert('Round of 16 generated. Open Knockout page to view bracket.');
  }

  /* ------------------------
     Render Knockout (on knockout.html)
     ------------------------ */
  function renderKnockoutPage() {
    const data = load(KEY_KNOCKOUT);
    const r16El = $('#r16');
    const qfEl = $('#qf');
    const sfEl = $('#sf');
    const finalEl = $('#final');
    if (!r16El || !qfEl || !sfEl || !finalEl) return;
    if (!data) {
      r16El.innerHTML = '<p class="muted">Round of 16 not generated yet.</p>';
      qfEl.innerHTML = '<p class="muted">-</p>';
      sfEl.innerHTML = '<p class="muted">-</p>';
      finalEl.innerHTML = '<p class="muted">-</p>';
      return;
    }
    const renderSection = (el, arr) => {
      if (!arr || arr.length === 0) {
        el.innerHTML = '<div class="muted">No matches</div>';
        return;
      }
      el.innerHTML = arr.map(m => `<div class="bracket-card"><div class="left">${m.home}</div><div class="vs">vs</div><div class="right">${m.away}</div></div>`).join('');
    };
    renderSection(r16El, data.r16);
    renderSection(qfEl, data.qf);
    renderSection(sfEl, data.sf);
    renderSection(finalEl, data.final);
  }

  /* ------------------------
     Initialization for pages
     ------------------------ */
  function initGroupsPage() {
    const generateGroupsBtn = $('#generateGroupsBtn');
    const generateRoundBtn = $('#generateRoundBtn');
    const goKnockoutBtn = $('#goKnockout');
    const prev = $('#prevRound');
    const next = $('#nextRound');
    const curLabel = $('#currentRoundLabel');

    // if no groups stored, create automatically (initial load)
    if (!load(KEY_GROUPS)) {
      createGroups(true);
    }
    renderGroupsPanel();
    renderPlayedMatches();

    // display rounds info
    const rounds = load(KEY_ROUNDS) || 0;
    $('#roundInfo').textContent = `Rounds generated: ${rounds}/3`;

    // set active round to 1 or last generated
    let activeRound = rounds > 0 ? rounds : 1;
    curLabel.textContent = `Round ${activeRound}`;
    renderMatchesForRound(activeRound);

    // attach handlers
    if (generateGroupsBtn) {
      generateGroupsBtn.addEventListener('click', () => {
        createGroups(true);
        renderGroupsPanel();
        save(KEY_ROUNDS, 0);
        $('#roundInfo').textContent = `Rounds generated: 0/3`;
        if ($('#goKnockout')) $('#goKnockout').style.display = 'none';
        renderMatchesForRound(1);
      });
    }

    if (generateRoundBtn) {
      generateRoundBtn.addEventListener('click', () => {
        let gen = load(KEY_ROUNDS) || 0;
        if (gen >= 3) {
          alert('All 3 rounds already generated.');
          return;
        }
        const newRound = gen + 1;
        generateRound(newRound);
        save(KEY_ROUNDS, newRound);
        $('#roundInfo').textContent = `Rounds generated: ${newRound}/3`;
        activeRound = newRound;
        curLabel.textContent = `Round ${activeRound}`;
        renderMatchesForRound(activeRound);
        renderStandingsAll();
        renderPlayedMatches();
      });
    }

    if (prev) {
      prev.addEventListener('click', () => {
        let r = Number((curLabel.textContent.match(/\d+/) || [1])[0]) || 1;
        r = Math.max(1, r - 1);
        curLabel.textContent = `Round ${r}`;
        renderMatchesForRound(r);
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        let r = Number((curLabel.textContent.match(/\d+/) || [1])[0]) || 1;
        r = Math.min(3, r + 1);
        curLabel.textContent = `Round ${r}`;
        renderMatchesForRound(r);
      });
    }

    // modal buttons
    const cancelBtn = $('#cancelScoreBtn');
    const saveBtn = $('#saveScoreBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeScoreModal);
    if (saveBtn) saveBtn.addEventListener('click', saveScoreFromModal);

    // go to knockout button
    if (goKnockoutBtn) {
      goKnockoutBtn.addEventListener('click', () => {
        tryAutoGenerateKnockout(); // will generate only if complete
        window.location.href = 'knockout.html';
      });
    }

    // click overlay to close modal
    const modal = $('#scoreModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeScoreModal();
      });
    }
  }

  function initKnockoutPage() {
    renderKnockoutPage();
  }

  /* ------------------------
     Expose main functions to window (for HTML buttons)
     ------------------------ */
  window.createGroups = () => {
    createGroups(true);
    renderGroupsPanel();
    save(KEY_ROUNDS, 0);
    $('#roundInfo').textContent = `Rounds generated: 0/3`;
    if ($('#goKnockout')) $('#goKnockout').style.display = 'none';
  };
  window.generateRound = (n) => {
    if (![1,2,3].includes(n)) return;
    generateRound(n);
    save(KEY_ROUNDS, n);
    $('#roundInfo').textContent = `Rounds generated: ${n}/3`;
    renderMatchesForRound(n);
    renderStandingsAll();
    renderPlayedMatches();
    tryAutoGenerateKnockout();
  };
  window.resetTournament = function() {
    if (!confirm('Reset tournament and clear saved data?')) return;
    localStorage.removeItem(KEY_GROUPS);
    localStorage.removeItem(KEY_MATCHES);
    localStorage.removeItem(KEY_ROUNDS);
    localStorage.removeItem(KEY_KNOCKOUT);
    alert('Tournament reset.');
    location.reload();
  };

  /* ------------------------
     Auto-run based on page
     ------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    // groups.html detection
    if (location.pathname.endsWith('groups.html') || document.body.classList.contains('groups-page')) {
      initGroupsPage();
    }
    // knockout.html detection
    if (location.pathname.endsWith('knockout.html') || document.body.classList.contains('knockout-page')) {
      initKnockoutPage();
    }
    // update if scoreboard present
    renderPlayedMatches();
  });

})();
