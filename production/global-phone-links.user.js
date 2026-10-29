// ==UserScript==
// @name         global phone links
// @namespace    http://tampermonkey.net/
// @version      1.2
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js?v=1.2
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js?v=1.2
// @description  Add a click-to-call icon beside phone numbers
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
            addPhoneLinks(node);
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
        for (const candidate of textNodes) addPhoneLinks(candidate);
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
