// ==UserScript==
// @name         Chess.com Stockfish 16 AI Companion
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Automatic Stockfish 16 NNUE Live Overlay directly on Chess.com!
// @author       Shivamshu Roy
// @match        https://www.chess.com/*
// @match        https://www.chess.com/play/*
// @match        https://www.chess.com/game/*
// @grant        none
// ==UserScript==

(function() {
  'use strict';

  console.log('⚡ Chess.com Stockfish 16 AI Companion Initialized');

  function createOverlayPanel() {
    let panel = document.getElementById('ai-chesscom-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'ai-chesscom-panel';
    panel.setAttribute('style', `
      position: fixed;
      top: 70px;
      right: 20px;
      z-index: 9999999;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(16px);
      border: 2px solid #00e5ff;
      border-radius: 16px;
      padding: 16px 22px;
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 20px rgba(0,229,255,0.4);
      min-width: 270px;
      text-align: center;
      user-select: none;
    `);

    panel.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:#00e5ff; letter-spacing:1.5px; margin-bottom:6px;">⚡ STOCKFISH 16 LIVE ASSIST</div>
      <div id="ai-live-move" style="font-size:24px; font-weight:800; color:#ffffff; margin:6px 0; text-shadow:0 0 12px rgba(0,229,255,0.8);">Searching Board...</div>
      <div id="ai-live-eval" style="font-size:12px; color:#94a3b8; font-weight:600;">Active & Ready</div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  createOverlayPanel();

  let svgOverlay = null;

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

  function getFenFromDom(boardEl) {
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

    let activeTurn = 'w';
    if (boardEl.game && typeof boardEl.game.getFen === 'function') {
      try { return boardEl.game.getFen(); } catch(e){}
    }

    return `${fenRows.join('/')} ${activeTurn} KQkq - 0 1`;
  }

  let lastFen = '';

  setInterval(async () => {
    try {
      createOverlayPanel();

      const boardEl = document.querySelector('chess-board, wc-chess-board, #board-single, .board');
      if (!boardEl) return;

      ensureSvgOverlay(boardEl);

      const currentFen = getFenFromDom(boardEl);
      if (!currentFen || currentFen === lastFen) return;
      lastFen = currentFen;

      const res = await fetch('https://lichess.org/api/cloud-eval?fen=' + encodeURIComponent(currentFen) + '&multiPv=1');
      if (res.ok) {
        const data = await res.json();
        if (data && data.pvs && data.pvs.length > 0) {
          const uciMove = data.pvs[0].moves.split(' ')[0];
          const from = uciMove.substring(0, 2);
          const to = uciMove.substring(2, 4);
          const evalCp = data.pvs[0].cp !== undefined ? (data.pvs[0].cp / 100).toFixed(2) : 'Mate';

          const moveTextEl = document.getElementById('ai-live-move');
          const evalTextEl = document.getElementById('ai-live-eval');

          if (moveTextEl) moveTextEl.textContent = `${from} ➔ ${to}`;
          if (evalTextEl) evalTextEl.textContent = `Stockfish 16 Eval: ${evalCp >= 0 ? '+' : ''}${evalCp}`;

          drawArrowOnChessCom(boardEl, from, to);
        }
      }
    } catch(e) {}
  }, 400);

  function drawArrowOnChessCom(boardEl, from, to) {
    if (!svgOverlay) return;

    const rect = boardEl.getBoundingClientRect();
    svgOverlay.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svgOverlay.innerHTML = '';

    const isFlipped = boardEl.classList.contains('flipped');

    function squareToXY(sq) {
      let col = sq.charCodeAt(0) - 97;
      let rank = parseInt(sq[1], 10);
      let row = 8 - rank;
      if (isFlipped) { col = 7 - col; row = 7 - row; }
      const sz = rect.width / 8;
      return { x: col * sz + sz / 2, y: row * sz + sz / 2, sz };
    }

    const start = squareToXY(from);
    const end = squareToXY(to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;

    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const sqSize = start.sz;
    const headLen = sqSize * 0.38, headWidth = sqSize * 0.28, shaftWidth = sqSize * 0.10;
    const startOffset = sqSize * 0.15, endOffset = sqSize * 0.12;

    const tipX = end.x - ux * endOffset, tipY = end.y - uy * endOffset;
    const baseHeadX = end.x - ux * (endOffset + headLen), baseHeadY = end.y - uy * (endOffset + headLen);
    const startX = start.x + ux * startOffset, startY = start.y + uy * startOffset;

    const points = `${tipX},${tipY} ${baseHeadX + px * headWidth},${baseHeadY + py * headWidth} ${baseHeadX + px * shaftWidth},${baseHeadY + py * shaftWidth} ${startX + px * shaftWidth},${startY + py * shaftWidth} ${startX - px * shaftWidth},${startY - py * shaftWidth} ${baseHeadX - px * shaftWidth},${baseHeadY - py * shaftWidth} ${baseHeadX - px * headWidth},${baseHeadY - py * headWidth}`;

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('style', 'fill:#00e5ff; stroke:#0f172a; stroke-width:2; opacity:0.95; filter:drop-shadow(0px 0px 12px rgba(0,229,255,0.9));');
    svgOverlay.appendChild(polygon);
  }
})();
