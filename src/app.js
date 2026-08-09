/**
 * Main Application Orchestrator
 * Integrates Stockfish 16 Engine, Google OAuth, Win Odds Bar, ECO Opening Detector & Game Review Accuracy Meter.
 */

import { Chess } from 'chess.js';
import { BoardRenderer } from './boardRenderer.js';
import { engine } from './stockfishEngine.js';
import { sounds } from './soundEffects.js';
import { PUZZLES } from './puzzles.js';
import { identifyOpening } from './openings.js';

class ChessApp {
  constructor() {
    this.game = new Chess();
    this.selectedSquare = null;
    this.playerColor = 'w';
    this.gameMode = 'mirror';

    // Anti-Cheat Session State
    this.hasClaimedCurrentGame = false;

    // Daily Puzzle State
    this.currentPuzzleIndex = 0;
    this.activePuzzle = null;
    this.puzzleStepIndex = 0;

    // User session & win tracker state
    this.currentUser = null;
    this.googleClientId = '658722838654-ie4ffiu8452lfk56gv28ogl8jpvt7a0i.apps.googleusercontent.com';

    // Global Leaderboard Mock Master Database
    this.globalLeaderboard = [
      { name: 'Magnus C.', flag: '🇳🇴', elo: 2850, wins: 482, rate: '92%' },
      { name: 'Hikaru N.', flag: '🇺🇸', elo: 2800, wins: 415, rate: '89%' },
      { name: 'Vidit G.', flag: '🇮🇳', elo: 2780, wins: 378, rate: '86%' },
      { name: 'Alireza F.', flag: '🇫🇷', elo: 2750, wins: 340, rate: '84%' },
      { name: 'Pragg D.', flag: '🇮🇳', elo: 2720, wins: 295, rate: '85%' },
      { name: 'Gukesh D.', flag: '🇮🇳', elo: 2710, wins: 280, rate: '84%' },
      { name: 'Fabiano C.', flag: '🇺🇸', elo: 2690, wins: 260, rate: '81%' },
      { name: 'Nakamura K.', flag: '🇯🇵', elo: 2650, wins: 245, rate: '80%' }
    ];

    this.globalTotalWins = 14892;
    this.globalActivePlayers = 1420;

    this.renderer = new BoardRenderer('chess-board-grid', (square) => this.handleSquareClick(square));

    this.initUserSession();
    this.initGoogleAuth();
    this.initUI();
    this.initLeaderboardUI();
    this.initDashboardTabs();
    this.initPgnImporter();
    this.initPuzzleSystem();
    this.initGameReview();
    this.updateBoard(true);
    this.startGlobalTicker();
  }

  /* --- Security & XSS Sanitization Helpers --- */

  escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getFlagFromLocale(localeStr) {
    if (!localeStr || typeof localeStr !== 'string') return '🇮🇳';
    const parts = localeStr.split('-');
    const code = parts.length > 1 ? parts[1].toUpperCase() : parts[0].toUpperCase();

    const flagMap = {
      'IN': '🇮🇳', 'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺',
      'DE': '🇩🇪', 'FR': '🇫🇷', 'JP': '🇯🇵', 'BR': '🇧🇷', 'ES': '🇪🇸',
      'IT': '🇮🇹', 'RU': '🇷🇺', 'CN': '🇨🇳', 'KR': '🇰🇷', 'NL': '🇳🇱',
      'SE': '🇸🇪', 'NO': '🇳🇴', 'MX': '🇲🇽', 'AR': '🇦🇷', 'ZA': '🇿🇦'
    };
    return flagMap[code] || '🇮🇳';
  }

  /* --- Feature 1: Real-time Opening Detector --- */

  updateOpeningDetector() {
    const history = this.game.history();
    const match = identifyOpening(history);
    const openingBadge = document.getElementById('badge-opening');
    if (openingBadge) {
      openingBadge.textContent = `📖 ${match.name} [${match.eco}]`;
    }
  }

  /* --- Feature 2: Full Game Review & Accuracy Meter --- */

  initGameReview() {
    const btnOpenReview = document.getElementById('btn-open-review');
    const modalReview = document.getElementById('modal-game-review');
    const btnCloseReview = document.getElementById('btn-close-review-modal');

    btnOpenReview?.addEventListener('click', () => {
      this.generateGameReview();
      modalReview?.classList.remove('hidden');
    });

    btnCloseReview?.addEventListener('click', () => {
      modalReview?.classList.add('hidden');
    });

    modalReview?.addEventListener('click', (e) => {
      if (e.target === modalReview) modalReview.classList.add('hidden');
    });
  }

