// ==UserScript==
// @name         dsocket tools (dev)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/dsocket-tools.user.js
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/dsocket-tools.user.js
// @description  Auto-populate DealerSocket searches and add click-to-call buttons
// @match        https://dealersocket.com/*
// @match        https://*.dealersocket.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const storageKey = 'dealerSocketAutoSearch';

    function getUrlSearchTerm() {
        const hashQuery = window.location.hash.split('?')[1] || '';
        return new URLSearchParams(window.location.search).get('dssearch') ||
            new URLSearchParams(hashQuery).get('dssearch');
    }

    const urlSearchTerm = getUrlSearchTerm();
    if (urlSearchTerm) {
        sessionStorage.setItem(storageKey, JSON.stringify({
            term: urlSearchTerm,
            savedAt: Date.now()
        }));
    }

    function getSearchTerm() {
        const fromUrl = getUrlSearchTerm();
        if (fromUrl) return fromUrl;

        const saved = sessionStorage.getItem(storageKey);
        if (!saved) return null;

        try {
            const pending = JSON.parse(saved);
            if (Date.now() - pending.savedAt > 10 * 60 * 1000) {
                sessionStorage.removeItem(storageKey);
                return null;
            }
            return typeof pending.term === 'string' ? pending.term : null;
        } catch (error) {
            sessionStorage.removeItem(storageKey);
            console.error('DealerSocket auto search: invalid saved search term', error);
            return null;
        }
    }

    let pendingSearchTerm = getSearchTerm();
    const messageType = 'dealerSocketAutoSearch';
    const observedDocuments = new WeakSet();
    const observedFrames = new WeakSet();
    const phonePattern =
        /(^|[^\d])(\+?(?:\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}|\d{3}[.-]\d{4})(?!\d)/g;
    const ignoredPhoneElements =
        'a, button, input, select, textarea, script, style, noscript, option, iframe, ' +
        '[contenteditable]:not([contenteditable="false"]), [role="textbox"]';

    function createPhoneLink(doc, phone) {
        const link = doc.createElement('a');
        const digits = phone.replace(/\D/g, '');
        link.href = `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
        link.title = `Call ${phone}`;
        link.setAttribute('aria-label', `Call ${phone}`);
        link.dataset.dealerSocketPhoneLink = 'true';
        link.style.cssText =
            'display:inline-flex;align-items:center;margin-left:4px;' +
            'vertical-align:middle;text-decoration:none;';

        const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '16');
        icon.setAttribute('height', '16');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('aria-hidden', 'true');

        const handset = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        handset.setAttribute(
            'd',
            'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.56 3.58a1 1 0 0 1-.25 1.01z'
        );
        icon.appendChild(handset);
        link.appendChild(icon);
        return link;
    }

    function addPhoneLinks(textNode) {
        const parent = textNode.parentElement;
        const text = textNode.nodeValue;
        if (!parent || parent.closest(ignoredPhoneElements) || !text ||
            !/\d{3}/.test(text)) return;

        phonePattern.lastIndex = 0;
        let match;
        const matches = [];
        while ((match = phonePattern.exec(text)) !== null) {
            const phone = match[2];
            const digits = phone.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 15) continue;

            const end = match.index + match[1].length + phone.length;
            const next = textNode.nextSibling;
            if (end === text.length &&
                next?.nodeType === Node.ELEMENT_NODE &&
                next.dataset.dealerSocketPhoneLink === 'true') {
                continue;
            }
            matches.push({ phone, end });
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const { phone, end } = matches[i];
            const range = textNode.ownerDocument.createRange();
            range.setStart(textNode, end);
            range.collapse(true);
            range.insertNode(createPhoneLink(textNode.ownerDocument, phone));
        }
    }

    function processPhoneNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            addPhoneLinks(node);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        if (node.nodeType === Node.ELEMENT_NODE &&
            node.closest(ignoredPhoneElements)) return;

        const doc = node.nodeType === Node.DOCUMENT_NODE
            ? node
            : node.ownerDocument;
        const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
            acceptNode(textNode) {
                const parent = textNode.parentElement;
                return parent && !parent.closest(ignoredPhoneElements)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const textNodes = [];
        let textNode;
        while ((textNode = walker.nextNode())) textNodes.push(textNode);
        for (const candidate of textNodes) addPhoneLinks(candidate);
    }

    function observePhoneDocument(doc) {
        if (observedDocuments.has(doc) || !doc.body) return;
        observedDocuments.add(doc);
        processPhoneNode(doc.body);

        const Observer = doc.defaultView?.MutationObserver || MutationObserver;
        const observer = new Observer(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    processPhoneNode(mutation.target);
                } else {
                    for (const node of mutation.addedNodes) {
                        processPhoneNode(node);
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            observePhoneFrames(node);
                        }
                    }
                }
            }
        });
        observer.observe(doc.body, {
            childList: true,
            characterData: true,
            subtree: true
        });
        observePhoneFrames(doc);
    }

    function observePhoneFrames(root) {
        if (!root.querySelectorAll) return;
        const frames = [...root.querySelectorAll('iframe')];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches('iframe')) {
            frames.push(root);
        }
        for (const frame of frames) {
            if (observedFrames.has(frame)) continue;
            observedFrames.add(frame);

            const attachFrameObserver = () => {
                try {
                    const frameDoc = frame.contentDocument;
                    if (frameDoc) observePhoneDocument(frameDoc);
                } catch (error) {
                    console.debug('DealerSocket phone links: frame is not same-origin');
                }
            };
            frame.addEventListener('load', attachFrameObserver);
            attachFrameObserver();
        }
    }

    function startPhoneObserver() {
        if (document.body) {
            observePhoneDocument(document);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observePhoneDocument(document);
            }, { once: true });
        }
    }

    startPhoneObserver();

    function isDealerSocketOrigin(origin) {
        try {
            const hostname = new URL(origin).hostname;
            return hostname === 'dealersocket.com' ||
                hostname.endsWith('.dealersocket.com');
        } catch (error) {
            return false;
        }
    }

    window.addEventListener('message', event => {
        if (event.source !== window.parent ||
            !isDealerSocketOrigin(event.origin) ||
            event.data?.type !== messageType ||
            typeof event.data.term !== 'string') {
            return;
        }

        pendingSearchTerm = event.data.term;
        sessionStorage.setItem(storageKey, JSON.stringify({
            term: pendingSearchTerm,
            savedAt: Date.now()
        }));
    });

    function relaySearchTerm() {
        if (!pendingSearchTerm) return;

        for (const frame of document.querySelectorAll('iframe')) {
            try {
                const targetOrigin = new URL(frame.src, window.location.href).origin;
                if (isDealerSocketOrigin(targetOrigin)) {
                    frame.contentWindow?.postMessage({
                        type: messageType,
                        term: pendingSearchTerm
                    }, targetOrigin);
                }
            } catch (error) {
                console.warn('DealerSocket auto search: could not relay to CRM frame', error);
            }
        }
    }

    function findSearchInput() {
        const documents = [];
        const frameOrigins = [];
        const seenWindows = new Set();
        let currentWindow = window;

        while (currentWindow && !seenWindows.has(currentWindow)) {
            seenWindows.add(currentWindow);
            try {
                documents.push(currentWindow.document);
                if (currentWindow === currentWindow.parent) break;
                currentWindow = currentWindow.parent;
            } catch (error) {
                break;
            }
        }

        const pendingRoots = [...documents];
        const seenRoots = new Set();

        while (pendingRoots.length > 0) {
            const root = pendingRoots.pop();
            if (!root || seenRoots.has(root)) continue;
            seenRoots.add(root);

            const input = root.querySelector('#searchTermAll');
            if (input && input.tagName === 'INPUT' && !input.disabled) {
                return { input, frameOrigins };
            }

            for (const element of root.querySelectorAll('*')) {
                if (element.shadowRoot) pendingRoots.push(element.shadowRoot);
                if (element.tagName !== 'IFRAME') continue;

                try {
                    if (element.contentDocument) {
                        pendingRoots.push(element.contentDocument);
                    } else {
                        frameOrigins.push(
                            new URL(element.src, window.location.href).origin
                        );
                    }
                } catch (error) {
                    try {
                        frameOrigins.push(new URL(element.src, window.location.href).origin);
                    } catch (urlError) {
                        frameOrigins.push('unreadable iframe origin');
                    }
                }
            }
        }
        return { input: null, frameOrigins };
    }

    let hasLoggedReady = false;
    function tryPopulate() {
        const searchTerm = getUrlSearchTerm() || pendingSearchTerm || getSearchTerm();
        if (!searchTerm) return false;
        pendingSearchTerm = searchTerm;

        const { input } = findSearchInput();
        if (!input) return false;
        const inputWindow = input.ownerDocument.defaultView;
        if (!inputWindow) return false;

        if (input.value !== searchTerm) {
            input.focus();
            const valueSetter = Object.getOwnPropertyDescriptor(
                inputWindow.HTMLInputElement.prototype,
                'value'
            )?.set;

            if (valueSetter) valueSetter.call(input, searchTerm);
            else input.value = searchTerm;
            input.dispatchEvent(new inputWindow.Event('input', { bubbles: true }));
            input.dispatchEvent(new inputWindow.Event('change', { bubbles: true }));
            input.blur();
        }

        if (!hasLoggedReady) {
            console.info('DealerSocket auto search: field ready');
            hasLoggedReady = true;
        }
        return true;
    }

    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (!pendingSearchTerm) pendingSearchTerm = getSearchTerm();
        relaySearchTerm();

        const inputFound = tryPopulate();
        if (attempts >= 120) {
            clearInterval(timer);
            if (!inputFound) {
                const { frameOrigins } = findSearchInput();
                console.error('DealerSocket auto search: timed out', {
                    hasSearchTerm: Boolean(pendingSearchTerm || getSearchTerm()),
                    inputFound: false,
                    frameOrigins,
                    currentOrigin: window.location.origin,
                    isTopFrame: window === window.top
                });
            }
        }
    }, 1000);

})();