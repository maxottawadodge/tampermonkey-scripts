// ==UserScript==
// @name         !DEV DealerSocket Auto Refresh
// @namespace    http://tampermonkey.net/
// @version      1.1
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-auto-refresh.user.js?v=1.1
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-auto-refresh.user.js?v=1.1
// @description  Refresh DealerSocket pages on a repeating interval
// @match        https://dealersocket.com/*
// @match        https://*.dealersocket.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const storageKey = 'devDealerSocketAutoRefresh';
    const positionKey = 'devDealerSocketAutoRefreshPosition';
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
    let dragState = null;
    const panel = document.createElement('section');
    panel.id = panelId;
    panel.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:999999;' +
        'display:flex;align-items:center;gap:4px;padding:4px;' +
        'background:#fff;border:1px solid #bbb;border-radius:5px;' +
        'box-shadow:0 1px 5px rgba(0,0,0,.18);font:11px Arial,sans-serif;';

    const dragHandle = document.createElement('span');
    dragHandle.textContent = '⠿';
    dragHandle.title = 'Drag to move';
    dragHandle.setAttribute('aria-label', 'Drag to move refresh control');
    dragHandle.style.cssText =
        'padding:2px 1px;color:#888;cursor:grab;touch-action:none;user-select:none;';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.step = 'any';
    input.value = String(state?.seconds || 60);
    input.setAttribute('aria-label', 'Refresh interval in seconds');
    input.title = 'Refresh interval in seconds';
    input.style.cssText =
        'box-sizing:border-box;width:48px;padding:3px 4px;' +
        'border:1px solid #bbb;border-radius:3px;font:11px Arial,sans-serif;';

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText =
        'padding:4px 6px;border:0;border-radius:3px;' +
        'background:#2d6cdf;color:#fff;font:600 11px Arial,sans-serif;cursor:pointer;';

    const status = document.createElement('span');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'min-width:12px;text-align:center;color:#666;';

    function restorePosition() {
        const saved = sessionStorage.getItem(positionKey);
        if (!saved) return;

        try {
            const position = JSON.parse(saved);
            if (
                Number.isFinite(position.left) &&
                Number.isFinite(position.top)
            ) {
                panel.style.left = `${Math.max(0, Math.min(
                    position.left,
                    window.innerWidth - panel.offsetWidth
                ))}px`;
                panel.style.top = `${Math.max(0, Math.min(
                    position.top,
                    window.innerHeight - panel.offsetHeight
                ))}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        } catch (error) {
            console.error('DealerSocket auto refresh: invalid saved panel position', error);
            sessionStorage.removeItem(positionKey);
        }
    }

    function movePanel(event) {
        if (!dragState) return;
        const left = Math.max(0, Math.min(
            event.clientX - dragState.offsetX,
            window.innerWidth - panel.offsetWidth
        ));
        const top = Math.max(0, Math.min(
            event.clientY - dragState.offsetY,
            window.innerHeight - panel.offsetHeight
        ));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        sessionStorage.setItem(positionKey, JSON.stringify({ left, top }));
    }

    dragHandle.addEventListener('pointerdown', event => {
        const rect = panel.getBoundingClientRect();
        dragState = {
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        dragHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    dragHandle.addEventListener('pointermove', movePanel);
    dragHandle.addEventListener('pointerup', () => {
        dragState = null;
    });
    dragHandle.addEventListener('pointercancel', () => {
        dragState = null;
    });

    function stopRefresh() {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = undefined;
        state = null;
        sessionStorage.removeItem(storageKey);
        button.textContent = 'Start';
        status.textContent = '—';
        status.removeAttribute('title');
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

        status.textContent = String(Math.ceil(remaining / 1000));
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
        status.removeAttribute('title');
        updateTimer();
    }

    button.addEventListener('click', () => {
        if (state) {
            stopRefresh();
            return;
        }

        const seconds = Number(input.value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            status.textContent = '!';
            status.title = 'Enter a number greater than zero';
            input.focus();
            return;
        }
        startRefresh(seconds);
    });

    panel.append(dragHandle, input, button, status);
    document.body.appendChild(panel);
    restorePosition();

    if (state) {
        button.textContent = 'Stop';
        updateTimer();
    } else {
        button.textContent = 'Start';
        status.textContent = '—';
    }
})();
