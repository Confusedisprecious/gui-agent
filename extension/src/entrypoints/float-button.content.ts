export default defineContentScript({
    matches: ['<all_urls>'],
    main() {
        // Styles
        const style = document.createElement('style');
        style.textContent = `
            #medical-agent-float-btn {
                position: fixed;
                bottom: 80px;
                right: 24px;
                width: 52px;
                height: 52px;
                border-radius: 50%;
                background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%);
                border: none;
                box-shadow: 0 4px 16px rgba(59, 130, 246, 0.45);
                cursor: pointer;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.18s ease, box-shadow 0.18s ease;
                padding: 0;
            }
            #medical-agent-float-btn:hover {
                transform: scale(1.12);
                box-shadow: 0 6px 24px rgba(59, 130, 246, 0.6);
            }
            #medical-agent-float-btn:active {
                transform: scale(0.94);
            }
            #medical-agent-float-btn svg {
                width: 24px;
                height: 24px;
                fill: none;
                stroke: #fff;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
                pointer-events: none;
            }
            #medical-agent-float-tooltip {
                position: fixed;
                bottom: 104px;
                right: 16px;
                background: #1e293b;
                color: #e2e8f0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12px;
                padding: 6px 12px;
                border-radius: 8px;
                white-space: nowrap;
                z-index: 2147483647;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            #medical-agent-float-tooltip.visible {
                opacity: 1;
                visibility: visible;
            }
        `;
        document.head.appendChild(style);

        // Floating button
        const btn = document.createElement('button');
        btn.id = 'medical-agent-float-btn';
        btn.title = 'AI 智能助手';
        btn.innerHTML = `<svg viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <line x1="9" y1="9" x2="15" y2="9"/>
            <line x1="9" y1="13" x2="13" y2="13"/>
        </svg>`;

        // Tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'medical-agent-float-tooltip';
        tooltip.textContent = '点击使用 AI 智能助手';

        document.body.appendChild(btn);
        document.body.appendChild(tooltip);

        // Show tooltip on hover
        btn.addEventListener('mouseenter', () => tooltip.classList.add('visible'));
        btn.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));

        // Show tooltip for 3 seconds on load
        setTimeout(() => tooltip.classList.add('visible'), 500);
        setTimeout(() => tooltip.classList.remove('visible'), 4000);

        // Click handler — send message to background to open side panel
        btn.addEventListener('click', async () => {
            // Give user feedback
            btn.style.transform = 'scale(0.9)';
            setTimeout(() => { btn.style.transform = ''; }, 150);

            try {
                await chrome.runtime.sendMessage({ type: 'open_sidepanel' });
            } catch {
                // If side panel fails, the background will handle feedback
            }
        });
    },
});
