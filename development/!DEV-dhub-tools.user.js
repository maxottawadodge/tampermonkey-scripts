// ==UserScript==
// @name         !DEV dhub tools
// @namespace    http://tampermonkey.net/
// @version      1.11
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js?v=1.11
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js?v=1.11
// @description  Add copy-name, DealerSocket search, and click-to-call tools in DemandHub
// @match        https://app.demandhub.co/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const phoneRegex =
        /(^|[^\d])(\+\d{1,3}[ .-]?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}|(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4})(?!\d)/;
    const searchColor = '#287397';
    const nameElementId = 'mb-edit-contact-name-text';

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

        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(button.dataset.copyValue);
                button.replaceChildren(document.createTextNode('✓'));
                button.title = `Copied ${label}`;
                window.setTimeout(() => {
                    if (button.isConnected) {
                        button.replaceChildren(icon);
                        button.title = `Copy ${label}`;
                    }
                }, 1000);
            } catch (error) {
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

    function addNameCopyButton() {
        const nameElement = document.getElementById(nameElementId);
        if (!nameElement || !nameElement.parentNode) return;

        const name = getNameValue(nameElement);
        if (!name) return;

        let next = nameElement.nextSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()) {
            next = next.nextSibling;
        }
        if (next?.dataset?.demandHubNameCopy === 'true') {
            next.dataset.copyValue = name;
            return;
        }

        const button = createCopyButton(name, 'name');
        button.dataset.demandHubNameCopy = 'true';
        nameElement.parentNode.insertBefore(button, nameElement.nextSibling);
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
            addNameCopyButton();
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE) return;

        addNameCopyButton();
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
