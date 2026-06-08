// Advanced Amplitude Modulation Virtual Lab - Core Logic

// State management
const state = {
    Ac: 5.0,
    fc: 1000,
    Am: 3.0,
    fm: 50,
    R: 1200,
    C: 2.0, // in uF
    scheme: 'am-fc', // 'am-fc' (Conventional), 'am-sc' (DSB-SC), 'ssb-sc' (SSB)
    snr: 45, // 45 is treated as "Noiseless" bypass
    theme: 'dark',
    activeTab: 'bench',
    chMsg: true,
    chCar: false,
    chMod: true,
    chEnv: true,
    tDivIndex: 3, // default is 2.0 ms/div
    tDivOptions: [0.2, 0.5, 1.0, 2.0, 5.0, 10.0], // in ms/div
    showGrid: true,
    showIdealEnvelope: false,
    cursorType: 'off', // 'off', 'voltage', 'time'
    panOffsetTime: 0.0, // in seconds
    cursors: {
        y1: 3.0,  // in Volts
        y2: -3.0, // in Volts
        x1: 4.0,  // in ms
        x2: 14.0  // in ms
    },
    activeCursorDrag: null,
    observations: [],
    
    // Advanced features state variables
    activeAnalysisView: 'spectrum', // 'spectrum' or 'constellation3d'
    spin3d: true,
    theta3d: 0.8, // 3D rotation horizontal angle
    phi3d: 0.6,   // 3D tilt angle
    micActive: false,
    voiceData: new Float32Array(2048), // buffer storing latest voice samples
    voiceWriteIndex: 0
};

// Canvas references and contexts
let canvasScope, ctxScope;
let canvasSpectrum, ctxSpectrum;
let canvas3d, ctx3D;
const PADDING = 40;
const VOLTS_PER_DIV = 2.0;

// Web Audio API context references
let audioContext = null;
let micStream = null;
let scriptProcessor = null;
let carrierPhase = 0.0;
let demodCapVoltage = 0.0;

// Initialize when DOM loaded
window.addEventListener('DOMContentLoaded', () => {
    canvasScope = document.getElementById('oscilloscope');
    ctxScope = canvasScope.getContext('2d');
    
    canvasSpectrum = document.getElementById('canvas-spectrum');
    ctxSpectrum = canvasSpectrum.getContext('2d');
    
    canvas3d = document.getElementById('canvas-3d');
    ctx3D = canvas3d.getContext('2d');

    setupTabs();
    setupTheme();
    setupInputs();
    setupScopeControls();
    setupPresets();
    setupObservationTable();
    setupQuiz();
    
    // Upgraded feature hooks
    setupAdvancedControls();
    setupBlockModals();
    setupSchematicProbes();

    // Set initial canvas sizes
    resizeCanvases();
    window.addEventListener('resize', () => {
        resizeCanvases();
        updateSimulation();
    });

    // Start 3D animation loop
    animationLoop();
    
    // Run initial simulation
    updateSimulation();
});

function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    
    // Scope Canvas
    const rectScope = canvasScope.getBoundingClientRect();
    canvasScope.width = rectScope.width * dpr;
    canvasScope.height = rectScope.height * dpr;
    ctxScope.scale(dpr, dpr);
    
    // Spectrum Canvas
    const rectSpec = canvasSpectrum.getBoundingClientRect();
    canvasSpectrum.width = rectSpec.width * dpr;
    canvasSpectrum.height = rectSpec.height * dpr;
    ctxSpectrum.scale(dpr, dpr);

    // 3D Canvas
    const rect3d = canvas3d.getBoundingClientRect();
    canvas3d.width = rect3d.width * dpr;
    canvas3d.height = rect3d.height * dpr;
    ctx3D.scale(dpr, dpr);
}

// -------------------------------------------------------------
// TAB NAVIGATION & THEME TOGGLE
// -------------------------------------------------------------
function setupTabs() {
    const tabBench = document.getElementById('tab-bench');
    const tabLab = document.getElementById('tab-lab');
    const viewBench = document.getElementById('view-bench');
    const viewLab = document.getElementById('view-lab');

    tabBench.addEventListener('click', () => {
        state.activeTab = 'bench';
        tabBench.classList.add('active');
        tabLab.classList.remove('active');
        viewBench.classList.remove('hidden');
        viewLab.classList.add('hidden');
        resizeCanvases();
        updateSimulation();
    });

    tabLab.addEventListener('click', () => {
        state.activeTab = 'lab';
        tabLab.classList.add('active');
        tabBench.classList.remove('active');
        viewLab.classList.remove('hidden');
        viewBench.classList.add('hidden');
    });
}

function setupTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('theme-sun');
    const moonIcon = document.getElementById('theme-moon');

    themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        state.theme = newTheme;

        if (newTheme === 'dark') {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
        updateSimulation();
    });
}

// -------------------------------------------------------------
// CONTROL INPUTS & SLIDERS SYNCHRONIZATION
// -------------------------------------------------------------
function setupInputs() {
    const controls = [
        { id: 'ac', stateKey: 'Ac', isFloat: true },
        { id: 'fc', stateKey: 'fc', isFloat: false },
        { id: 'am', stateKey: 'Am', isFloat: true },
        { id: 'fm', stateKey: 'fm', isFloat: false },
        { id: 'r', stateKey: 'R', isFloat: false },
        { id: 'c', stateKey: 'C', isFloat: true }
    ];

    controls.forEach(ctrl => {
        const slider = document.getElementById(`slider-${ctrl.id}`);
        const num = document.getElementById(`num-${ctrl.id}`);

        const updateVal = (val) => {
            const parsed = ctrl.isFloat ? parseFloat(val) : parseInt(val, 10);
            if (!isNaN(parsed)) {
                state[ctrl.stateKey] = parsed;
                slider.value = parsed;
                num.value = parsed;
                
                if (ctrl.id !== 'r' && ctrl.id !== 'c') {
                    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
                }
                updateSimulation();
            }
        };

        slider.addEventListener('input', (e) => updateVal(e.target.value));
        num.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            if (val < min) val = min;
            if (val > max) val = max;
            updateVal(val);
        });
    });
}

// -------------------------------------------------------------
// ADVANCED FEATURES WORKBENCH CONFIG (AWGN, SSB, Audio API)
// -------------------------------------------------------------
function setupAdvancedControls() {
    // 1. Modulation Scheme Selector
    const schemeSelect = document.getElementById('select-modulation-scheme');
    schemeSelect.addEventListener('change', (e) => {
        state.scheme = e.target.value;
        
        // Custom updates to formulas text in view lab sheet
        const formulaLabel = document.getElementById('lbl-bandwidth-formula');
        if (state.scheme === 'ssb-sc') {
            formulaLabel.innerHTML = 'BW = f<sub>m</sub>';
        } else {
            formulaLabel.innerHTML = 'BW = 2 &times; f<sub>m</sub>';
        }

        // De-active default AM depth presets if DSB-SC/SSB selected
        if (state.scheme !== 'am-fc') {
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        }

        updateSimulation();
    });

    // 2. SNR noise slider
    const snrSlider = document.getElementById('slider-snr');
    const snrValLbl = document.getElementById('lbl-snr-val');
    snrSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        state.snr = val;
        
        if (val >= 45) {
            snrValLbl.textContent = 'Noiseless';
        } else {
            snrValLbl.textContent = `${val} dB`;
        }
        updateSimulation();
    });

    // 3. Monitor 2 Mode Selector (Spectrum vs 3D Helix)
    const btnShowSpectrum = document.getElementById('btn-show-spectrum');
    const btnShow3d = document.getElementById('btn-show-3d');
    const canvasSpecElement = document.getElementById('canvas-spectrum');
    const canvas3dElement = document.getElementById('canvas-3d');
    const specControls = document.getElementById('spectrum-controls');
    const controls3d = document.getElementById('3d-controls');
    const specReadouts = document.getElementById('spectrum-readouts');
    const readouts3d = document.getElementById('3d-readouts');
    const lblAnalysisTitle = document.getElementById('lbl-analysis-title');

    btnShowSpectrum.addEventListener('click', () => {
        state.activeAnalysisView = 'spectrum';
        btnShowSpectrum.classList.add('active');
        btnShow3d.classList.remove('active');
        
        canvasSpecElement.classList.remove('hidden');
        canvas3dElement.classList.add('hidden');
        specControls.classList.remove('hidden');
        controls3d.classList.add('hidden');
        specReadouts.classList.remove('hidden');
        readouts3d.classList.add('hidden');
        lblAnalysisTitle.textContent = 'Frequency Domain Spectrum';
        updateSimulation();
    });

    btnShow3d.addEventListener('click', () => {
        state.activeAnalysisView = 'constellation3d';
        btnShow3d.classList.add('active');
        btnShowSpectrum.classList.remove('active');
        
        canvas3dElement.classList.remove('hidden');
        canvasSpecElement.classList.add('hidden');
        controls3d.classList.remove('hidden');
        specControls.classList.add('hidden');
        readouts3d.classList.remove('hidden');
        specReadouts.classList.add('hidden');
        lblAnalysisTitle.textContent = '3D Analytical Signal Helix';
        
        resizeCanvases();
        draw3dHelix();
    });

    // 4. 3D Rotation control
    const btnToggleSpin = document.getElementById('btn-toggle-spin');
    btnToggleSpin.addEventListener('click', () => {
        state.spin3d = !state.spin3d;
        btnToggleSpin.textContent = state.spin3d ? 'Auto-Rotate: ON' : 'Auto-Rotate: OFF';
        btnToggleSpin.classList.toggle('active', state.spin3d);
    });

    // 3D Canvas mouse rotating drag
    let isDragging3d = false;
    let dragStart3d = { x: 0, y: 0 };
    let startTheta = 0;
    let startPhi = 0;

    canvas3d.addEventListener('mousedown', (e) => {
        if (state.activeAnalysisView !== 'constellation3d') return;
        isDragging3d = true;
        dragStart3d.x = e.clientX;
        dragStart3d.y = e.clientY;
        startTheta = state.theta3d;
        startPhi = state.phi3d;
        canvas3d.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging3d) return;
        const dx = e.clientX - dragStart3d.x;
        const dy = e.clientY - dragStart3d.y;
        
        state.theta3d = startTheta + dx * 0.015;
        state.phi3d = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, startPhi - dy * 0.01));
        
        document.getElementById('lbl-3d-angle').textContent = `θ: ${(state.theta3d * 180 / Math.PI).toFixed(0)}°, φ: ${(state.phi3d * 180 / Math.PI).toFixed(0)}°`;
        if (!state.spin3d) draw3dHelix();
    });

    window.addEventListener('mouseup', () => {
        if (isDragging3d) {
            isDragging3d = false;
            canvas3d.style.cursor = 'crosshair';
        }
    });

    // 5. Microphone voice input modulator
    const btnToggleMic = document.getElementById('btn-toggle-mic');
    const micStatusLbl = document.getElementById('mic-status-text');

    btnToggleMic.addEventListener('click', () => {
        if (!state.micActive) {
            startMicModulation();
        } else {
            stopMicModulation();
        }
    });
}

