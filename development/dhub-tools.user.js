// ==UserScript==
// @name         dhub tools (dev)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/dhub-tools.user.js
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/dhub-tools.user.js
// @description  Add DealerSocket search and copy buttons beside phone numbers and make tel clickable
// @match        https://app.demandhub.co/*
// @grant        none
// ==/UserScript==

(function() {
        'use strict';

     const phoneRegex =
                 /(^|[^\d])(\+\d{1,3}[ .-]?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}|(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4})(?!\d)/g;
        const blockTags = new Set([
                    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL',
                    'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
                    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN',
                    'OL', 'P', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
                    'THEAD', 'TR', 'UL'
                ]);
        const excludedTextSelector = 'a, button, script, style, textarea, input, select, option';
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

     function getBlockContainer(element) {
                 while (element && element !== document.body && !blockTags.has(element.tagName)) {
                                 element = element.parentElement;
                 }
                 return element || document.body;
     }

     function linkPhoneGroup(textNodes) {
                 const text = textNodes.map(node => node.nodeValue || '').join('');
                 const matches = Array.from(text.matchAll(phoneRegex));
                 if (!matches.length) return;

            const positions = [];
                 let offset = 0;
                 for (const node of textNodes) {
                                 const end = offset + (node.nodeValue || '').length;
                                 positions.push({ node, start: offset, end });
                                 offset = end;
                 }

            function findPosition(target, isEnd) {
                            for (const position of positions) {
                                                if (isEnd ? target <= position.end : target < position.end) {
                                                                        return {
                                                                                                    node: position.node,
                                                                                                    offset: target - position.start
                                                                        };
                                                }
                            }
                            const last = positions[positions.length - 1];
                            return { node: last.node, offset: last.end - last.start };
            }

            for (const match of matches.reverse()) {
                            const phone = match[2];
                            const start = match.index + match[1].length;
                            const end = start + phone.length;
                            const rangeStart = findPosition(start, false);
                            const rangeEnd = findPosition(end, true);
                            const range = document.createRange();
                            range.setStart(rangeStart.node, rangeStart.offset);
                            range.setEnd(rangeEnd.node, rangeEnd.offset);

                     const callLink = document.createElement('a');
                            const digits = phone.replace(/\D/g, '');
                            callLink.href = `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
                            callLink.title = `Call ${phone}`;
                            callLink.setAttribute('aria-label', `Call ${phone}`);
                            callLink.appendChild(range.extractContents());

                     const fragment = document.createDocumentFragment();
                            fragment.appendChild(callLink);
                            fragment.appendChild(createSearchLink(phone));
                            fragment.appendChild(createCopyButton(phone));
                            range.insertNode(fragment);
            }
     }

     function processNode(node) {
                 if (node.nodeType !== Node.TEXT_NODE &&
                                 node.nodeType !== Node.ELEMENT_NODE &&
                                 node.nodeType !== Node.DOCUMENT_NODE) return;

            const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
                 if (!element) return;

            const root = node.nodeType === Node.DOCUMENT_NODE
                     ? document.body
                            : getBlockContainer(element);
                 if (!root) return;

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                 let group = [];
                 let groupContainer = null;

            function flushGroup() {
                            if (group.length) linkPhoneGroup(group);
                            group = [];
                            groupContainer = null;
            }

            let textNode;
                 while ((textNode = walker.nextNode())) {
                                 const parent = textNode.parentElement;
                                 if (!parent || parent.closest(excludedTextSelector)) {
                                                     flushGroup();
                                                     continue;
                                 }

                     const container = getBlockContainer(parent);
                                 if (group.length && container !== groupContainer) flushGroup();
                                 if (!group.length) groupContainer = container;
                                 group.push(textNode);
                 }
                 flushGroup();
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