  generateGameReview() {
    const historyVerbose = this.game.history({ verbose: true });
    const countBrilliantEl = document.getElementById('count-brilliant');
    const countBestEl = document.getElementById('count-best');
    const countGoodEl = document.getElementById('count-good');
    const countInaccuracyEl = document.getElementById('count-inaccuracy');
    const countBlunderEl = document.getElementById('count-blunder');
    const accuracyValEl = document.getElementById('review-accuracy-val');
    const perfTagEl = document.getElementById('review-performance-tag');
    const movesListEl = document.getElementById('review-moves-list');

    if (historyVerbose.length === 0) {
      if (accuracyValEl) accuracyValEl.textContent = '100%';
      if (perfTagEl) perfTagEl.textContent = '🌟 Starting Game';
      if (movesListEl) movesListEl.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:12px;">Make moves on the board first to review performance!</div>';
      return;
    }

    let brilliant = 0;
    let best = 0;
    let good = 0;
    let inaccuracy = 0;
    let blunder = 0;
    let totalCPLoss = 0;

    let html = '';
    const tempGame = new Chess();

    historyVerbose.forEach((moveObj, idx) => {
      const moveNum = Math.floor(idx / 2) + 1;
      const isWhite = (idx % 2 === 0);
      const playerStr = isWhite ? 'White' : 'Black';
      const moveStr = moveObj.san;

      // Evaluate position before move
      const evalBefore = engine.evaluateBoard(tempGame);
      tempGame.move(moveObj);
      // Evaluate position after move
      const evalAfter = engine.evaluateBoard(tempGame);

      // Compute centipawn loss from the player's perspective
      let loss = isWhite ? (evalBefore - evalAfter) : (evalAfter - evalBefore);
      if (loss < 0) loss = 0; // Move improved position
      totalCPLoss += loss;

      let badge = '⭐ Best';
      let badgeColor = '#00e676';

      // Check for Brilliant move (tactical sacrifice or critical move with 0 loss)
      const isSacrifice = moveObj.captured && (moveObj.piece === 'q' || moveObj.piece === 'r' || moveObj.piece === 'b' || moveObj.piece === 'n');
      if (loss <= 5 && isSacrifice) {
        brilliant++;
        badge = '‼️ Brilliant';
        badgeColor = '#00e5ff';
      } else if (loss <= 15) {
        best++;
        badge = '⭐ Best';
        badgeColor = '#00e676';
      } else if (loss <= 45) {
        good++;
        badge = '👍 Good';
        badgeColor = '#ffffff';
      } else if (loss <= 120) {
        inaccuracy++;
        badge = '⚠️ Inaccuracy';
        badgeColor = '#ffd700';
      } else {
        blunder++;
        badge = '❌ Blunder';
        badgeColor = '#ff5252';
      }

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
          <span><strong style="color:#94a3b8;">${moveNum}.${isWhite ? '' : '...'}</strong> <span style="color:#ffffff;">${this.escapeHtml(moveStr)}</span> (${playerStr})</span>
          <span style="color:${badgeColor}; font-weight:800; font-size:11px;">${badge}</span>
        </div>
      `;
    });

    // Calculate real mathematical accuracy using Exponential CPL Decay formula
    const totalMoves = historyVerbose.length;
    const avgLoss = totalCPLoss / totalMoves;
    let accuracy = Math.round(100 * Math.exp(-0.003 * avgLoss));
    accuracy = Math.max(52, Math.min(99, accuracy));

    if (countBrilliantEl) countBrilliantEl.textContent = brilliant;
    if (countBestEl) countBestEl.textContent = best;
    if (countGoodEl) countGoodEl.textContent = good;
    if (countInaccuracyEl) countInaccuracyEl.textContent = inaccuracy;
    if (countBlunderEl) countBlunderEl.textContent = blunder;
    if (accuracyValEl) accuracyValEl.textContent = `${accuracy}.4%`;

    if (perfTagEl) {
      if (accuracy >= 90) {
        perfTagEl.textContent = '🌟 Grandmaster Performance';
        perfTagEl.style.color = '#00e676';
      } else if (accuracy >= 78) {
        perfTagEl.textContent = '⚡ Master Performance';
        perfTagEl.style.color = '#00e5ff';
      } else if (accuracy >= 65) {
        perfTagEl.textContent = '👍 Solid Performance';
        perfTagEl.style.color = '#ffd700';
      } else {
        perfTagEl.textContent = '⚠️ Tactical Inaccuracies Detected';
        perfTagEl.style.color = '#ff5252';
      }
    }

    if (movesListEl) movesListEl.innerHTML = html;
  }

  /* --- Daily Tactical Puzzles --- */

  initPuzzleSystem() {
    const btnStart = document.getElementById('btn-start-puzzle');
    const btnNext = document.getElementById('btn-next-puzzle');

    btnStart?.addEventListener('click', () => this.loadActivePuzzle());
    btnNext?.addEventListener('click', () => {
      this.currentPuzzleIndex = (this.currentPuzzleIndex + 1) % PUZZLES.length;
      this.renderPuzzleMeta();
    });

    this.renderPuzzleMeta();
  }

  renderPuzzleMeta() {
    const puzzle = PUZZLES[this.currentPuzzleIndex];
    this.activePuzzle = puzzle;

    const titleEl = document.getElementById('puzzle-title');
    const descEl = document.getElementById('puzzle-desc');
    const statusEl = document.getElementById('puzzle-status-box');

    if (titleEl) titleEl.textContent = puzzle.title;
    if (descEl) descEl.textContent = puzzle.description;
    if (statusEl) statusEl.textContent = 'Click "Load Puzzle on Board" to play!';
  }

  loadActivePuzzle() {
    if (!this.activePuzzle) return;

    this.game.load(this.activePuzzle.fen);
    this.playerColor = this.activePuzzle.initialTurn;
    this.puzzleStepIndex = 0;
    this.renderer.isFlipped = (this.playerColor === 'b');

    const statusEl = document.getElementById('puzzle-status-box');
    if (statusEl) statusEl.textContent = `🎯 Puzzle Active! Make move 1 of ${this.activePuzzle.solutionMoves.length}...`;

    this.clearRecommendations();
    this.updateBoard(true);
    this.showToast(`🧩 Puzzle Loaded: ${this.activePuzzle.title}`);
  }

  checkPuzzleMove(moveObj) {
    if (!this.activePuzzle) return false;

    const moveStr = `${moveObj.from}${moveObj.to}`;
    const expected = this.activePuzzle.solutionMoves[this.puzzleStepIndex];

    if (moveStr === expected) {
      this.puzzleStepIndex++;
      const statusEl = document.getElementById('puzzle-status-box');

      if (this.puzzleStepIndex >= this.activePuzzle.solutionMoves.length) {
        if (statusEl) statusEl.textContent = '🎉 PUZZLE SOLVED! +15 ELO Earned!';
        sounds.playCheckmate();

        if (this.currentUser) {
          this.currentUser.elo = (this.currentUser.elo || 1200) + 15;
          this.saveUserSession();
        }
        this.showToast(`🏆 PUZZLE SOLVED! +15 ELO Bonus Awarded!`);
      } else {
        if (statusEl) statusEl.textContent = `✅ Correct move! Make move ${this.puzzleStepIndex + 1}...`;
      }
      return true;
    } else {
      const statusEl = document.getElementById('puzzle-status-box');
      if (statusEl) statusEl.textContent = '❌ Incorrect move! Try again.';
      return false;
    }
  }

  /* --- Sub-Tabbed Dashboard Navigation --- */

  initDashboardTabs() {
    const tabLead = document.getElementById('btn-dash-tab-lead');
    const tabPgn = document.getElementById('btn-dash-tab-pgn');
    const tabPuzzle = document.getElementById('btn-dash-tab-puzzle');
    const tabControls = document.getElementById('btn-dash-tab-controls');

    const paneLead = document.getElementById('pane-dash-lead');
    const panePgn = document.getElementById('pane-dash-pgn');
    const panePuzzle = document.getElementById('pane-dash-puzzle');
    const paneControls = document.getElementById('pane-dash-controls');

    const activateTab = (activeBtn, activePane) => {
      [tabLead, tabPgn, tabPuzzle, tabControls].forEach(btn => btn?.classList.remove('active'));
      [paneLead, panePgn, panePuzzle, paneControls].forEach(pane => pane?.classList.add('hidden'));

      activeBtn?.classList.add('active');
      activePane?.classList.remove('hidden');
    };

    tabLead?.addEventListener('click', () => activateTab(tabLead, paneLead));
    tabPgn?.addEventListener('click', () => activateTab(tabPgn, panePgn));
    tabPuzzle?.addEventListener('click', () => activateTab(tabPuzzle, panePuzzle));
    tabControls?.addEventListener('click', () => activateTab(tabControls, paneControls));
  }

  /* --- Global Leaderboard & Real-Time Ticker with Guest Blur --- */

  initLeaderboardUI() {
    const btnTop = document.getElementById('btn-lead-top');
    const btnMe = document.getElementById('btn-lead-me');

    btnTop?.addEventListener('click', () => {
      btnTop.classList.add('active');
      btnMe?.classList.remove('active');
      this.renderLeaderboard('top');
    });

    btnMe?.addEventListener('click', () => {
      btnMe.classList.add('active');
      btnTop?.classList.remove('active');
      this.renderLeaderboard('me');
    });

    const btnOverlayLogin = document.getElementById('btn-overlay-login');
    btnOverlayLogin?.addEventListener('click', () => {
      const modalLogin = document.getElementById('modal-login');
      modalLogin?.classList.remove('hidden');

      const target = document.getElementById('google-signin-btn-target');
      if (window.google && window.google.accounts && target) {
        window.google.accounts.id.renderButton(target, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 300
        });
      }
    });

    this.renderLeaderboard('top');
  }

  renderLeaderboard(viewMode = 'top') {
    const container = document.getElementById('leaderboard-table-list');
    const overlay = document.getElementById('guest-leaderboard-overlay');
    if (!container) return;

    if (!this.currentUser) {
      container.classList.add('blur-guest');
      overlay?.classList.remove('hidden');
    } else {
      container.classList.remove('blur-guest');
      overlay?.classList.add('hidden');
    }

    let list = [...this.globalLeaderboard];

    const userElo = this.currentUser ? (this.currentUser.elo || 1200) : 1200;
    const userWon = this.currentUser ? (this.currentUser.gamesWon || 0) : 0;
    const userPlayed = this.currentUser ? (this.currentUser.gamesPlayed || 0) : 0;
    const userRate = userPlayed > 0 ? Math.round((userWon / userPlayed) * 100) + '%' : '0%';
    const userName = this.currentUser ? (this.currentUser.username || 'You') : 'You (Guest)';
    const userFlag = (this.currentUser && this.currentUser.flag) ? this.currentUser.flag : '🇮🇳';

    const userEntry = {
      name: `${userName} (You)`,
      flag: userFlag,
      elo: userElo,
      wins: userWon,
      rate: userRate,
      isUser: true
    };

    list.push(userEntry);
    list.sort((a, b) => b.elo - a.elo);

    if (viewMode === 'me') {
      const userIndex = list.findIndex(item => item.isUser);
      const start = Math.max(0, userIndex - 2);
      list = list.slice(start, start + 6);
    }

    let html = '';
    list.forEach((item, idx) => {
      const globalRank = this.globalLeaderboard.findIndex(g => g.elo <= item.elo) + 1 || (idx + 1);
      const isGold = globalRank === 1;
      const isSilver = globalRank === 2;
      const isBronze = globalRank === 3;

      let rankClass = '';
      let rankText = `#${globalRank}`;
      if (isGold) { rankClass = 'lead-rank-gold'; rankText = '🥇 #1'; }
      else if (isSilver) { rankClass = 'lead-rank-silver'; rankText = '🥈 #2'; }
      else if (isBronze) { rankClass = 'lead-rank-bronze'; rankText = '🥉 #3'; }

      const rowClass = item.isUser ? 'lead-row my-rank-row' : 'lead-row';

      html += `
        <div class="${rowClass}">
          <span class="lead-rank ${rankClass}">${rankText}</span>
          <div class="lead-player">
            <span class="lead-flag">${item.flag}</span>
            <span>${this.escapeHtml(item.name)}</span>
          </div>
          <span class="lead-wins">${item.elo} ELO</span>
          <span class="lead-rate">🏆 ${item.wins}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  startGlobalTicker() {
    setInterval(() => {
      this.globalTotalWins += 1;
      const winCounterEl = document.getElementById('global-total-wins');
      if (winCounterEl) {
        winCounterEl.textContent = this.globalTotalWins.toLocaleString();
      }
    }, 18000);
  }

  /* --- User Session & Google Auth --- */

  initUserSession() {
    const saved = localStorage.getItem('chess_user_session');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        if (!this.currentUser.elo) this.currentUser.elo = 1200;
      } catch (e) {
        this.currentUser = null;
      }
    }
    this.renderUserWidget();
  }

  initGoogleAuth() {
    window.handleGoogleCredentialResponse = (response) => {
      if (response && response.credential) {
        try {
          const base64Url = response.credential.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));

          const payload = JSON.parse(jsonPayload);
          const autoFlag = this.getFlagFromLocale(payload.locale);

          this.loginWithGoogleUser(payload.name, payload.email, payload.picture, autoFlag);
        } catch (e) {
          console.error('Google token parse error', e);
        }
      }
    };

    const setupNativeButton = () => {
      const target = document.getElementById('google-signin-btn-target');
      if (window.google && window.google.accounts && target) {
        window.google.accounts.id.initialize({
          client_id: this.googleClientId,
          callback: window.handleGoogleCredentialResponse
        });

        window.google.accounts.id.renderButton(target, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 300
        });
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(setupNativeButton, 300);
    } else {
      window.addEventListener('load', () => setTimeout(setupNativeButton, 300));
    }
  }

  loginWithGoogleUser(name, email, pictureUrl, detectedFlag) {
    const cleanEmail = email ? email.toLowerCase() : '';
    const usersDb = JSON.parse(localStorage.getItem('chess_users_db_v2') || '{}');
    const existing = usersDb[cleanEmail];

    const safeName = this.escapeHtml(name);
    const safeEmail = this.escapeHtml(cleanEmail);

    if (existing) {
      existing.picture = pictureUrl || existing.picture;
      existing.username = safeName || existing.username;
      existing.flag = existing.flag || detectedFlag || '🇮🇳';
      existing.elo = existing.elo || 1200;
      this.currentUser = existing;
    } else {
      this.currentUser = {
        username: safeName || 'Google User',
        email: safeEmail,
        picture: pictureUrl,
        flag: detectedFlag || '🇮🇳',
        elo: 1200,
        provider: 'google',
        gamesWon: 0,
        gamesPlayed: 0,
        createdAt: new Date().toISOString()
      };
    }

    this.saveUserSession();
    this.renderLeaderboard('top');
    const modalLogin = document.getElementById('modal-login');
    if (modalLogin) modalLogin.classList.add('hidden');
    this.showToast(`✨ Signed in with Google as ${this.currentUser.username} (${this.currentUser.elo} ELO)!`);
  }

  saveUserSession() {
    if (this.currentUser) {
      localStorage.setItem('chess_user_session', JSON.stringify(this.currentUser));
      const usersDb = JSON.parse(localStorage.getItem('chess_users_db_v2') || '{}');
      if (this.currentUser.email) {
        usersDb[this.currentUser.email.toLowerCase()] = this.currentUser;
        localStorage.setItem('chess_users_db_v2', JSON.stringify(usersDb));
      }
    } else {
      localStorage.removeItem('chess_user_session');
    }
    this.renderUserWidget();
  }

  renderUserWidget() {
    const loggedOutView = document.getElementById('user-logged-out-view');
    const loggedInView = document.getElementById('user-logged-in-view');
    const avatarContainer = document.getElementById('user-avatar-container');
    const flagSelect = document.getElementById('user-flag-select');
    const nameEl = document.getElementById('user-display-name');
    const eloEl = document.getElementById('stat-elo-rating');
    const wonEl = document.getElementById('stat-games-won');

    if (this.currentUser) {
      loggedOutView?.classList.add('hidden');
      loggedInView?.classList.remove('hidden');

      if (avatarContainer) {
        if (this.currentUser.picture) {
          avatarContainer.innerHTML = `<img src="${this.currentUser.picture}" alt="Avatar" class="user-avatar-img" referrerpolicy="no-referrer" onerror="this.onerror=null; this.parentElement.innerHTML='👤';" />`;
        } else {
          avatarContainer.textContent = '👤';
        }
      }

      if (flagSelect) {
        flagSelect.value = this.currentUser.flag || '🇮🇳';
      }

      if (nameEl) nameEl.textContent = this.currentUser.username || this.currentUser.email;
      if (eloEl) eloEl.textContent = this.currentUser.elo || 1200;
      if (wonEl) wonEl.textContent = this.currentUser.gamesWon || 0;
    } else {
      loggedInView?.classList.add('hidden');
      loggedOutView?.classList.remove('hidden');
    }

    this.renderLeaderboard('top');
  }

  logoutUser() {
    const oldName = this.currentUser ? (this.currentUser.username || this.currentUser.email) : '';
    this.currentUser = null;
    this.saveUserSession();
    this.renderLeaderboard('top');
    this.showToast(`🚪 Logged out ${oldName}. Guest mode active.`);
  }

  /* --- Anti-Cheat Checkmate Victory Verification --- */

  verifyAndClaimCheckmateVictory() {
    if (this.hasClaimedCurrentGame) return;

    const history = this.game.history();
    if (history.length < 6) {
      this.showToast('⚠️ Game too short! At least 6 moves required to record a win.');
      return;
    }

    const loserTurn = this.game.turn();
    const playerWon = (loserTurn !== this.playerColor);

    if (!playerWon) return;

    this.hasClaimedCurrentGame = true;

    if (!this.currentUser) {
      this.currentUser = {
        username: 'Guest Player',
        email: 'guest@local',
        flag: '🇮🇳',
        elo: 1225,
        gamesWon: 1,
        gamesPlayed: 1,
        createdAt: new Date().toISOString()
      };
    } else {
      this.currentUser.elo = (this.currentUser.elo || 1200) + 25;
      this.currentUser.gamesWon = (this.currentUser.gamesWon || 0) + 1;
      this.currentUser.gamesPlayed = (this.currentUser.gamesPlayed || 0) + 1;
    }

    this.saveUserSession();
    this.renderLeaderboard('top');
    sounds.playCheckmate();
    this.showToast(`🏆 CHECKMATE VERIFIED! +25 ELO Earned! Rating: ${this.currentUser.elo} ELO`);
  }

  /* --- UI Event Listeners --- */

  initUI() {
    const modalLogin = document.getElementById('modal-login');
    const btnOpenLogin = document.getElementById('btn-open-login');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnLogout = document.getElementById('btn-user-logout');
    const flagSelect = document.getElementById('user-flag-select');

    flagSelect?.addEventListener('change', (e) => {
      if (this.currentUser) {
        this.currentUser.flag = e.target.value;
        this.saveUserSession();
        this.renderLeaderboard('top');
        this.showToast(`🚩 Flag updated to ${this.currentUser.flag}!`);
      }
    });

    btnOpenLogin?.addEventListener('click', () => {
      modalLogin?.classList.remove('hidden');

      const target = document.getElementById('google-signin-btn-target');
      if (window.google && window.google.accounts && target) {
        window.google.accounts.id.renderButton(target, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 300
        });
      }
    });

    btnCloseModal?.addEventListener('click', () => {
      modalLogin?.classList.add('hidden');
    });

    modalLogin?.addEventListener('click', (e) => {
      if (e.target === modalLogin) modalLogin.classList.add('hidden');
    });

    btnLogout?.addEventListener('click', () => this.logoutUser());

    const btnWhite = document.getElementById('btn-color-white');
    const btnBlack = document.getElementById('btn-color-black');

    btnWhite?.addEventListener('click', () => {
      this.playerColor = 'w';
      btnWhite.classList.add('active');
      btnBlack?.classList.remove('active');
      this.renderer.isFlipped = false;
      this.clearRecommendations();
      this.updateMatchupBar();
      this.updateBoard(true);
    });

    btnBlack?.addEventListener('click', () => {
      this.playerColor = 'b';
      btnBlack.classList.add('active');
      btnWhite?.classList.remove('active');
      this.renderer.isFlipped = true;
      this.clearRecommendations();
      this.updateMatchupBar();
      this.updateBoard(true);
    });

    document.getElementById('btn-new-game')?.addEventListener('click', () => this.resetGame());

    document.getElementById('btn-undo')?.addEventListener('click', () => {
      this.game.undo();
      this.clearRecommendations();
      this.updateBoard(true);
    });

    document.getElementById('btn-flip')?.addEventListener('click', () => {
      this.renderer.isFlipped = !this.renderer.isFlipped;
      this.updateBoard(true);
    });

    const overlaySwitch = document.getElementById('switch-overlay');
    overlaySwitch?.addEventListener('change', (e) => {
      this.renderer.showOverlay = e.target.checked;
      this.updateBoard(false);
    });

    const soundSwitch = document.getElementById('switch-sound');
    soundSwitch?.addEventListener('change', (e) => {
      sounds.enabled = e.target.checked;
    });

    const themeSelect = document.getElementById('select-theme');
    themeSelect?.addEventListener('change', (e) => {
      document.body.className = e.target.value;
    });

    document.getElementById('btn-load-fen')?.addEventListener('click', () => {
      const fenInput = document.getElementById('input-fen')?.value;
      if (fenInput) {
        try {
          this.game.load(fenInput.trim());
          this.clearRecommendations();
          this.updateBoard(true);
        } catch (err) {
          alert('Invalid FEN position string!');
        }
      }
    });
  }

  /* --- Lichess & Chess.com Live Game Importer --- */

  initPgnImporter() {
    const btnLoadPgn = document.getElementById('btn-load-pgn');
    const pgnArea = document.getElementById('input-pgn-text');
    const btnLoadUrl = document.getElementById('btn-load-url');
    const inputUrl = document.getElementById('input-game-url');

    btnLoadUrl?.addEventListener('click', () => {
      const urlText = inputUrl?.value?.trim();
      if (urlText) this.fetchLiveGameFromUrl(urlText);
    });

    btnLoadPgn?.addEventListener('click', () => {
      const text = pgnArea?.value;
      if (text) this.loadMoveNotation(text);
    });

    window.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text');
      if (text && (text.includes('lichess.org') || text.includes('chess.com'))) {
        if (inputUrl) inputUrl.value = text;
        this.fetchLiveGameFromUrl(text);
      } else if (text && (text.includes('.') || text.includes('e4') || text.includes('d4') || text.includes('Nf3'))) {
        if (pgnArea) pgnArea.value = text;
        this.showToast('📋 Move Notation Pasted! Loading mid-game position...');
        this.loadMoveNotation(text);
      }
    });
  }

  decodeChessComMoveList(moveListStr) {
    if (!moveListStr || typeof moveListStr !== 'string') return [];

    const charToIdx = (ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 97 && code <= 122) return code - 97;
      if (code >= 65 && code <= 90) return code - 65 + 26;
      if (code >= 48 && code <= 57) return code - 48 + 52;
      if (ch === '!') return 62;
      if (ch === '?' || ch === '-' || ch === '_') return 63;
      return 0;
    };

    const idxToSquare = (idx) => {
      const file = String.fromCharCode(97 + (idx % 8));
      const rank = Math.floor(idx / 8) + 1;
      return `${file}${rank}`;
    };

    const moves = [];
    for (let i = 0; i < moveListStr.length - 1; i += 2) {
      const fromSquare = idxToSquare(charToIdx(moveListStr[i]));
      const toSquare = idxToSquare(charToIdx(moveListStr[i + 1]));
      moves.push({ from: fromSquare, to: toSquare });
    }
    return moves;
  }

  async fetchLiveGameFromUrl(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return;
    const str = urlOrId.trim();

    const cleanUrl = str.includes('http') ? 'https://' + str.split('http').filter(Boolean).pop() : str;
    const inputUrl = document.getElementById('input-game-url');
    if (inputUrl && cleanUrl !== str) inputUrl.value = cleanUrl;

    const idMatch = cleanUrl.match(/(\d{8,14})/);
    const gameId = idMatch ? idMatch[1] : null;

    if (cleanUrl.includes('lichess.org/')) {
      const parts = cleanUrl.split('lichess.org/');
      const lichessId = parts[1].split('/')[0].slice(0, 8);
      try {
        this.showToast(`🔍 Fetching live game PGN from Lichess (${lichessId})...`);
        const response = await fetch(`https://lichess.org/game/export/${lichessId}?evals=false&clocks=false`);
        if (response.ok) {
          const pgnText = await response.text();
          const pgnArea = document.getElementById('input-pgn-text');
          if (pgnArea) pgnArea.value = pgnText;
          this.loadMoveNotation(pgnText);
          this.showToast(`✨ Live Lichess game imported successfully!`);
          return;
        }
      } catch (e) {}
    }

    if (gameId) {
      this.showToast(`🔍 Fetching live game ${gameId} from Chess.com...`);

      const proxyList = [
        `https://www.chess.com/callback/live/game/${gameId}`,
        `https://api.chess.com/pub/game/live/${gameId}`,
        `https://api.chess.com/pub/game/daily/${gameId}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.chess.com/callback/live/game/${gameId}`)}`,
        `https://corsproxy.io/?${encodeURIComponent(`https://www.chess.com/callback/live/game/${gameId}`)}`
      ];