// Web Audio API integration
function startMicModulation() {
    const btnToggleMic = document.getElementById('btn-toggle-mic');
    const micStatusLbl = document.getElementById('mic-status-text');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Web Audio API is not supported in this browser environment.');
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            micStream = stream;
            
            const micSource = audioContext.createMediaStreamSource(stream);
            scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);
            
            carrierPhase = 0.0;
            demodCapVoltage = 0.0;

            scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const outputData = e.outputBuffer.getChannelData(0);
                const bufferLength = inputData.length;
                
                // 1. Log microphone samples to circular oscilloscope state buffer
                // Downsample or copy buffer
                for (let i = 0; i < bufferLength; i++) {
                    if (i % 2 === 0) {
                        state.voiceData[state.voiceWriteIndex] = inputData[i];
                        state.voiceWriteIndex = (state.voiceWriteIndex + 1) % state.voiceData.length;
                    }
                }

                // 2. Perform Real-time Ring-like Acoustic Modulation (DSB-FC or DSB-SC)
                // We use fc = 1500 Hz (acoustic boundary) so the user can hear it.
                const fcAcoustic = 1200.0; 
                const fs = audioContext.sampleRate;
                const dt = 1.0 / fs;
                const RC = state.R * (state.C * 1e-6);
                const Vdiode = 0.3;

                const modulatedBuffer = new Float32Array(bufferLength);

                for (let i = 0; i < bufferLength; i++) {
                    const voiceSample = inputData[i] * 2.0; // scale voice amplitude
                    let st = 0.0;

                    if (state.scheme === 'am-fc') {
                        st = (3.0 + voiceSample) * Math.cos(carrierPhase); // Conventional AM (Carrier = 3V)
                    } else if (state.scheme === 'am-sc') {
                        st = voiceSample * Math.cos(carrierPhase); // DSB-SC
                    } else {
                        // SSB approximation (analytic phase shift)
                        st = voiceSample * Math.cos(carrierPhase); // Simplified AM types compare
                    }

                    // Inject AWGN noise in real-time buffer if SNR slider is active
                    if (state.snr < 45) {
                        const snrLinear = Math.pow(10, state.snr / 10);
                        const sigma = 1.5 / Math.sqrt(snrLinear);
                        st += getGaussianNoiseValue(sigma);
                    }

                    modulatedBuffer[i] = st;
                    carrierPhase += 2.0 * Math.PI * fcAcoustic * dt;
                    if (carrierPhase > 2.0 * Math.PI * 1e5) {
                        carrierPhase -= 2.0 * Math.PI * 1e5; // phase wrap to prevent float overflow
                    }
                }

                // 3. Demodulate the modulated buffer causally through the simulated RC envelope detector
                for (let i = 0; i < bufferLength; i++) {
                    const inputVoltage = modulatedBuffer[i];
                    
                    if (inputVoltage - Vdiode > demodCapVoltage) {
                        demodCapVoltage = inputVoltage - Vdiode; // Diode conducts (charge)
                    } else {
                        demodCapVoltage = demodCapVoltage * Math.exp(-dt / RC); // Diode reversed (discharge)
                    }
                    if (demodCapVoltage < 0) demodCapVoltage = 0;
                    
                    // Center and feed demodulated output to speaker channels
                    // Subtract DC offset if Conventional AM (DSB-FC)
                    const dcOffset = state.scheme === 'am-fc' ? 2.3 : 0.0;
                    outputData[i] = (demodCapVoltage - dcOffset) * 0.4; // scale output volume
                }
            };

            micSource.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);
            
            state.micActive = true;
            btnToggleMic.textContent = '🛑 Disable Voice Input';
            btnToggleMic.style.borderColor = 'var(--accent-magenta)';
            btnToggleMic.style.color = 'var(--accent-magenta)';
            micStatusLbl.innerHTML = '🟢 Microphone Active.<br>Hear demodulated voice in real-time!';
        })
        .catch(err => {
            console.error('Audio setup failed: ', err);
            alert('Could not access microphone. Verify system recording permissions.');
        });
}

function stopMicModulation() {
    const btnToggleMic = document.getElementById('btn-toggle-mic');
    const micStatusLbl = document.getElementById('mic-status-text');

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    state.micActive = false;
    btnToggleMic.textContent = '🎙️ Enable Voice Input';
    btnToggleMic.style.borderColor = 'var(--accent-yellow)';
    btnToggleMic.style.color = 'var(--accent-yellow)';
    micStatusLbl.innerHTML = 'Inactive. Uses real microphone capture.';
    updateSimulation();
}

// AWGN Box-Muller generator helper
function getGaussianNoiseValue(sigma) {
    let u1 = Math.random();
    let u2 = Math.random();
    if (u1 === 0) u1 = 0.0001; // protect log(0)
    return sigma * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// -------------------------------------------------------------
// OSCILLOSCOPE CONTROL HANDLERS
// -------------------------------------------------------------
function setupScopeControls() {
    // Channel check boxes
    const chkMsg = document.getElementById('chk-ch-msg');
    const chkCar = document.getElementById('chk-ch-car');
    const chkMod = document.getElementById('chk-ch-mod');
    const chkEnv = document.getElementById('chk-ch-env');

    const updateChState = (checkbox, stateKey) => {
        const label = checkbox.parentElement;
        state[stateKey] = checkbox.checked;
        if (checkbox.checked) {
            label.classList.add('active');
        } else {
            label.classList.remove('active');
        }
        updateSimulation();
    };

    chkMsg.addEventListener('change', () => updateChState(chkMsg, 'chMsg'));
    chkCar.addEventListener('change', () => updateChState(chkCar, 'chCar'));
    chkMod.addEventListener('change', () => updateChState(chkMod, 'chMod'));
    chkEnv.addEventListener('change', () => updateChState(chkEnv, 'chEnv'));

    // Time/Div zoom knobs
    const tdivVal = document.getElementById('lbl-tdiv');
    const btnTdivDown = document.getElementById('btn-tdiv-down');
    const btnTdivUp = document.getElementById('btn-tdiv-up');

    const updateTDiv = (dir) => {
        state.tDivIndex += dir;
        if (state.tDivIndex < 0) state.tDivIndex = 0;
        if (state.tDivIndex >= state.tDivOptions.length) state.tDivIndex = state.tDivOptions.length - 1;
        
        tdivVal.textContent = `${state.tDivOptions[state.tDivIndex].toFixed(1)} ms/div`;
        updateSimulation();
    };

    btnTdivDown.addEventListener('click', () => updateTDiv(-1));
    btnTdivUp.addEventListener('click', () => updateTDiv(1));

    // Display buttons
    const btnGrid = document.getElementById('btn-toggle-grid');
    const btnIdealEnv = document.getElementById('btn-toggle-envelope');
    const btnResetPan = document.getElementById('btn-reset-pan');

    btnGrid.addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        btnGrid.classList.toggle('active', state.showGrid);
        updateSimulation();
    });

    btnIdealEnv.addEventListener('click', () => {
        state.showIdealEnvelope = !state.showIdealEnvelope;
        btnIdealEnv.classList.toggle('active', state.showIdealEnvelope);
        updateSimulation();
    });

    btnResetPan.addEventListener('click', () => {
        state.panOffsetTime = 0.0;
        updateSimulation();
    });

    // Cursors switch
    const btnCursorType = document.getElementById('btn-cursor-type');
    const readoutX = document.getElementById('readout-x');
    const readoutY = document.getElementById('readout-y');
    const lblCursorStatus = document.getElementById('lbl-cursor-status');

    btnCursorType.addEventListener('click', () => {
        if (state.cursorType === 'off') {
            state.cursorType = 'time';
            btnCursorType.textContent = 'Cursors: Time';
            btnCursorType.classList.add('active');
            readoutX.classList.remove('hidden');
            readoutY.classList.add('hidden');
            lblCursorStatus.textContent = 'TIME';
        } else if (state.cursorType === 'time') {
            state.cursorType = 'voltage';
            btnCursorType.textContent = 'Cursors: Volt';
            btnCursorType.classList.add('active');
            readoutX.classList.add('hidden');
            readoutY.classList.remove('hidden');
            lblCursorStatus.textContent = 'VOLTAGE';
        } else {
            state.cursorType = 'off';
            btnCursorType.textContent = 'Cursors: Off';
            btnCursorType.classList.remove('active');
            readoutX.classList.add('hidden');
            readoutY.classList.add('hidden');
            lblCursorStatus.textContent = 'OFF';
        }
        updateSimulation();
    });

    // Drag and drop cursors or panning on canvas Scope
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let initialPanOffset = 0;

    canvasScope.addEventListener('mousedown', (e) => {
        const rect = canvasScope.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        isDragging = true;
        dragStart.x = mouseX;
        dragStart.y = mouseY;
        initialPanOffset = state.panOffsetTime;

        state.activeCursorDrag = checkCursorHit(mouseX, mouseY);
        
        if (state.activeCursorDrag) {
            canvasScope.style.cursor = (state.activeCursorDrag === 'x1' || state.activeCursorDrag === 'x2') ? 'col-resize' : 'row-resize';
        } else {
            canvasScope.style.cursor = 'grabbing';
        }
    });

    canvasScope.addEventListener('mousemove', (e) => {
        const rect = canvasScope.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (!isDragging) {
            const hit = checkCursorHit(mouseX, mouseY);
            if (hit) {
                canvasScope.style.cursor = (hit === 'x1' || hit === 'x2') ? 'col-resize' : 'row-resize';
            } else {
                canvasScope.style.cursor = 'crosshair';
            }
            return;
        }

        if (state.activeCursorDrag) {
            const tDiv = state.tDivOptions[state.tDivIndex];
            const Twindow = 10 * (tDiv * 1e-3);
            const plotW = canvasScope.width / (window.devicePixelRatio || 1) - PADDING * 2;
            const plotH = canvasScope.height / (window.devicePixelRatio || 1) - PADDING * 2;
            const centerY = PADDING + plotH / 2;
            const pixelsPerVolt = plotH / 16;

            if (state.activeCursorDrag === 'x1' || state.activeCursorDrag === 'x2') {
                const tMapped = state.panOffsetTime + ((mouseX - PADDING) / plotW) * Twindow;
                state.cursors[state.activeCursorDrag] = Math.max(0, tMapped * 1000);
            } else if (state.activeCursorDrag === 'y1' || state.activeCursorDrag === 'y2') {
                const vMapped = (centerY - mouseY) / pixelsPerVolt;
                state.cursors[state.activeCursorDrag] = Math.min(8.0, Math.max(-8.0, vMapped));
            }
        } else {
            const dx = mouseX - dragStart.x;
            const tDiv = state.tDivOptions[state.tDivIndex];
            const Twindow = 10 * (tDiv * 1e-3);
            const plotW = canvasScope.width / (window.devicePixelRatio || 1) - PADDING * 2;
            const dt = -(dx / plotW) * Twindow;
            state.panOffsetTime = Math.max(0, initialPanOffset + dt);
        }
        
        updateSimulation();
    });

    const stopDragging = () => {
        isDragging = false;
        state.activeCursorDrag = null;
        canvasScope.style.cursor = 'crosshair';
    };

    canvasScope.addEventListener('mouseup', stopDragging);
    canvasScope.addEventListener('mouseleave', stopDragging);
}

