// ==UserScript==
// @name         !DEV dhub tools
// @namespace    http://tampermonkey.net/
// @version      1.13
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js?v=1.13
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js?v=1.13
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
    const processedPhoneTextNodes = new WeakSet();

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

    function createPhoneLink(phone) {
        const link = document.createElement('a');
        const digits = phone.replace(/\D/g, '');
        link.href = `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
        link.title = `Call ${phone}`;
        link.setAttribute('aria-label', `Call ${phone}`);
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
        if (element.matches('input, textarea')) return element.value.trim();

        const clone = element.cloneNode(true);
        clone.querySelector('[data-demand-hub-name-copy="true"]')?.remove();
        const value = clone.innerText || clone.textContent;
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function addNameCopyButton() {
        const nameElement = document.getElementById(nameElementId);
        if (!nameElement || !nameElement.parentNode) return;

        const name = getNameValue(nameElement);
        if (!name) return;

        let existingButton;
        if (nameElement.matches('input, textarea')) {
            const nextElement = nameElement.nextElementSibling;
            if (nextElement?.matches('[data-demand-hub-name-copy="true"]')) {
                existingButton = nextElement;
            }
        } else {
            existingButton = nameElement.querySelector(
                '[data-demand-hub-name-copy="true"]'
            );
        }
        if (existingButton) {
            existingButton.dataset.copyValue = name;
            return;
        }

        const button = createCopyButton(name, 'name');
        button.dataset.demandHubNameCopy = 'true';
        if (nameElement.matches('input, textarea')) {
            nameElement.insertAdjacentElement('afterend', button);
        } else {
            nameElement.appendChild(button);
        }
    }

    function linkPhoneText(textNode) {
        if (processedPhoneTextNodes.has(textNode)) return;

        const parent = textNode.parentElement;
        if (!parent || parent.closest('a, button, script, style, textarea')) return;

        const text = textNode.nodeValue || '';
        const match = text.match(phoneRegex);
        if (!match) return;

        const phone = match[2];
        const start = match.index + match[1].length;
        const end = start + phone.length;
        const fragment = document.createDocumentFragment();

        if (start > 0) fragment.appendChild(document.createTextNode(text.slice(0, start)));

        const phoneText = document.createTextNode(phone);
        processedPhoneTextNodes.add(phoneText);
        fragment.appendChild(phoneText);
        fragment.appendChild(createPhoneLink(phone));
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
