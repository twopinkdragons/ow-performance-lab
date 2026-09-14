(function(){
  // ---- Rank model ----
  var TIERS = [
    { name: "Bronze",      color: "#c5784c" },
    { name: "Silver",      color: "#bcc1c7" },
    { name: "Gold",        color: "#ebc463" },
    { name: "Platinum",    color: "#99cdbc" },
    { name: "Emerald",     color: "#11b477" },
    { name: "Diamond",     color: "#6ba5ef" },
    { name: "Master",      color: "#8fe35b" },
    { name: "Grandmaster", color: "#8a70fd" },
    { name: "Champion",    color: "#c77ff6" }
  ];
  var DIVISIONS_PER_TIER = 5;
  var TOTAL_UNITS = TIERS.length * DIVISIONS_PER_TIER; // 45

  // continuous scale value: 0 = Bronze 5 @ 0%, increases toward Champion
  function valueOf(tierIdx, division, percent){
    var dIdx = DIVISIONS_PER_TIER - division; // division5->0 ... division1->4
    return tierIdx * DIVISIONS_PER_TIER + dIdx + (percent / 100);
  }

  function hexToRgb(hex){
    var h = hex.replace('#','');
    return {
      r: parseInt(h.substring(0,2),16),
      g: parseInt(h.substring(2,4),16),
      b: parseInt(h.substring(4,6),16)
    };
  }

  function lerpColor(hexA, hexB, t){
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    var r = Math.round(a.r + (b.r - a.r) * t);
    var g = Math.round(a.g + (b.g - a.g) * t);
    var bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  // color at a given continuous value, per the tier-to-tier interpolation rule
  function colorAt(v){
    v = Math.max(0, Math.min(v, TOTAL_UNITS - 1e-6));
    var tierIdx = Math.min(Math.floor(v / DIVISIONS_PER_TIER), TIERS.length - 1);
    if (tierIdx >= TIERS.length - 1){
      return TIERS[TIERS.length - 1].color; // Champion: top of scale, nothing to blend into
    }
    var frac = (v - tierIdx * DIVISIONS_PER_TIER) / DIVISIONS_PER_TIER;
    return lerpColor(TIERS[tierIdx].color, TIERS[tierIdx + 1].color, frac);
  }

  // human label for a continuous value, snapped to its division boundary (0%)
  function labelAt(v){
    v = Math.max(0, Math.min(v, TOTAL_UNITS));
    var tierIdx = Math.min(Math.floor(v / DIVISIONS_PER_TIER), TIERS.length - 1);
    var rem = v - tierIdx * DIVISIONS_PER_TIER;
    var dIdx = Math.min(Math.floor(rem), DIVISIONS_PER_TIER - 1);
    var division = DIVISIONS_PER_TIER - dIdx;
    return TIERS[tierIdx].name + ' ' + division;
  }

  // ---- Seed match data (from logged games; new entries are appended via Save match) ----
  var GOLD_IDX = TIERS.findIndex(function(t){ return t.name === 'Gold'; });
  var ROMAN_TO_DIVISION = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

  var ALL_GAMES = [
    { v: valueOf(GOLD_IDX, ROMAN_TO_DIVISION.II,  8),   rank: "Gold", division: ROMAN_TO_DIVISION.II,  percent: 8,   map: "Rialto",        mode: "Escort",     hero: "Tracer", result: "Win"  },
    { v: valueOf(GOLD_IDX, ROMAN_TO_DIVISION.II,  -24), rank: "Gold", division: ROMAN_TO_DIVISION.II,  percent: -24, map: "Lijiang Tower", mode: "Control",    hero: "Tracer", result: "Loss" },
    { v: valueOf(GOLD_IDX, ROMAN_TO_DIVISION.III, 36),  rank: "Gold", division: ROMAN_TO_DIVISION.III, percent: 36,  map: "Esperança",     mode: "Push",       hero: "Tracer", result: "Loss" },
    { v: valueOf(GOLD_IDX, ROMAN_TO_DIVISION.III, 65),  rank: "Gold", division: ROMAN_TO_DIVISION.III, percent: 65,  map: "Route 66",      mode: "Escort",     hero: "Tracer", result: "Win"  },
    { v: valueOf(GOLD_IDX, ROMAN_TO_DIVISION.III, 34),  rank: "Gold", division: ROMAN_TO_DIVISION.III, percent: 34,  map: "Suravasa",      mode: "Flashpoint", hero: "Echo",   result: "Loss" }
  ];
  // ^ Local fallback shown until a GitHub connection loads the real data
  // (or if the person never connects at all).

  // ---- GitHub persistence ----
  var GH_OWNER = 'twopinkdragons';
  var GH_REPO = 'ow-performance-lab';
  var GH_PATH = 'matches.json';
  var GH_TOKEN_KEY = 'owPerfLabGhToken';
  var ghCurrentSha = null;

  function ghGetToken(){ return localStorage.getItem(GH_TOKEN_KEY) || ''; }
  function ghSetToken(t){ localStorage.setItem(GH_TOKEN_KEY, t); }

  function b64EncodeUnicode(str){ return btoa(unescape(encodeURIComponent(str))); }
  function b64DecodeUnicode(str){ return decodeURIComponent(escape(atob(str))); }

  function ghApiUrl(){
    return 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + GH_PATH;
  }

  function ghFetchMatches(){
    var token = ghGetToken();
    return fetch(ghApiUrl(), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    }).then(function(res){
      if (!res.ok) throw new Error('GitHub fetch failed (' + res.status + ')');
      return res.json();
    }).then(function(data){
      ghCurrentSha = data.sha;
      var text = b64DecodeUnicode(data.content.replace(/\n/g, ''));
      var parsed = JSON.parse(text || '[]');
      return Array.isArray(parsed) ? parsed : [];
    });
  }

  function ghSaveMatches(records, message){
    var token = ghGetToken();
    var encoded = b64EncodeUnicode(JSON.stringify(records, null, 2));
    return fetch(ghApiUrl(), {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: message, content: encoded, sha: ghCurrentSha })
    }).then(function(res){
      if (!res.ok){
        return res.json().then(function(err){
          throw new Error(err && err.message ? err.message : ('GitHub save failed (' + res.status + ')'));
        });
      }
      return res.json();
    }).then(function(result){
      ghCurrentSha = result.content.sha;
      return result;
    });
  }

  // A saved record stores the source-of-truth fields (rank name, division
  // number, percent) rather than the derived continuous value. Percent can
  // be negative under rank protection — that's kept as-is here so text
  // displays always show the true rank/division, never a value decoded
  // back out of the (possibly demoted) graph position.
  function recordToGame(rec){
    var tierIdx = TIERS.findIndex(function(t){ return t.name === rec.rank; });
    if (tierIdx < 0) tierIdx = 0;
    return {
      v: valueOf(tierIdx, rec.division, rec.percent),
      rank: rec.rank,
      division: rec.division,
      percent: rec.percent,
      map: rec.map,
      mode: rec.mode,
      hero: rec.hero,
      result: rec.result,
      goodComment: rec.goodComment || '',
      badComment: rec.badComment || ''
    };
  }

  function gameToRecord(g){
    return {
      map: g.map,
      mode: g.mode,
      hero: g.hero,
      result: g.result,
      rank: g.rank,
      division: g.division,
      percent: g.percent,
      goodComment: g.goodComment || '',
      badComment: g.badComment || ''
    };
  }

  function romanDivision(d){
    return ['', 'I', 'II', 'III', 'IV', 'V'][d] || d;
  }

  // How many divisions Gold 3 -> Master 3 spans. At this wide a range or
  // wider, individual division sub-ticks get hidden; only tier names show.
  var GOLD_TO_MASTER_SPAN = valueOf(TIERS.findIndex(function(t){ return t.name === 'Master'; }), 3, 0)
                           - valueOf(TIERS.findIndex(function(t){ return t.name === 'Gold'; }), 3, 0);

  function pointInfo(v){
    v = Math.max(0, Math.min(v, TOTAL_UNITS));
    var tierIdx = Math.min(Math.floor(v / DIVISIONS_PER_TIER), TIERS.length - 1);
    var rem = v - tierIdx * DIVISIONS_PER_TIER;
    var dIdx = Math.min(Math.floor(rem), DIVISIONS_PER_TIER - 1);
    return {
      tier: TIERS[tierIdx].name,
      division: DIVISIONS_PER_TIER - dIdx,
      percent: Math.round((rem - dIdx) * 100)
    };
  }

  var ABBR = { Bronze:'B', Silver:'S', Gold:'G', Platinum:'P', Emerald:'E', Diamond:'D', Master:'M', Grandmaster:'GM', Champion:'C' };
  var RESULT_COLORS = { Win: '#00c707', Loss: '#b90e0e', Tie: '#9aa4b2' };

  // Abbreviated axis tick label. Every tier's start (division 5, 0%) gets the
  // plain letter (e.g. "GM"). Everywhere else (minor division ticks, and the
  // one special case of the scale's absolute top, e.g. "C1") gets the letter
  // plus the roman-numeral division.
  function abbrLabelAt(t){
    var full = labelAt(t); // "TierName Division"
    var sp = full.lastIndexOf(' ');
    var tierName = full.substring(0, sp);
    var division = parseInt(full.substring(sp + 1), 10);
    var abbr = ABBR[tierName] || tierName;
    var isTierStart = (t % DIVISIONS_PER_TIER === 0) && (t < TOTAL_UNITS);
    return isTierStart ? abbr : (abbr + division);
  }

  // ---- Match log form: result toggle + live progress entry ----
  var resultToggle = document.getElementById('resultToggle');
  resultToggle.addEventListener('click', function(e){
    var btn = e.target.closest('.result-btn');
    if (!btn) return;
    Array.prototype.forEach.call(resultToggle.querySelectorAll('.result-btn'), function(b){
      b.classList.remove('active');
    });
    btn.classList.add('active');
  });

  var rankSelect = document.getElementById('rank');
  var divisionSelect = document.getElementById('division');
  var percentInput = document.getElementById('percentInput');
  var meterFill = document.getElementById('meterFill');
  var rangeStartLabel = document.getElementById('rangeStartLabel');
  var rangeEndLabel = document.getElementById('rangeEndLabel');

  // The meter now spans the whole current tier: 0% of division V through
  // 99% of division I. Position and gradient are both derived from that.
  function updateMeter(){
    var tierIdx = TIERS.findIndex(function(t){ return t.name === rankSelect.value; });
    var division = parseInt(divisionSelect.value, 10);
    var pct = parseInt(percentInput.value, 10);
    if (isNaN(pct)) pct = 0;
    pct = Math.max(-99, Math.min(99, pct));
    // Note: intentionally NOT writing the clamped value back to
    // percentInput here — doing so on every keystroke stomps on a
    // lone "-" while typing a negative number before the digits
    // follow it (parseInt("-") is NaN, which would snap the field
    // back to 0 and erase the minus sign). Normalizing the displayed
    // value happens on blur instead, once typing is done.

    var dIdx = DIVISIONS_PER_TIER - division; // division 5 -> 0 ... division 1 -> 4
    var tierPos = (dIdx + pct / 100) / DIVISIONS_PER_TIER; // 0..1 across the whole tier

    var hasNextTier = tierIdx < TIERS.length - 1;
    var endColor = hasNextTier ? TIERS[tierIdx + 1].color : TIERS[tierIdx].color;
    // The gradient always spans the full tier (bottom of V to top of I).
    // Only the portion up to the current position is revealed, so a low
    // position shows barely any blend and a high position shows almost
    // the full blend toward the next tier's color — same idea as the graph.
    meterFill.style.width = '100%';
    meterFill.style.background = 'linear-gradient(90deg, ' + TIERS[tierIdx].color + ', ' + endColor + ')';
    meterFill.style.clipPath = 'inset(0 ' + (100 - tierPos * 100) + '% 0 0)';

    rangeStartLabel.textContent = TIERS[tierIdx].name + ' V';
    rangeEndLabel.textContent = 'Progress to ' + (hasNextTier ? TIERS[tierIdx + 1].name + ' V' : TIERS[tierIdx].name + ' I (top rank)');
  }

  function normalizePercentInput(){
    var pct = parseInt(percentInput.value, 10);
    if (isNaN(pct)) pct = 0;
    pct = Math.max(-99, Math.min(99, pct));
    percentInput.value = pct;
    updateMeter();
  }

  rankSelect.addEventListener('change', updateMeter);
  divisionSelect.addEventListener('change', updateMeter);
  percentInput.addEventListener('input', updateMeter);
  percentInput.addEventListener('blur', normalizePercentInput);

  updateMeter();

  // ---- GitHub connect/status UI ----
  var githubStatusText = document.getElementById('githubStatusText');
  var githubDot = document.getElementById('githubDot');
  var githubConnectBtn = document.getElementById('githubConnectBtn');
  var githubTokenRow = document.getElementById('githubTokenRow');
  var githubTokenInput = document.getElementById('githubTokenInput');
  var githubTokenSave = document.getElementById('githubTokenSave');

  function setGithubStatus(state, text){
    githubStatusText.textContent = text;
    githubDot.className = 'github-dot' + (state ? ' ' + state : '');
  }

  githubConnectBtn.addEventListener('click', function(){
    githubTokenRow.classList.toggle('visible');
    if (githubTokenRow.classList.contains('visible')) githubTokenInput.focus();
  });

  function submitGithubToken(){
    var t = githubTokenInput.value.trim();
    if (!t) return;
    ghSetToken(t);
    githubTokenInput.value = '';
    githubTokenRow.classList.remove('visible');
    loadFromGithub();
  }

  githubTokenSave.addEventListener('click', submitGithubToken);
  githubTokenInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') submitGithubToken();
  });

  function loadFromGithub(){
    if (!ghGetToken()){
      setGithubStatus('', 'Not connected');
      githubConnectBtn.textContent = 'Connect';
      return;
    }
    setGithubStatus('', 'Loading…');
    ghFetchMatches().then(function(records){
      ALL_GAMES = records.map(recordToGame);
      setGithubStatus('ok', 'Synced');
      githubConnectBtn.textContent = 'Reconnect';
      render();
      renderTable();
      prefillFromLastGame();
    }).catch(function(err){
      setGithubStatus('error', 'Connection error');
      console.error(err);
    });
  }

  loadFromGithub();

  // ---- Save match: push the current form's entry to GitHub, then graph it ----
  var mapSelect = document.getElementById('map');
  var heroSelect = document.getElementById('hero');
  var saveMatchBtn = document.getElementById('saveMatchBtn');
  var goodTextarea = document.getElementById('good');
  var badTextarea = document.getElementById('bad');
  var formError = document.getElementById('formError');

  function showFormError(msg){
    formError.textContent = msg;
    formError.classList.add('visible');
  }
  function clearFormError(){
    formError.textContent = '';
    formError.classList.remove('visible');
  }

  // The most recently logged game — ALL_GAMES is always in the order
  // matches were saved, so this is simply the last element.
  function getLastGame(){
    return ALL_GAMES.length ? ALL_GAMES[ALL_GAMES.length - 1] : null;
  }

  // Pre-fill hero/rank/division from whatever was last logged, since
  // that's almost always still true for the next match. Result and
  // percent are cleared instead of defaulted — those change every game
  // and a stale default invites logging bad data.
  function prefillFromLastGame(){
    var last = getLastGame();
    if (last){
      if (last.hero) heroSelect.value = last.hero;
      if (last.rank) rankSelect.value = last.rank;
      if (last.division) divisionSelect.value = String(last.division);
    }
    percentInput.value = '';
    Array.prototype.forEach.call(resultToggle.querySelectorAll('.result-btn'), function(b){
      b.classList.remove('active');
    });
    clearFormError();
    updateMeter();
  }

  prefillFromLastGame();

  function validateMatchForm(){
    var missing = [];
    if (!mapSelect.value) missing.push('Map');
    if (!heroSelect.value) missing.push('Hero');
    if (!resultToggle.querySelector('.result-btn.active')) missing.push('Win/Loss/Tie');
    if (!rankSelect.value) missing.push('Rank');
    if (!divisionSelect.value) missing.push('Division');
    if (percentInput.value.trim() === '' || isNaN(parseInt(percentInput.value, 10))) missing.push('Percent');
    return missing;
  }

  saveMatchBtn.addEventListener('click', function(){
    if (!ghGetToken()){
      setGithubStatus('error', 'Connect GitHub to save');
      githubTokenRow.classList.add('visible');
      githubTokenInput.focus();
      return;
    }

    var missing = validateMatchForm();
    if (missing.length){
      showFormError('Fill in ' + missing.join(', ') + ' before saving.');
      return;
    }
    clearFormError();

    var activeResultBtn = resultToggle.querySelector('.result-btn.active');
    var result = activeResultBtn.getAttribute('data-result');
    var tierIdx = TIERS.findIndex(function(t){ return t.name === rankSelect.value; });
    var division = parseInt(divisionSelect.value, 10);
    var pct = parseInt(percentInput.value, 10);

    var newGame = {
      v: valueOf(tierIdx, division, pct),
      rank: rankSelect.value,
      division: division,
      percent: pct,
      map: mapSelect.value,
      hero: heroSelect.value,
      result: result,
      goodComment: goodTextarea.value,
      badComment: badTextarea.value
    };

    saveMatchBtn.disabled = true;
    saveMatchBtn.textContent = 'Saving\u2026';
    setGithubStatus('', 'Saving\u2026');

    // Re-fetch right before writing so the save is against the current
    // file, not a possibly-stale sha from page load.
    ghFetchMatches().then(function(records){
      records.push(gameToRecord(newGame));
      return ghSaveMatches(records, 'Log match: ' + newGame.map + ' (' + result + ')');
    }).then(function(){
      ALL_GAMES.push(newGame);
      render();
      renderTable();
      goodTextarea.value = '';
      badTextarea.value = '';
      setGithubStatus('ok', 'Synced');
      prefillFromLastGame();
    }).catch(function(err){
      setGithubStatus('error', 'Save failed');
      console.error(err);
    }).then(function(){
      saveMatchBtn.disabled = false;
      saveMatchBtn.textContent = 'Save match';
    });
  });

  // ---- Range selection state ----
  var selectedRange = { type: 'last', n: 250 };

  var rangeSelector = document.getElementById('rangeSelector');
  var customInput = document.getElementById('customRangeInput');

  rangeSelector.addEventListener('click', function(e){
    var btn = e.target.closest('.range-btn');
    if (!btn) return;
    Array.prototype.forEach.call(rangeSelector.querySelectorAll('.range-btn'), function(b){
      b.classList.remove('active');
    });
    btn.classList.add('active');

    var r = btn.getAttribute('data-range');
    if (r === 'max'){
      selectedRange = { type: 'max' };
      customInput.classList.remove('visible');
    } else if (r === 'custom'){
      customInput.classList.add('visible');
      var n = parseInt(customInput.value, 10);
      selectedRange = { type: 'last', n: (n > 0 ? n : ALL_GAMES.length) };
      customInput.focus();
    } else {
      customInput.classList.remove('visible');
      selectedRange = { type: 'last', n: parseInt(r, 10) };
    }
    render();
  });

  customInput.addEventListener('change', function(){
    var n = parseInt(customInput.value, 10);
    if (!(n > 0)) n = ALL_GAMES.length;
    n = Math.min(n, ALL_GAMES.length);
    selectedRange = { type: 'last', n: n };
    render();
  });

  function getSelectedGames(){
    if (selectedRange.type === 'max') return ALL_GAMES.slice();
    var n = Math.min(selectedRange.n, ALL_GAMES.length);
    return ALL_GAMES.slice(ALL_GAMES.length - n);
  }

  // ---- Rendering ----
  var svg = document.getElementById('rankSvg');
  var statusEl = document.getElementById('rangeStatus');
  var tooltipEl = document.getElementById('pointTooltip');

  var CHART_LEFT = 44, CHART_RIGHT = 680, CHART_TOP = 20, CHART_BOTTOM = 220;

  function render(){
    var games = getSelectedGames();
    var values = games.map(function(g){ return g.v; });
    var vMin = Math.min.apply(null, values);
    var vMax = Math.max.apply(null, values);

    // Auto-zoom: show the 0% mark of the lowest division present,
    // and the 0% mark of one division above the highest division present.
    var axisMin = Math.floor(vMin);
    var axisMax = Math.min(Math.floor(vMax) + 1, TOTAL_UNITS);
    if (axisMax <= axisMin) axisMax = axisMin + 1;

    // Once the range is wide enough to hide individual divisions, pad both
    // ends out to their tier's boundary for framing (e.g. a bottom at
    // Gold III extends down to show Gold V; a top at Master III extends up
    // to show Grandmaster V).
    var showMinorTicks = (axisMax - axisMin) < GOLD_TO_MASTER_SPAN;
    if (!showMinorTicks){
      axisMin = Math.floor(axisMin / DIVISIONS_PER_TIER) * DIVISIONS_PER_TIER;
      var nextTierStart = (Math.floor(axisMax / DIVISIONS_PER_TIER) + 1) * DIVISIONS_PER_TIER;
      axisMax = Math.min(nextTierStart, TOTAL_UNITS);
    }

    var span = axisMax - axisMin;

    function yFor(v){
      var f = (v - axisMin) / span;
      return CHART_BOTTOM - f * (CHART_BOTTOM - CHART_TOP);
    }
    function xFor(i, n){
      if (n <= 1) return (CHART_LEFT + CHART_RIGHT) / 2;
      return CHART_LEFT + (i / (n - 1)) * (CHART_RIGHT - CHART_LEFT);
    }

    var n = games.length;
    // Absolute game numbers for the displayed slice (matches the table's
    // numbering) — needed so x-axis ticks reference real game numbers,
    // not just position-within-the-current-filter.
    var startGameNumber = ALL_GAMES.length - n + 1;
    var points = games.map(function(g, i){
      // Text always shows the true rank/division/percent as entered — even
      // under rank protection, where a negative percent means the graph's
      // y-position and color sit lower (as if actually demoted) while the
      // label still reads e.g. "Gold II: -24%".
      var tooltip = g.rank + ' ' + romanDivision(g.division) + ': ' + g.percent + '% (' + g.result + ')|' + g.hero + ' \u2014 ' + g.map;
      return { x: xFor(i, n), y: yFor(g.v), color: colorAt(g.v), result: g.result, tooltip: tooltip };
    });

    var parts = [];
    parts.push('<defs>');
    for (var i = 0; i < points.length - 1; i++){
      var p1 = points[i], p2 = points[i+1];
      parts.push(
        '<linearGradient id="seg-grad-' + i + '" gradientUnits="userSpaceOnUse" x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '">' +
        '<stop offset="0%" stop-color="' + p1.color + '"/>' +
        '<stop offset="100%" stop-color="' + p2.color + '"/>' +
        '</linearGradient>'
      );
    }
    parts.push('</defs>');

    // gridlines + ticks: major = tier boundary, minor = division boundary.
    // Minor ticks are hidden once the visible span is as wide as Gold 3 -> Master 3.
    // The absolute top of the whole scale (only reachable inside Champion) gets
    // no tick or label at all — there's no rank above it to name.
    for (var t = axisMin; t <= axisMax; t++){
      if (t === TOTAL_UNITS) continue;
      var gy = yFor(t);
      var isTierBoundary = (t % DIVISIONS_PER_TIER === 0);
      if (isTierBoundary){
        parts.push('<line class="grid-line" x1="' + CHART_LEFT + '" y1="' + gy + '" x2="' + CHART_RIGHT + '" y2="' + gy + '" stroke-dasharray="2,4"/>');
        parts.push('<line class="tick-mark-major" x1="' + (CHART_LEFT - 6) + '" y1="' + gy + '" x2="' + CHART_LEFT + '" y2="' + gy + '"/>');
        parts.push('<text class="tick-major" x="' + (CHART_LEFT - 10) + '" y="' + (gy + 3) + '" text-anchor="end">' + abbrLabelAt(t) + '</text>');
      } else if (showMinorTicks){
        parts.push('<line class="grid-line" x1="' + CHART_LEFT + '" y1="' + gy + '" x2="' + CHART_RIGHT + '" y2="' + gy + '" stroke-dasharray="1,5"/>');
        parts.push('<line class="tick-mark-minor" x1="' + (CHART_LEFT - 3) + '" y1="' + gy + '" x2="' + CHART_LEFT + '" y2="' + gy + '"/>');
        parts.push('<text class="tick-minor" x="' + (CHART_LEFT - 10) + '" y="' + (gy + 3) + '" text-anchor="end">' + abbrLabelAt(t) + '</text>');
      }
    }

    parts.push('<line class="axis-line" x1="' + CHART_LEFT + '" y1="' + CHART_TOP + '" x2="' + CHART_LEFT + '" y2="' + CHART_BOTTOM + '"/>');
    parts.push('<line class="axis-line" x1="' + CHART_LEFT + '" y1="' + CHART_BOTTOM + '" x2="' + CHART_RIGHT + '" y2="' + CHART_BOTTOM + '"/>');

    // x-axis: game-number ticks at a "nice" round interval (1/2/5 x a power
    // of ten), sized to land on roughly 6-8 ticks regardless of how many
    // games are on screen — the same approach D3/Chart.js/matplotlib use
    // for auto-scaling axis ticks to a variable data range.
    function niceNum(x){
      if (x <= 0) return 1;
      var exp = Math.floor(Math.log(x) / Math.LN10);
      var f = x / Math.pow(10, exp);
      var niceF = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
      return niceF * Math.pow(10, exp);
    }
    var TARGET_X_TICKS = 7;
    var xTickStep = Math.max(1, niceNum(n / TARGET_X_TICKS));
    var endGameNumber = ALL_GAMES.length;
    var firstXTick = Math.ceil(startGameNumber / xTickStep) * xTickStep;
    for (var gn = firstXTick; gn <= endGameNumber; gn += xTickStep){
      var idx = gn - startGameNumber;
      var px = xFor(idx, n);
      parts.push('<line class="tick-mark-minor" x1="' + px + '" y1="' + CHART_BOTTOM + '" x2="' + px + '" y2="' + (CHART_BOTTOM + 5) + '"/>');
      parts.push('<text class="axis-label" x="' + px + '" y="' + (CHART_BOTTOM + 16) + '" text-anchor="middle">' + gn + '</text>');
    }

    for (var i = 0; i < points.length - 1; i++){
      var p1 = points[i], p2 = points[i+1];
      parts.push('<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="url(#seg-grad-' + i + ')" stroke-width="2.5" stroke-linecap="round"/>');
    }

    // points: visible fill dot when few enough to read; always hoverable.
    // No border here — win/loss shows on the tooltip instead.
    var showDots = points.length <= 120;
    points.forEach(function(p){
      parts.push(
        '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (showDots ? 3 : 5) + '" ' +
        'fill="' + (showDots ? p.color : 'transparent') + '" ' +
        'pointer-events="all" data-tooltip="' + p.tooltip.replace(/"/g, '&quot;') + '" data-color="' + p.color + '" data-result="' + p.result + '"/>'
      );
    });

    svg.innerHTML = parts.join('');

    statusEl.textContent = n + (n === 1 ? ' game' : ' games') + ' shown \u00b7 ' + labelAt(axisMin) + ' \u2013 ' + labelAt(axisMax) + ' visible range';
  }

  // ---- Match history table: full log, unaffected by the graph's range filter ----
  var matchTableBody = document.getElementById('matchTableBody');
  var tableEmpty = document.getElementById('tableEmpty');

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderTable(){
    if (!ALL_GAMES.length){
      matchTableBody.innerHTML = '';
      tableEmpty.classList.add('visible');
      return;
    }
    tableEmpty.classList.remove('visible');

    var rowsHtml = ALL_GAMES.map(function(g, i){
      var resultColor = RESULT_COLORS[g.result] || RESULT_COLORS.Win;
      var rankText = g.rank + ' ' + romanDivision(g.division);
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="truncate" title="' + escapeHtml(g.map) + '">' + escapeHtml(g.map) + '</td>' +
        '<td class="truncate" title="' + escapeHtml(g.hero) + '">' + escapeHtml(g.hero) + '</td>' +
        '<td style="color:' + resultColor + '">' + escapeHtml(g.result) + '</td>' +
        '<td class="truncate" title="' + escapeHtml(rankText) + '">' + escapeHtml(rankText) + '</td>' +
        '<td class="num">' + g.percent + '%</td>' +
        '<td class="num"><button type="button" class="row-delete-btn" data-index="' + i + '" title="Delete this match">\u00d7</button></td>' +
      '</tr>';
    }).join('');

    matchTableBody.innerHTML = rowsHtml;
  }

  // Delete a match: re-fetch the current file (avoid a stale sha), remove
  // the record at this index, save, then drop it locally and re-render
  // both the graph and the table.
  matchTableBody.addEventListener('click', function(e){
    var btn = e.target.closest('.row-delete-btn');
    if (!btn) return;

    if (!ghGetToken()){
      setGithubStatus('error', 'Connect GitHub to delete');
      githubTokenRow.classList.add('visible');
      githubTokenInput.focus();
      return;
    }

    var index = parseInt(btn.getAttribute('data-index'), 10);
    var g = ALL_GAMES[index];
    if (!g) return;

    var label = g.map + ' \u2014 ' + g.rank + ' ' + romanDivision(g.division) + ' (' + g.percent + '%)';
    if (!window.confirm('Delete match #' + (index + 1) + ': ' + label + '?')) return;

    Array.prototype.forEach.call(matchTableBody.querySelectorAll('.row-delete-btn'), function(b){
      b.disabled = true;
    });
    setGithubStatus('', 'Deleting\u2026');

    ghFetchMatches().then(function(records){
      records.splice(index, 1);
      return ghSaveMatches(records, 'Delete match: ' + label);
    }).then(function(){
      ALL_GAMES.splice(index, 1);
      render();
      renderTable();
      prefillFromLastGame();
      setGithubStatus('ok', 'Synced');
    }).catch(function(err){
      setGithubStatus('error', 'Delete failed');
      console.error(err);
      Array.prototype.forEach.call(matchTableBody.querySelectorAll('.row-delete-btn'), function(b){
        b.disabled = false;
      });
    });
  });

  svg.addEventListener('pointermove', function(e){
    var target = e.target;
    if (target && target.hasAttribute && target.hasAttribute('data-tooltip')){
      var parts2 = target.getAttribute('data-tooltip').split('|');
      var ptColor = target.getAttribute('data-color');
      var result = target.getAttribute('data-result');
      var resultColor = RESULT_COLORS[result] || RESULT_COLORS.Win;
      tooltipEl.style.borderColor = resultColor;
      tooltipEl.innerHTML = '<div class="tt-main" style="color:' + ptColor + '">' + parts2[0] + '</div><div class="tt-sub">' + (parts2[1] || '') + '</div>';
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = (e.clientX + 14) + 'px';
      tooltipEl.style.top = (e.clientY + 14) + 'px';
    } else {
      tooltipEl.style.display = 'none';
    }
  });

  svg.addEventListener('pointerleave', function(){
    tooltipEl.style.display = 'none';
  });

  render();
  renderTable();
})();