function checkCursorHit(mx, my) {
    if (state.cursorType === 'off') return null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasScope.width / dpr;
    const h = canvasScope.height / dpr;
    const plotW = w - PADDING * 2;
    const plotH = h - PADDING * 2;
    const centerY = PADDING + plotH / 2;
    
    const tDiv = state.tDivOptions[state.tDivIndex];
    const Twindow = 10 * (tDiv * 1e-3);
    const pixelsPerVolt = plotH / 16;
    const tolerance = 12;

    if (state.cursorType === 'time') {
        const x1Pix = PADDING + ((state.cursors.x1 * 1e-3 - state.panOffsetTime) / Twindow) * plotW;
        const x2Pix = PADDING + ((state.cursors.x2 * 1e-3 - state.panOffsetTime) / Twindow) * plotW;

        if (Math.abs(mx - x1Pix) < tolerance) return 'x1';
        if (Math.abs(mx - x2Pix) < tolerance) return 'x2';
    } else if (state.cursorType === 'voltage') {
        const y1Pix = centerY - state.cursors.y1 * pixelsPerVolt;
        const y2Pix = centerY - state.cursors.y2 * pixelsPerVolt;

        if (Math.abs(my - y1Pix) < tolerance) return 'y1';
        if (Math.abs(my - y2Pix) < tolerance) return 'y2';
    }

    return null;
}

// -------------------------------------------------------------
// PRESETS CONFIGURATION

// -------------------------------------------------------------
function setupPresets() {
    const presetUnder = document.getElementById('preset-under');
    const presetCritical = document.getElementById('preset-critical');
    const presetOver = document.getElementById('preset-over');
    const btnOptimalRc = document.getElementById('btn-optimal-rc');

    const applyPreset = (Ac, Am, fc, fm) => {
        // Force scheme to Conventional AM (DSB-FC)
        const schemeSelect = document.getElementById('select-modulation-scheme');
        schemeSelect.value = 'am-fc';
        state.scheme = 'am-fc';

        updateControlValue('ac', Ac);
        updateControlValue('am', Am);
        updateControlValue('fc', fc);
        updateControlValue('fm', fm);
        
        calculateAndApplyOptimalRC(Am / Ac, fm);
    };

    presetUnder.addEventListener('click', () => {
        setActivePresetButton(presetUnder);
        applyPreset(5.0, 3.0, 1000, 50);
    });

    presetCritical.addEventListener('click', () => {
        setActivePresetButton(presetCritical);
        applyPreset(5.0, 5.0, 1000, 50);
    });

    presetOver.addEventListener('click', () => {
        setActivePresetButton(presetOver);
        applyPreset(5.0, 7.0, 1000, 50);
    });

    btnOptimalRc.addEventListener('click', () => {
        const m = state.Am / state.Ac;
        calculateAndApplyOptimalRC(m, state.fm);
    });
}

function setActivePresetButton(activeBtn) {
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

function updateControlValue(id, val) {
    const slider = document.getElementById(`slider-${id}`);
    const num = document.getElementById(`num-${id}`);
    const keyMap = { ac: 'Ac', am: 'Am', fc: 'fc', fm: 'fm', r: 'R', c: 'C' };
    
    state[keyMap[id]] = val;
    slider.value = val;
    num.value = val;
}

function calculateAndApplyOptimalRC(m, fm) {
    const wm = 2 * Math.PI * fm;
    let RC;
    
    if (m < 0.95) {
        const maxRC = Math.sqrt(1 - m * m) / (m * wm);
        RC = maxRC * 0.8;
    } else {
        const fc = state.fc;
        RC = 1 / (2 * Math.PI * Math.sqrt(fc * fm));
    }

    const R = 1500;
    let C = RC / R * 1e6;

    if (C < 0.1) C = 0.1;
    if (C > 10.0) C = 10.0;
    
    updateControlValue('r', R);
    updateControlValue('c', Math.round(C * 10) / 10);
    updateSimulation();
}

// -------------------------------------------------------------
// HARDWARE BLOCK MODALS DIALOGS CLICK LOGIC
// -------------------------------------------------------------
function setupBlockModals() {
    const modal = document.getElementById('block-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body-content');
    const btnClose = document.getElementById('btn-close-modal');

    const blockData = {
        'msg-source': {
            title: 'Baseband Modulating Source',
            content: `
                <p><strong>Definition:</strong> Generates the information-bearing baseband signal containing voice, telemetry, music, or digital codes.</p>
                <p><strong>Equations:</strong> For sinusoidal test tones, represented by:
                   <span class="math-formula">m(t) = A<sub>m</sub> cos(2π f<sub>m</sub> t)</span>
                </p>
                <p><strong>Lab Implementation:</strong> In standard university setups, this block is represented by a Function/Signal Generator (sine output) or a Microphone circuit pre-amplifier.</p>
            `
        },
        'carrier-osc': {
            title: 'Carrier RF Oscillator',
            content: `
                <p><strong>Definition:</strong> Generates a high-frequency sinusoidal radio-frequency (RF) wave. This serves as the carrier vehicle since high frequencies can propagate efficiently through free space.</p>
                <p><strong>Equations:</strong>
                   <span class="math-formula">c(t) = A<sub>c</sub> cos(2π f<sub>c</sub> t)</span>
                </p>
                <p><strong>Lab Implementation:</strong> Usually implemented with Colpitts oscillators, Hartley oscillators, or temperature-compensated Crystal oscillator chips for high frequency stability.</p>
            `
        },
        'modulator': {
            title: 'Amplitude Modulator',
            content: `
                <p><strong>Definition:</strong> Mixes the baseband intelligence signal onto the carrier by linearly varying the carrier envelope. Depending on configuration, it can perform double sideband or single sideband modulation.</p>
                <p><strong>Schemes:</strong>
                   <ul>
                      <li>Conventional AM (DSB-FC): Adds carrier bias voltage to prevent envelope zero-crossings.</li>
                      <li>DSB-SC: Suppresses the carrier component to maximize transmission power efficiency.</li>
                      <li>SSB: Suppresses carrier and filters out one redundant sideband to save 50% spectrum.</li>
                   </ul>
                </p>
                <p><strong>Lab Implementation:</strong> Achieved using analog multiplier IC chips (like AD633), diode ring balanced modulators, or transistors biased in their non-linear operational zones.</p>
            `
        },
        'channel': {
            title: 'Transmission Noise Channel',
            content: `
                <p><strong>Definition:</strong> The physical channel (such as free space, coaxial cable, or twisted pair) which attenuates the signal and injects Additive White Gaussian Noise (AWGN).</p>
                <p><strong>Calculations:</strong> Thermal noise is modeled statistically using the normal Gaussian distribution. Signal quality degradation is controlled by the Signal-to-Noise Ratio (SNR):
                   <span class="math-formula">SNR (dB) = 10 log<sub>10</sub> (P<sub>signal</sub> / P<sub>noise</sub>)</span>
                </p>
            `
        },
        'demodulator': {
            title: 'Diode Envelope Demodulator',
            content: `
                <p><strong>Definition:</strong> Recovers the baseband signal. A Schottky/germanium diode rectifies the received AM wave, and a parallel RC low-pass filter tracks the peaks of the remaining carrier cycles.</p>
                <p><strong>Limitations:</strong>
                   <ul>
                      <li>If the RC filter discharges too slowly (RC constant too large), it fails to follow the envelope downward, causing <strong>Diagonal Clipping</strong>.</li>
                      <li>If RC discharges too fast (RC too small), the output suffers from excessive high frequency <strong>Carrier Ripple</strong>.</li>
                   </ul>
                </p>
            `
        }
    };

    document.querySelectorAll('.clickable-block').forEach(block => {
        block.addEventListener('click', () => {
            const key = block.getAttribute('data-block');
            if (blockData[key]) {
                modalTitle.textContent = blockData[key].title;
                modalBody.innerHTML = blockData[key].content;
                modal.classList.remove('hidden');
            }
        });
    });

    const hideModal = () => modal.classList.add('hidden');
    btnClose.addEventListener('click', hideModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) hideModal();
    });
}

