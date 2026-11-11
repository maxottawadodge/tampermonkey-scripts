// ==UserScript==
// @name         dhub tools
// @namespace    http://tampermonkey.net/
// @version      1.10
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js?v=1.10
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js?v=1.10
// @description  Add copy-name, DealerSocket search, and click-to-call tools in DemandHub
// @match        https://app.demandhub.co/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const phoneRegex =
        /(^|[^\d])(\+\d{1,3}[ .-]?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}|(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4})(?!\d)/;
    const searchColor = '#287397';
    const copyColor = '#2f8f5b';
    const nameSelectors = [
        'span[name="editName"]',
        '[data-testid*="contact-name"]',
        '[data-testid*="lead-name"]',
        '[data-testid*="customer-name"]',
        '[class*="contact-name"]',
        '[class*="lead-name"]',
        '[class*="customer-name"]',
        '[class*="full-name"]',
        'input[autocomplete="name"]'
    ].join(',');

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

    function createCopyButton(value, label = 'phone number') {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = `Copy ${label}`;
        button.setAttribute('aria-label', `Copy ${label}`);
        button.style.cssText =
            `margin-left:5px;padding:2px 4px;background:${copyColor};color:#fff;` +
            'border:0;border-radius:4px;font:inherit;font-size:0.85em;' +
            'font-weight:600;cursor:pointer;vertical-align:middle;';
        button.textContent = 'Copy';

        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(button.dataset.copyValue);
                button.textContent = 'Copied!';
                window.setTimeout(() => {
                    button.textContent = 'Copy';
                }, 1500);
            } catch (error) {
                button.textContent = 'Copy failed';
                console.error(`Could not copy ${label} to clipboard:`, error);
            }
        });

        button.dataset.copyValue = value;
        return button;
    }

    function getNameValue(element) {
        const value = element.matches('input, textarea')
            ? element.value
            : element.innerText || element.textContent;
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function isLikelyContactName(value) {
        if (!value || value.length > 80 || /[\d@]/.test(value)) return false;
        const parts = value.split(/\s+/);
        return parts.length >= 2 && parts.length <= 6 &&
            parts.every(part => /^[\p{L}\p{M}][\p{L}\p{M}.'’,\-]*$/u.test(part));
    }

    function addNameCopyButtons(root) {
        if (!root?.querySelectorAll) return;
        const elements = [...root.querySelectorAll(nameSelectors)];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches(nameSelectors)) {
            elements.unshift(root);
        }

        for (const element of elements) {
            const name = getNameValue(element);
            if (!isLikelyContactName(name) || !element.parentNode) continue;

            let next = element.nextSibling;
            while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()) {
                next = next.nextSibling;
            }
            if (next?.dataset?.demandHubNameCopy === 'true') {
                next.dataset.copyValue = name;
                continue;
            }

            const button = createCopyButton(name, 'name');
            button.dataset.demandHubNameCopy = 'true';
            element.parentNode.insertBefore(button, element.nextSibling);
        }
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
            const parent = node.parentElement;
            linkPhoneText(node);
            addNameCopyButtons(parent);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE) return;

        addNameCopyButtons(node);
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
