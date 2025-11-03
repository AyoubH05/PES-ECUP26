/* script.js
  Tournament logic for:
  - generate groups (6 groups × 4)
  - generate rounds (1..3) per group with round-robin template
  - store matches and groups in localStorage
  - modal for entering scores
  - compute standings per group (PTS,P,W,D,L,GF,GA,GD,Played)
  - compute best 4 thirds and create R16 bracket (avoid same-group when possible)
  - render knockout to knockout.html
*/

(() => {
  // keys
  const KEY_GROUPS = 'ef_groups';
  const KEY_MATCHES = 'ef_matches';
  const KEY_ROUNDS = 'ef_generatedRounds';
  const KEY_KNOCKOUT = 'ef_knockout';

  // helpers
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const load = (k) => JSON.parse(localStorage.getItem(k) || 'null');

  // create groups: shuffle teams then split
  function createGroups() {
    const s = [...teams].sort(() => Math.random() - 0.5);
    const groups = [];
    for (let i = 0; i < 6; i++) groups.push(s.slice(i * 4, i * 4 + 4));
    save(KEY_GROUPS, groups);
    // reset matches/round count
    save(KEY_MATCHES, []);
    save(KEY_ROUNDS, 0);
    return groups;
  }

  // match id helper
  function matchId(g, r, a, b) {
    return `G-${g}-R${r}-${a.replace(/\s+/g,'_')}-vs-${b.replace(/\s+/g,'_')}`;
  }

  // generate matches for round (1..3) for all groups — each group 2 matches per round
  function generateRound(roundNumber) {
    const groups = load(KEY_GROUPS);
    if (!groups) return [];
    const matches = load(KEY_MATCHES) || [];
    groups.forEach((grp, gi) => {
      // ensure 4 teams
      if (grp.length !== 4) return;
      const [T1, T2, T3, T4] = grp;
      if (roundNumber === 1) {
        matches.push(makeMatch(gi, 1, T1, T2));
        matches.push(makeMatch(gi, 1, T3, T4));
      } else if (roundNumber === 2) {
        matches.push(makeMatch(gi, 2, T1, T3));
        matches.push(makeMatch(gi, 2, T2, T4));
      } else if (roundNumber === 3) {
        matches.push(makeMatch(gi, 3, T1, T4));
        matches.push(makeMatch(gi, 3, T2, T3));
      }
    });
    save(KEY_MATCHES, matches);
    save(KEY_ROUNDS, roundNumber);
    return matches;
  }

  function makeMatch(groupIndex, round, home, away) {
    return {
      id: matchId(groupIndex, round, home, away),
      groupIndex,
      groupName: String.fromCharCode(65 + groupIndex),
      round,
      home,
      away,
      homeGoals: null,
      awayGoals: null,
      status: 'scheduled' // or 'played'
    };
  }

  // rendering functions (groups page)
  function renderGroupsPanel() {
    const wrap = $('#standingsWrap');
    if (!wrap) return;
    const groups = load(KEY_GROUPS) || [];
    wrap.innerHTML = '';
    groups.forEach((g, i) => {
      const div = document.createElement('div');
      div.className = 'group';
      div.innerHTML = `
        <h3>Group ${String.fromCharCode(65+i)}</h3>
        <div class="team-list">
          ${g.map(t => `<div class="team-row">${t}</div>`).join('')}
        </div>
        <div class="standings-table" id="stand-${i}"></div>
      `;
      wrap.appendChild(div);
    });
    // compute standings for each and render
    renderStandingsAll();
  }

  // compute standings from matches data
  function computeStandings() {
    const groups = load(KEY_GROUPS) || [];
    const matches = load(KEY_MATCHES) || [];
    const standings = groups.map(g => {
      return g.map(team => ({
        team,
        played: 0, w:0, d:0, l:0, gf:0, ga:0, pts:0
      }));
    });

    matches.forEach(m => {
      if (m.status !== 'played') return;
      // find index in standings
      const gIdx = m.groupIndex;
      const homeObj = standings[gIdx].find(x => x.team === m.home);
      const awayObj = standings[gIdx].find(x => x.team === m.away);
      if (!homeObj || !awayObj) return;
      homeObj.played += 1;
      awayObj.played += 1;
      homeObj.gf += m.homeGoals;
      homeObj.ga += m.awayGoals;
      awayObj.gf += m.awayGoals;
      awayObj.ga += m.homeGoals;
      if (m.homeGoals > m.awayGoals) {
        homeObj.w +=1; homeObj.pts +=3;
        awayObj.l +=1;
      } else if (m.homeGoals < m.awayGoals) {
        awayObj.w +=1; awayObj.pts +=3;
        homeObj.l +=1;
      } else {
        homeObj.d +=1; awayObj.d +=1;
        homeObj.pts +=1; awayObj.pts +=1;
      }
    });

    // convert to sorted standings per group
    const sorted = standings.map(arr => {
      return arr.map(o => ({...o, gd: o.gf - o.ga})).sort((a,b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if ((b.gf - b.ga) !== (a.gf - a.ga)) return (b.gf - b.ga) - (a.gf - a.ga);
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.team.localeCompare(b.team);
      }).map((r, idx) => ({...r, position: idx+1}));
    });

    return sorted;
  }

  function renderStandingsAll() {
    const sorted = computeStandings();
    sorted.forEach((arr, gi) => {
      const container = document.getElementById(`stand-${gi}`);
      if (!container) return;
      container.innerHTML = `
        <table class="small-table">
          <thead><tr><th>#</th><th>Team</th><th>P</th><th>Pts</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th></tr></thead>
          <tbody>
            ${arr.map(r => `<tr class="pos-${r.position}"><td>${r.position}</td><td class="name">${r.team}</td><td>${r.played}</td><td>${r.pts}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    });
    // update best thirds etc
    updateBestThirdsUI();
  }

  // render matches for current round index (1..3)
  function renderMatchesForRound(roundNumber) {
    const matches = (load(KEY_MATCHES) || []).filter(m => m.round === roundNumber);
    const matchesList = $('#matchesList');
    if (!matchesList) return;
    matchesList.innerHTML = '';
    if (matches.length === 0) {
      matchesList.innerHTML = '<p class="muted">No matches for this round. Generate the round first.</p>';
      return;
    }
    matches.forEach(m => {
      const card = document.createElement('div');
      card.className = 'match-card';
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

    // attach listeners to enter-score
    $$('.enter-score').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        openScoreModal(id);
      });
    });
  }

  // modal logic
  let currentEditingId = null;
  function openScoreModal(matchId) {
    currentEditingId = matchId;
    const matches = load(KEY_MATCHES) || [];
    const m = matches.find(x => x.id === matchId);
    if (!m) return;
    $('#modalTitle').textContent = `Result: ${m.groupName} (R${m.round})`;
    $('#homeName').textContent = m.home;
    $('#awayName').textContent = m.away;
    $('#homeGoals').value = m.homeGoals ?? 0;
    $('#awayGoals').value = m.awayGoals ?? 0;
    $('#scoreModal').classList.remove('hidden');
  }

  function closeScoreModal() {
    currentEditingId = null;
    $('#scoreModal').classList.add('hidden');
  }

  // save score
  function saveScoreFromModal() {
    const hg = Number($('#homeGoals').value);
    const ag = Number($('#awayGoals').value);
    if (isNaN(hg) || isNaN(ag) || hg < 0 || ag < 0) {
      alert('Invalid goals');
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
    renderMatchesForRound(load(KEY_ROUNDS) || 1);
    renderStandingsAll();
    renderPlayedMatches();
    tryAutoGenerateKnockout();
  }

  // played list
  function renderPlayedMatches() {
    const matches = (load(KEY_MATCHES) || []).filter(m => m.status === 'played');
    const container = $('#playedContainer');
    if (!container) return;
    container.innerHTML = matches.map(m => `<div class="played-row"><div class="left">${m.home}</div><div class="score">${m.homeGoals} - ${m.awayGoals}</div><div class="right">${m.away}</div></div>`).join('');
  }

  // compute best 4 thirds
  function getBestFourThirds(sortedStandings) {
    const thirds = [];
    sortedStandings.forEach((arr, gi) => {
      const third = arr.find(r => r.position === 3);
      if (third) thirds.push({ ...third, group: String.fromCharCode(65 + gi) });
    });
    thirds.sort((a,b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if ((b.gf - b.ga) !== (a.gf - a.ga)) return (b.gf - b.ga) - (a.gf - a.ga);
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.localeCompare(b.team);
    });
    return { all: thirds, qualified: thirds.slice(0,4) };
  }

  function updateBestThirdsUI() {
    // show small info - attach to top of page if exists
    const info = $('.muted');
    const sorted = computeStandings();
    const best = getBestFourThirds(sorted);
    if (info) {
      info.textContent = `Rounds generated: ${load(KEY_ROUNDS) || 0}/3 · Best 3rd qualified: ${best.qualified.map(x => x.team).join(', ') || '-'}`;
    }
  }

  // generate knockout bracket once all matches played and rounds generated = 3
  function tryAutoGenerateKnockout() {
    const genRounds = load(KEY_ROUNDS) || 0;
    if (genRounds < 3) return;
    const matches = load(KEY_MATCHES) || [];
    // ensure all group matches played? optional: require all group matches to be played before generating R16
    const totalGroupMatches = 6 * 6; // 6 groups * 6 matches each = 36
    const playedCount = matches.filter(m => m.status === 'played').length;
    // proceed if all group matches played OR at least all rounds generated and user pressed "Go to Knockout"
    // we'll auto-generate if playedCount === 36
    if (playedCount < totalGroupMatches) return;

    const sorted = computeStandings();
    // winners and seconds
    const winners = [];
    const seconds = [];
    sorted.forEach((arr, gi) => {
      winners.push({team: arr[0].team, group: String.fromCharCode(65+gi)});
      seconds.push({team: arr[1].team, group: String.fromCharCode(65+gi)});
    });
    const bestThirds = getBestFourThirds(sorted).qualified.map(t => ({team: t.team, group: t.group}));

    // assemble full 16
    const full = [...winners.map(w => ({...w, seed: '1st'})), ...seconds.map(s => ({...s, seed:'2nd'})), ...bestThirds.map(b=>({...b, seed:'3rd'}))];

    // constrained draw to make 8 matches avoiding same-group where possible
    const shuffled = [...full].sort(() => Math.random() - 0.5);
    // simple pairing: take first 8 as home, next 8 as away, try swaps to avoid same group
    const homeSlice = shuffled.slice(0,8);
    const awaySlice = shuffled.slice(8,16);
    for (let i=0;i<8;i++){
      if (homeSlice[i].group === awaySlice[i].group) {
        // try swap with later away
        for (let j=i+1;j<8;j++){
          if (homeSlice[i].group !== awaySlice[j].group && homeSlice[j].group !== awaySlice[i].group) {
            const tmp = awaySlice[j];
            awaySlice[j] = awaySlice[i];
            awaySlice[i] = tmp;
            break;
          }
        }
      }
    }
    const r16 = homeSlice.map((h, idx) => ({
      id: `R16-${idx+1}`,
      home: h.team,
      away: awaySlice[idx].team,
      homeGoals: null,
      awayGoals: null,
      status: 'scheduled'
    }));
    // save bracket
    save(KEY_KNOCKOUT, { r16, qf: [], sf: [], final: [] });
    // show goKnockout button
    const goBtn = $('#goKnockout');
    if (goBtn) goBtn.style.display = 'inline-block';
    alert('Round of 16 generated (saved). Go to Knockout page to view and continue.');
  }

  // public init functions for pages
  function initGroupsPage() {
    // buttons
    const generateGroupsBtn = $('#generateGroupsBtn');
    const generateRoundBtn = $('#generateRoundBtn');
    const goKnockoutBtn = $('#goKnockout');
    const prev = $('#prevRound');
    const next = $('#nextRound');
    const curLabel = $('#currentRoundLabel');

    // load state
    const savedGroups = load(KEY_GROUPS);
    if (!savedGroups) {
      createGroups();
    }
    renderGroupsPanel();
    renderPlayedMatches();

    // set round display
    let rounds = load(KEY_ROUNDS) || 0;
    $('#roundInfo').textContent = `Rounds generated: ${rounds}/3`;
    let activeRound = Math.max(1, Math.min(3, rounds || 1));
    curLabel.textContent = `Round ${activeRound}`;
    renderMatchesForRound(activeRound);

    // generate groups click
    generateGroupsBtn.addEventListener('click', () => {
      createGroups();
      renderGroupsPanel();
      renderMatchesForRound(1);
      save(KEY_ROUNDS, 0);
      $('#roundInfo').textContent = `Rounds generated: 0/3`;
      $('#goKnockout').style.display = 'none';
    });

    // generate next round
    generateRoundBtn.addEventListener('click', () => {
      let generated = load(KEY_ROUNDS) || 0;
      if (generated >= 3) { alert('All 3 rounds already generated.'); return; }
      const newRound = generated + 1;
      generateRound(newRound);
      save(KEY_ROUNDS, newRound);
      $('#roundInfo').textContent = `Rounds generated: ${newRound}/3`;
      activeRound = newRound;
      curLabel.textContent = `Round ${activeRound}`;
      renderMatchesForRound(activeRound);
      renderStandingsAll();
      renderPlayedMatches();
    });

    // nav arrows
    prev.addEventListener('click', () => {
      let r = Math.max(1, (Number(curLabel.textContent.match(/\d+/)[0]) || 1) - 1);
      curLabel.textContent = `Round ${r}`;
      renderMatchesForRound(r);
    });
    next.addEventListener('click', () => {
      let r = Math.min(3, (Number(curLabel.textContent.match(/\d+/)[0]) || 1) + 1);
      curLabel.textContent = `Round ${r}`;
      renderMatchesForRound(r);
    });

    // modal actions
    $('#cancelScoreBtn').addEventListener('click', closeScoreModal);
    $('#saveScoreBtn').addEventListener('click', saveScoreFromModal);

    // if goKnockout exists
    if (goKnockoutBtn) {
      goKnockoutBtn.addEventListener('click', () => {
        // attempt generate if not yet generated
        tryAutoGenerateKnockout();
        window.location.href = 'knockout.html';
      });
    }

    // initial show/hide go button
    const k = load(KEY_KNOCKOUT);
    if (k && k.r16 && k.r16.length) {
      $('#goKnockout').style.display = 'inline-block';
    }
  }

  // render knockout page
  function initKnockoutPage() {
    const data = load(KEY_KNOCKOUT);
    if (!data) {
      $('#r16').innerHTML = '<p class="muted">Round of 16 not generated yet. Finish groups first.</p>';
      return;
    }
    // simple rendering of rounds (R16 only implemented for now)
    function renderBracketSection(containerId, matches) {
      const c = $(`#${containerId}`);
      if (!c) return;
      if (!matches || matches.length === 0) {
        c.innerHTML = '<div class="muted">No matches</div>';
        return;
      }
      c.innerHTML = matches.map(m => `<div class="bracket-card"><div class="left">${m.home}</div><div class="vs">vs</div><div class="right">${m.away}</div></div>`).join('');
    }

    renderBracketSection('r16', data.r16);
    renderBracketSection('qf', data.qf);
    renderBracketSection('sf', data.sf);
    renderBracketSection('final', data.final);
  }

  // automatically run depending on page
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('groups-page') || location.pathname.endsWith('groups.html')) {
      initGroupsPage();
    }
    if (location.pathname.endsWith('knockout.html')) {
      initKnockoutPage();
    }
    // if groups page or knockout page, attach modal close when clicking overlay
    const modal = $('#scoreModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeScoreModal();
      });
    }
  });

  // expose for manual calls (for pages linking)
  window.createGroups = () => { createGroups(); renderGroupsPanel(); renderMatchesForRound(1); save(KEY_ROUNDS, 0); $('#roundInfo').textContent = `Rounds generated: 0/3`; $('#goKnockout').style.display = 'none'; };
  window.generateRound = (n) => { generateRound(n); renderMatchesForRound(n); save(KEY_ROUNDS, n); $('#roundInfo').textContent = `Rounds generated: ${n}/3`; renderStandingsAll(); renderPlayedMatches(); tryAutoGenerateKnockout(); };
  window.resetTournament = resetTournament; // reuse from reset.js
})();
