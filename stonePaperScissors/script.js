'use strict';

/* ============================================================================
 * Stone Paper Scissors — Game Engine
 *
 * The file is organized top to bottom as:
 *   1. Configuration   — every tunable number/string lives here
 *   2. Rules           — the win table, kept data-driven so a new hand
 *                        (e.g. "lizard") can be added with one line here
 *                        plus one matching tile in the HTML, no branching
 *                        logic needs to change anywhere else.
 *   3. DOM references  — every element the game touches, gathered once
 *   4. State           — the single mutable object describing "now"
 *   5. Rendering       — pure "state -> DOM" helper functions
 *   6. Game flow       — round lifecycle (start, resolve, advance, end)
 *   7. Event wiring    — connects user input to the flow functions
 *   8. Bootstrap       — runs once on load
 * ============================================================================ */

/* -------------------------------------------------------------------------
 * 1. Configuration
 * ---------------------------------------------------------------------- */
const CONFIG = {
    appName: 'Stone Paper Scissors',
    roundsToWinMatch: 3,       // first side to reach this score wins the match
    roundDurationSeconds: 30,   // countdown a player has to make a choice
    botRevealDelayMs: 313,     // small pause before the bot's tile appears
    resultHoldMs: 2013,        // how long the result stays on screen before the next round
};

/* -------------------------------------------------------------------------
 * 2. Rules
 * A choice on the left beats the choice on the right.
 * Extend this table (and add a matching tile with the same data-choice
 * value in the HTML) to support additional hands without touching any
 * other function in this file.
 * ---------------------------------------------------------------------- */
const BEATS = {
    stone: 'scissors',
    paper: 'stone',
    scissors: 'paper',
};

const ALL_CHOICES = Object.keys(BEATS);

/* -------------------------------------------------------------------------
 * 3. DOM references
 * ---------------------------------------------------------------------- */
const dom = {
    titleTag: document.querySelector('.titleTag'),
    h1Tag: document.querySelector('.h1Tag'),

    startScreen: document.querySelector('.startContainer'),
    usernameInput: document.querySelector('.usernameBox'),
    submitButton: document.querySelector('.submit'),
    startError: document.querySelector('.error'),
    startMessage: document.querySelector('.messageNotification'),

    gameBoard: document.querySelector('.container'),
    logPanel: document.querySelector('.comment'),
    logList: document.querySelector('.comments'),

    userNameLabel: document.querySelector('.userName'),
    userScoreLabel: document.querySelector('.userScore'),
    botScoreLabel: document.querySelector('.botScore'),

    playRoundButton: document.querySelector('.goToPlayRoundBut'),
    userSelectionPanel: document.querySelector('#userSelection'),
    botSelectionPanel: document.querySelector('#botSelection'),
    botWaitingTile: document.querySelector('.botItemSelected'),
};

const userTiles = Array.from(document.querySelectorAll('.userItem'));
const botTiles = Array.from(document.querySelectorAll('.botItem'));

/* -------------------------------------------------------------------------
 * 4. State
 * The single source of truth for "what is happening right now".
 * Every render function below reads from here; nothing reads scores or
 * round numbers back out of the DOM.
 * ---------------------------------------------------------------------- */
const state = {
    username: null,
    userScore: 0,
    botScore: 0,
    roundNumber: 1,
    isRoundResolved: true,   // true while waiting for "play round" press
    logEntryCount: 1,
    countdownTimerHandle: null,
    countdownTimerId: 0,
    secondsRemaining: 0,
};

/* -------------------------------------------------------------------------
 * 5. Rendering — small, single-purpose DOM updates
 * ---------------------------------------------------------------------- */
function renderAppName() {
    dom.titleTag.textContent = CONFIG.appName;
    dom.h1Tag.textContent = CONFIG.appName;
}

function renderScores() {
    dom.userScoreLabel.textContent = String(state.userScore);
    dom.botScoreLabel.textContent = String(state.botScore);
}

function renderRoundButtonLabel() {
    dom.playRoundButton.textContent = 'Play round ' + state.roundNumber;
}