// -------------------------------------------------------------
// SCHEMATIC INTERACTIVE CIRCUIT PROBES
// -------------------------------------------------------------
function setupSchematicProbes() {
    const probeTP1 = document.getElementById('probe-tp1');
    const probeTP2 = document.getElementById('probe-tp2');
    const probeTP3 = document.getElementById('probe-tp3');
    
    const btnTP1 = document.getElementById('btn-probe-tp1');
    const btnTP2 = document.getElementById('btn-probe-tp2');
    const btnTP3 = document.getElementById('btn-probe-tp3');

    const selectProbe = (tpNum) => {
        // Clear active probe state styling
        probeTP1.classList.remove('active');
        probeTP2.classList.remove('active');
        probeTP3.classList.remove('active');
        
        btnTP1.classList.remove('active');
        btnTP2.classList.remove('active');
        btnTP3.classList.remove('active');

        // Reset all channel selections to cleanly isolate the probed node
        document.getElementById('chk-ch-msg').checked = false;
        document.getElementById('chk-ch-car').checked = false;
        document.getElementById('chk-ch-mod').checked = false;
        document.getElementById('chk-ch-env').checked = false;

        state.chMsg = false;
        state.chCar = false;
        state.chMod = false;
        state.chEnv = false;

        // Activate target channel
        if (tpNum === 1) {
            probeTP1.classList.add('active');
            btnTP1.classList.add('active');
            
            // TP1 probes modulated AM signal before rectification (Ch C)
            document.getElementById('chk-ch-mod').checked = true;
            state.chMod = true;
        } 
        else if (tpNum === 2) {
            probeTP2.classList.add('active');
            btnTP2.classList.add('active');
            
            // TP2 probes half-wave rectified output (Simulated inside Ch D by setting C capacitor to 0 in display!)
            // For educational demo, we override Ch D to show raw rectification spikes (Capacitor disconnected)
            document.getElementById('chk-ch-env').checked = true;
            state.chEnv = true;
            
            // Temporary message check to compare
            document.getElementById('chk-ch-msg').checked = true;
            state.chMsg = true;
        } 
        else if (tpNum === 3) {
            probeTP3.classList.add('active');
            btnTP3.classList.add('active');
            
            // TP3 probes fully filtered envelope detector wave (Ch D)
            document.getElementById('chk-ch-env').checked = true;
            state.chEnv = true;
            
            document.getElementById('chk-ch-mod').checked = true;
            state.chMod = true;
        }

        // Apply active check styles
        document.querySelectorAll('.channel-check').forEach(lbl => {
            const check = lbl.querySelector('input');
            lbl.classList.toggle('active', check.checked);
        });

        updateSimulation();
    };

    probeTP1.addEventListener('click', () => selectProbe(1));
    probeTP2.addEventListener('click', () => selectProbe(2));
    probeTP3.addEventListener('click', () => selectProbe(3));

    btnTP1.addEventListener('click', () => selectProbe(1));
    btnTP2.addEventListener('click', () => selectProbe(2));
    btnTP3.addEventListener('click', () => selectProbe(3));
}

// -------------------------------------------------------------
// MATH & SOLVER CALCULATIONS WITH NOISE AND AM SCHEMES
// -------------------------------------------------------------
function updateSimulation() {
    const Ac = state.Ac;
    const Am = state.Am;
    const fc = state.fc;
    const fm = state.fm;
    const R = state.R;
    const C = state.C;
    const scheme = state.scheme;

    // 1. Calculations
    const m = Ac > 0 ? (Am / Ac) : 0;
    const mPercent = m * 100;

    const valModIndex = document.getElementById('val-mod-index');
    const valModPercent = document.getElementById('val-mod-percent');
    const cardModIndex = document.getElementById('card-mod-index');

    if (scheme === 'am-fc') {
        valModIndex.textContent = m.toFixed(2);
        valModPercent.textContent = `${mPercent.toFixed(1)}% Modulation Depth`;
        
        if (m > 1.0) {
            cardModIndex.className = 'calc-card warning';
            valModPercent.innerHTML = '⚠️ Over-Modulated (Clipping)';
        } else if (m === 1.0) {
            cardModIndex.className = 'calc-card highlight';
            valModPercent.innerHTML = '⚡ Critical 100% Mod';
        } else {
            cardModIndex.className = 'calc-card';
            valModPercent.innerHTML = 'Normal Under-Modulated';
        }
    } else if (scheme === 'am-sc') {
        valModIndex.textContent = 'Suppressed';
        valModPercent.textContent = 'Carrier Null (DSB-SC)';
        cardModIndex.className = 'calc-card highlight';
    } else {
        valModIndex.textContent = 'Suppressed';
        valModPercent.textContent = 'Single Sideband (SSB-SC)';
        cardModIndex.className = 'calc-card highlight';
    }

    // 2. Bandwidth
    const bw = scheme === 'ssb-sc' ? fm : 2 * fm;
    document.getElementById('val-bandwidth').textContent = `${bw} Hz`;

    // 3. Sidebands
    const usb = fc + fm;
    const lsb = fc - fm;
    if (scheme === 'ssb-sc') {
        document.getElementById('val-sidebands').innerHTML = `USB: ${usb} Hz<br>LSB: Suppressed`;
    } else if (scheme === 'am-sc') {
        document.getElementById('val-sidebands').innerHTML = `USB: ${usb} Hz<br>LSB: ${lsb} Hz`;
    } else {
        document.getElementById('val-sidebands').innerHTML = `USB: ${usb} Hz<br>LSB: ${lsb} Hz`;
    }
    document.getElementById('card-sidebands').querySelector('.calc-card-sub').textContent = `Carrier fc: ${fc} Hz`;

    // 4. Power calculations
    let Pc = 0;
    let Pt = 0;
    let Psb = 0;
    let efficiency = 0;

    if (scheme === 'am-fc') {
        Pc = (Ac * Ac) / 2;
        Pt = Pc * (1 + (m * m) / 2);
        Psb = Pt - Pc;
        efficiency = (m * m) / (2 + m * m) * 100;
    } else if (scheme === 'am-sc') {
        Pc = 0; // carrier suppressed
        Pt = (Ac * Ac * Am * Am) / 8; // DSB power: (Ac*Am)^2 / 8
        Psb = Pt;
        efficiency = 100.0;
    } else {
        Pc = 0;
        Pt = (Ac * Ac * Am * Am) / 16; // SSB power: (Ac*Am)^2 / 16
        Psb = Pt;
        efficiency = 100.0;
    }

    document.getElementById('val-power').textContent = `${Pt.toFixed(2)} W`;
    document.getElementById('val-power-pc').textContent = scheme === 'am-fc' ? `Carrier Pc: ${Pc.toFixed(2)} W` : `Carrier Pc: 0.00 W (Suppr.)`;
    
    document.getElementById('val-efficiency').textContent = `${efficiency.toFixed(1)}%`;
    document.getElementById('val-power-sidebands').textContent = `Sidebands: ${Psb.toFixed(2)} W`;

    // Check envelope detector warning status
    const tau = R * (C * 1e-6);
    const wm = 2 * Math.PI * fm;
    const btnOptimalRc = document.getElementById('btn-optimal-rc');
    
    if (scheme === 'am-fc' && m <= 1.0) {
        const limit = Math.sqrt(1 - m*m) / (m * wm);
        if (tau > limit) {
            btnOptimalRc.textContent = '⚠️ RC too large (Clipping)';
            btnOptimalRc.style.borderColor = 'var(--accent-magenta)';
            btnOptimalRc.style.color = 'var(--accent-magenta)';
        } else if (tau < (1 / fc)) {
            btnOptimalRc.textContent = '⚠️ RC too small (High Ripple)';
            btnOptimalRc.style.borderColor = 'var(--accent-yellow)';
            btnOptimalRc.style.color = 'var(--accent-yellow)';
        } else {
            btnOptimalRc.textContent = '⚡ Optimal RC Engaged';
            btnOptimalRc.style.borderColor = 'var(--accent-green)';
            btnOptimalRc.style.color = 'var(--accent-green)';
        }
    } else if (scheme === 'am-fc') {
        btnOptimalRc.textContent = '⚠️ Overmodulation Distortion';
        btnOptimalRc.style.borderColor = 'var(--accent-magenta)';
        btnOptimalRc.style.color = 'var(--accent-magenta)';
    } else {
        btnOptimalRc.textContent = '⚠️ Requires Coherent detector';
        btnOptimalRc.style.borderColor = 'var(--accent-yellow)';
        btnOptimalRc.style.color = 'var(--accent-yellow)';
    }

    // Refresh rendering displays
    drawOscilloscope();
    
    if (state.activeAnalysisView === 'spectrum') {
        drawSpectrumAnalyzer();
    } else {
        draw3dHelix();
    }
}

