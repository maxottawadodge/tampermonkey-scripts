// ==UserScript==
// @name         dsocket tools
// @namespace    http://tampermonkey.net/
// @version      2.5
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js
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
    const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
    const cdjrWmis = new Set([
        '1C3', '1C4', '1C6', '2C3', '2C4', '2C7', '3C3', '3C4', '3C6',
        'ZAC', 'ZFA'
    ]);
    const ignoredPhoneElements =
        'a, button, input, select, textarea, script, style, noscript, option, iframe, ' +
        '[contenteditable]:not([contenteditable="false"]), [role="textbox"]';
    const phoneBlockTags = new Set([
        'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
        'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
        'H6', 'HEADER', 'LI', 'MAIN', 'P', 'SECTION', 'TD', 'TH', 'TR'
    ]);

    function getPhoneBlock(element) {
        while (element && element !== element.ownerDocument.body &&
            !phoneBlockTags.has(element.tagName)) {
            element = element.parentElement;
        }
        return element || document.body;
    }

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

    function createWindowStickerLink(doc, vin) {
        const link = doc.createElement('a');
        link.href =
            `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${vin}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Sticker';
        link.title = `Open window sticker for ${vin}`;
        link.dataset.dealerSocketVinLink = 'true';
        link.style.cssText =
            'display:inline-block;margin-left:4px;padding:1px 3px;' +
            'background:#c64545;color:#fff;border-radius:3px;' +
            'font-size:9px;line-height:1.2;text-decoration:none;vertical-align:middle;';
        return link;
    }

    function addVinLinks(textNodes) {
        const positions = [];
        let text = '';
        for (const node of textNodes) {
            const start = text.length;
            text += node.nodeValue || '';
            positions.push({ node, start, end: text.length });
        }

        vinPattern.lastIndex = 0;
        let match;
        const matches = [];
        while ((match = vinPattern.exec(text)) !== null) {
            const vin = match[0];
            if (!cdjrWmis.has(vin.substring(0, 3).toUpperCase())) continue;
            matches.push({ vin, end: match.index + vin.length });
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const { vin, end } = matches[i];
            const position = positions.find(item => end <= item.end && end > item.start);
            if (!position) continue;

            const offset = end - position.start;
            const next = position.node.nextSibling;
            if (offset === (position.node.nodeValue || '').length &&
                next?.nodeType === Node.ELEMENT_NODE &&
                next.dataset.dealerSocketVinLink === 'true') continue;

            const range = position.node.ownerDocument.createRange();
            range.setStart(position.node, offset);
            range.collapse(true);
            range.insertNode(createWindowStickerLink(position.node.ownerDocument, vin));
        }
    }

    function addPhoneLinks(textNodes) {
        if (textNodes.length === 0) return;
        const positions = [];
        let text = '';
        for (const node of textNodes) {
            const start = text.length;
            text += node.nodeValue || '';
            positions.push({ node, start, end: text.length });
        }
        if (!/\d{3}/.test(text)) return;

        phonePattern.lastIndex = 0;
        let match;
        const matches = [];
        while ((match = phonePattern.exec(text)) !== null) {
            const phone = match[2];
            const digits = phone.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 15) continue;

            const end = match.index + match[1].length + phone.length;
            matches.push({ phone, end });
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const { phone, end } = matches[i];
            const position = positions.find(item => end <= item.end && end > item.start);
            if (!position) continue;
            const offset = end - position.start;
            const next = position.node.nextSibling;
            if (offset === (position.node.nodeValue || '').length &&
                next?.nodeType === Node.ELEMENT_NODE &&
                next.dataset.dealerSocketPhoneLink === 'true') continue;

            const range = position.node.ownerDocument.createRange();
            range.setStart(position.node, offset);
            range.collapse(true);
            range.insertNode(createPhoneLink(position.node.ownerDocument, phone));
        }
    }

    function getBlockTextNodes(block) {
        const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
            acceptNode(textNode) {
                const parent = textNode.parentElement;
                return parent && !parent.closest(ignoredPhoneElements) &&
                    getPhoneBlock(parent) === block
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const textNodes = [];
        let textNode;
        while ((textNode = walker.nextNode())) textNodes.push(textNode);
        return textNodes;
    }

    function processPhoneNode(node) {
        if (node.nodeType !== Node.TEXT_NODE &&
            node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        if (node.nodeType === Node.ELEMENT_NODE &&
            node.closest(ignoredPhoneElements)) return;

        const doc = node.nodeType === Node.DOCUMENT_NODE ? node : node.ownerDocument;
        const blocks = new Set();
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.parentElement && !node.parentElement.closest(ignoredPhoneElements)) {
                blocks.add(getPhoneBlock(node.parentElement));
            }
        } else {
            const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
                acceptNode(textNode) {
                    const parent = textNode.parentElement;
                    return parent && !parent.closest(ignoredPhoneElements)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                }
            });
            let textNode;
            while ((textNode = walker.nextNode())) {
                blocks.add(getPhoneBlock(textNode.parentElement));
            }
        }

        for (const block of blocks) {
            const textNodes = getBlockTextNodes(block);
            addPhoneLinks(textNodes);
            addVinLinks(getBlockTextNodes(block));
        }
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