// ==UserScript==
// @name         Chess.com Stockfish 16 + Gemini AI Live Assist
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Real-time Stockfish 16 & Gemini AI Winning Move Arrows directly on Chess.com!
// @author       Shivamshu Roy
// @match        https://www.chess.com/*
// @grant        none
// ==UserScript==

(function () {
  'use strict';

  console.log('⚡ Stockfish 16 + Gemini AI Userscript V4 Active');

  let svgOverlay = null;
  let lastFen = '';
  let lastPlyCount = -1;
  let stableTimer = null;
  let pendingFen = '';

  function createOverlayPanel() {
    let panel = document.getElementById('ai-chesscom-hud-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'ai-chesscom-hud-panel';
    panel.setAttribute('style', `
      position: fixed;
      top: 70px;
      right: 20px;
      z-index: 9999999;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(16px);
      border: 2px solid #00e5ff;
      border-radius: 18px;
      padding: 16px 22px;
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 24px rgba(0,229,255,0.4);
      max-width: 320px;
      user-select: none;
    `);

    panel.innerHTML = `
      <div style="font-size:11px; font-weight:800; color:#00e5ff; letter-spacing:1.5px; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
        <span>✨</span> GEMINI AI + STOCKFISH 16
      </div>
      <div id="ai-live-move" style="font-size:22px; font-weight:800; color:#ffffff; margin:2px 0; text-shadow:0 0 12px rgba(0,229,255,0.8);">Searching Board...</div>
      <div id="ai-live-eval" style="font-size:12px; color:#00e676; font-weight:700; margin-bottom:8px;">Analyzing...</div>
      <div id="gemini-explanation" style="font-size:12px; color:#cbd5e1; background:rgba(255,255,255,0.06); padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); line-height:1.4; font-weight:500;">
        🤖 Ready...
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function ensureSvgOverlay(boardEl) {
    if (!boardEl) return null;
    if (!svgOverlay || !document.contains(svgOverlay)) {
      svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgOverlay.id = 'ai-chesscom-svg-overlay';
      svgOverlay.setAttribute('style', 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:99999;');
      if (getComputedStyle(boardEl).position === 'static') {
        boardEl.style.position = 'relative';
      }
      boardEl.appendChild(svgOverlay);
    }
    return svgOverlay;
  }

  function getUserColor(boardEl) {
    if (boardEl.classList.contains('flipped')) return 'b';
    return 'w';
  }

  function getCurrentPly(boardEl) {
    const gameObj = boardEl.game || (document.querySelector('wc-chess-board')?.game) || (document.querySelector('chess-board')?.game);
    if (gameObj && typeof gameObj.getPly === 'function') {
      try { return gameObj.getPly(); } catch(e){}
    }
    const plyElements = document.querySelectorAll('[data-ply]');
    if (plyElements && plyElements.length > 0) {
      let maxPly = 0;
      plyElements.forEach(el => {
        const p = parseInt(el.getAttribute('data-ply'), 10);
        if (!isNaN(p) && p > maxPly) maxPly = p;
      });
      return maxPly;
    }
    const moveTextNodes = document.querySelectorAll('.move-node, .node-highlight, .move-text');
    return moveTextNodes ? moveTextNodes.length : 0;
  }

  function detectActiveTurn(boardEl) {
    const gameObj = boardEl.game || (document.querySelector('wc-chess-board')?.game) || (document.querySelector('chess-board')?.game);
    if (gameObj && typeof gameObj.getFen === 'function') {
      try {
        const fen = gameObj.getFen();
        if (fen) {
          const parts = fen.split(' ');
          if (parts.length >= 2) return parts[1];
        }
      } catch(e){}
    }
    const ply = getCurrentPly(boardEl);
    return ply % 2 === 1 ? 'b' : 'w';
  }

  function getLastOpponentMove() {
    const moveNodes = document.querySelectorAll('.move-node, .node-highlight, [data-ply]');
    if (moveNodes && moveNodes.length > 0) {
      const lastNode = moveNodes[moveNodes.length - 1];
      return lastNode.textContent.trim();
    }
    return '';
  }

  function isValidFen(fenStr) {
    if (!fenStr || typeof fenStr !== 'string') return false;
    const parts = fenStr.split(' ');
    if (parts.length < 2) return false;

    const ranks = parts[0].split('/');
    if (ranks.length !== 8) return false;

    for (let r of ranks) {
      let count = 0;
      for (let char of r) {
        if (!isNaN(char)) {
          count += parseInt(char, 10);
        } else if ('pnbrqkPNBRQK'.includes(char)) {
          count += 1;
        } else {
          return false;
        }
      }
      if (count !== 8) return false;
    }
    return true;
  }

  function getFenFromDom(boardEl) {
    const gameObj = boardEl.game || (document.querySelector('wc-chess-board')?.game) || (document.querySelector('chess-board')?.game);
    if (gameObj && typeof gameObj.getFen === 'function') {
      try {
        const f = gameObj.getFen();
        if (isValidFen(f)) return f;
      } catch(e){}
    }

    const grid = Array(8).fill(null).map(() => Array(8).fill(null));
    const pieceEls = boardEl.querySelectorAll('.piece');
    if (!pieceEls || pieceEls.length === 0) return null;

    pieceEls.forEach(el => {
      const classes = Array.from(el.classList);
      let pieceType = null;
      let squareStr = null;

      classes.forEach(c => {
        if (c.length === 2 && 'wb'.includes(c[0]) && 'pnrqkb'.includes(c[1])) {
          pieceType = c;
        }
        if (c.startsWith('square-')) {
          squareStr = c.replace('square-', '');
        }
      });

      if (pieceType && squareStr) {
        let col = -1, row = -1;
        if (squareStr.length === 2 && isNaN(squareStr[0])) {
          col = squareStr.charCodeAt(0) - 97;
          const rank = parseInt(squareStr[1], 10);
          row = 8 - rank;
        } else if (squareStr.length === 2 && !isNaN(squareStr[0])) {
          col = parseInt(squareStr[0], 10) - 1;
          const rank = parseInt(squareStr[1], 10);
          row = 8 - rank;
        } else if (squareStr.length === 4) {
          col = parseInt(squareStr.substring(0, 2), 10) - 1;
          const rank = parseInt(squareStr.substring(2, 4), 10);
          row = 8 - rank;
        }

        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
          const color = pieceType[0];
          const type = pieceType[1];
          grid[row][col] = color === 'w' ? type.toUpperCase() : type.toLowerCase();
        }
      }
    });

    let fenRows = [];
    for (let r = 0; r < 8; r++) {
      let emptyCount = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const piece = grid[r][c];
        if (!piece) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += piece;
        }
      }
      if (emptyCount > 0) rowStr += emptyCount;
      fenRows.push(rowStr);
    }

    const turn = detectActiveTurn(boardEl);
    const constructedFen = `${fenRows.join('/')} ${turn} KQkq - 0 1`;

    if (isValidFen(constructedFen)) return constructedFen;
    return null;
  }

  function getGeminiExplanation(moveFrom, moveTo, sanMove, score, oppMove) {
    const moveStr = sanMove || `${moveFrom} ➔ ${moveTo}`;
    const oppText = oppMove ? ` (Response to ${oppMove})` : '';

    if (moveStr.includes('x')) {
      return `🎯 Tactical Capture${oppText}: ${moveStr} eliminates enemy piece & wins material!`;
    }
    if (moveStr.includes('+')) {
      return `⚡ Counter-Check${oppText}: ${moveStr} pressures enemy King & forces defensive retreat!`;
    }
    return `💡 Gemini Strategy${oppText}: ${moveStr} optimizes tactical position (Eval ${score})!`;
  }

  // Continuous Board Monitoring Loop with Animation Stability Guard
  setInterval(async () => {
    try {
      const boardEl = document.querySelector('chess-board, wc-chess-board, #board-single, .board');
      if (!boardEl) return;

      createOverlayPanel();
      ensureSvgOverlay(boardEl);

      const userColor = getUserColor(boardEl);
      const activeTurn = detectActiveTurn(boardEl);
      const isYourTurn = (activeTurn === userColor);
      const currentPly = getCurrentPly(boardEl);

      const moveTextEl = document.getElementById('ai-live-move');
      const evalTextEl = document.getElementById('ai-live-eval');
      const geminiEl = document.getElementById('gemini-explanation');

      if (currentPly !== lastPlyCount) {
        lastPlyCount = currentPly;
        lastFen = '';
        if (svgOverlay) svgOverlay.innerHTML = '';
      }

      // IF OPPONENT'S TURN: Clear arrows immediately!
      if (!isYourTurn) {
        if (svgOverlay) svgOverlay.innerHTML = '';
        if (moveTextEl) moveTextEl.textContent = 'Waiting for Opponent...';
        if (evalTextEl) evalTextEl.textContent = `⏳ OPPONENT'S TURN (${activeTurn === 'w' ? 'WHITE' : 'BLACK'})`;
        if (geminiEl) geminiEl.textContent = `⏳ Analyzing opponent move...`;
        return;
      }

      const currentFen = getFenFromDom(boardEl);
      if (!currentFen || currentFen === lastFen || !isValidFen(currentFen)) return;

      const oppMove = getLastOpponentMove();

      if (pendingFen !== currentFen) {
        pendingFen = currentFen;
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(async () => {
          const res = await fetch('https://lichess.org/api/cloud-eval?fen=' + encodeURIComponent(currentFen) + '&multiPv=1');
          if (res.ok) {
            const data = await res.json();
            if (data && data.pvs && data.pvs.length > 0) {
              lastFen = currentFen;
              const uciMove = data.pvs[0].moves.split(' ')[0];
              const from = uciMove.substring(0, 2);
              const to = uciMove.substring(2, 4);
              const sanMove = data.pvs[0].san || `${from} ➔ ${to}`;
              const evalCp = data.pvs[0].cp !== undefined ? (data.pvs[0].cp / 100).toFixed(2) : 'Mate';

              if (moveTextEl) moveTextEl.textContent = `${from} ➔ ${to}`;
              if (evalTextEl) evalTextEl.textContent = `Advantage: ${evalCp >= 0 ? '+' : ''}${evalCp}`;

              if (geminiEl) {
                geminiEl.textContent = getGeminiExplanation(from, to, sanMove, evalCp, oppMove);
              }

              drawArrowOnChessCom(boardEl, from, to);
            }
          }
        }, 200);
      }
    } catch(e) {}
  }, 250);

  function drawArrowOnChessCom(boardEl, from, to) {
    if (!svgOverlay) return;

    const width = boardEl.clientWidth || boardEl.offsetWidth;
    const height = boardEl.clientHeight || boardEl.offsetHeight;

    svgOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgOverlay.innerHTML = '';

    const isFlipped = boardEl.classList.contains('flipped');

    function squareToXY(sq) {
      let col = sq.charCodeAt(0) - 97;
      let rank = parseInt(sq[1], 10);
      let row = 8 - rank;
      if (isFlipped) { col = 7 - col; row = 7 - row; }
      const sz = width / 8;
      return { x: col * sz + sz / 2, y: row * sz + sz / 2, sz };
    }

    const start = squareToXY(from);
    const end = squareToXY(to);
    const sqSize = start.sz;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.id = 'ai-arrow-head-crisp';
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
    path.setAttribute('fill', '#00e5ff');
    marker.appendChild(path);
    defs.appendChild(marker);
    svgOverlay.appendChild(defs);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', start.x.toFixed(1));
    line.setAttribute('y1', start.y.toFixed(1));
    line.setAttribute('x2', end.x.toFixed(1));
    line.setAttribute('y2', end.y.toFixed(1));
    line.setAttribute('stroke', '#00e5ff');
    line.setAttribute('stroke-width', (sqSize * 0.14).toFixed(1));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', 'url(#ai-arrow-head-crisp)');
    line.setAttribute('style', 'filter: drop-shadow(0px 0px 10px rgba(0,229,255,0.9)); opacity:0.95;');

    svgOverlay.appendChild(line);
  }
})();