// -------------------------------------------------------------
// CAUSAL DIODE + RC SOLVER INCLUDING AWGN NOISE
// -------------------------------------------------------------
function solveEnvelopeDetector(tMax, tStart = 0) {
    const dt = 0.000008; // high simulation step resolution (8 microseconds)
    const RC = state.R * (state.C * 1e-6);
    const Vdiode = 0.3; // forward barrier diode drop
    
    // Check if TP2 probe is active (Raw rectification, C is effectively disconnected)
    const isTP2Active = document.getElementById('probe-tp2').classList.contains('active');
    const actualRC = isTP2Active ? (state.R * 1e-12) : RC; // set C extremely small (~1pF) to show raw peaks

    const solverStartT = 0.0;
    const steps = Math.ceil((tMax - solverStartT) / dt);
    
    const tValues = new Float32Array(steps);
    const vValues = new Float32Array(steps);
    
    let vc = 0;
    let t = solverStartT;

    // SNR parameters for noise modeling
    let sigma = 0;
    const noiseActive = state.snr < 45;
    if (noiseActive) {
        const snrLinear = Math.pow(10, state.snr / 10);
        // Estimate signal power
        const signalPower = (state.Ac * state.Ac) / 2;
        sigma = Math.sqrt(signalPower / snrLinear);
    }

    for (let i = 0; i < steps; i++) {
        // Calculate modulated value
        let st = getModulatedSignalValue(t);

        // Add AWGN noise
        if (noiseActive) {
            st += getGaussianNoiseValue(sigma);
        }
        
        // Diode Rectifier + RC filter differential step solver
        if (st - Vdiode > vc) {
            vc = st - Vdiode; // Diode conducts
        } else {
            vc = vc * Math.exp(-dt / actualRC); // Diode reversed
        }
        if (vc < 0) vc = 0;
        
        tValues[i] = t;
        vValues[i] = vc;
        t += dt;
    }
    
    return { tValues, vValues };
}

function getModulatedSignalValue(t) {
    let mt = 0;
    
    if (state.micActive) {
        // Read voice sample circular buffer
        const voiceIdx = Math.floor(t * 1000) % state.voiceData.length;
        mt = state.voiceData[voiceIdx] * 3.0; // scale voice
    } else {
        mt = state.Am * Math.cos(2 * Math.PI * state.fm * t);
    }

    if (state.scheme === 'am-fc') {
        // s(t) = [Ac + m(t)] * cos(wc * t)
        return (state.Ac + mt) * Math.cos(2 * Math.PI * state.fc * t);
    } 
    else if (state.scheme === 'am-sc') {
        // s(t) = m(t) * Ac * cos(wc * t)
        return mt * state.Ac * Math.cos(2 * Math.PI * state.fc * t);
    } 
    else {
        // SSB: s(t) = (Ac*Am/2) * cos((wc + wm)*t)
        // If mic is active, we just do a simplified single band shift
        const wSSB = state.micActive ? (state.fc + 100) : (state.fc + state.fm);
        return (state.Ac * state.Am / 2) * Math.cos(2 * Math.PI * wSSB * t);
    }
}

// -------------------------------------------------------------
// SCOPE RENDERING LOOP
// -------------------------------------------------------------
function drawOscilloscope() {
    if (!canvasScope || !ctxScope) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasScope.width / dpr;
    const h = canvasScope.height / dpr;
    
    const plotW = w - PADDING * 2;
    const plotH = h - PADDING * 2;
    const centerY = PADDING + plotH / 2;
    
    // Background CRT monitor
    ctxScope.fillStyle = state.theme === 'dark' ? '#040810' : '#080e1a';
    ctxScope.fillRect(0, 0, w, h);
    
    if (state.showGrid) {
        drawScopeGrid(ctxScope, plotW, plotH, centerY);
    }
    
    const tDiv = state.tDivOptions[state.tDivIndex];
    const Twindow = 10 * (tDiv * 1e-3);
    const tStart = state.panOffsetTime;
    const tEnd = tStart + Twindow;
    const pixelsPerVolt = plotH / 16;
    
    const getXPix = (time) => PADDING + ((time - tStart) / Twindow) * plotW;
    const getYPix = (voltage) => centerY - voltage * pixelsPerVolt;

    // Run envelope detector solver
    let envelopeSolution = null;
    if (state.chEnv) {
        envelopeSolution = solveEnvelopeDetector(tEnd, tStart);
    }

    const pointsCount = Math.floor(plotW);
    const traceData = {
        msg: state.chMsg ? new Float32Array(pointsCount) : null,
        car: state.chCar ? new Float32Array(pointsCount) : null,
        mod: state.chMod ? new Float32Array(pointsCount) : null,
        env: state.chEnv ? new Float32Array(pointsCount) : null,
        ideal: state.showIdealEnvelope ? new Float32Array(pointsCount) : null
    };

    // SNR parameters for noise trace mapping
    let sigma = 0;
    const noiseActive = state.snr < 45;
    if (noiseActive) {
        const snrLinear = Math.pow(10, state.snr / 10);
        const signalPower = (state.Ac * state.Ac) / 2;
        sigma = Math.sqrt(signalPower / snrLinear);
    }

    for (let i = 0; i < pointsCount; i++) {
        const t = tStart + (i / pointsCount) * Twindow;
        
        // 1. Baseband Modulating Signal
        if (state.chMsg) {
            if (state.micActive) {
                const voiceIdx = Math.floor(t * 1000) % state.voiceData.length;
                traceData.msg[i] = state.voiceData[voiceIdx] * 3.0;
            } else {
                traceData.msg[i] = state.Am * Math.cos(2 * Math.PI * state.fm * t);
            }
        }
        
        // 2. Carrier RF wave
        if (state.chCar) {
            traceData.car[i] = state.Ac * Math.cos(2 * Math.PI * state.fc * t);
        }
        
        // 3. Modulated Wave
        if (state.chMod || state.showIdealEnvelope) {
            let st = getModulatedSignalValue(t);
            if (noiseActive) st += getGaussianNoiseValue(sigma);
            
            if (state.chMod) traceData.mod[i] = st;
            
            if (state.showIdealEnvelope) {
                // Ideal math envelope shape
                let envelopeHeight = 0;
                if (state.scheme === 'am-fc') {
                    if (state.micActive) {
                        const voiceIdx = Math.floor(t * 1000) % state.voiceData.length;
                        envelopeHeight = state.Ac + state.voiceData[voiceIdx] * 3.0;
                    } else {
                        envelopeHeight = state.Ac + state.Am * Math.cos(2 * Math.PI * state.fm * t);
                    }
                } else if (state.scheme === 'am-sc') {
                    if (state.micActive) {
                        const voiceIdx = Math.floor(t * 1000) % state.voiceData.length;
                        envelopeHeight = Math.abs(state.voiceData[voiceIdx] * 3.0 * state.Ac);
                    } else {
                        envelopeHeight = Math.abs(state.Am * state.Ac * Math.cos(2 * Math.PI * state.fm * t));
                    }
                } else {
                    envelopeHeight = state.Ac * state.Am / 2; // Flat envelope for SSB
                }
                traceData.ideal[i] = envelopeHeight;
            }
        }

        // 4. Demodulated envelope
        if (state.chEnv) {
            traceData.env[i] = getEnvelopeValue(t, envelopeSolution);
        }
    }

    // Drawing
    ctxScope.lineWidth = 1.8;
    if (state.theme === 'dark') {
        ctxScope.shadowBlur = 5;
    }

    // Ch B: Carrier (Cyan)
    if (state.chCar) {
        ctxScope.strokeStyle = state.theme === 'dark' ? '#00f0ff' : '#0891b2';
        ctxScope.shadowColor = ctxScope.strokeStyle;
        ctxScope.beginPath();
        for (let i = 0; i < pointsCount; i++) {
            const px = PADDING + i;
            const py = getYPix(traceData.car[i] + 4.0); // shifted up 2 divisions (+4V)
            if (i === 0) ctxScope.moveTo(px, py); else ctxScope.lineTo(px, py);
        }
        ctxScope.stroke();
    }

    // Ch A: Modulating (Yellow)
    if (state.chMsg) {
        ctxScope.strokeStyle = state.theme === 'dark' ? '#fbbf24' : '#d97706';
        ctxScope.shadowColor = ctxScope.strokeStyle;
        ctxScope.beginPath();
        for (let i = 0; i < pointsCount; i++) {
            const px = PADDING + i;
            const py = getYPix(traceData.msg[i] + 4.0); // shifted up 2 divisions (+4V)
            if (i === 0) ctxScope.moveTo(px, py); else ctxScope.lineTo(px, py);
        }
        ctxScope.stroke();
    }

    // Ch C: Modulated wave (Green)
    if (state.chMod) {
        ctxScope.strokeStyle = state.theme === 'dark' ? '#10b981' : '#059669';
        ctxScope.shadowColor = ctxScope.strokeStyle;
        ctxScope.beginPath();
        for (let i = 0; i < pointsCount; i++) {
            const px = PADDING + i;
            const py = getYPix(traceData.mod[i]); // centered
            if (i === 0) ctxScope.moveTo(px, py); else ctxScope.lineTo(px, py);
        }
        ctxScope.stroke();
    }

    // Ideal Envelope limits (Dashed grey lines)
    if (state.showIdealEnvelope) {
        ctxScope.shadowBlur = 0;
        ctxScope.lineWidth = 1.25;
        ctxScope.setLineDash([5, 5]);
        ctxScope.strokeStyle = state.theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(15, 23, 42, 0.4)';
        
        ctxScope.beginPath();
        for (let i = 0; i < pointsCount; i++) {
            const px = PADDING + i;
            const py = getYPix(traceData.ideal[i]);
            if (i === 0) ctxScope.moveTo(px, py); else ctxScope.lineTo(px, py);
        }
        ctxScope.stroke();

        ctxScope.beginPath();
        for (let i = 0; i < pointsCount; i++) {
            const px = PADDING + i;
            const py = getYPix(-traceData.ideal[i]);
            if (i === 0) ctxScope.moveTo(px, py); else ctxScope.lineTo(px, py);
        }
        ctxScope.stroke();
        
        ctxScope.setLineDash([]);
        if (state.theme === 'dark') ctxScope.shadowBlur = 5;
    }

    // Ch D: Envelope Demodulated Output (Magenta)
    if (state.chEnv) {
        ctxScope.strokeStyle = state.theme === 'dark' ? '#f43f5e' : '#e11d48';
        ctxScope.shadowColor = ctxScope.strokeStyle;
        ctxScope.beginPath();
        for (let i = 0; i < pointsCount; i++) {
            const px = PADDING + i;
            const py = getYPix(traceData.env[i]); // overlaid centered
            if (i === 0) ctxScope.moveTo(px, py); else ctxScope.lineTo(px, py);
        }
        ctxScope.stroke();
    }

    ctxScope.shadowBlur = 0;

    // Draw Cursors
    drawScopeCursors(ctxScope, w, h, plotW, plotH, centerY, getXPix, getYPix, pixelsPerVolt, Twindow, tStart);
    
    // Scale info text
    drawAxisScales(ctxScope, w, h, tDiv);
}