function showStartScreen() {
    dom.startScreen.style.display = 'flex';
    dom.gameBoard.style.display = 'none';
    dom.logPanel.style.display = 'none';
}

function showGameScreen() {
    dom.startScreen.style.display = 'none';
    dom.gameBoard.style.display = 'flex';
    dom.logPanel.style.display = 'flex';
}

function setUserTilesInteractive(isInteractive) {
    userTiles.forEach((tile) => {
        tile.style.pointerEvents = isInteractive ? 'auto' : 'none';
        tile.style.opacity = isInteractive ? '1' : '0.513';
    });
}

function hideAllBotTiles() {
    botTiles.forEach((tile) => {
        tile.style.display = 'none';
    });
    dom.botWaitingTile.style.display = 'flex';
}

function revealBotTile(choice) {
    dom.botWaitingTile.style.display = 'none';
    const tile = botTiles.find((item) => item.dataset.choice === choice);
    if (tile) {
        tile.style.display = 'flex';
    }
}

function appendLogEntry(content) {
    const entry = document.createElement('div');
    const entryNumber = document.createElement('span');

    entry.classList.add('message');
    entryNumber.classList.add('commentNum');
    entryNumber.textContent = String(state.logEntryCount);
    entry.appendChild(entryNumber);

    if (content instanceof HTMLElement) {
        entry.appendChild(content);
    } else {
        const textSpan = document.createElement('span');
        textSpan.classList.add('commentText');
        textSpan.textContent = content;
        entry.appendChild(textSpan);
    }

    dom.logList.appendChild(entry);
    state.logEntryCount++;
    dom.logList.scrollTo({ top: dom.logList.scrollHeight, behavior: 'smooth' });
}

function clearLog() {
    dom.logList.replaceChildren();
    state.logEntryCount = 1;
}

function createReturnToStartButton() {
    const button = document.createElement('button');
    button.textContent = 'Back to Start';
    button.className = 'commentBoxButton';
    button.type = 'button';
    button.onclick = resetToStartScreen;
    return button;
}

/* -------------------------------------------------------------------------
 * 6. Game flow
 * ---------------------------------------------------------------------- */

/** Starts a fresh match for the given player name. */
function startMatch(username) {
    state.username = username;
    state.userScore = 0;
    state.botScore = 0;
    state.roundNumber = 1;
    state.isRoundResolved = true;

    dom.userNameLabel.textContent = username;
    renderScores();
    renderRoundButtonLabel();
    clearLog();
    showGameScreen();

    appendLogEntry('Welcome ' + username);
}

/** Fully resets the app back to the name-entry screen. */
function resetToStartScreen() {
    stopCountdown();
    appendLogEntry('Goodbye ' + state.username);
    showStartScreen();
}

/** True once either side has reached the winning score for the match. */
function hasMatchEnded() {
    if (state.userScore >= CONFIG.roundsToWinMatch) {
        dom.startMessage.textContent = 'You won this game!';
        return true;
    }
    if (state.botScore >= CONFIG.roundsToWinMatch) {
        dom.startMessage.textContent = 'You lost this game!';
        return true;
    }
    return false;
}

/** Ends the match and offers a way back to the start screen. */
function concludeMatch() {
    dom.startScreen.style.display = 'none';
    dom.gameBoard.style.display = 'none';
    appendLogEntry('Goodbye ' + state.username);
    appendLogEntry(createReturnToStartButton());
}

/** Puts the board into "ready to play" state, showing the round button. */
function showRoundReadyState() {
    dom.playRoundButton.style.display = 'flex';
    dom.userSelectionPanel.style.display = 'none';
    dom.botSelectionPanel.style.display = 'none';
    setUserTilesInteractive(true);
    hideAllBotTiles();
}

/** Kicks off a new round: reveals the tiles and starts the countdown. */
function playRound() {
    if (hasMatchEnded()) {
        concludeMatch();
        return;
    }

    state.isRoundResolved = false;

    dom.playRoundButton.style.display = 'none';
    dom.userSelectionPanel.style.display = 'flex';
    dom.botSelectionPanel.style.display = 'flex';

    hideAllBotTiles();
    setUserTilesInteractive(true);

    appendLogEntry('Round ' + state.roundNumber + ' has started!');
    startCountdown(CONFIG.roundDurationSeconds);
}

