// ==UserScript==
// @name         !DEV global phone links
// @namespace    http://tampermonkey.net/
// @version      1.4
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js?v=1.4
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js?v=1.4
// @description  Add click-to-call links and inline VIN actions
// @match        *://*/*
// @exclude      *://dealersocket.com/*
// @exclude      *://*.dealersocket.com/*
// @exclude      *://app.demandhub.co/*
// @exclude      *://ottawachryslerjeepdodge.com/*
// @exclude      *://*.ottawachryslerjeepdodge.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const phonePattern =
        /(^|[^A-Za-z0-9])(\+?(?:\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]?\d{3,4}[ .-]?\d{4}|\d{3}[.-]\d{4}|\d{10,11}|\+\d{7,15})(?![A-Za-z0-9])/g;
    const skippedElements =
        'a, button, input, select, textarea, script, style, noscript, option, iframe, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
    const processedTextNodes = new WeakSet();
    const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
    const cdjrWmis = new Set([
        '1C3', '1C4', '1C6', '2C3', '2C4', '2C7', '3C3', '3C4', '3C6',
        'ZAC', 'ZFA'
    ]);
    const vinBlockTags = new Set([
        'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
        'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
        'H6', 'HEADER', 'LI', 'MAIN', 'P', 'SECTION', 'TD', 'TH', 'TR'
    ]);

    function getVinBlock(element) {
        while (element && element !== document.body &&
            !vinBlockTags.has(element.tagName)) {
            element = element.parentElement;
        }
        return element || document.body;
    }

    function getVinBlockTextNodes(block) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
            acceptNode(textNode) {
                const parent = textNode.parentElement;
                return parent && !isSkipped(parent) && getVinBlock(parent) === block
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const textNodes = [];
        let textNode;
        while ((textNode = walker.nextNode())) textNodes.push(textNode);
        return textNodes;
    }

    function isSkipped(element) {
        return Boolean(element.closest(skippedElements));
    }

    function createPhoneLink(phone) {
        const link = document.createElement('a');
        const digits = phone.replace(/\D/g, '');
        link.href = `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
        link.title = `Call ${phone}`;
        link.setAttribute('aria-label', `Call ${phone}`);
        link.dataset.globalPhoneLink = 'true';
        link.style.cssText =
            'display:inline-flex;align-items:center;margin-left:4px;' +
            'vertical-align:middle;text-decoration:none;';

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '16');
        icon.setAttribute('height', '16');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('aria-hidden', 'true');

        const handset = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        handset.setAttribute(
            'd',
            'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.56 3.58a1 1 0 0 1-.25 1.01z'
        );
        icon.appendChild(handset);
        link.appendChild(icon);
        return link;
    }

    function createVinLink(vin, sticker = false) {
        const link = document.createElement('a');
        if (sticker) {
            link.href =
                `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${vin}`;
            link.textContent = 'Sticker';
            link.title = `Open window sticker for ${vin}`;
            link.dataset.globalVinLink = 'true';
        } else {
            const filter = [{
                tsearch: [{
                    n: 'fieldsearch',
                    v: vin.toLowerCase(),
                    s: 1
                }]
            }];
            link.href =
                'https://www.ottawachryslerjeepdodge.com/inventory.html?filterid=' +
                'a9b123q0-10x0-0-0+' + btoa(JSON.stringify(filter));
            link.setAttribute('aria-label', `Search inventory for VIN ${vin}`);
            link.title = `Search inventory for VIN ${vin}`;
            link.dataset.globalVinSearch = 'true';

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('width', '12');
            icon.setAttribute('height', '12');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '2');
            icon.setAttribute('aria-hidden', 'true');
            const globe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
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
        return link;
    }

    function createVinCopyButton(vin) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Copy VIN';
        button.setAttribute('aria-label', 'Copy VIN');
        button.dataset.globalVinCopy = 'true';
        button.dataset.copyValue = vin;
        button.style.cssText =
            'display:inline-flex;align-items:center;margin-left:3px;padding:1px 2px;' +
            'border:0;background:transparent;color:#2d6cdf;cursor:pointer;' +
            'vertical-align:middle;line-height:1;';

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '12');
        icon.setAttribute('height', '12');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '2');
        icon.setAttribute('stroke-linecap', 'round');
        icon.setAttribute('stroke-linejoin', 'round');
        icon.setAttribute('aria-hidden', 'true');
        const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outline.setAttribute('d', 'M8 8V4h12v12h-4M4 8h12v12H4z');
        icon.appendChild(outline);
        button.appendChild(icon);

        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            try {
                const clipboard = navigator.clipboard;
                if (clipboard?.writeText) {
                    try {
                        await clipboard.writeText(vin);
                    } catch (error) {
                        console.debug('Global VIN: clipboard API unavailable; using copy fallback', error);
                        copyVinWithCommand(vin);
                    }
                } else {
                    copyVinWithCommand(vin);
                }
                button.textContent = '✓';
                button.title = 'Copied VIN';
                setTimeout(() => {
                    if (button.isConnected) {
                        button.replaceChildren(icon);
                        button.title = 'Copy VIN';
                    }
                }, 1000);
            } catch (error) {
                console.error('Could not copy VIN', error);
                alert('Could not copy VIN.');
            }
        });
        return button;
    }

    function copyVinWithCommand(vin) {
        const textarea = document.createElement('textarea');
        textarea.value = vin;
        textarea.setAttribute('readonly', '');
        textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(textarea);
        let copied;
        try {
            textarea.select();
            copied = document.execCommand('copy');
        } finally {
            textarea.remove();
        }
        if (!copied) throw new Error('Browser copy command failed');
    }

    function getFollowingVinControls(textNode) {
        const controls = [];
        let next = textNode.nextSibling;
        while (next && next.nodeType === Node.ELEMENT_NODE &&
            (next.dataset.globalVinLink === 'true' ||
                next.dataset.globalVinSearch === 'true' ||
                next.dataset.globalVinCopy === 'true')) {
            controls.push(next);
            next = next.nextSibling;
        }
        return controls;
    }

    function addVinLinks(textNodes) {
        const positions = [];
        let text = '';
        for (const node of textNodes) {
            const start = text.length;
            text += node.nodeValue || '';
            positions.push({ node, start, end: text.length });
        }
        if (!text) return;

        vinPattern.lastIndex = 0;
        let match;
        const matches = [];
        while ((match = vinPattern.exec(text)) !== null) {
            matches.push({
                vin: match[0],
                end: match.index + match[0].length
            });
        }

        for (let index = matches.length - 1; index >= 0; index--) {
            const { vin, end } = matches[index];
            const position = positions.find(item => end <= item.end && end > item.start);
            if (!position) continue;

            const offset = end - position.start;
            const existing = offset === position.node.nodeValue.length
                ? getFollowingVinControls(position.node)
                : [];
            const existingMarkers = new Set(existing.map(control =>
                ['globalVinLink', 'globalVinSearch', 'globalVinCopy']
                    .find(key => control.dataset[key] === 'true')
            ));
            const range = document.createRange();
            if (existing.length) {
                range.setStartAfter(existing[existing.length - 1]);
            } else {
                range.setStart(position.node, offset);
            }
            range.collapse(true);

            const isCDJR = cdjrWmis.has(vin.substring(0, 3).toUpperCase());
            if (isCDJR && !existingMarkers.has('globalVinLink')) {
                const stickerLink = createVinLink(vin, true);
                range.insertNode(stickerLink);
                range.setStartAfter(stickerLink);
                range.collapse(true);
            }
            if (isCDJR && !existingMarkers.has('globalVinSearch')) {
                const searchLink = createVinLink(vin);
                range.insertNode(searchLink);
                range.setStartAfter(searchLink);
                range.collapse(true);
            }
            if (!existingMarkers.has('globalVinCopy')) {
                range.insertNode(createVinCopyButton(vin));
            }
        }
    }

    function addPhoneLinks(textNode) {
        const parent = textNode.parentElement;
        const text = textNode.nodeValue;
        if (!parent || isSkipped(parent) || processedTextNodes.has(textNode) ||
            !text || !/\d{3}/.test(text)) return;

        phonePattern.lastIndex = 0;
        let match;
        const matches = [];

        while ((match = phonePattern.exec(text)) !== null) {
            const phone = match[2];
            const digits = phone.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 15) continue;
            const end = match.index + match[1].length + phone.length;
            const alreadyLinked = end === text.length &&
                textNode.nextSibling &&
                textNode.nextSibling.nodeType === Node.ELEMENT_NODE &&
                textNode.nextSibling.dataset.globalPhoneLink === 'true';
            if (alreadyLinked) continue;
            matches.push({
                phone,
                end
            });
        }

        if (matches.length === 0) return;

        for (let index = matches.length - 1; index >= 0; index--) {
            const { phone, end } = matches[index];
            const range = document.createRange();
            range.setStart(textNode, end);
            range.collapse(true);

            const link = createPhoneLink(phone);
            range.insertNode(link);
            if (link.nextSibling && link.nextSibling.nodeType === Node.TEXT_NODE) {
                processedTextNodes.add(link.nextSibling);
            }
        }

        processedTextNodes.add(textNode);
    }

    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.parentElement && !isSkipped(node.parentElement)) {
                const block = getVinBlock(node.parentElement);
                addVinLinks(getVinBlockTextNodes(block));
                getVinBlockTextNodes(block).forEach(addPhoneLinks);
            } else {
                addPhoneLinks(node);
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        if (node.nodeType === Node.ELEMENT_NODE && isSkipped(node)) return;

        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
            acceptNode(textNode) {
                const parent = textNode.parentElement;
                return parent && !isSkipped(parent)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const textNodes = [];
        let textNode;
        while ((textNode = walker.nextNode())) {
            textNodes.push(textNode);
        }
        const vinBlocks = new Set(textNodes.map(candidate =>
            getVinBlock(candidate.parentElement)
        ));
        for (const block of vinBlocks) {
            addVinLinks(getVinBlockTextNodes(block));
            getVinBlockTextNodes(block).forEach(addPhoneLinks);
        }
    }

    function start() {
        processNode(document.body);

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    processedTextNodes.delete(mutation.target);
                    processNode(mutation.target);
                } else {
                    for (const node of mutation.addedNodes) {
                        processNode(node);
                    }
                }
            }
        });
        observer.observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