function drawScopeGrid(ctx, w, h, centerY) {
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = state.theme === 'dark' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(15, 23, 42, 0.08)';

    const xStep = w / 10;
    for (let i = 0; i <= 10; i++) {
        const x = PADDING + i * xStep;
        ctx.beginPath();
        ctx.moveTo(x, PADDING);
        ctx.lineTo(x, PADDING + h);
        ctx.stroke();
    }

    const yStep = h / 8;
    for (let i = 0; i <= 8; i++) {
        const y = PADDING + i * yStep;
        ctx.beginPath();
        ctx.moveTo(PADDING, y);
        ctx.lineTo(PADDING + w, y);
        ctx.stroke();
    }

    ctx.lineWidth = 1.0;
    ctx.strokeStyle = state.theme === 'dark' ? 'rgba(0, 240, 255, 0.3)' : 'rgba(15, 23, 42, 0.18)';
    
    ctx.beginPath();
    ctx.moveTo(PADDING, centerY);
    ctx.lineTo(PADDING + w, centerY);
    ctx.stroke();

    const centerX = PADDING + w / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, PADDING);
    ctx.lineTo(centerX, PADDING + h);
    ctx.stroke();

    const tickLen = 4;
    for (let i = 0; i <= 50; i++) {
        const x = PADDING + i * (w / 50);
        ctx.beginPath();
        ctx.moveTo(x, centerY - tickLen);
        ctx.lineTo(x, centerY + tickLen);
        ctx.stroke();
    }
    
    for (let i = 0; i <= 40; i++) {
        const y = PADDING + i * (h / 40);
        ctx.beginPath();
        ctx.moveTo(centerX - tickLen, y);
        ctx.lineTo(centerX + tickLen, y);
        ctx.stroke();
    }
}

function drawScopeCursors(ctx, w, h, plotW, plotH, centerY, getXPix, getYPix, pixelsPerVolt, Twindow, tStart) {
    if (state.cursorType === 'off') return;

    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);

    const activeColor = 'rgba(251, 191, 36, 0.9)';
    const idleColor = state.theme === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.35)';

    if (state.cursorType === 'time') {
        const x1Sec = state.cursors.x1 * 1e-3;
        const x2Sec = state.cursors.x2 * 1e-3;

        const x1Pix = getXPix(x1Sec);
        const x2Pix = getXPix(x2Sec);

        if (x1Pix >= PADDING && x1Pix <= PADDING + plotW) {
            ctx.strokeStyle = state.activeCursorDrag === 'x1' ? activeColor : idleColor;
            ctx.beginPath();
            ctx.moveTo(x1Pix, PADDING);
            ctx.lineTo(x1Pix, PADDING + plotH);
            ctx.stroke();
            
            drawCursorLabel(ctx, x1Pix, PADDING + 12, 'X1', state.cursors.x1.toFixed(2) + ' ms');
        }

        if (x2Pix >= PADDING && x2Pix <= PADDING + plotW) {
            ctx.strokeStyle = state.activeCursorDrag === 'x2' ? activeColor : idleColor;
            ctx.beginPath();
            ctx.moveTo(x2Pix, PADDING);
            ctx.lineTo(x2Pix, PADDING + plotH);
            ctx.stroke();

            drawCursorLabel(ctx, x2Pix, PADDING + plotH - 12, 'X2', state.cursors.x2.toFixed(2) + ' ms');
        }

        const dx = Math.abs(state.cursors.x2 - state.cursors.x1);
        const freq = dx > 0 ? (1000 / dx) : 0;

        document.getElementById('val-cur-x1').textContent = `${state.cursors.x1.toFixed(2)} ms`;
        document.getElementById('val-cur-x2').textContent = `${state.cursors.x2.toFixed(2)} ms`;
        document.getElementById('val-cur-dx').textContent = `${dx.toFixed(2)} ms`;
        document.getElementById('val-cur-freq').textContent = freq >= 1000 ? `${(freq/1000).toFixed(2)} kHz` : `${freq.toFixed(1)} Hz`;
    } 
    else if (state.cursorType === 'voltage') {
        const y1Pix = getYPix(state.cursors.y1);
        const y2Pix = getYPix(state.cursors.y2);

        if (y1Pix >= PADDING && y1Pix <= PADDING + plotH) {
            ctx.strokeStyle = state.activeCursorDrag === 'y1' ? activeColor : idleColor;
            ctx.beginPath();
            ctx.moveTo(PADDING, y1Pix);
            ctx.lineTo(PADDING + plotW, y1Pix);
            ctx.stroke();

            drawCursorLabel(ctx, PADDING + 30, y1Pix, 'Y1', state.cursors.y1.toFixed(2) + ' V');
        }

        if (y2Pix >= PADDING && y2Pix <= PADDING + plotH) {
            ctx.strokeStyle = state.activeCursorDrag === 'y2' ? activeColor : idleColor;
            ctx.beginPath();
            ctx.moveTo(PADDING, y2Pix);
            ctx.lineTo(PADDING + plotW, y2Pix);
            ctx.stroke();

            drawCursorLabel(ctx, PADDING + plotW - 75, y2Pix, 'Y2', state.cursors.y2.toFixed(2) + ' V');
        }

        const dy = Math.abs(state.cursors.y2 - state.cursors.y1);
        document.getElementById('val-cur-y1').textContent = `${state.cursors.y1.toFixed(2)} V`;
        document.getElementById('val-cur-y2').textContent = `${state.cursors.y2.toFixed(2)} V`;
        document.getElementById('val-cur-dy').textContent = `${dy.toFixed(2)} V`;
    }

    ctx.setLineDash([]);
}

function drawCursorLabel(ctx, x, y, name, valStr) {
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    
    const text = `${name}: ${valStr}`;
    const w = ctx.measureText(text).width + 8;
    const h = 14;
    
    ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
}

function drawAxisScales(ctx, w, h, tDiv) {
    ctx.font = '10px Outfit, sans-serif';
    ctx.fillStyle = state.theme === 'dark' ? '#94a3b8' : '#4b5563';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    let scalesInfo = `H-Scale: ${tDiv} ms/div | V-Scale: 2.0 V/div`;
    ctx.fillText(scalesInfo, PADDING, h - 10);
    
    ctx.textAlign = 'right';
    ctx.fillText(`Trigger: Auto | AC Coupling`, w - PADDING, h - 10);
    
    if (state.panOffsetTime > 0.0) {
        ctx.textAlign = 'center';
        ctx.fillText(`Pan Delay: ${(state.panOffsetTime * 1000).toFixed(1)} ms`, w / 2, h - 10);
    }
}

