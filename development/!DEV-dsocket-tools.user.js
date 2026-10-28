// ==UserScript==
// @name         !DEV dsocket tools
// @namespace    http://tampermonkey.net/
// @version      3.9
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-tools.user.js
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-tools.user.js
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

    function createCopyButton(doc, value, label, marker) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.title = `Copy ${label}`;
        button.setAttribute('aria-label', `Copy ${label}`);
        button.dataset[marker] = 'true';
        button.style.cssText =
            'display:inline-flex;align-items:center;margin-left:3px;padding:1px 2px;' +
            'border:0;background:transparent;color:#2d6cdf;cursor:pointer;' +
            'vertical-align:middle;line-height:1;';

        const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '12');
        icon.setAttribute('height', '12');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '2');
        icon.setAttribute('stroke-linecap', 'round');
        icon.setAttribute('stroke-linejoin', 'round');
        icon.setAttribute('aria-hidden', 'true');
        const outline = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        outline.setAttribute('d', 'M8 8V4h12v12h-4M4 8h12v12H4z');
        icon.appendChild(outline);
        button.appendChild(icon);
        button.dataset.copyValue = value;
        button.dataset.copyLabel = label;
        return button;
    }

    async function copyText(doc, value) {
        const clipboard = doc.defaultView?.navigator.clipboard;
        if (clipboard?.writeText) {
            try {
                await clipboard.writeText(value);
                return;
            } catch (error) {
                console.debug('DealerSocket: Clipboard API unavailable; using copy fallback', error);
            }
        }

        const textarea = doc.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        doc.body.appendChild(textarea);
        let copied;
        try {
            textarea.select();
            copied = doc.execCommand('copy');
        } finally {
            textarea.remove();
        }
        if (!copied) throw new Error('Browser copy command failed');
    }

    async function handleInjectedControlClick(event, doc) {
        const control = event.target?.closest?.('a, button');
        if (!control) return;

        if (control.dataset.dealerSocketVinCopy === 'true' ||
            control.dataset.dealerSocketPhoneCopy === 'true' ||
            control.dataset.dealerSocketNameCopy === 'true') {
            event.preventDefault();
            event.stopImmediatePropagation();
            try {
                await copyText(doc, control.dataset.copyValue);
                const icon = control.querySelector('svg');
                control.textContent = '✓';
                control.title = `Copied ${control.dataset.copyLabel}`;
                setTimeout(() => {
                    if (control.isConnected && icon) {
                        control.replaceChildren(icon);
                        control.title = `Copy ${control.dataset.copyLabel}`;
                    }
                }, 1000);
            } catch (error) {
                console.error(
                    `DealerSocket: could not copy ${control.dataset.copyLabel}`,
                    error
                );
                doc.defaultView?.alert(
                    `Could not copy ${control.dataset.copyLabel}.`
                );
            }
            return;
        }

        if (control.dataset.dealerSocketVinLink === 'true' ||
            control.dataset.dealerSocketVinSearch === 'true' ||
            control.dataset.dealerSocketPhoneLink === 'true' ||
            control.dataset.dealerSocketMapsLink === 'true') {
            event.stopImmediatePropagation();
        }
    }

    function getFollowingControls(node) {
        const controls = [];
        const markerKeys = [
            'dealerSocketVinLink',
            'dealerSocketVinSearch',
            'dealerSocketVinCopy',
            'dealerSocketPhoneLink',
            'dealerSocketPhoneCopy',
            'dealerSocketNameCopy',
            'dealerSocketMapsLink'
        ];
        let next = node.nextSibling;
        while (next) {
            if (next.nodeType === Node.TEXT_NODE && !next.nodeValue) {
                next = next.nextSibling;
                continue;
            }
            if (next.nodeType !== Node.ELEMENT_NODE ||
                !markerKeys.some(key => next.dataset[key] === 'true')) break;
            controls.push(next);
            next = next.nextSibling;
        }
        return controls;
    }

    function createVinLink(doc, vin, { sticker = false } = {}) {
        const link = doc.createElement('a');
        if (sticker) {
            link.href =
                `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${vin}`;
            link.textContent = 'Sticker';
            link.title = `Open window sticker for ${vin}`;
            link.dataset.dealerSocketVinLink = 'true';
        } else {
            const filter = [{
                tsearch: [{
                    n: 'fieldsearch',
                    v: vin.toLowerCase(),
                    s: 1
                }]
            }];
            const encoded = doc.defaultView.btoa(JSON.stringify(filter));
            link.href =
                'https://www.ottawachryslerjeepdodge.com/inventory.html?filterid=' +
                'a9b123q0-10x0-0-0+' + encoded;
            link.setAttribute('aria-label', `Search inventory for VIN ${vin}`);
            link.title = `Search inventory for VIN ${vin}`;
            link.dataset.dealerSocketVinSearch = 'true';

            const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('width', '12');
            icon.setAttribute('height', '12');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '2');
            icon.setAttribute('aria-hidden', 'true');
            const globe = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            globe.setAttribute(
                'd',
                'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0 0c2.5-2.7 3.5-5.9 3.5-10S14.5 4.7 12 2m0 20c-2.5-2.7-3.5-5.9-3.5-10S9.5 4.7 12 2M2 12h20M4.9 5.5h14.2M4.9 18.5h14.2'
            );
            icon.appendChild(globe);
            link.appendChild(icon);
        }
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.cssText =
            'display:inline-block;margin-left:4px;padding:1px 3px;' +
            `background:${sticker ? '#c64545' : '#2d6cdf'};color:#fff;` +
            'border-radius:3px;font-size:9px;line-height:1.2;' +
            'text-decoration:none;vertical-align:middle;';
        link.addEventListener('click', event => event.stopPropagation());
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
            matches.push({ vin, end: match.index + vin.length });
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const { vin, end } = matches[i];
            const isCDJR = cdjrWmis.has(vin.substring(0, 3).toUpperCase());
            const position = positions.find(item => end <= item.end && end > item.start);
            if (!position) continue;

            const existing = getFollowingControls(position.node);
            const existingMarkers = new Set(existing.map(control =>
                Object.keys(control.dataset).find(key => control.dataset[key] === 'true')
            ));
            const range = position.node.ownerDocument.createRange();
            if (existing.length) {
                range.setStartAfter(existing[existing.length - 1]);
            } else {
                range.setStart(position.node, end - position.start);
            }
            range.collapse(true);
            const doc = position.node.ownerDocument;
            if (isCDJR) {
                if (!existingMarkers.has('dealerSocketVinLink')) {
                    const stickerLink = createVinLink(doc, vin, { sticker: true });
                    range.insertNode(stickerLink);
                    range.setStartAfter(stickerLink);
                    range.collapse(true);
                }
                if (!existingMarkers.has('dealerSocketVinSearch')) {
                    const searchLink = createVinLink(doc, vin);
                    range.insertNode(searchLink);
                    range.setStartAfter(searchLink);
                    range.collapse(true);
                }
            }
            if (!existingMarkers.has('dealerSocketVinCopy')) {
                const copyButton = createCopyButton(
                    doc, vin, 'VIN', 'dealerSocketVinCopy'
                );
                range.insertNode(copyButton);
            }
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
            const existing = getFollowingControls(position.node);
            const existingMarkers = new Set(existing.map(control =>
                Object.keys(control.dataset).find(key => control.dataset[key] === 'true')
            ));
            const range = position.node.ownerDocument.createRange();
            if (existing.length) {
                range.setStartAfter(existing[existing.length - 1]);
            } else {
                range.setStart(position.node, end - position.start);
            }
            range.collapse(true);
            const doc = position.node.ownerDocument;
            if (!existingMarkers.has('dealerSocketPhoneLink')) {
                const phoneLink = createPhoneLink(doc, phone);
                range.insertNode(phoneLink);
                range.setStartAfter(phoneLink);
                range.collapse(true);
            }
            if (!existingMarkers.has('dealerSocketPhoneCopy')) {
                range.insertNode(createCopyButton(
                    doc, phone, 'phone number', 'dealerSocketPhoneCopy'
                ));
            }
        }
    }

    function getNameText(nameElement) {
        const walker = nameElement.ownerDocument.createTreeWalker(
            nameElement,
            NodeFilter.SHOW_TEXT
        );
        const parts = [];
        let textNode;
        while ((textNode = walker.nextNode())) {
            const part = textNode.nodeValue.trim();
            if (part) parts.push(part);
        }
        return parts.join(' ');
    }

    function addNameCopyButton(nameElement) {
        const name = getNameText(nameElement);
        if (!name) return;

        let next = nameElement.nextSibling;
        while (next && (next.nodeType === Node.COMMENT_NODE ||
            (next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()))) {
            next = next.nextSibling;
        }
        if (next?.dataset?.dealerSocketNameCopy === 'true') {
            next.dataset.copyValue = name;
            return;
        }

        nameElement.parentNode.insertBefore(
            createCopyButton(
                nameElement.ownerDocument,
                name,
                'name',
                'dealerSocketNameCopy'
            ),
            nameElement.nextSibling
        );
    }

    function createMapsLink(doc, address) {
        const link = doc.createElement('a');
        link.href =
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = `Search Google Maps for ${address}`;
        link.setAttribute('aria-label', 'Open address in Google Maps');
        link.dataset.dealerSocketMapsLink = 'true';
        link.style.cssText =
            'display:inline-flex;align-items:center;margin-left:3px;padding:1px 2px;' +
            'color:#2d6cdf;vertical-align:middle;text-decoration:none;line-height:1;';

        const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '13');
        icon.setAttribute('height', '13');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('aria-hidden', 'true');
        const pin = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        pin.setAttribute(
            'd',
            'M12 22s8-7.2 8-13a8 8 0 1 0-16 0c0 5.8 8 13 8 13zm0-10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z'
        );
        icon.appendChild(pin);
        link.appendChild(icon);
        return link;
    }

    function getValidAddress(text) {
        const address = text
            .replace(/(?:<\s*)?-?\s*invalid\s+(?:address|city|zip|postal(?:\s+code)?)\s*-?(?:>)?/gi, ' ')
            .replace(/[<>]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const streetAddress =
            /^\d{1,6}\s+(?:[\p{L}\d.'’-]+\s+){1,8}(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|court|ct|crescent|cres|highway|hwy|terrace|ter|trail|trl|way)\b/iu;
        const poBox = /^P\.?\s*O\.?\s+Box\s+\d+\b/i;
        return streetAddress.test(address) || poBox.test(address) ? address : '';
    }

    function getValidPostalCode(text) {
        const postalCode = text.replace(/\s+/g, '').toUpperCase();
        return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(postalCode)
            ? postalCode
            : '';
    }

    function addAddressMapButton(textNode) {
        const text = textNode.nodeValue || '';
        const postalElement = textNode.parentElement?.closest(
            '[ng-show="ctrl.contact.address.postal"]'
        );
        const address = postalElement
            ? getValidPostalCode(text)
            : getValidAddress(text);
        const controls = getFollowingControls(textNode);
        const existing = controls.find(control =>
            control.dataset.dealerSocketMapsLink === 'true');
        if (!address) {
            existing?.remove();
            return;
        }
        if (existing) {
            existing.href =
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
            existing.title = `Search Google Maps for ${address}`;
            return;
        }

        const range = textNode.ownerDocument.createRange();
        range.setStart(textNode, textNode.length);
        range.collapse(true);
        range.insertNode(createMapsLink(textNode.ownerDocument, address));
    }

    function processNameCopyNode(node) {
        const selector = 'span[name="editName"]';
        const candidates = new Set();
        if (node.nodeType === Node.TEXT_NODE) {
            const nameElement = node.parentElement?.closest(selector);
            if (nameElement) candidates.add(nameElement);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(selector)) candidates.add(node);
            node.querySelectorAll(selector).forEach(element => candidates.add(element));
        } else if (node.querySelectorAll) {
            node.querySelectorAll(selector).forEach(element => candidates.add(element));
        }
        candidates.forEach(addNameCopyButton);
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
        processNameCopyNode(node);
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
            textNodes.forEach(addAddressMapButton);
            addPhoneLinks(textNodes);
            addVinLinks(getBlockTextNodes(block));
        }
    }

    function observePhoneDocument(doc) {
        if (observedDocuments.has(doc) || !doc.body) return;
        observedDocuments.add(doc);
        doc.querySelectorAll('button[data-dealer-socket-name-copy="true"]')
            .forEach(button => button.remove());
        doc.addEventListener('click', event => {
            handleInjectedControlClick(event, doc);
        }, true);
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