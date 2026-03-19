document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Core UI
    const singleNumberInput = document.getElementById('singleNumber');
    const addNumberBtn = document.getElementById('addNumberBtn');
    const bulkNumbersTextarea = document.getElementById('bulkNumbers');
    const parseBulkBtn = document.getElementById('parseBulkBtn');
    const queueSection = document.getElementById('queueSection');
    const numberList = document.getElementById('numberList');
    const queueCount = document.getElementById('queueCount');
    const clearAllBtn = document.getElementById('clearAllBtn');
    
    // DOM Elements - Actions & Progress
    const startBulkCallBtn = document.getElementById('startBulkCall');
    const progressContainer = document.getElementById('progressContainer');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    const resultsSection = document.getElementById('resultsSection');
    const resultsSummary = document.getElementById('resultsSummary');
    const resultsBody = document.getElementById('resultsBody');
    
    // DOM Elements - Modals & Console
    const verifyModal = document.getElementById('verifyModal');
    const verifyModalText = document.getElementById('verifyModalText');
    const verifyCode = document.getElementById('verifyCode');
    const codeDisplay = document.getElementById('codeDisplay');
    const closeModalBtn = document.getElementById('closeModal');
    
    const coreOrb = document.getElementById('coreOrb');
    
    const serverConsole = document.getElementById('serverConsole');
    const consoleBody = document.getElementById('consoleBody');
    const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
    const closeConsoleBtn = document.getElementById('closeConsoleBtn');

    // Voice UI
    const micBtn = document.getElementById('micBtn');
    const jarvisSpeech = document.getElementById('jarvisSpeech');

    // State
    let phoneNumbers = [];

    // =============================================
    // J.A.R.V.I.S. VOICE ASSISTANT (GEMINI)
    // =============================================
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let synthUnlocked = false; // Track if TTS is unlocked
    
    // Setup recognition object if browser supports it
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function() {
            micBtn.classList.add('recording');
            micBtn.textContent = '[ LISTENING... ]';
            jarvisSpeech.textContent = '> AWAITING VOICE COMMAND... (SPEAK NOW)';
        };

        recognition.onresult = async function(event) {
            const transcript = event.results[0][0].transcript;
            jarvisSpeech.textContent = `> YOU: "${transcript.toUpperCase()}"`;
            micBtn.textContent = '[ PROCESSING... ]';
            micBtn.classList.remove('recording');

            try {
                const res = await fetch('/api/jarvis-command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: transcript })
                });
                const data = await res.json();
                executeJarvisAction(data);
            } catch (err) {
                jarvisSpeak('Cannot reach mainframe. Check network or API key.');
                micBtn.textContent = '[ START VOICE UPLINK ]';
            }
        };

        recognition.onspeechend = function() {
            recognition.stop();
        };

        // Reset UI if it ends without a result (user was quiet)
        recognition.onend = function() {
            if (micBtn.classList.contains('recording')) {
                micBtn.classList.remove('recording');
                micBtn.textContent = '[ START VOICE UPLINK ]';
                jarvisSpeech.textContent = '> AUDIO CAPTURE TIMEOUT. NO SPEECH DETECTED.';
            }
        };

        recognition.onerror = function(event) {
            if (event.error === 'not-allowed') {
                jarvisSpeak('Microphone access denied. Please allow permissions in browser settings.');
            } else if (event.error === 'no-speech') {
                // Handled by onend usually, but good to catch
            } else {
                jarvisSpeak('Audio capture failed. Check network security protocols.');
            }
            micBtn.classList.remove('recording');
            micBtn.textContent = '[ START VOICE UPLINK ]';
        };
    }

    micBtn.addEventListener('click', async () => {
        // Unlock Web Speech TTS Engine on first user interaction
        if (!synthUnlocked && 'speechSynthesis' in window) {
            const unlock = new SpeechSynthesisUtterance('');
            unlock.volume = 0;
            window.speechSynthesis.speak(unlock);
            synthUnlocked = true;
        }

        // If already recording, stop
        if (micBtn.classList.contains('recording') && recognition) {
            recognition.stop();
            return;
        }

        // Force browser to ask for Microphone Permission Popup
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                jarvisSpeech.textContent = '> REQUESTING MIC PERMISSION...';
                await navigator.mediaDevices.getUserMedia({ audio: true });
            } else {
                jarvisSpeak('Browser does not support secure audio capture. Use HTTPS or localhost.');
                return;
            }
        } catch (err) {
            jarvisSpeak('Microphone permission denied by user.');
            return;
        }

        // Proceed to start recognition after permission granted
        if (recognition) {
            recognition.start();
        } else {
            jarvisSpeak('Voice recognition is not supported on this browser device.');
            micBtn.textContent = '[ BROWSER UNSUPPORTED ]';
        }
    });

    function jarvisSpeak(text) {
        jarvisSpeech.textContent = `> J.A.R.V.I.S: ${text.toUpperCase()}`;
        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech to prevent queuing bugs
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            const preferred = voices.find(v => v.lang.includes('en') && (v.name.includes('Google') || v.name.includes('Male')));
            if(preferred) utterance.voice = preferred;
            utterance.pitch = 0.5;
            utterance.rate = 1.1;
            window.speechSynthesis.speak(utterance);
        }
    }

    function executeJarvisAction(data) {
        if (data.action === 'open_url') {
            jarvisSpeak(`Accessing network. Opening ${data.url}.`);
            setTimeout(() => window.open(data.url, '_blank'), 1500);
        } else if (data.action === 'search') {
            jarvisSpeak(`Searching global databases for ${data.query}.`);
            setTimeout(() => window.open(`https://google.com/search?q=${encodeURIComponent(data.query)}`, '_blank'), 1500);
        } else if (data.action === 'speak') {
            jarvisSpeak(data.text);
        } else {
            jarvisSpeak('Command protocol unrecognized.');
        }
        
        // Reset mic button
        setTimeout(() => micBtn.textContent = '[ START VOICE UPLINK ]', 2000);
    }

    // =============================================
    // DRAGGABLE HACKER PANELS
    // =============================================
    const draggables = document.querySelectorAll('.draggable-panel');
    
    draggables.forEach(panel => {
        const handle = panel.querySelector('.drag-handle');
        if (!handle) return;
        
        let isDragging = false;
        let startX, startY, initialX = 0, initialY = 0;

        // Initialize transform
        panel.style.transform = `translate(0px, 0px)`;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            panel.classList.add('dragging');
            
            // Get current translation values
            const style = window.getComputedStyle(panel);
            const matrix = new WebKitCSSMatrix(style.transform);
            initialX = matrix.m41;
            initialY = matrix.m42;
            
            startX = e.clientX;
            startY = e.clientY;
            
            // Bring to front
            draggables.forEach(p => p.style.zIndex = '20');
            panel.style.zIndex = '100';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            panel.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                panel.classList.remove('dragging');
            }
        });
        
        // Basic Touch support for mobile dragging
        handle.addEventListener('touchstart', (e) => {
            isDragging = true;
            panel.classList.add('dragging');
            const style = window.getComputedStyle(panel);
            const matrix = new WebKitCSSMatrix(style.transform);
            initialX = matrix.m41;
            initialY = matrix.m42;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            draggables.forEach(p => p.style.zIndex = '20');
            panel.style.zIndex = '100';
        }, {passive: false});
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            panel.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`;
        }, {passive: false});
        
        document.addEventListener('touchend', () => {
            isDragging = false;
            panel.classList.remove('dragging');
        });
    });

    // =============================================
    // SERVER CONSOLE (SSE LOGS)
    // =============================================
    function toggleConsole() {
        serverConsole.classList.toggle('closed');
    }
    
    toggleConsoleBtn.addEventListener('click', toggleConsole);
    closeConsoleBtn.addEventListener('click', () => serverConsole.classList.add('closed'));

    function appendLog(level, msg, time) {
        const line = document.createElement('div');
        line.className = `log-line ${level}`;
        line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-txt">${msg}</span>`;
        consoleBody.appendChild(line);
        // Auto scroll to bottom
        consoleBody.scrollTop = consoleBody.scrollHeight;
    }

    // Connect to backend SSE logs
    const logEventSource = new EventSource('/api/logs');
    logEventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            appendLog(data.level, data.msg, data.time);
        } catch (e) { }
    };

    // =============================================
    // JARVIS UI EFFECTS
    // =============================================
    function typeWriter(element, text, speed = 30) {
        element.placeholder = "";
        let i = 0;
        function type() {
            if (i < text.length) {
                element.placeholder += text.charAt(i);
                i++;
                setTimeout(type, speed);
            }
        }
        type();
    }
    
    setTimeout(() => {
        typeWriter(singleNumberInput, "ENTER TARGET NUM...");
        typeWriter(bulkNumbersTextarea, ">> BATCH INPUT MODE READY...\n>> AWAITING COORDINATES...");
    }, 500);

    function generateHex() {
        return Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(6, '0');
    }
    
    setInterval(() => {
        const decorEls = document.querySelectorAll('.header-decor');
        decorEls.forEach(el => {
            el.textContent = `[0x${generateHex()}] [0x${generateHex()}]`;
            el.style.fontSize = '0.5rem';
            el.style.color = 'rgba(0, 240, 255, 0.3)';
            el.style.letterSpacing = '1px';
        });
    }, 2000);

    // =============================================
    // NUMBER FORMATTING & PARSING
    // =============================================
    function formatNumber(raw) {
        let n = raw.trim().replace(/[\s\-\(\)\.]/g, '');
        if (!n) return null;
        if (/^\d{10}$/.test(n)) return '+91' + n;
        if (/^91\d{10}$/.test(n)) return '+' + n;
        if (/^0\d{10}$/.test(n)) return '+91' + n.substring(1);
        if (/^\+\d{8,15}$/.test(n)) return n;
        return null;
    }

    function parseNumbers(text) {
        const parts = text.split(/[\n,;]+/);
        const results = [];
        for (const part of parts) {
            const tokens = part.trim().split(/\s+/);
            for (const tok of tokens) {
                const formatted = formatNumber(tok);
                if (formatted && !results.includes(formatted)) {
                    results.push(formatted);
                }
            }
        }
        return results;
    }

    function updateQueueUI() {
        if (phoneNumbers.length === 0) {
            queueSection.style.display = 'none';
            startBulkCallBtn.disabled = true;
            return;
        }
        queueSection.style.display = 'block';
        startBulkCallBtn.disabled = false;
        
        queueCount.textContent = "ERR";
        setTimeout(() => queueCount.textContent = phoneNumbers.length, 150);

        numberList.innerHTML = '';
        phoneNumbers.forEach((num, idx) => {
            const item = document.createElement('div');
            item.className = 'number-item';
            item.innerHTML = `
                <span class="num-text">[ ${num} ]</span>
                <button class="remove-btn" title="PURGE">×</button>
            `;
            item.querySelector('.remove-btn').addEventListener('click', () => {
                phoneNumbers.splice(idx, 1);
                updateQueueUI();
            });
            numberList.appendChild(item);
        });
    }

    function addSingleNumber() {
        const formatted = formatNumber(singleNumberInput.value);
        if (!formatted) {
            singleNumberInput.style.borderColor = 'var(--red)';
            setTimeout(() => { singleNumberInput.style.borderColor = ''; }, 1000);
            return;
        }
        if (!phoneNumbers.includes(formatted)) phoneNumbers.push(formatted);
        singleNumberInput.value = '';
        updateQueueUI();
    }

    addNumberBtn.addEventListener('click', addSingleNumber);
    singleNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addSingleNumber();
    });

    parseBulkBtn.addEventListener('click', () => {
        const parsed = parseNumbers(bulkNumbersTextarea.value);
        if (parsed.length === 0) {
            bulkNumbersTextarea.style.borderColor = 'var(--red)';
            setTimeout(() => { bulkNumbersTextarea.style.borderColor = ''; }, 1000);
            return;
        }
        for (const num of parsed) {
            if (!phoneNumbers.includes(num)) phoneNumbers.push(num);
        }
        bulkNumbersTextarea.value = '';
        updateQueueUI();
    });

    clearAllBtn.addEventListener('click', () => {
        phoneNumbers = [];
        updateQueueUI();
    });

    // =============================================
    // VERIFY MODAL LOGIC
    // =============================================
    function showVerifyModalAndWait(num, code) {
        return new Promise((resolve) => {
            verifyModal.style.display = 'flex';
            verifyModalText.textContent = "";
            let text = `> UPLINK SECURED. TWILIO IS HAILING ${num}.`;
            let i = 0;
            function type() {
                if (i < text.length) {
                    verifyModalText.textContent += text.charAt(i);
                    i++;
                    setTimeout(type, 20);
                } else {
                    verifyCode.style.display = 'block';
                    codeDisplay.textContent = code;
                }
            }
            type();

            function onClose() {
                verifyModal.style.display = 'none';
                verifyCode.style.display = 'none';
                closeModalBtn.removeEventListener('click', onClose);
                resolve();
            }
            closeModalBtn.addEventListener('click', onClose);
        });
    }

    // =============================================
    // BULK CALL EXECUTION
    // =============================================
    startBulkCallBtn.addEventListener('click', async () => {
        if (phoneNumbers.length === 0) return;

        startBulkCallBtn.querySelector('.btn-text').textContent = "SEQUENCE ACTIVE";
        startBulkCallBtn.classList.add('loading');
        startBulkCallBtn.disabled = true;
        
        progressContainer.style.display = 'block';
        resultsSection.style.display = 'flex'; // Changed to flex for new CSS
        resultsSummary.innerHTML = '';
        resultsBody.innerHTML = '';

        const total = phoneNumbers.length;
        let completed = 0, succeeded = 0, failed = 0;

        phoneNumbers.forEach((num, idx) => {
            const row = document.createElement('tr');
            row.id = `row-${idx}`;
            row.innerHTML = `<td>0${idx + 1}</td><td>${num}</td><td class="status-queued">STANDBY</td><td class="detail-text">[WAITING]</td>`;
            resultsBody.appendChild(row);
        });

        for (let i = 0; i < phoneNumbers.length; i++) {
            const num = phoneNumbers[i];
            const row = document.getElementById(`row-${i}`);
            const cells = row.querySelectorAll('td');

            cells[2].innerHTML = '► CALLING';
            cells[2].className = 'status-calling';
            cells[3].textContent = '[ESTABLISHING UPLINK]';
            progressText.textContent = `> TARGETING ${num} (${i + 1}/${total})`;
            
            coreOrb.className = 'core-orb calling';

            let callResult = await attemptCall(num);

            if (callResult.needsVerification && callResult.validationCode) {
                cells[2].innerHTML = '!! VERIFY';
                cells[2].className = 'status-failed'; 
                cells[3].textContent = `[AUTH REQ: ${callResult.validationCode}]`;
                
                coreOrb.className = 'core-orb verifying';

                await showVerifyModalAndWait(num, callResult.validationCode);

                cells[3].textContent = '[RE-ESTABLISHING...]';
                coreOrb.className = 'core-orb calling';
                await new Promise(r => setTimeout(r, 4000));

                callResult = await attemptCall(num);
            }

            coreOrb.className = 'core-orb';

            if (callResult.success) {
                cells[2].textContent = 'OK';
                cells[2].className = 'status-success';
                cells[3].textContent = `[SID: ${callResult.callSid.substring(0, 16)}...]`;
                succeeded++;
            } else {
                cells[2].textContent = 'FAIL';
                cells[2].className = 'status-failed';
                cells[3].textContent = `[ERR: ${callResult.error.substring(0, 30)}]`;
                failed++;
            }

            completed++;
            const pct = Math.round((completed / total) * 100);
            progressFill.style.width = pct + '%';
            progressPercent.textContent = `[${pct}%]`;

            if (i < phoneNumbers.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        progressText.textContent = '> SEQUENCE TERMINATED';
        
        resultsSummary.innerHTML = `
            <div class="summary-card total"><span class="lbl">TOTAL TARGETS</span><span class="num">${total.toString().padStart(2, '0')}</span></div>
            <div class="summary-card ok"><span class="lbl">SUCCESS (LINKED)</span><span class="num">${succeeded.toString().padStart(2, '0')}</span></div>
            <div class="summary-card fail"><span class="lbl">FAILED (BLOCKED)</span><span class="num">${failed.toString().padStart(2, '0')}</span></div>
        `;
        
        startBulkCallBtn.querySelector('.btn-text').textContent = "INITIATE SEQUENCE";
        startBulkCallBtn.classList.remove('loading');
        startBulkCallBtn.disabled = false;
    });

    async function attemptCall(phoneNumber) {
        try {
            const response = await fetch('/api/start-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });
            return await response.json();
        } catch (err) {
            return { success: false, error: 'Network failure' };
        }
    }
});