// -------------------------------------------------------------
// REAL-TIME FREQUENCY SPECTRUM ANALYZER
// -------------------------------------------------------------
function drawSpectrumAnalyzer() {
    if (!canvasSpectrum || !ctxSpectrum || state.activeAnalysisView !== 'spectrum') return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasSpectrum.width / dpr;
    const h = canvasSpectrum.height / dpr;

    const plotW = w - PADDING * 2;
    const plotH = h - PADDING * 2;
    const plotY0 = PADDING;
    const plotY1 = PADDING + plotH;

    // Spectrum CRT background
    ctxSpectrum.fillStyle = state.theme === 'dark' ? '#040810' : '#080e1a';
    ctxSpectrum.fillRect(0, 0, w, h);

    // Draw grid
    ctxSpectrum.lineWidth = 0.5;
    ctxSpectrum.strokeStyle = state.theme === 'dark' ? 'rgba(0, 240, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)';

    // 10 divisions horizontal
    const xStep = plotW / 10;
    for (let i = 0; i <= 10; i++) {
        const x = PADDING + i * xStep;
        ctxSpectrum.beginPath();
        ctxSpectrum.moveTo(x, plotY0);
        ctxSpectrum.lineTo(x, plotY1);
        ctxSpectrum.stroke();
    }

    // 8 divisions vertical
    const yStep = plotH / 8;
    for (let i = 0; i <= 8; i++) {
        const y = plotY0 + i * yStep;
        ctxSpectrum.beginPath();
        ctxSpectrum.moveTo(PADDING, y);
        ctxSpectrum.lineTo(PADDING + plotW, y);
        ctxSpectrum.stroke();
    }

    // Axis scales
    const freqMax = 2500; // max visible frequency in Hz
    const getXFromFreq = (freq) => PADDING + (freq / freqMax) * plotW;
    const getYFromVolts = (volts) => plotY1 - (volts / 6.0) * plotH; // max height scale is 6V

    // Plot continuous noise floor across spectrum
    const pointsCount = Math.floor(plotW);
    const snrActive = state.snr < 45;
    let baseNoiseLevel = 0.05; // clean background noise
    if (snrActive) {
        // Higher noise level on lower SNR
        baseNoiseLevel = 0.15 + (40 - state.snr) * 0.03;
    }

    ctxSpectrum.strokeStyle = state.theme === 'dark' ? 'rgba(0, 240, 255, 0.4)' : 'rgba(8, 145, 178, 0.4)';
    ctxSpectrum.lineWidth = 1.0;
    ctxSpectrum.beginPath();
    for (let i = 0; i < pointsCount; i++) {
        const fx = PADDING + i;
        // Generate random jagged noise floor
        const noiseV = baseNoiseLevel + Math.random() * (snrActive ? 0.4 : 0.08);
        const fy = getYFromVolts(noiseV);
        if (i === 0) ctxSpectrum.moveTo(fx, fy); else ctxSpectrum.lineTo(fx, fy);
    }
    ctxSpectrum.stroke();

    // Mathematically determine spectral spikes based on scheme
    const fc = state.fc;
    const fm = state.fm;
    const Ac = state.Ac;
    const Am = state.Am;
    const scheme = state.scheme;

    // List of spikes: { freq, amplitude, label, color }
    const spikes = [];

    if (scheme === 'am-fc') {
        spikes.push({ freq: fc, amp: Ac, label: 'fc', color: '#00f0ff' });
        spikes.push({ freq: fc - fm, amp: Am / 2, label: 'LSB', color: '#fbbf24' });
        spikes.push({ freq: fc + fm, amp: Am / 2, label: 'USB', color: '#fbbf24' });
    } else if (scheme === 'am-sc') {
        // Suppressed carrier AM
        spikes.push({ freq: fc - fm, amp: (Ac * Am) / 4, label: 'LSB', color: '#fbbf24' });
        spikes.push({ freq: fc + fm, amp: (Ac * Am) / 4, label: 'USB', color: '#fbbf24' });
    } else {
        // SSB (Upper sideband only)
        const ssbFreq = state.micActive ? (fc + 100) : (fc + fm);
        spikes.push({ freq: ssbFreq, amp: (Ac * Am) / 2, label: 'USB', color: '#fbbf24' });
    }

    // Render spikes as vertical pulses with labels
    ctxSpectrum.shadowBlur = state.theme === 'dark' ? 6 : 0;
    
    spikes.forEach(spike => {
        const sx = getXFromFreq(spike.freq);
        const sy = getYFromVolts(spike.amp);
        
        ctxSpectrum.strokeStyle = spike.color;
        ctxSpectrum.shadowColor = spike.color;
        ctxSpectrum.lineWidth = 2.5;

        // Draw vertical spike line from noise floor up to peak amplitude
        ctxSpectrum.beginPath();
        ctxSpectrum.moveTo(sx, plotY1);
        ctxSpectrum.lineTo(sx, sy);
        ctxSpectrum.stroke();

        // Draw label text above spike
        ctxSpectrum.font = 'bold 9px JetBrains Mono, monospace';
        ctxSpectrum.fillStyle = state.theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctxSpectrum.textAlign = 'center';
        ctxSpectrum.textBaseline = 'bottom';
        ctxSpectrum.fillText(`${spike.label} (${spike.freq}Hz)`, sx, sy - 4);
    });

    ctxSpectrum.shadowBlur = 0;

    // Metadata details
    ctxSpectrum.font = '10px Outfit, sans-serif';
    ctxSpectrum.fillStyle = state.theme === 'dark' ? '#94a3b8' : '#4b5563';
    ctxSpectrum.textAlign = 'left';
    ctxSpectrum.textBaseline = 'bottom';
    ctxSpectrum.fillText(`Freq Span: 0 - 2.5 kHz | RBW: 10 Hz`, PADDING, h - 10);
    
    ctxSpectrum.textAlign = 'right';
    const bw = scheme === 'ssb-sc' ? fm : 2 * fm;
    ctxSpectrum.fillText(`Measured BW: ${bw} Hz`, w - PADDING, h - 10);
}

// -------------------------------------------------------------
// 3D SIGNAL HELIX (IQ CASCADE ROTATING VISUALIZER)
// -------------------------------------------------------------
function draw3dHelix() {
    if (!canvas3d || !ctx3D || state.activeAnalysisView !== 'constellation3d') return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas3d.width / dpr;
    const h = canvas3d.height / dpr;

    const plotW = w - PADDING * 2;
    const plotH = h - PADDING * 2;
    const centerX = PADDING + plotW / 2;
    const centerY = PADDING + plotH / 2;

    // CRT screen backgrounds
    ctx3D.fillStyle = state.theme === 'dark' ? '#040810' : '#080e1a';
    ctx3D.fillRect(0, 0, w, h);

    // 3D projection constants
    const theta = state.theta3d; // horizontal rotation
    const phi = state.phi3d;     // vertical tilt angle

    // Coordinate projection function (3D -> 2D)
    // X is In-Phase, Y is Quadrature, Z is Time
    const project = (x3d, y3d, z3d) => {
        // Rotate horizontally around Z-axis (Time axis)
        const xRot = x3d * Math.cos(theta) - y3d * Math.sin(theta);
        const yTemp = x3d * Math.sin(theta) + y3d * Math.cos(theta);
        
        // Rotate vertically (tilt)
        const yRot = yTemp * Math.cos(phi) - z3d * Math.sin(phi);
        const zRot = yTemp * Math.sin(phi) + z3d * Math.cos(phi);
        
        // Map to 2D canvas coordinates
        const scale = 11.0; 
        const px = centerX + xRot * scale;
        const py = centerY - yRot * scale;
        
        return { x: px, y: py };
    };

    // Draw 3D coordinate reference axes lines
    ctx3D.lineWidth = 0.75;
    ctx3D.setLineDash([3, 3]);
    ctx3D.strokeStyle = 'rgba(255,255,255,0.2)';
    
    // Draw In-Phase Axis (I)
    ctx3D.beginPath();
    let p0 = project(-10, 0, 0);
    let p1 = project(10, 0, 0);
    ctx3D.moveTo(p0.x, p0.y); ctx3D.lineTo(p1.x, p1.y);
    ctx3D.stroke();
    
    ctx3D.font = '9px JetBrains Mono, monospace';
    ctx3D.fillStyle = state.theme === 'dark' ? '#94a3b8' : '#4b5563';
    ctx3D.textAlign = 'left';
    ctx3D.fillText('+I', p1.x + 3, p1.y);

    // Draw Quadrature Axis (Q)
    ctx3D.beginPath();
    p0 = project(0, -10, 0);
    p1 = project(0, 10, 0);
    ctx3D.moveTo(p0.x, p0.y); ctx3D.lineTo(p1.x, p1.y);
    ctx3D.stroke();
    ctx3D.fillText('+Q', p1.x + 3, p1.y);

    // Draw Time Axis (T)
    ctx3D.beginPath();
    p0 = project(0, 0, -8);
    p1 = project(0, 0, 8);
    ctx3D.moveTo(p0.x, p0.y); ctx3D.lineTo(p1.x, p1.y);
    ctx3D.stroke();
    ctx3D.fillText('+T (Time)', p1.x + 3, p1.y);
    
    ctx3D.setLineDash([]);

    // Plot Helix Points
    const helixPoints = 120;
    const tMaxSec = 0.012; // 12 ms window
    ctx3D.lineWidth = 1.75;
    ctx3D.strokeStyle = state.theme === 'dark' ? '#c084fc' : '#7c3aed';
    ctx3D.beginPath();

    for (let i = 0; i < helixPoints; i++) {
        // Calculate point time coordinates
        const t = (i / helixPoints) * tMaxSec;
        
        // Z-coordinate corresponds to time (shifted to center)
        const z3d = ((i / helixPoints) - 0.5) * 14.0; 

        // Modulating envelope E(t)
        let Et = 0.0;
        const mt = state.Am * Math.cos(2 * Math.PI * state.fm * t);
        
        if (state.scheme === 'am-fc') {
            Et = state.Ac + mt;
        } else if (state.scheme === 'am-sc') {
            Et = mt;
        } else {
            Et = state.Ac * state.Am / 2; // Flat circle for SSB
        }

        // Vector coordinates (In-Phase / Quadrature)
        const x3d = Et * Math.cos(2 * Math.PI * state.fc * t);
        const y3d = Et * Math.sin(2 * Math.PI * state.fc * t);

        const projPt = project(x3d, y3d, z3d);

        // Keep lines within monitor screen boundary
        if (projPt.x >= PADDING && projPt.x <= PADDING + plotW && projPt.y >= PADDING && projPt.y <= PADDING + plotH) {
            if (i === 0) ctx3D.moveTo(projPt.x, projPt.y); else ctx3D.lineTo(projPt.x, projPt.y);
        }
    }
    ctx3D.stroke();
}

// -------------------------------------------------------------
// 3D ANIMATION LOOP
// -------------------------------------------------------------
function animationLoop() {
    if (state.activeAnalysisView === 'constellation3d' && state.spin3d) {
        state.theta3d += 0.008; // slow continuous horizontal rotation
        draw3dHelix();
    }
    requestAnimationFrame(animationLoop);
}