/** Moves to the next round, or ends the match if it is already decided. */
function advanceToNextRoundOrEnd() {
    if (hasMatchEnded()) {
        concludeMatch();
        return;
    }
    state.roundNumber++;
    renderRoundButtonLabel();
    appendLogEntry('Round ' + (state.roundNumber - 1) + ' has ended. Take a moment to rest.');
    showRoundReadyState();
}

/** Picks a uniformly random choice for the bot. */
function pickBotChoice() {
    const index = Math.floor(Math.random() * ALL_CHOICES.length);
    return ALL_CHOICES[index];
}

/**
 * Resolves the current round given the player's choice (or `null` if the
 * timer ran out with no choice made), updates the score, and schedules the
 * transition into the next round.
 */
function resolveRound(userChoice) {
    if (state.isRoundResolved) {
        return;
    }
    state.isRoundResolved = true;
    stopCountdown();
    setUserTilesInteractive(false);

    const botChoice = pickBotChoice();

    setTimeout(() => {
        revealBotTile(botChoice);

        if (userChoice === null) {
            state.botScore++;
            appendLogEntry("Time's up — you lose this round. Try to be quicker next time!");
        } else if (botChoice === userChoice) {
            appendLogEntry("It's a tie!");
        } else if (BEATS[botChoice] === userChoice) {
            state.botScore++;
            appendLogEntry('You lose this round. Try more!');
        } else {
            state.userScore++;
            appendLogEntry('You win this round!');
        }

        renderScores();

        setTimeout(() => {
            advanceToNextRoundOrEnd();
        }, CONFIG.resultHoldMs);
    }, CONFIG.botRevealDelayMs);
}

/* -------------------------------------------------------------------------
 * Countdown timer
 * ---------------------------------------------------------------------- */

function startCountdown(durationSeconds) {
    state.countdownTimerId++;
    const thisTimerId = state.countdownTimerId;
    state.secondsRemaining = durationSeconds;

    const timerWrapper = document.createElement('span');
    timerWrapper.classList.add('timer', 'timerElementParent');

    const secondsLabel = document.createElement('span');
    secondsLabel.classList.add('second', 'timerElement', 'timer' + thisTimerId);
    timerWrapper.appendChild(secondsLabel);
    appendLogEntry(timerWrapper);

    function render() {
        secondsLabel.textContent = String(state.secondsRemaining % 60).padStart(2, '0');
    }
    render();

    state.countdownTimerHandle = setInterval(() => {
        state.secondsRemaining--;

        if (state.secondsRemaining < 0) {
            stopCountdown();
            secondsLabel.textContent = '00';
            resolveRound(null);
            return;
        }

        render();
    }, 1000);
}

function stopCountdown() {
    if (state.countdownTimerHandle !== null) {
        clearInterval(state.countdownTimerHandle);
        state.countdownTimerHandle = null;
    }
}

/* -------------------------------------------------------------------------
 * 7. Event wiring
 * ---------------------------------------------------------------------- */

function handleNameSubmit() {
    const newUsername = dom.usernameInput.value.trim();
    if (newUsername === '') {
        dom.startError.textContent = 'Please enter a username to continue!';
        return;
    }
    dom.startError.textContent = '';
    startMatch(newUsername);
}

function bindEvents() {
    dom.submitButton.addEventListener('click', handleNameSubmit);
    dom.usernameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleNameSubmit();
        }
    });

    dom.playRoundButton.addEventListener('click', playRound);

    userTiles.forEach((tile) => {
        tile.addEventListener('click', () => {
            resolveRound(tile.dataset.choice);
        });
    });
}

/* -------------------------------------------------------------------------
 * 8. Bootstrap
 * ---------------------------------------------------------------------- */

function init() {
    renderAppName();
    showStartScreen();
    bindEvents();
}

init();
