// ==UserScript==
// @name         !DEV DealerSocket Auto Refresh
// @namespace    http://tampermonkey.net/
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-auto-refresh.user.js?v=1.0
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-auto-refresh.user.js?v=1.0
// @description  Refresh DealerSocket pages on a repeating interval
// @match        https://dealersocket.com/*
// @match        https://*.dealersocket.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const storageKey = 'devDealerSocketAutoRefresh';
    const panelId = 'dev-dsocket-auto-refresh';
    if (document.getElementById(panelId)) return;

    function readState() {
        const saved = sessionStorage.getItem(storageKey);
        if (!saved) return null;

        try {
            const state = JSON.parse(saved);
            if (
                typeof state.seconds === 'number' &&
                Number.isFinite(state.seconds) &&
                state.seconds > 0 &&
                typeof state.nextRefreshAt === 'number' &&
                Number.isFinite(state.nextRefreshAt)
            ) {
                return state;
            }
        } catch (error) {
            console.error('DealerSocket auto refresh: invalid saved timer state', error);
        }

        sessionStorage.removeItem(storageKey);
        return null;
    }

    let state = readState();
    let refreshTimeout;
    const panel = document.createElement('section');
    panel.id = panelId;
    panel.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:999999;' +
        'display:flex;align-items:center;gap:8px;padding:10px;' +
        'background:#fff;border:1px solid #bbb;border-radius:6px;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.2);font:13px Arial,sans-serif;';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.step = 'any';
    input.value = String(state?.seconds || 60);
    input.setAttribute('aria-label', 'Refresh interval in seconds');
    input.title = 'Refresh interval in seconds';
    input.style.cssText =
        'box-sizing:border-box;width:86px;padding:7px 8px;' +
        'border:1px solid #bbb;border-radius:4px;';

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText =
        'padding:8px 12px;border:0;border-radius:4px;' +
        'background:#2d6cdf;color:#fff;font-weight:600;cursor:pointer;';

    const status = document.createElement('span');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'min-width:94px;text-align:right;';

    function stopRefresh() {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = undefined;
        state = null;
        sessionStorage.removeItem(storageKey);
        button.textContent = 'Start';
        status.textContent = 'Disabled';
    }

    function updateTimer() {
        if (!state) return;

        const remaining = state.nextRefreshAt - Date.now();
        if (remaining <= 0) {
            state.nextRefreshAt = Date.now() + state.seconds * 1000;
            sessionStorage.setItem(storageKey, JSON.stringify(state));
            window.location.reload();
            return;
        }

        status.textContent = `Refreshing in ${Math.ceil(remaining / 1000)}s`;
        refreshTimeout = window.setTimeout(
            updateTimer,
            Math.min(remaining, 1000, 2147483647)
        );
    }

    function startRefresh(seconds) {
        state = {
            seconds,
            nextRefreshAt: Date.now() + seconds * 1000
        };
        sessionStorage.setItem(storageKey, JSON.stringify(state));
        button.textContent = 'Stop';
        updateTimer();
    }

    button.addEventListener('click', () => {
        if (state) {
            stopRefresh();
            return;
        }

        const seconds = Number(input.value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            status.textContent = 'Enter seconds > 0';
            input.focus();
            return;
        }
        startRefresh(seconds);
    });

    panel.append(input, button, status);
    document.body.appendChild(panel);

    if (state) {
        button.textContent = 'Stop';
        updateTimer();
    } else {
        button.textContent = 'Start';
        status.textContent = 'Disabled';
    }
})();
