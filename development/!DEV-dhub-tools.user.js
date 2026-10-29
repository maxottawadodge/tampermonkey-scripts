// ==UserScript==
// @name         !DEV dhub tools
// @namespace    http://tampermonkey.net/
// @version      1.9
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js?v=1.9
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js?v=1.9
// @description  Add DealerSocket search and copy buttons beside phone numbers and make tel clickable
// @match        https://app.demandhub.co/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const phoneRegex =
        /(^|[^\d])(\+\d{1,3}[ .-]?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}|(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4})(?!\d)/;
    const searchColor = '#287397';
    const copyColor = '#2f8f5b';

    function createSearchLink(phone) {
        const link = document.createElement('a');
        link.dataset.dealersocketSearch = '1';
        link.href =
            'https://bb.dealersocket.com/#/crm/search?dssearch=' +
            encodeURIComponent(phone);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = 'Search in DealerSocket';
        link.setAttribute('aria-label', 'Search in DealerSocket');
        link.style.cssText =
            `display:inline-flex;align-items:center;margin-left:5px;padding:2px 5px;` +
            `background:${searchColor};color:#fff;border-radius:4px;` +
            'font-weight:600;text-decoration:none;vertical-align:middle;';
        link.textContent = 'DSOCKET';
        return link;
    }

    function createCopyButton(phone) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Copy phone number';
        button.setAttribute('aria-label', `Copy phone number ${phone}`);
        button.style.cssText =
            `margin-left:5px;padding:2px 4px;background:${copyColor};color:#fff;` +
            'border:0;border-radius:4px;font:inherit;font-size:0.85em;' +
            'font-weight:600;cursor:pointer;vertical-align:middle;';
        button.textContent = 'Copy';

        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(phone);
                button.textContent = 'Copied!';
                window.setTimeout(() => {
                    button.textContent = 'Copy';
                }, 1500);
            } catch (error) {
                button.textContent = 'Copy failed';
                console.error('Could not copy phone number to clipboard:', error);
            }
        });

        return button;
    }

    function linkPhoneText(textNode) {
        const parent = textNode.parentElement;
        if (!parent || parent.closest('a, button, script, style, textarea')) return;

        const text = textNode.nodeValue || '';
        const match = text.match(phoneRegex);
        if (!match) return;

        const phone = match[2];
        const start = match.index + match[1].length;
        const end = start + phone.length;
        const digits = phone.replace(/\D/g, '');
        const fragment = document.createDocumentFragment();

        if (start > 0) fragment.appendChild(document.createTextNode(text.slice(0, start)));

        const callLink = document.createElement('a');
        callLink.href = `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
        callLink.title = `Call ${phone}`;
        callLink.setAttribute('aria-label', `Call ${phone}`);
        callLink.textContent = phone;
        fragment.appendChild(callLink);
        fragment.appendChild(createSearchLink(phone));
        fragment.appendChild(createCopyButton(phone));

        if (end < text.length) fragment.appendChild(document.createTextNode(text.slice(end)));
        textNode.replaceWith(fragment);
    }

    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            linkPhoneText(node);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE) return;

        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let textNode;
        while ((textNode = walker.nextNode())) {
            textNodes.push(textNode);
        }
        for (const candidate of textNodes) linkPhoneText(candidate);
    }

    function startObserving() {
        processNode(document.body);

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    processNode(mutation.target);
                    continue;
                }
                for (const node of mutation.addedNodes) processNode(node);
            }
        });
        observer.observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true
        });

        window.addEventListener('popstate', () => processNode(document.body));
        window.addEventListener('hashchange', () => processNode(document.body));
    }

    if (document.body) {
        startObserving();
    } else {
        document.addEventListener('DOMContentLoaded', startObserving, { once: true });
    }
})();