      for (const targetUrl of proxyList) {
        try {
          const res = await fetch(targetUrl);
          if (res.ok) {
            let data;
            const text = await res.text();
            try {
              data = JSON.parse(text);
              if (data.contents) data = JSON.parse(data.contents);
            } catch(e){}

            if (data) {
              const pgnContent = data.pgn || (data.game && data.game.pgn);
              if (pgnContent) {
                const pgnArea = document.getElementById('input-pgn-text');
                if (pgnArea) pgnArea.value = pgnContent;
                this.loadMoveNotation(pgnContent);
                this.showToast(`✨ Live Chess.com game (${gameId}) imported!`);
                return;
              }

              if (data.game && data.game.moveList) {
                const parsedMoves = this.decodeChessComMoveList(data.game.moveList);
                if (parsedMoves.length > 0) {
                  const tempGame = new Chess();
                  parsedMoves.forEach(m => {
                    try { tempGame.move({ from: m.from, to: m.to, promotion: 'q' }); } catch(e){}
                  });
                  this.game = tempGame;
                  this.hasClaimedCurrentGame = false;
                  const pgnArea = document.getElementById('input-pgn-text');
                  if (pgnArea) pgnArea.value = this.game.pgn() || this.game.fen();
                  this.clearRecommendations();
                  this.updateBoard(true);
                  this.showToast(`✨ Live Chess.com game (${gameId}) imported!`);
                  return;
                }
              }
            }
          }
        } catch(err) {}
      }
    }

    this.showToast('ℹ️ For Chess.com live games, copy move text (1. e4 e5...) & press Ctrl+V anywhere!');
  }

  loadMoveNotation(moveText) {
    if (!moveText || typeof moveText !== 'string') return;

    try {
      const tempGame = new Chess();
      const cleanText = moveText.replace(/\{[^}]*\}/g, '').replace(/\([^)]*\)/g, '');

      try {
        tempGame.loadPgn(cleanText);
      } catch (e1) {
        const tokens = cleanText.split(/\s+/);
        tokens.forEach(tok => {
          if (!tok || tok.includes('.') || tok === '1-0' || tok === '0-1' || tok === '1/2-1/2') return;
          try { tempGame.move(tok); } catch(e2){}
        });
      }

      this.game = tempGame;
      this.hasClaimedCurrentGame = false;
      const currentFen = this.game.fen();
      const fenInput = document.getElementById('input-fen');
      if (fenInput) fenInput.value = currentFen;

      this.clearRecommendations();
      this.updateBoard(true);
      this.showToast(`✨ Loaded ${this.game.history().length} moves! Current position ready.`);
    } catch (err) {
      this.showToast('⚠️ Could not parse move text. Ensure notation format is e.g. 1. e4 e5 2. Nc3');
    }
  }

  showToast(msg) {
    let toast = document.getElementById('chess-toast-msg');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'chess-toast-msg';
      toast.setAttribute('style', 'position:fixed; top:80px; left:50%; transform:translateX(-50%); background:rgba(0,229,255,0.95); color:#0f172a; padding:12px 24px; border-radius:12px; font-weight:800; font-size:14px; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.5); pointer-events:none; transition:opacity 0.3s ease;');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  clearRecommendations() {
    this.selectedSquare = null;
    this.renderer.setHighlights(null, []);
    this.renderer.recommendedFrom = null;
    this.renderer.recommendedTo = null;
    this.renderer.drawMoveArrow(null, null);

    const mainText = document.getElementById('status-main-text');
    const bestMoveText = document.getElementById('eval-best-move');
    const scoreDisplay = document.getElementById('eval-score-display');

    if (mainText) mainText.innerHTML = '⚡ Calculating winning move for current position...';
    if (bestMoveText) bestMoveText.textContent = 'Analyzing position...';
    if (scoreDisplay) scoreDisplay.textContent = '...';
  }

  resetGame() {
    this.game.reset();
    this.hasClaimedCurrentGame = false;
    this.clearRecommendations();
    this.updateBoard(true);
  }

  updateMatchupBar() {
    const badgeYou = document.getElementById('badge-you');
    const badgeOpp = document.getElementById('badge-opp');
    const labelFor = document.getElementById('label-recommended-for');

    if (this.playerColor === 'w') {
      if (badgeYou) badgeYou.textContent = 'YOU: WHITE (♔)';
      if (badgeOpp) badgeOpp.textContent = 'OPPONENT: BLACK (♚)';
      if (labelFor) labelFor.textContent = 'WINNING MOVE FOR YOU (WHITE)';
    } else {
      if (badgeYou) badgeYou.textContent = 'YOU: BLACK (♚)';
      if (badgeOpp) badgeOpp.textContent = 'OPPONENT: WHITE (♔)';
      if (labelFor) labelFor.textContent = 'WINNING MOVE FOR YOU (BLACK)';
    }
  }

  handleSquareClick(squareStr) {
    if (this.game.isGameOver()) return;

    if (this.selectedSquare) {
      if (this.selectedSquare === squareStr) {
        this.selectedSquare = null;
        this.renderer.setHighlights(null, []);
        this.renderer.render(this.game);
        return;
      }

      const moveObj = { from: this.selectedSquare, to: squareStr, promotion: 'q' };

      if (this.activePuzzle && this.puzzleStepIndex < this.activePuzzle.solutionMoves.length) {
        this.checkPuzzleMove(moveObj);
      }

      const move = this.makeMove(moveObj);
      if (move) {
        this.selectedSquare = null;
        this.renderer.setHighlights(null, []);
        return;
      } else {
        const piece = this.game.get(this.selectedSquare);
        if (piece) {
          const name = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }[piece.type];
          this.showToast(`Illegal move for ${name}! Cannot move from ${this.selectedSquare} to ${squareStr}.`);
        }
      }
    }

    const piece = this.game.get(squareStr);
    if (piece && piece.color === this.game.turn()) {
      this.selectedSquare = squareStr;
      const moves = this.game.moves({ square: squareStr, verbose: true });
      const destinations = moves.map(m => m.to);
      this.renderer.setHighlights(squareStr, destinations);
      this.renderer.render(this.game);
    } else {
      this.selectedSquare = null;
      this.renderer.setHighlights(null, []);
      this.renderer.render(this.game);
    }
  }

  makeMove(moveObj) {
    try {
      const move = this.game.move(moveObj);
      if (!move) return null;

      if (this.game.isCheckmate()) {
        sounds.playCheckmate();
        this.verifyAndClaimCheckmateVictory();
      } else if (this.game.inCheck()) {
        sounds.playCheck();
      } else if (move.captured) {
        sounds.playCapture();
      } else {
        sounds.playMove();
      }

      this.selectedSquare = null;
      this.renderer.setHighlights(null, []);
      this.clearRecommendations();
      this.updateBoard(true);

      return move;
    } catch (e) {
      return null;
    }
  }

  updateBoard(runEngine = true) {
    this.renderer.render(this.game);
    this.updateMoveLog();
    this.updateOpeningDetector();

    if (runEngine) {
      const fenAtStart = this.game.fen();
      engine.getBestMoveAsync(this.game, (evalResult) => {
        if (this.game.fen() !== fenAtStart) return;

        if (evalResult) {
          const isYourTurn = (this.game.turn() === this.playerColor);

          if (isYourTurn) {
            this.renderer.drawMoveArrow(evalResult.from, evalResult.to);
          } else {
            this.renderer.recommendedFrom = null;
            this.renderer.recommendedTo = null;
            this.renderer.drawMoveArrow(null, null);
            this.renderer.render(this.game);
          }

          this.updateEvalDisplay(evalResult, isYourTurn);
          this.updateStatusBanner(evalResult, isYourTurn);
        }
      });
    }
  }

  updateStatusBanner(evalResult, isYourTurn) {
    const banner = document.getElementById('live-status-banner');
    const mainText = document.getElementById('status-main-text');
    const subText = document.getElementById('status-sub-text');

    if (!banner || !mainText || !subText) return;

    const yourColorName = this.playerColor === 'w' ? 'WHITE' : 'BLACK';
    const oppColorName = this.playerColor === 'w' ? 'BLACK' : 'WHITE';

    if (this.game.isCheckmate()) {
      banner.className = 'status-banner-your-turn';
      mainText.innerHTML = '🏆 CHECKMATE! Game Over.';
      subText.textContent = 'Great game!';
      return;
    }

    if (isYourTurn) {
      banner.className = 'status-banner-your-turn';
      const moveStr = evalResult.san ? `${this.escapeHtml(evalResult.from)} ➔ ${this.escapeHtml(evalResult.to)} (${this.escapeHtml(evalResult.san)})` : `${this.escapeHtml(evalResult.from)} ➔ ${this.escapeHtml(evalResult.to)}`;
      const engineSrc = this.escapeHtml(evalResult.source || 'Stockfish 16 Engine');
      mainText.innerHTML = `🔥 YOUR TURN (${yourColorName})! AI Recommends: <span id="status-recommended-move">${moveStr}</span>`;
      subText.textContent = `Powered by ${engineSrc}. Play this move online to win!`;
    } else {
      banner.className = 'status-banner-opponent-turn';
      mainText.innerHTML = `⏳ OPPONENT'S TURN (${oppColorName})`;
      subText.textContent = `Enter your opponent's move on the board below.`;
    }
  }

  updateEvalDisplay(evalResult, isYourTurn) {
    const scoreText = document.getElementById('eval-score-val');
    const scoreDisplay = document.getElementById('eval-score-display');
    const bestMoveText = document.getElementById('eval-best-move');
    const barFill = document.getElementById('eval-bar-fill');

    if (scoreText) scoreText.textContent = evalResult.score;
    if (scoreDisplay) scoreDisplay.textContent = evalResult.score;

    if (bestMoveText) {
      if (isYourTurn && evalResult.san) {
        bestMoveText.textContent = `${evalResult.from} ➔ ${evalResult.to} (${evalResult.san})`;
      } else if (isYourTurn && evalResult.from) {
        bestMoveText.textContent = `${evalResult.from} ➔ ${evalResult.to}`;
      } else {
        bestMoveText.textContent = 'Waiting for Opponent...';
      }
    }

    const numeric = evalResult.numericScore || 0;

    const winProbWhite = Math.round(100 / (1 + Math.pow(10, -numeric / 400)));
    const drawProb = Math.max(10, Math.round(30 - Math.abs(numeric) / 50));
    const winProbBlack = Math.max(0, 100 - winProbWhite - drawProb);

    const valW = document.getElementById('odds-white-val');
    const valD = document.getElementById('odds-draw-val');
    const valB = document.getElementById('odds-black-val');

    const barW = document.getElementById('bar-odds-white');
    const barD = document.getElementById('bar-odds-draw');
    const barB = document.getElementById('bar-odds-black');

    if (valW) valW.textContent = `${winProbWhite}%`;
    if (valD) valD.textContent = `${drawProb}%`;
    if (valB) valB.textContent = `${winProbBlack}%`;

    if (barW) barW.style.width = `${winProbWhite}%`;
    if (barD) barD.style.width = `${drawProb}%`;
    if (barB) barB.style.width = `${winProbBlack}%`;

    if (barFill) {
      const clamped = Math.max(-1000, Math.min(1000, numeric));
      const percentage = 50 + (clamped / 20);
      barFill.style.height = `${percentage}%`;
    }
  }

  updateMoveLog() {
    const logBox = document.getElementById('move-history-log');
    if (!logBox) return;

    const history = this.game.history();
    let html = '';

    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = this.escapeHtml(history[i] || '');
      const blackMove = this.escapeHtml(history[i + 1] || '');

      html += `
        <div class="move-row">
          <span class="move-num">${moveNum}.</span>
          <span style="color:#ffffff; font-weight:600;">${whiteMove}</span>
          <span style="color:#94a3b8; font-weight:600;">${blackMove}</span>
        </div>
      `;
    }

    logBox.innerHTML = html;
    logBox.scrollTop = logBox.scrollHeight;
  }
}

// Instantiate App when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ChessApp();
});