// -------------------------------------------------------------
// CAUSAL INTERPOLATOR UTILITY
// -------------------------------------------------------------
function getEnvelopeValue(t, solverResult) {
    const { tValues, vValues } = solverResult;
    let low = 0;
    let high = tValues.length - 1;
    
    if (t <= tValues[0]) return vValues[0];
    if (t >= tValues[high]) return vValues[high];
    
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (tValues[mid] < t) {
            low = mid + 1;
        } else if (tValues[mid] > t) {
            high = mid - 1;
        } else {
            return vValues[mid];
        }
    }
    
    const t0 = tValues[high];
    const t1 = tValues[low];
    const v0 = vValues[high];
    const v1 = vValues[low];
    if (t1 === t0) return v0;
    return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
}

// -------------------------------------------------------------
// OBSERVATIONS LOG AND PDF EXPORT REPORT GENERATOR
// -------------------------------------------------------------
function setupObservationTable() {
    const btnRecord = document.getElementById('btn-record-obs');
    const btnClear = document.getElementById('btn-clear-table');
    const btnExport = document.getElementById('btn-export-csv');
    const btnPrint = document.getElementById('btn-print-report');

    btnRecord.addEventListener('click', () => {
        const m = state.Am / state.Ac;
        
        let Pt = 0;
        let efficiency = 0;
        if (state.scheme === 'am-fc') {
            Pt = (state.Ac * state.Ac / 2) * (1 + (m * m) / 2);
            efficiency = (m * m) / (2 + m * m) * 100;
        } else if (state.scheme === 'am-sc') {
            Pt = (state.Ac * state.Ac * state.Am * state.Am) / 8;
            efficiency = 100.0;
        } else {
            Pt = (state.Ac * state.Ac * state.Am * state.Am) / 16;
            efficiency = 100.0;
        }
        
        let status = 'Coherent Req';
        if (state.scheme === 'am-fc') {
            const tau = state.R * (state.C * 1e-6);
            const limit = Math.sqrt(1 - m*m) / (m * 2 * Math.PI * state.fm);
            
            status = 'Stable';
            if (m > 1.0) {
                status = 'Over-Modulated';
            } else if (tau > limit) {
                status = 'Diag. Clipping';
            } else if (tau < (1 / state.fc)) {
                status = 'High Ripple';
            }
        }

        let labelScheme = 'AM (DSB-FC)';
        if (state.scheme === 'am-sc') labelScheme = 'DSB-SC';
        if (state.scheme === 'ssb-sc') labelScheme = 'SSB-SC';

        const newRow = {
            id: state.observations.length + 1,
            type: labelScheme,
            Ac: state.Ac,
            Am: state.Am,
            m: state.scheme === 'am-fc' ? m.toFixed(2) : 'Suppr.',
            fc: state.fc,
            fm: state.fm,
            snr: state.snr >= 45 ? 'Clean' : `${state.snr} dB`,
            Pt: Pt.toFixed(2),
            eff: `${efficiency.toFixed(1)}%`,
            status: status
        };

        state.observations.push(newRow);
        renderObservationTable();
        
        btnRecord.textContent = '✔️ Logged!';
        setTimeout(() => {
            btnRecord.textContent = 'Record Table Row';
        }, 1200);
    });

    btnClear.addEventListener('click', () => {
        state.observations = [];
        renderObservationTable();
    });

    btnExport.addEventListener('click', () => {
        if (state.observations.length === 0) {
            alert('No data recorded yet. Record some values first.');
            return;
        }
        exportObservationsToCSV();
    });

    btnPrint.addEventListener('click', () => {
        window.print(); // triggers system printing overlay styled via media query CSS
    });
}

function renderObservationTable() {
    const tableBody = document.querySelector('#table-observations tbody');
    tableBody.innerHTML = '';

    state.observations.forEach(row => {
        const tr = document.createElement('tr');
        
        let statusColorClass = '';
        if (row.status === 'Over-Modulated' || row.status === 'Diag. Clipping') {
            statusColorClass = 'style="color: var(--accent-magenta); font-weight: 500;"';
        } else if (row.status === 'High Ripple' || row.status === 'Coherent Req') {
            statusColorClass = 'style="color: var(--accent-yellow); font-weight: 500;"';
        } else {
            statusColorClass = 'style="color: var(--accent-green); font-weight: 500;"';
        }

        tr.innerHTML = `
            <td>${row.id}</td>
            <td style="font-weight: 600;">${row.type}</td>
            <td>${row.Ac} V</td>
            <td>${row.Am} V</td>
            <td>${row.m}</td>
            <td>${row.fc} Hz</td>
            <td>${row.fm} Hz</td>
            <td>${row.snr}</td>
            <td>${row.Pt} W</td>
            <td>${row.eff}</td>
            <td ${statusColorClass}>${row.status}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function exportObservationsToCSV() {
    let csvContent = 'S.No.,Type,Ac (V),Am (V),Modulation Index,fc (Hz),fm (Hz),SNR (dB),Total Power Pt (W),Efficiency,Demodulator Status\r\n';
    
    state.observations.forEach(row => {
        csvContent += `${row.id},${row.type},${row.Ac},${row.Am},${row.m},${row.fc},${row.fm},${row.snr},${row.Pt},${row.eff},${row.status}\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'AM_Virtual_Lab_Observations.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// -------------------------------------------------------------
// VIVA VOCE QUIZ EVALUATION
// -------------------------------------------------------------
function setupQuiz() {
    const btnSubmit = document.getElementById('btn-submit-quiz');
    const quizForm = document.getElementById('quiz-form');
    const scoreCard = document.getElementById('quiz-score-card');
    const scoreNum = document.getElementById('quiz-score-num');
    const scoreSummary = document.getElementById('quiz-score-summary');

    const answers = {
        q1: {
            correct: 'b',
            explanation: 'Correct! The phase of a DSB-SC signal reverses by 180 degrees every time the baseband message crosses zero. This flips the RF carrier inside out, causing severe envelope distortion if rectified by a simple diode.'
        },
        q2: {
            correct: 'a',
            explanation: 'Correct! Efficiency η = m² / (2 + m²). For m = 0.5, η = 0.25 / (2 + 0.25) = 0.25 / 2.25 = 1/9 ≈ 11.1%.'
        },
        q3: {
            correct: 'b',
            explanation: 'Correct! In SSB-SC, since we filter out one complete sideband and suppress the carrier, we only transmit a single sideband tone. This takes exactly f_m Hz bandwidth, saving 50% spectrum compared to the 2 * f_m of DSB.'
        },
        q4: {
            correct: 'b',
            explanation: 'Correct! AWGN noise is distributed uniformly across the RF spectrum width, adding continuous random voltage ripples which effectively raises the visible average thermal noise floor.'
        },
        q5: {
            correct: 'a',
            explanation: 'Correct! To filter out high frequency carrier fluctuations while keeping the message smooth, the capacitor time constant RC must be much larger than the carrier cycle period (RC >> 1/fc).'
        }
    };

    btnSubmit.addEventListener('click', () => {
        let score = 0;
        
        document.querySelectorAll('.quiz-option-label').forEach(lbl => {
            lbl.classList.remove('correct', 'incorrect');
        });
        document.querySelectorAll('.quiz-feedback').forEach(fdb => {
            fdb.className = 'quiz-feedback';
            fdb.style.display = 'none';
        });

        for (let qKey in answers) {
            const selectedOpt = quizForm.elements[qKey].value;
            const feedbackBox = document.getElementById(`feedback-${qKey}`);

            if (!selectedOpt) {
                feedbackBox.textContent = `⚠️ Answer missing. Correct answer is (${answers[qKey].correct.toUpperCase()}).`;
                feedbackBox.className = 'quiz-feedback show-incorrect';
                continue;
            }

            const correctOpt = answers[qKey].correct;
            const targetLabel = document.querySelector(`.quiz-option-label[data-q="${qKey.charAt(1)}"][data-opt="${selectedOpt}"]`);

            if (selectedOpt === correctOpt) {
                score++;
                if (targetLabel) targetLabel.classList.add('correct');
                feedbackBox.textContent = answers[qKey].explanation;
                feedbackBox.className = 'quiz-feedback show-correct';
            } else {
                if (targetLabel) targetLabel.classList.add('incorrect');
                const correctLabel = document.querySelector(`.quiz-option-label[data-q="${qKey.charAt(1)}"][data-opt="${correctOpt}"]`);
                if (correctLabel) correctLabel.classList.add('correct');
                
                feedbackBox.textContent = `❌ Incorrect. Correct: (${correctOpt.toUpperCase()}). ${answers[qKey].explanation.slice(9)}`;
                feedbackBox.className = 'quiz-feedback show-incorrect';
            }
        }

        scoreNum.textContent = `${score} / 5`;
        if (score === 5) {
            scoreSummary.textContent = '🎉 Perfect score! You have successfully mastered the analog modulation lab concepts.';
            scoreCard.style.borderColor = 'var(--accent-green)';
            scoreNum.style.color = 'var(--accent-green)';
        } else if (score >= 3) {
            scoreSummary.textContent = '👍 Good job! You have a strong conceptual foundation. Check the feedback notes to master all items.';
            scoreCard.style.borderColor = 'var(--accent-cyan)';
            scoreNum.style.color = 'var(--accent-cyan)';
        } else {
            scoreSummary.textContent = '📚 Review the theory cards on the bench and the procedure notes, then try again!';
            scoreCard.style.borderColor = 'var(--accent-magenta)';
            scoreNum.style.color = 'var(--accent-magenta)';
        }

        scoreCard.style.display = 'block';
        scoreCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}
