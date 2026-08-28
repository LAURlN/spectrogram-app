/**
 * Real-Time 2D Spectrogram Audio Visualizer Engine
 * Powered by Web Audio API & HTML5 Canvas
 */

(function () {
  'use strict';

  // --- Colormap Definitions (256 RGB tuples) ---
  const COLORMAPS = {
    ultra_contrast: createUltraContrastLUT(),
    volcano_contrast: createVolcanoContrastLUT(),
    cyberpunk: createCyberpunkLUT(),
    viridis: createViridisLUT(),
    inferno: createInfernoLUT(),
    plasma: createPlasmaLUT(),
    magma: createMagmaLUT(),
    matrix: createMatrixLUT(),
    rainbow: createRainbowLUT(),
    grayscale: createGrayscaleLUT()
  };

  // --- Note Name Constants ---
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // --- State Variables ---
  let audioCtx = null;
  let pianoAudioCtx = null;
  let analyserNode = null;
  let lowEqNode = null;
  let midEqNode = null;
  let highEqNode = null;
  let mediaStream = null;
  let sourceNode = null;
  let animFrameId = null;

  let isRunning = false;
  let isPaused = false;
  let sampleRate = 44100;

  // Configuration settings
  const config = {
    fftSize: 8192,
    smoothing: 0.5,
    colormap: 'ultra_contrast',
    volumeCurve: 'steep',
    scale: 'logarithmic',
    maxFreq: 8000,
    speed: 2,
    gain: 1.0,
    noiseGate: -90,
    contrast: 1.2,
    noteSensitivity: 3,
    tunerTolerance: 35,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    showOscilloscope: true,
    showSpectrumBar: true,
    showCanvasNotes: true,
    showTunerHUD: true,
    showMultiNoteBar: false,
    deviceId: ''
  };

  // Pitch Detection & Tuner State
  let detectedPitchHz = 0;
  let detectedPitchConfidence = 0;

  // Auto-Adjust Dynamic State
  let smoothedNoiseFloor = -75.0;
  let smoothedPeakSignal = -20.0;
  let effectiveGain = 1.0;
  let effectiveNoiseGate = -75.0;
  let effectiveContrast = 1.3;

  // Canvas elements
  let spectroCanvas = null;
  let spectroCtx = null;
  let overlayCanvas = null;
  let overlayCtx = null;
  let offscreenCanvas = null;
  let offscreenCtx = null;

  // Audio Data Buffers
  let frequencyData = null;
  let timeData = null;

  // FPS tracking
  let lastFpsCalcTime = performance.now();
  let frameCount = 0;
  let currentFps = 60;

  // DOM Elements
  const DOM = {};

  // Initialize App on DOM Load
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDOMElements();
    setupCanvases();
    setupEventListeners();
    updateColormapPreview();
    renderYAxis();
    renderXAxis();
    renderLegend();
    loadSavedProfile();
    initPianoKeyboard();

    // Auto-collapse side panels on mobile screens for full-screen visualizer display
    if (window.innerWidth <= 768) {
      if (DOM.controlPanel) DOM.controlPanel.classList.add('collapsed');
      if (DOM.pianoPanel) DOM.pianoPanel.classList.add('collapsed');
      if (DOM.toggleSidebarBtn) DOM.toggleSidebarBtn.classList.remove('active');
      if (DOM.togglePianoPanelBtn) DOM.togglePianoPanelBtn.classList.remove('active');
    }

    resizeCanvases();
  }

  function cacheDOMElements() {
    DOM.toggleMicBtn = document.getElementById('toggleMicBtn');
    DOM.toggleMicBtnText = document.getElementById('toggleMicBtnText');
    DOM.freezeBtn = document.getElementById('freezeBtn');
    DOM.exportBtn = document.getElementById('exportBtn');
    DOM.controlPanel = document.querySelector('.control-panel');
    DOM.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    DOM.togglePianoPanelBtn = document.getElementById('togglePianoPanelBtn');
    DOM.pianoPanel = document.getElementById('pianoPanel');
    DOM.closePianoPanelBtn = document.getElementById('closePianoPanelBtn');
    DOM.overlayStartBtn = document.getElementById('overlayStartBtn');
    DOM.startOverlay = document.getElementById('startOverlay');
    DOM.micStatus = document.getElementById('micStatus');
    DOM.statusText = document.getElementById('statusText');
    DOM.meterBar = document.getElementById('meterBar');
    DOM.meterValue = document.getElementById('meterValue');

    DOM.audioDeviceSelect = document.getElementById('audioDeviceSelect');
    DOM.fftSizeSelect = document.getElementById('fftSizeSelect');
    DOM.smoothingRange = document.getElementById('smoothingRange');
    DOM.smoothingVal = document.getElementById('smoothingVal');

    DOM.colormapSelect = document.getElementById('colormapSelect');
    DOM.colormapPreview = document.getElementById('colormapPreview');
    DOM.scaleSelect = document.getElementById('scaleSelect');
    DOM.maxFreqSelect = document.getElementById('maxFreqSelect');
    DOM.maxFreqVal = document.getElementById('maxFreqVal');
    DOM.speedRange = document.getElementById('speedRange');
    DOM.speedVal = document.getElementById('speedVal');

    DOM.gainRange = document.getElementById('gainRange');
    DOM.gainVal = document.getElementById('gainVal');
    DOM.noiseGateRange = document.getElementById('noiseGateRange');
    DOM.noiseGateVal = document.getElementById('noiseGateVal');
    DOM.contrastRange = document.getElementById('contrastRange');
    DOM.contrastVal = document.getElementById('contrastVal');
    DOM.showOscilloscope = document.getElementById('showOscilloscope');
    DOM.showSpectrumBar = document.getElementById('showSpectrumBar');

    DOM.spectrogramCanvas = document.getElementById('spectrogramCanvas');
    DOM.overlayCanvas = document.getElementById('overlayCanvas');
    DOM.canvasWrapper = document.getElementById('canvasWrapper');
    DOM.yAxisContainer = document.getElementById('yAxisContainer');
    DOM.xAxisContainer = document.getElementById('xAxisContainer');

    DOM.inspectorTooltip = document.getElementById('inspectorTooltip');
    DOM.tooltipFreq = document.getElementById('tooltipFreq');
    DOM.tooltipNote = document.getElementById('tooltipNote');
    DOM.tooltipDb = document.getElementById('tooltipDb');
    DOM.tooltipTime = document.getElementById('tooltipTime');
    DOM.crosshairH = document.getElementById('crosshairH');
    DOM.crosshairV = document.getElementById('crosshairV');

    DOM.calibrateBtn = document.getElementById('calibrateBtn');
    DOM.runCalibBtn = document.getElementById('runCalibBtn');
    DOM.calibrationModal = document.getElementById('calibrationModal');
    DOM.modalCloseBtn = document.getElementById('modalCloseBtn');
    DOM.cancelCalibBtn = document.getElementById('cancelCalibBtn');
    DOM.startCalibStepBtn = document.getElementById('startCalibStepBtn');
    DOM.wizStepTag = document.getElementById('wizStepTag');
    DOM.wizTitle = document.getElementById('wizTitle');
    DOM.wizDesc = document.getElementById('wizDesc');
    DOM.countdownBar = document.getElementById('countdownBar');
    DOM.countdownNumber = document.getElementById('countdownNumber');
    DOM.wizPeakDb = document.getElementById('wizPeakDb');
    DOM.wizMeterFill = document.getElementById('wizMeterFill');
    DOM.calStatusBadge = document.getElementById('calStatusBadge');
    DOM.calDescText = document.getElementById('calDescText');
    DOM.calDetails = document.getElementById('calDetails');
    DOM.calGateVal = document.getElementById('calGateVal');
    DOM.calRangeVal = document.getElementById('calRangeVal');
    DOM.calGainVal = document.getElementById('calGainVal');

    DOM.appMenuBtn = document.getElementById('appMenuBtn');
    DOM.menuDrawerOverlay = document.getElementById('menuDrawerOverlay');
    DOM.closeMenuBtn = document.getElementById('closeMenuBtn');
    DOM.selectSpectrogramBtn = document.getElementById('selectSpectrogramBtn');
    DOM.selectGame2Btn = document.getElementById('selectGame2Btn');
    DOM.viewSpectrogram = document.getElementById('viewSpectrogram');
    DOM.viewGame2 = document.getElementById('viewGame2');

    DOM.pitchTunerHud = document.getElementById('pitchTunerHud');
    DOM.tunerNoteBadge = document.getElementById('tunerNoteBadge');
    DOM.tunerFreqVal = document.getElementById('tunerFreqVal');
    DOM.tunerTargetVal = document.getElementById('tunerTargetVal');
    DOM.tunerNeedle = document.getElementById('tunerNeedle');
    DOM.tunerStatusBadge = document.getElementById('tunerStatusBadge');
    DOM.multiNoteList = document.getElementById('multiNoteList');
    DOM.multiNoteBarContainer = document.getElementById('multiNoteBar');
    DOM.showCanvasNotes = document.getElementById('showCanvasNotes');
    DOM.showTunerHUD = document.getElementById('showTunerHUD');
    DOM.showMultiNoteBar = document.getElementById('showMultiNoteBar');
    DOM.volumeCurveSelect = document.getElementById('volumeCurveSelect');

    DOM.noteSensRange = document.getElementById('noteSensRange');
    DOM.noteSensVal = document.getElementById('noteSensVal');
    DOM.tunerToleranceSelect = document.getElementById('tunerToleranceSelect');
    DOM.eqLowRange = document.getElementById('eqLowRange');
    DOM.eqLowVal = document.getElementById('eqLowVal');
    DOM.eqMidRange = document.getElementById('eqMidRange');
    DOM.eqMidVal = document.getElementById('eqMidVal');
    DOM.eqHighRange = document.getElementById('eqHighRange');
    DOM.eqHighVal = document.getElementById('eqHighVal');

    DOM.openPianoBtn = document.getElementById('openPianoBtn');
    DOM.pianoModalOverlay = document.getElementById('pianoModalOverlay');
    DOM.closePianoBtn = document.getElementById('closePianoBtn');
    DOM.pianoKeyboard = document.getElementById('pianoKeyboard');
    DOM.pianoSustainCheck = document.getElementById('pianoSustainCheck');
    DOM.pianoOctaveDown = document.getElementById('pianoOctaveDown');
    DOM.pianoOctaveUp = document.getElementById('pianoOctaveUp');
    DOM.pianoOctaveText = document.getElementById('pianoOctaveText');

    DOM.dominantFreqText = document.getElementById('dominantFreqText');
    DOM.sampleRateText = document.getElementById('sampleRateText');
    DOM.fpsText = document.getElementById('fpsText');
    DOM.legendBar = document.getElementById('legendBar');

    // Game 2 Spectral Echo Matcher Elements
    DOM.g2RecordRefBtn = document.getElementById('g2RecordRefBtn');
    DOM.g2RecordRefBtnText = document.getElementById('g2RecordRefBtnText');
    DOM.g2PlayRefBtn = document.getElementById('g2PlayRefBtn');
    DOM.g2StartMatchBtn = document.getElementById('g2StartMatchBtn');
    DOM.g2StartMatchBtnText = document.getElementById('g2StartMatchBtnText');
    DOM.g2ResetBtn = document.getElementById('g2ResetBtn');
    DOM.game2StatusText = document.getElementById('game2StatusText');
    DOM.targetDurationBadge = document.getElementById('targetDurationBadge');
    DOM.attemptStatusBadge = document.getElementById('attemptStatusBadge');
    DOM.targetNoteBadge = document.getElementById('targetNoteBadge');
    DOM.attemptNoteBadge = document.getElementById('attemptNoteBadge');
    DOM.g2ScoreVal = document.getElementById('g2ScoreVal');
    DOM.g2RatingBadge = document.getElementById('g2RatingBadge');
    DOM.g2ScoreBarFill = document.getElementById('g2ScoreBarFill');
    DOM.targetSpectrogramCanvas = document.getElementById('targetSpectrogramCanvas');
    DOM.attemptSpectrogramCanvas = document.getElementById('attemptSpectrogramCanvas');
  }

  function setupCanvases() {
    spectroCanvas = DOM.spectrogramCanvas;
    spectroCtx = spectroCanvas.getContext('2d', { alpha: false });
    overlayCanvas = DOM.overlayCanvas;
    overlayCtx = overlayCanvas.getContext('2d');

    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
  }

  function resizeCanvases() {
    const rect = DOM.canvasWrapper.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (width === 0 || height === 0) return;

    // Save existing offscreen image content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = offscreenCanvas.width || width;
    tempCanvas.height = offscreenCanvas.height || height;
    const tempCtx = tempCanvas.getContext('2d');
    if (offscreenCanvas.width > 0) {
      tempCtx.drawImage(offscreenCanvas, 0, 0);
    }

    spectroCanvas.width = width;
    spectroCanvas.height = height;
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;

    // Background fill
    offscreenCtx.fillStyle = '#030509';
    offscreenCtx.fillRect(0, 0, width, height);

    // Restore existing content stretched to new dimensions
    if (tempCanvas.width > 0 && tempCanvas.height > 0) {
      offscreenCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, width, height);
    }

    spectroCtx.drawImage(offscreenCanvas, 0, 0);
    renderYAxis();
    renderXAxis();
    resizeGame2Canvases();
  }

  function setupEventListeners() {
    DOM.toggleMicBtn.addEventListener('click', toggleMicrophone);
    DOM.overlayStartBtn.addEventListener('click', toggleMicrophone);
    DOM.startOverlay.addEventListener('click', (e) => {
      if (!isRunning) toggleMicrophone();
    });

    DOM.freezeBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      DOM.freezeBtn.classList.toggle('active', isPaused);
      DOM.freezeBtn.querySelector('span').textContent = isPaused ? 'Resume' : 'Freeze';
      updateStatusBadge();
    });

    DOM.exportBtn.addEventListener('click', exportImage);

    DOM.calibrateBtn.addEventListener('click', openCalibrationModal);
    DOM.runCalibBtn.addEventListener('click', openCalibrationModal);
    DOM.modalCloseBtn.addEventListener('click', closeCalibrationModal);
    DOM.cancelCalibBtn.addEventListener('click', closeCalibrationModal);

    // Inputs & Controls
    DOM.audioDeviceSelect.addEventListener('change', (e) => {
      config.deviceId = e.target.value;
      if (isRunning) restartMicrophone();
    });

    DOM.fftSizeSelect.addEventListener('change', (e) => {
      config.fftSize = parseInt(e.target.value, 10);
      if (analyserNode) {
        analyserNode.fftSize = config.fftSize;
        frequencyData = new Float32Array(analyserNode.frequencyBinCount);
        timeData = new Uint8Array(analyserNode.fftSize);
      }
    });

    DOM.smoothingRange.addEventListener('input', (e) => {
      config.smoothing = parseFloat(e.target.value);
      DOM.smoothingVal.textContent = config.smoothing.toFixed(2);
      if (analyserNode) analyserNode.smoothingTimeConstant = config.smoothing;
    });

    DOM.colormapSelect.addEventListener('change', (e) => {
      config.colormap = e.target.value;
      updateColormapPreview();
      renderLegend();
    });

    DOM.volumeCurveSelect.addEventListener('change', (e) => {
      config.volumeCurve = e.target.value;
    });

    DOM.scaleSelect.addEventListener('change', (e) => {
      config.scale = e.target.value;
      renderYAxis();
    });

    DOM.maxFreqSelect.addEventListener('change', (e) => {
      config.maxFreq = parseInt(e.target.value, 10);
      DOM.maxFreqVal.textContent = config.maxFreq >= 1000 ? `${(config.maxFreq / 1000).toFixed(0)} kHz` : `${config.maxFreq} Hz`;
      renderYAxis();
    });

    DOM.speedRange.addEventListener('input', (e) => {
      config.speed = parseInt(e.target.value, 10);
      DOM.speedVal.textContent = `${config.speed} px/frame`;
      renderXAxis();
    });

    DOM.gainRange.addEventListener('input', (e) => {
      config.gain = parseFloat(e.target.value);
      DOM.gainVal.textContent = `${config.gain.toFixed(1)}x`;
    });

    DOM.noiseGateRange.addEventListener('input', (e) => {
      config.noiseGate = parseInt(e.target.value, 10);
      DOM.noiseGateVal.textContent = `${config.noiseGate} dB`;
    });

    DOM.contrastRange.addEventListener('input', (e) => {
      config.contrast = parseFloat(e.target.value);
      DOM.contrastVal.textContent = config.contrast.toFixed(1);
    });

    if (DOM.noteSensRange) {
      DOM.noteSensRange.addEventListener('input', (e) => {
        config.noteSensitivity = parseInt(e.target.value, 10);
        const labels = ['Strict (1/5)', 'Moderate (2/5)', 'Balanced (3/5)', 'Sensitive (4/5)', 'Max Sensitive (5/5)'];
        DOM.noteSensVal.textContent = labels[config.noteSensitivity - 1];
      });
    }

    if (DOM.tunerToleranceSelect) {
      DOM.tunerToleranceSelect.addEventListener('change', (e) => {
        config.tunerTolerance = parseInt(e.target.value, 10);
      });
    }

    if (DOM.eqLowRange) {
      DOM.eqLowRange.addEventListener('input', (e) => {
        config.eqLow = parseInt(e.target.value, 10);
        DOM.eqLowVal.textContent = `${config.eqLow > 0 ? '+' : ''}${config.eqLow} dB`;
        if (lowEqNode && audioCtx) lowEqNode.gain.setValueAtTime(config.eqLow, audioCtx.currentTime);
      });
    }

    if (DOM.eqMidRange) {
      DOM.eqMidRange.addEventListener('input', (e) => {
        config.eqMid = parseInt(e.target.value, 10);
        DOM.eqMidVal.textContent = `${config.eqMid > 0 ? '+' : ''}${config.eqMid} dB`;
        if (midEqNode && audioCtx) midEqNode.gain.setValueAtTime(config.eqMid, audioCtx.currentTime);
      });
    }

    if (DOM.eqHighRange) {
      DOM.eqHighRange.addEventListener('input', (e) => {
        config.eqHigh = parseInt(e.target.value, 10);
        DOM.eqHighVal.textContent = `${config.eqHigh > 0 ? '+' : ''}${config.eqHigh} dB`;
        if (highEqNode && audioCtx) highEqNode.gain.setValueAtTime(config.eqHigh, audioCtx.currentTime);
      });
    }

    DOM.showOscilloscope.addEventListener('change', (e) => {
      config.showOscilloscope = e.target.checked;
    });

    DOM.showSpectrumBar.addEventListener('change', (e) => {
      config.showSpectrumBar = e.target.checked;
    });

    if (DOM.showCanvasNotes) {
      DOM.showCanvasNotes.addEventListener('change', (e) => {
        config.showCanvasNotes = e.target.checked;
      });
    }

    if (DOM.showTunerHUD) {
      DOM.showTunerHUD.addEventListener('change', (e) => {
        config.showTunerHUD = e.target.checked;
        if (DOM.pitchTunerHud) {
          DOM.pitchTunerHud.classList.toggle('hidden', !config.showTunerHUD);
        }
      });
    }

    if (DOM.showMultiNoteBar) {
      DOM.showMultiNoteBar.addEventListener('change', (e) => {
        config.showMultiNoteBar = e.target.checked;
        if (DOM.multiNoteBarContainer) {
          DOM.multiNoteBarContainer.classList.toggle('hidden', !config.showMultiNoteBar);
        }
      });
    }

    // Collapsible Panel Handlers (Left Settings & Right Piano)
    if (DOM.toggleSidebarBtn) {
      DOM.toggleSidebarBtn.addEventListener('click', () => {
        if (DOM.controlPanel) {
          DOM.controlPanel.classList.toggle('collapsed');
          DOM.toggleSidebarBtn.classList.toggle('active', !DOM.controlPanel.classList.contains('collapsed'));
          setTimeout(resizeCanvases, 260);
        }
      });
    }

    if (DOM.togglePianoPanelBtn) {
      DOM.togglePianoPanelBtn.addEventListener('click', () => {
        if (DOM.pianoPanel) {
          DOM.pianoPanel.classList.toggle('collapsed');
          DOM.togglePianoPanelBtn.classList.toggle('active', !DOM.pianoPanel.classList.contains('collapsed'));
          setTimeout(resizeCanvases, 260);
        }
      });
    }

    if (DOM.closePianoPanelBtn) {
      DOM.closePianoPanelBtn.addEventListener('click', () => {
        if (DOM.pianoPanel) {
          DOM.pianoPanel.classList.add('collapsed');
          if (DOM.togglePianoPanelBtn) DOM.togglePianoPanelBtn.classList.remove('active');
          setTimeout(resizeCanvases, 260);
        }
      });
    }

    if (DOM.pianoOctaveDown) {
      DOM.pianoOctaveDown.addEventListener('click', () => {
        if (pianoBaseOctave > 2) {
          pianoBaseOctave--;
          stopAllPianoVoices();
          initPianoKeyboard();
        }
      });
    }

    if (DOM.pianoOctaveUp) {
      DOM.pianoOctaveUp.addEventListener('click', () => {
        if (pianoBaseOctave < 6) {
          pianoBaseOctave++;
          stopAllPianoVoices();
          initPianoKeyboard();
        }
      });
    }

    // Computer Keyboard Shortcuts for Piano
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (DOM.pianoPanel && !DOM.pianoPanel.classList.contains('collapsed')) {
        const key = e.key === ';' ? ';' : e.key.toUpperCase();
        const keyElem = document.querySelector(`.piano-key[data-shortcut="${key}"]`);
        if (keyElem) {
          const freqHz = parseFloat(keyElem.dataset.freq);
          const noteName = keyElem.dataset.note;
          handlePianoKeyPress(freqHz, noteName, keyElem);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (DOM.pianoPanel && !DOM.pianoPanel.classList.contains('collapsed')) {
        const key = e.key === ';' ? ';' : e.key.toUpperCase();
        const keyElem = document.querySelector(`.piano-key[data-shortcut="${key}"]`);
        if (keyElem) {
          const freqHz = parseFloat(keyElem.dataset.freq);
          handlePianoKeyRelease(freqHz, keyElem);
        }
      }
    });

    // Inspector mouse hover
    DOM.canvasWrapper.addEventListener('mousemove', handleMouseMove);
    DOM.canvasWrapper.addEventListener('mouseleave', handleMouseLeave);

    // Mobile Background / Tab Switch Lifecycle Management
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Tab moved to background: disable audio tracks & suspend context to release phone mic hardware
        if (isRunning && mediaStream) {
          mediaStream.getAudioTracks().forEach(track => { track.enabled = false; });
        }
        if (audioCtx && audioCtx.state === 'running') {
          audioCtx.suspend().catch(() => {});
        }
      } else if (document.visibilityState === 'visible') {
        // Tab returned to foreground: re-enable tracks & resume context
        if (isRunning) {
          if (mediaStream) {
            mediaStream.getAudioTracks().forEach(track => { track.enabled = true; });
          }
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
        }
      }
    });

    window.addEventListener('pagehide', () => {
      stopMicrophone();
    });

    window.addEventListener('beforeunload', () => {
      stopMicrophone();
    });

    // Game Selector Hamburger Menu & Mode Switcher Handlers
    document.querySelectorAll('.app-menu-btn').forEach(btn => {
      btn.addEventListener('click', openMenuDrawer);
    });
    if (DOM.closeMenuBtn) {
      DOM.closeMenuBtn.addEventListener('click', closeMenuDrawer);
    }
    if (DOM.menuDrawerOverlay) {
      DOM.menuDrawerOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.menuDrawerOverlay) closeMenuDrawer();
      });
    }
    if (DOM.selectSpectrogramBtn) {
      DOM.selectSpectrogramBtn.addEventListener('click', () => switchAppMode('spectrogram'));
    }
    if (DOM.selectGame2Btn) {
      DOM.selectGame2Btn.addEventListener('click', () => switchAppMode('game2'));
    }

    // Game 2 Control Event Listeners
    if (DOM.g2RecordRefBtn) {
      DOM.g2RecordRefBtn.addEventListener('click', g2ToggleRecordRef);
    }
    if (DOM.g2PlayRefBtn) {
      DOM.g2PlayRefBtn.addEventListener('click', g2PlayRef);
    }
    if (DOM.g2StartMatchBtn) {
      DOM.g2StartMatchBtn.addEventListener('click', g2ToggleMatch);
    }
    if (DOM.g2ResetBtn) {
      DOM.g2ResetBtn.addEventListener('click', g2Reset);
    }
  }

  let currentAppMode = 'spectrogram'; // 'spectrogram' | 'game2'

  function openMenuDrawer() {
    if (DOM.menuDrawerOverlay) {
      DOM.menuDrawerOverlay.classList.remove('hidden');
    }
  }

  function closeMenuDrawer() {
    if (DOM.menuDrawerOverlay) {
      DOM.menuDrawerOverlay.classList.add('hidden');
    }
  }

  function switchAppMode(mode) {
    currentAppMode = mode;
    if (mode === 'spectrogram') {
      if (DOM.viewSpectrogram) DOM.viewSpectrogram.classList.remove('hidden');
      if (DOM.viewGame2) DOM.viewGame2.classList.add('hidden');
      if (DOM.selectSpectrogramBtn) DOM.selectSpectrogramBtn.classList.add('active');
      if (DOM.selectGame2Btn) DOM.selectGame2Btn.classList.remove('active');
      setTimeout(resizeCanvases, 100);
    } else if (mode === 'game2') {
      if (DOM.viewSpectrogram) DOM.viewSpectrogram.classList.add('hidden');
      if (DOM.viewGame2) DOM.viewGame2.classList.remove('hidden');
      if (DOM.selectSpectrogramBtn) DOM.selectSpectrogramBtn.classList.remove('active');
      if (DOM.selectGame2Btn) DOM.selectGame2Btn.classList.add('active');
      setTimeout(() => {
        resizeGame2Canvases();
      }, 100);
    }
    closeMenuDrawer();
  }

  // --- Audio Engine ---
  async function populateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      
      DOM.audioDeviceSelect.innerHTML = '<option value="">Default Microphone</option>';
      audioInputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        DOM.audioDeviceSelect.appendChild(option);
      });
    } catch (err) {
      console.warn('Could not enumerate audio devices:', err);
    }
  }

  async function toggleMicrophone() {
    if (isRunning) {
      stopMicrophone();
    } else {
      await startMicrophone();
    }
  }

  async function startMicrophone() {
    // Immediately hide the overlay on user gesture so the UI never appears stuck!
    if (DOM.startOverlay) {
      DOM.startOverlay.classList.add('hidden');
    }

    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      audioCtx.onstatechange = () => {
        if (audioCtx && audioCtx.state === 'suspended' && isRunning && !isPaused && document.visibilityState === 'visible') {
          audioCtx.resume().catch(() => {});
        }
      };
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      sampleRate = audioCtx.sampleRate;
      DOM.sampleRateText.textContent = `${sampleRate} Hz`;

      let constraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      if (config.deviceId) {
        constraints.audio.deviceId = { exact: config.deviceId };
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (errConstraint) {
        console.warn('Exact deviceId constraint failed, falling back to basic audio:', errConstraint);
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
      }

      sourceNode = audioCtx.createMediaStreamSource(mediaStream);

      // Create 3-Band BiquadFilter Hardware EQ Nodes
      lowEqNode = audioCtx.createBiquadFilter();
      lowEqNode.type = 'lowshelf';
      lowEqNode.frequency.value = 250;
      lowEqNode.gain.value = config.eqLow;

      midEqNode = audioCtx.createBiquadFilter();
      midEqNode.type = 'peaking';
      midEqNode.frequency.value = 1000;
      midEqNode.Q.value = 1.0;
      midEqNode.gain.value = config.eqMid;

      highEqNode = audioCtx.createBiquadFilter();
      highEqNode.type = 'highshelf';
      highEqNode.frequency.value = 4000;
      highEqNode.gain.value = config.eqHigh;

      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = config.fftSize;
      analyserNode.smoothingTimeConstant = config.smoothing;
      analyserNode.minDecibels = -100;
      analyserNode.maxDecibels = 0;

      // Connect Audio Graph Chain: Source -> Low EQ -> Mid EQ -> High EQ -> AnalyserNode
      sourceNode.connect(lowEqNode);
      lowEqNode.connect(midEqNode);
      midEqNode.connect(highEqNode);
      highEqNode.connect(analyserNode);

      frequencyData = new Float32Array(analyserNode.frequencyBinCount);
      timeData = new Uint8Array(analyserNode.fftSize);

      isRunning = true;
      isPaused = false;

      DOM.freezeBtn.disabled = false;
      DOM.toggleMicBtnText.textContent = 'Stop';
      DOM.toggleMicBtn.classList.replace('btn-primary', 'btn-secondary');

      updateStatusBadge();
      populateAudioDevices();

      // Start render loop
      if (!animFrameId) {
        lastFpsCalcTime = performance.now();
        animFrameId = requestAnimationFrame(renderLoop);
      }
    } catch (err) {
      console.error('Error starting microphone input:', err);
      if (DOM.startOverlay) DOM.startOverlay.classList.remove('hidden');
      alert(`Could not access microphone: ${err.message}. Please grant microphone permissions in your browser.`);
    }
  }

  function stopMicrophone() {
    isRunning = false;
    isPaused = false;

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    DOM.freezeBtn.disabled = true;
    DOM.toggleMicBtnText.textContent = 'Mic';
    DOM.toggleMicBtn.classList.replace('btn-secondary', 'btn-primary');
    DOM.meterBar.style.width = '0%';
    DOM.meterValue.textContent = '-∞ dB';

    updateStatusBadge();
  }

  async function restartMicrophone() {
    stopMicrophone();
    await startMicrophone();
  }

  function updateStatusBadge() {
    if (!DOM.micStatus || !DOM.statusText) return;
    DOM.micStatus.className = 'mic-status-badge';
    if (!isRunning) {
      DOM.micStatus.classList.add('idled');
      DOM.statusText.textContent = 'Idle';
    } else if (isPaused) {
      DOM.micStatus.classList.add('paused');
      DOM.statusText.textContent = 'Paused';
    } else {
      DOM.micStatus.classList.add('active');
      DOM.statusText.textContent = 'Active';
    }
  }

  // --- Rendering Pipeline ---
  function renderLoop(now) {
    animFrameId = requestAnimationFrame(renderLoop);

    // FPS Counter
    frameCount++;
    if (now - lastFpsCalcTime >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsCalcTime));
      DOM.fpsText.textContent = `${currentFps} FPS`;
      frameCount = 0;
      lastFpsCalcTime = now;
    }

    if (isRunning && analyserNode) {
      if (mediaStream) {
        const tracks = mediaStream.getAudioTracks();
        if (!tracks.length || tracks[0].readyState === 'ended') {
          stopMicrophone();
          return;
        }
      }
      if (audioCtx && audioCtx.state === 'suspended' && document.visibilityState === 'visible') {
        audioCtx.resume().catch(() => {});
      }

      analyserNode.getFloatFrequencyData(frequencyData);
      analyserNode.getByteTimeDomainData(timeData);

      // Process Game 2 Spectral Matcher if active
      processGame2LiveFrame(frequencyData);

      // Update Audio Level Meter
      updateAudioLevelMeter();

      // Peak Dominant Frequency
      updateDominantFrequency();

      // Pitch Detection & Tuner HUD Update
      detectPitchAndTuning();

      // Process Calibration Frame if active
      if (calib.active) {
        processCalibrationFrame();
      }

      // Process Spectrogram Waterfall frame
      if (!isPaused) {
        drawSpectrogramColumn();
      }
    }

    // Render Overlay Canvas (Waveform, Spectrum Bar)
    drawOverlays();
  }

  function setAutoAdjust(enabled) {
    config.autoAdjust = !!enabled;
    if (DOM.autoAdjustToggle) DOM.autoAdjustToggle.checked = config.autoAdjust;
    if (DOM.autoAdjustBtn) {
      DOM.autoAdjustBtn.classList.toggle('active', config.autoAdjust);
      DOM.autoAdjustBtnText.textContent = config.autoAdjust ? 'Auto Adjust: ON' : 'Auto Adjust: OFF';
    }
    if (DOM.autoAdjustActiveBadge) {
      DOM.autoAdjustActiveBadge.className = config.autoAdjust ? 'badge-active' : 'badge-active off';
      DOM.autoAdjustActiveBadge.textContent = config.autoAdjust ? 'ACTIVE' : 'OFF';
    }
    if (DOM.autoAdjustCard) {
      DOM.autoAdjustCard.classList.toggle('disabled', !config.autoAdjust);
    }
    if (!config.autoAdjust) {
      DOM.gainVal.textContent = `${config.gain.toFixed(1)}x`;
      DOM.noiseGateVal.textContent = `${config.noiseGate} dB`;
      DOM.contrastVal.textContent = `${config.contrast.toFixed(1)}`;
    }
  }

  function processAutoAdjust() {
    if (!frequencyData) return;
    const numBins = frequencyData.length;
    const nyquist = sampleRate / 2;
    const maxBinIndex = Math.floor((config.maxFreq / nyquist) * numBins);

    let maxDb = -100;
    let validBins = [];

    for (let i = 1; i < maxBinIndex; i++) {
      const db = frequencyData[i];
      if (db > maxDb) maxDb = db;
      if (db > -98) validBins.push(db);
    }

    validBins.sort((a, b) => a - b);
    let currentNoiseFloor = -85.0;
    if (validBins.length > 5) {
      const p15Index = Math.floor(validBins.length * 0.15);
      currentNoiseFloor = validBins[p15Index];
    }

    // Exponential Moving Average Smoothing
    if (maxDb > smoothedPeakSignal) {
      smoothedPeakSignal = smoothedPeakSignal * 0.7 + maxDb * 0.3; // Fast attack
    } else {
      smoothedPeakSignal = smoothedPeakSignal * 0.98 + maxDb * 0.02; // Slow decay
    }

    smoothedNoiseFloor = smoothedNoiseFloor * 0.98 + currentNoiseFloor * 0.02;

    if (smoothedPeakSignal < smoothedNoiseFloor + 12) {
      smoothedPeakSignal = smoothedNoiseFloor + 12;
    }

    effectiveNoiseGate = Math.min(-30, Math.max(-95, smoothedNoiseFloor + 4.5));
    const dynamicRange = Math.max(15, smoothedPeakSignal - effectiveNoiseGate);

    effectiveGain = Math.min(5.0, Math.max(0.6, 90.0 / dynamicRange));
    effectiveContrast = 1.3;

    if (DOM.autoNoiseFloorVal) DOM.autoNoiseFloorVal.textContent = `${effectiveNoiseGate.toFixed(1)} dB`;
    if (DOM.autoPeakSignalVal) DOM.autoPeakSignalVal.textContent = `${smoothedPeakSignal.toFixed(1)} dB`;
    
    if (config.autoAdjust) {
      DOM.gainVal.textContent = `${effectiveGain.toFixed(1)}x (Auto)`;
      DOM.noiseGateVal.textContent = `${effectiveNoiseGate.toFixed(1)} dB (Auto)`;
      DOM.contrastVal.textContent = `${effectiveContrast.toFixed(1)} (Auto)`;
    }
  }

  function updateAudioLevelMeter() {
    if (!timeData) return;
    let sumSquares = 0;
    for (let i = 0; i < timeData.length; i++) {
      const norm = (timeData[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / timeData.length);
    const db = Math.max(-100, 20 * Math.log10(rms || 0.00001));

    const percent = Math.min(100, Math.max(0, (db + 80) * 1.25));
    DOM.meterBar.style.width = `${percent}%`;
    DOM.meterValue.textContent = `${db.toFixed(1)} dB`;
  }

  function updateDominantFrequency() {
    if (!frequencyData) return;
    let maxDb = -Infinity;
    let maxBin = 0;
    const nyquist = sampleRate / 2;
    const maxBinIndex = Math.floor((config.maxFreq / nyquist) * frequencyData.length);

    for (let i = 1; i < maxBinIndex; i++) { // Skip DC offset bin 0
      if (frequencyData[i] > maxDb) {
        maxDb = frequencyData[i];
        maxBin = i;
      }
    }

    if (maxDb > -75) {
      const freqHz = Math.round(maxBin * (sampleRate / config.fftSize));
      const note = freqToNote(freqHz);
      DOM.dominantFreqText.textContent = `${freqHz} Hz (${note})`;
    } else {
      DOM.dominantFreqText.textContent = '--- Hz (---)';
    }
  }

  function drawSpectrogramColumn() {
    const width = offscreenCanvas.width;
    const height = offscreenCanvas.height;
    const speed = config.speed;

    // Shift offscreen canvas left by 'speed' pixels
    offscreenCtx.drawImage(offscreenCanvas, speed, 0, width - speed, height, 0, 0, width - speed, height);

    // Render the new column at x = width - speed
    const colImageData = offscreenCtx.createImageData(speed, height);
    const data = colImageData.data;
    const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
    const nyquist = sampleRate / 2;
    const numBins = frequencyData.length;

    const minFreq = 20; // 20 Hz lower cutoff for log/mel scales
    const maxFreq = Math.min(config.maxFreq, nyquist);

    // Precalculate frequency parameters
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const melMin = hzToMel(minFreq);
    const melMax = hzToMel(maxFreq);

    for (let y = 0; y < height; y++) {
      // Invert Y so low frequencies are at bottom (y = height - 1)
      const normY = 1 - (y / (height - 1));
      let freq = 0;

      if (config.scale === 'logarithmic') {
        freq = Math.pow(10, logMin + normY * (logMax - logMin));
      } else if (config.scale === 'mel') {
        freq = melToHz(melMin + normY * (melMax - melMin));
      } else {
        // Linear
        freq = normY * maxFreq;
      }

      // Convert frequency to FFT bin index with linear interpolation
      const binFloat = (freq / nyquist) * numBins;
      const binLow = Math.floor(binFloat);
      const binHigh = Math.min(numBins - 1, binLow + 1);
      const weight = binFloat - binLow;

      let db = -100;
      if (binLow >= 0 && binHigh < numBins) {
        db = frequencyData[binLow] * (1 - weight) + frequencyData[binHigh] * weight;
      }

      const currentGate = config.autoAdjust ? effectiveNoiseGate : config.noiseGate;
      const currentGain = config.autoAdjust ? effectiveGain : config.gain;
      const currentContrast = config.autoAdjust ? effectiveContrast : config.contrast;

      // Apply Noise Gate Threshold
      if (db < currentGate) {
        db = -100;
      }

      // Normalize dB (-100 dB to 0 dB) -> [0, 1]
      let normVal = Math.max(0, Math.min(1, (db + 100) / 100));

      // Apply Gain & Gamma Contrast
      normVal = Math.pow(Math.min(1, normVal * currentGain), currentContrast);

      // Apply Volume Contrast Curve
      if (config.volumeCurve === 'steep') {
        normVal = 1.0 / (1.0 + Math.exp(-12.0 * (normVal - 0.45)));
      } else if (config.volumeCurve === 'super_sharp') {
        normVal = Math.floor(normVal * 8.99) / 8.0;
      }

      const colorIndex = Math.min(255, Math.floor(normVal * 255));
      const [r, g, b] = lut[colorIndex];

      // Fill pixel column of width 'speed'
      for (let s = 0; s < speed; s++) {
        const pixelIdx = (y * speed + s) * 4;
        data[pixelIdx] = r;
        data[pixelIdx + 1] = g;
        data[pixelIdx + 2] = b;
        data[pixelIdx + 3] = 255;
      }
    }

    offscreenCtx.putImageData(colImageData, width - speed, 0);

    // Blit offscreen canvas to visible canvas
    spectroCtx.drawImage(offscreenCanvas, 0, 0);
  }

  function drawOverlays() {
    const width = overlayCanvas.width;
    const height = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, width, height);

    // 1. Oscilloscope Waveform Overlay
    if (config.showOscilloscope && timeData && isRunning) {
      overlayCtx.save();
      overlayCtx.lineWidth = 1.5;
      overlayCtx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
      overlayCtx.shadowColor = 'rgba(0, 240, 255, 0.8)';
      overlayCtx.shadowBlur = 8;
      overlayCtx.beginPath();

      const waveHeight = Math.min(100, height * 0.2);
      const waveYOffset = height - waveHeight / 2 - 10;
      const sliceWidth = width / timeData.length;
      let x = 0;

      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i] / 128.0; // 0..2
        const y = waveYOffset + (v - 1) * (waveHeight / 2);

        if (i === 0) overlayCtx.moveTo(x, y);
        else overlayCtx.lineTo(x, y);
        x += sliceWidth;
      }
      overlayCtx.stroke();
      overlayCtx.restore();
    }

    // 2. Real-Time Instantaneous Spectrum Bar (Right edge)
    if (config.showSpectrumBar && frequencyData && isRunning) {
      overlayCtx.save();
      const barWidth = 30;
      const xStart = width - barWidth;
      const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;

      overlayCtx.fillStyle = 'rgba(5, 8, 15, 0.6)';
      overlayCtx.fillRect(xStart, 0, barWidth, height);
      overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      overlayCtx.strokeRect(xStart, 0, barWidth, height);

      const nyquist = sampleRate / 2;
      const maxFreq = Math.min(config.maxFreq, nyquist);
      const minFreq = 20;
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const melMin = hzToMel(minFreq);
      const melMax = hzToMel(maxFreq);

      for (let y = 0; y < height; y += 2) {
        const normY = 1 - (y / (height - 1));
        let freq = 0;

        if (config.scale === 'logarithmic') {
          freq = Math.pow(10, logMin + normY * (logMax - logMin));
        } else if (config.scale === 'mel') {
          freq = melToHz(melMin + normY * (melMax - melMin));
        } else {
          freq = normY * maxFreq;
        }

        const binFloat = (freq / nyquist) * frequencyData.length;
        const bin = Math.min(frequencyData.length - 1, Math.max(0, Math.floor(binFloat)));
        const db = frequencyData[bin];
        const normVal = Math.max(0, Math.min(1, (db + 100) / 100));

        const barLen = normVal * (barWidth - 4);
        const colorIdx = Math.min(255, Math.floor(normVal * 255));
        const [r, g, b] = lut[colorIdx];

        overlayCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        overlayCtx.fillRect(xStart + 2, y, barLen, 1.8);
      }
      overlayCtx.restore();
    }

    // 3. Render Confirmed Sustained Note Callouts directly on the Spectrogram Canvas
    if (config.showCanvasNotes && confirmedSustainedNotes && confirmedSustainedNotes.length > 0 && isRunning) {
      overlayCtx.save();
      const nyquist = sampleRate / 2;
      const maxFreq = Math.min(config.maxFreq, nyquist);
      const minFreq = 20;
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);

      confirmedSustainedNotes.forEach(note => {
        if (note.freqHz < minFreq || note.freqHz > maxFreq) return;

        let normY = 0;
        if (config.scale === 'logarithmic') {
          normY = (Math.log10(note.freqHz) - logMin) / (logMax - logMin);
        } else if (config.scale === 'mel') {
          normY = (hzToMel(note.freqHz) - hzToMel(minFreq)) / (hzToMel(maxFreq) - hzToMel(minFreq));
        } else {
          normY = note.freqHz / maxFreq;
        }

        const yPos = (1 - normY) * height;

        // Draw glowing horizontal tick line across the right edge of spectrogram
        overlayCtx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
        overlayCtx.lineWidth = 2;
        overlayCtx.shadowColor = '#00f0ff';
        overlayCtx.shadowBlur = 8;
        overlayCtx.beginPath();
        overlayCtx.moveTo(width - 150, yPos);
        overlayCtx.lineTo(width - 35, yPos);
        overlayCtx.stroke();

        // Draw Note Label Tag Badge
        const tagText = `${note.noteName} • ${Math.round(note.freqHz)} Hz`;
        overlayCtx.font = 'bold 11px "Outfit", sans-serif';
        const textWidth = overlayCtx.measureText(tagText).width;

        const boxX = width - 40 - textWidth - 14;
        const boxY = Math.max(10, Math.min(height - 30, yPos - 12));

        overlayCtx.fillStyle = 'rgba(9, 12, 21, 0.92)';
        overlayCtx.strokeStyle = '#00f0ff';
        overlayCtx.lineWidth = 1.5;
        overlayCtx.beginPath();
        overlayCtx.roundRect(boxX, boxY, textWidth + 14, 22, 6);
        overlayCtx.fill();
        overlayCtx.stroke();

        overlayCtx.fillStyle = '#00f0ff';
        overlayCtx.fillText(tagText, boxX + 7, boxY + 15);
      });
      overlayCtx.restore();
    }
  }

  // --- Dynamic Axis Ticks ---
  function renderYAxis() {
    DOM.yAxisContainer.innerHTML = '';
    const height = DOM.canvasWrapper.clientHeight || 500;
    const nyquist = sampleRate / 2;
    const maxFreq = Math.min(config.maxFreq, nyquist);

    // Target frequencies for ticks based on max selected frequency
    let targetTicks = [100, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000];
    if (maxFreq <= 4000) targetTicks = [100, 250, 500, 1000, 1500, 2000, 3000, 4000];
    else if (maxFreq <= 8000) targetTicks = [100, 300, 600, 1000, 2000, 4000, 6000, 8000];

    const minFreq = 20;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const melMin = hzToMel(minFreq);
    const melMax = hzToMel(maxFreq);

    targetTicks.forEach(freq => {
      if (freq > maxFreq) return;

      let normY = 0;
      if (config.scale === 'logarithmic') {
        if (freq < minFreq) return;
        normY = (Math.log10(freq) - logMin) / (logMax - logMin);
      } else if (config.scale === 'mel') {
        normY = (hzToMel(freq) - melMin) / (melMax - melMin);
      } else {
        normY = freq / maxFreq;
      }

      if (normY < 0 || normY > 1) return;

      const yPosPercent = (1 - normY) * 100;
      const tick = document.createElement('div');
      tick.className = 'y-tick';
      tick.style.top = `${yPosPercent}%`;
      tick.textContent = freq >= 1000 ? `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k` : `${freq}`;
      DOM.yAxisContainer.appendChild(tick);
    });
  }

  function renderXAxis() {
    DOM.xAxisContainer.innerHTML = '';
    const width = DOM.canvasWrapper.clientWidth || 800;
    const pixelsPerSec = currentFps * config.speed;
    const totalSecs = width / pixelsPerSec;

    const numTicks = 6;
    for (let i = 0; i <= numTicks; i++) {
      const frac = i / numTicks;
      const timeOffsetSec = (1 - frac) * totalSecs;

      const tick = document.createElement('div');
      tick.className = 'x-tick';
      tick.style.left = `${frac * 100}%`;
      tick.textContent = i === numTicks ? 'Now' : `-${timeOffsetSec.toFixed(1)}s`;
      DOM.xAxisContainer.appendChild(tick);
    }
  }

  // --- Mouse Inspector Tooltip ---
  function handleMouseMove(e) {
    const rect = DOM.canvasWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    if (x < 0 || x > width || y < 0 || y > height) {
      handleMouseLeave();
      return;
    }

    DOM.crosshairH.style.display = 'block';
    DOM.crosshairV.style.display = 'block';
    DOM.crosshairH.style.top = `${y}px`;
    DOM.crosshairV.style.left = `${x}px`;

    // Position tooltip
    DOM.inspectorTooltip.style.display = 'block';
    let tooltipX = x + 15;
    let tooltipY = y + 15;

    if (tooltipX + 160 > width) tooltipX = x - 165;
    if (tooltipY + 110 > height) tooltipY = y - 110;

    DOM.inspectorTooltip.style.left = `${tooltipX}px`;
    DOM.inspectorTooltip.style.top = `${tooltipY}px`;

    // Calculate Frequency at position Y
    const normY = 1 - (y / (height - 1));
    const nyquist = sampleRate / 2;
    const maxFreq = Math.min(config.maxFreq, nyquist);
    const minFreq = 20;

    let freq = 0;
    if (config.scale === 'logarithmic') {
      freq = Math.pow(10, Math.log10(minFreq) + normY * (Math.log10(maxFreq) - Math.log10(minFreq)));
    } else if (config.scale === 'mel') {
      freq = melToHz(hzToMel(minFreq) + normY * (hzToMel(maxFreq) - hzToMel(minFreq)));
    } else {
      freq = normY * maxFreq;
    }

    freq = Math.round(freq);
    const note = freqToNote(freq);

    // Calculate Amplitude dB if data available
    let dbVal = '-';
    if (frequencyData) {
      const binFloat = (freq / nyquist) * frequencyData.length;
      const bin = Math.min(frequencyData.length - 1, Math.max(0, Math.floor(binFloat)));
      dbVal = `${frequencyData[bin].toFixed(1)} dB`;
    }

    // Time offset calculation
    const pixelsFromRight = width - x;
    const pixelsPerSec = currentFps * config.speed;
    const timeOffsetSec = pixelsFromRight / pixelsPerSec;

    DOM.tooltipFreq.textContent = `${freq} Hz`;
    DOM.tooltipNote.textContent = note;
    DOM.tooltipDb.textContent = dbVal;
    DOM.tooltipTime.textContent = `-${timeOffsetSec.toFixed(2)} s`;
  }

  function handleMouseLeave() {
    DOM.crosshairH.style.display = 'none';
    DOM.crosshairV.style.display = 'none';
    DOM.inspectorTooltip.style.display = 'none';
  }

  // --- Export Image (PNG) ---
  function exportImage() {
    const exportCanvas = document.createElement('canvas');
    const width = spectroCanvas.width;
    const height = spectroCanvas.height;
    const yAxisWidth = 80;
    const footerHeight = 40;

    exportCanvas.width = width + yAxisWidth;
    exportCanvas.height = height + footerHeight;
    const ctx = exportCanvas.getContext('2d');

    // Dark Background
    ctx.fillStyle = '#090c15';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw Spectrogram Canvas
    ctx.drawImage(spectroCanvas, yAxisWidth, 0);

    // Draw Y-Axis (Frequency Ticks)
    ctx.fillStyle = '#101726';
    ctx.fillRect(0, 0, yAxisWidth, height);
    ctx.strokeStyle = '#202c42';
    ctx.strokeRect(0, 0, yAxisWidth, height);

    ctx.fillStyle = '#8b9bb4';
    ctx.font = '12px "Fira Code", monospace';
    ctx.textAlign = 'right';

    const nyquist = sampleRate / 2;
    const maxFreq = Math.min(config.maxFreq, nyquist);
    let ticks = [100, 500, 1000, 2000, 5000, 10000, 15000, 20000];

    const minFreq = 20;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    ticks.forEach(freq => {
      if (freq > maxFreq) return;
      let normY = 0;
      if (config.scale === 'logarithmic') {
        if (freq < minFreq) return;
        normY = (Math.log10(freq) - logMin) / (logMax - logMin);
      } else {
        normY = freq / maxFreq;
      }
      const y = (1 - normY) * height;
      ctx.fillText(`${freq} Hz`, yAxisWidth - 10, y + 4);
    });

    // Footer Watermark & Metadata
    ctx.fillStyle = '#101726';
    ctx.fillRect(0, height, exportCanvas.width, footerHeight);
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 14px "Outfit", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`AudioSpectra 2D Snapshot — Palette: ${config.colormap.toUpperCase()} | Scale: ${config.scale.toUpperCase()} | FFT: ${config.fftSize}`, 15, height + 25);

    // Download Link
    const link = document.createElement('a');
    link.download = `spectrogram_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  // --- Helper Functions ---
  function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
  }

  function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  function freqToNote(freqHz) {
    if (!freqHz || freqHz < 10) return '---';
    const noteNum = 12 * (Math.log2(freqHz / 440)) + 69;
    const roundedNote = Math.round(noteNum);
    const octave = Math.floor(roundedNote / 12) - 1;
    const noteIndex = ((roundedNote % 12) + 12) % 12;
    const cents = Math.round((noteNum - roundedNote) * 100);
    const centsStr = cents >= 0 ? `+${cents}c` : `${cents}c`;
    return `${NOTE_NAMES[noteIndex]}${octave} (${centsStr})`;
  }

  function updateColormapPreview() {
    const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
    let cssGrad = 'linear-gradient(to right';
    for (let i = 0; i <= 10; i++) {
      const idx = Math.floor((i / 10) * 255);
      const [r, g, b] = lut[idx];
      cssGrad += `, rgb(${r}, ${g}, ${b})`;
    }
    cssGrad += ')';
    DOM.colormapPreview.style.background = cssGrad;
  }

  function renderLegend() {
    const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
    let cssGrad = 'linear-gradient(to right';
    for (let i = 0; i <= 10; i++) {
      const idx = Math.floor((i / 10) * 255);
      const [r, g, b] = lut[idx];
      cssGrad += `, rgb(${r}, ${g}, ${b})`;
    }
    cssGrad += ')';
    DOM.legendBar.style.background = cssGrad;
  }

  // --- Colormap LUT Generators ---
  function createViridisLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      // Interpolated Viridis RGB polynomial approximation
      const r = Math.max(0, Math.min(255, Math.floor(255 * (0.28 + 0.15 * t + 0.5 * Math.pow(t, 2)))));
      const g = Math.max(0, Math.min(255, Math.floor(255 * (0.0 + 0.9 * t - 0.1 * Math.pow(t, 2)))));
      const b = Math.max(0, Math.min(255, Math.floor(255 * (0.33 + 0.65 * t - 0.9 * Math.pow(t, 2)))));
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createInfernoLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.max(0, Math.min(255, Math.floor(255 * Math.pow(t, 0.7) * 1.2)));
      const g = Math.max(0, Math.min(255, Math.floor(255 * Math.pow(t, 1.8) * 0.9)));
      const b = Math.max(0, Math.min(255, Math.floor(255 * (t < 0.5 ? Math.sin(t * Math.PI) * 0.7 : (1 - t) * 0.8))));
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createCyberpunkLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0;
      if (t < 0.25) {
        // Dark blue to Purple
        const k = t / 0.25;
        r = Math.floor(k * 112); g = 0; b = Math.floor(40 + k * 215);
      } else if (t < 0.65) {
        // Purple to Hot Pink
        const k = (t - 0.25) / 0.4;
        r = Math.floor(112 + k * 143); g = 0; b = Math.floor(255 - k * 133);
      } else if (t < 0.9) {
        // Hot Pink to Cyan
        const k = (t - 0.65) / 0.25;
        r = Math.floor(255 - k * 255); g = Math.floor(k * 240); b = Math.floor(122 + k * 133);
      } else {
        // Cyan to White
        const k = (t - 0.9) / 0.1;
        r = Math.floor(k * 255); g = Math.floor(240 + k * 15); b = 255;
      }
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createPlasmaLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(255 * Math.sin(t * Math.PI * 0.8));
      const g = Math.floor(255 * Math.pow(t, 2));
      const b = Math.floor(255 * (0.8 - t * 0.6));
      lut.push([Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))]);
    }
    return lut;
  }

  function createMagmaLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(255 * Math.pow(t, 0.8));
      const g = Math.floor(255 * Math.pow(t, 2.2));
      const b = Math.floor(255 * (t < 0.4 ? t * 1.5 : (1 - t) * 0.6));
      lut.push([Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))]);
    }
    return lut;
  }

  function createMatrixLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(255 * Math.pow(t, 4));
      const g = Math.floor(255 * Math.sqrt(t));
      const b = Math.floor(255 * Math.pow(t, 3));
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createRainbowLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const hue = ((1 - i / 255) * 280) % 360;
      const sat = 1.0;
      const val = i === 0 ? 0 : Math.min(1.0, 0.2 + (i / 255) * 0.8);
      
      // HSV to RGB conversion
      const c = val * sat;
      const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
      const m = val - c;
      let r1 = 0, g1 = 0, b1 = 0;

      if (hue < 60) { r1 = c; g1 = x; b1 = 0; }
      else if (hue < 120) { r1 = x; g1 = c; b1 = 0; }
      else if (hue < 180) { r1 = 0; g1 = c; b1 = x; }
      else if (hue < 240) { r1 = 0; g1 = x; b1 = c; }
      else if (hue < 300) { r1 = x; g1 = 0; b1 = c; }
      else { r1 = c; g1 = 0; b1 = x; }

      lut.push([
        Math.floor((r1 + m) * 255),
        Math.floor((g1 + m) * 255),
        Math.floor((b1 + m) * 255)
      ]);
    }
    return lut;
  }

  function createGrayscaleLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      lut.push([i, i, i]);
    }
    return lut;
  }

  // --- Beatbox Mic Calibration Engine ---
  const calib = {
    active: false,
    phase: 0,
    startTime: 0,
    durationMs: 0,
    timerId: null,
    ambientSamples: [],
    soundPeakSamples: [],
    profile: null
  };

  function openCalibrationModal() {
    if (!isRunning) {
      startMicrophone().then(() => {
        if (isRunning) showCalibWizard();
      });
    } else {
      showCalibWizard();
    }
  }

  function showCalibWizard() {
    DOM.calibrationModal.classList.remove('hidden');
    resetCalibUIPhase1();
  }

  function closeCalibrationModal() {
    DOM.calibrationModal.classList.add('hidden');
    if (calib.timerId) {
      clearInterval(calib.timerId);
      calib.timerId = null;
    }
    calib.active = false;
  }

  function resetCalibUIPhase1() {
    calib.phase = 1;
    calib.ambientSamples = [];
    calib.soundPeakSamples = [];
    DOM.wizStepTag.textContent = 'Step 1 of 2';
    DOM.wizTitle.textContent = 'Phase 1: Ambient Room Noise (2s)';
    DOM.wizDesc.textContent = 'Please remain quiet for 2 seconds while we measure your room\'s background hum and fan noise.';
    DOM.countdownNumber.textContent = '2';
    DOM.countdownBar.style.strokeDashoffset = '0';
    DOM.startCalibStepBtn.textContent = 'Start Phase 1 (Quiet 2s)';
    DOM.startCalibStepBtn.onclick = () => startCalibPhase(1, 2000);
  }

  function setupCalibPhase2() {
    calib.phase = 2;
    DOM.wizStepTag.textContent = 'Step 2 of 2';
    DOM.wizTitle.textContent = 'Phase 2: Beatbox & Sound Sampling (5s)';
    DOM.wizDesc.textContent = 'Make your beatbox sounds now! (kicks, hi-hats, vocal bass, snares, soft & loud sounds for 5 seconds).';
    DOM.countdownNumber.textContent = '5';
    DOM.countdownBar.style.strokeDashoffset = '0';
    DOM.startCalibStepBtn.textContent = 'Start Phase 2 (Beatbox 5s)';
    DOM.startCalibStepBtn.onclick = () => startCalibPhase(2, 5000);
  }

  function startCalibPhase(phase, durationMs) {
    calib.active = true;
    calib.phase = phase;
    calib.startTime = performance.now();
    calib.durationMs = durationMs;
    DOM.startCalibStepBtn.disabled = true;

    const totalDash = 264;

    calib.timerId = setInterval(() => {
      const elapsed = performance.now() - calib.startTime;
      const remainingSec = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      const progress = Math.min(1, elapsed / durationMs);

      DOM.countdownNumber.textContent = `${remainingSec}`;
      DOM.countdownBar.style.strokeDashoffset = `${progress * totalDash}`;

      if (elapsed >= durationMs) {
        clearInterval(calib.timerId);
        calib.timerId = null;
        DOM.startCalibStepBtn.disabled = false;

        if (phase === 1) {
          setupCalibPhase2();
        } else {
          finishCalibration();
        }
      }
    }, 50);
  }

  function processCalibrationFrame() {
    if (!calib.active || !frequencyData) return;

    let maxDb = -100;
    for (let i = 1; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxDb) maxDb = frequencyData[i];
    }

    if (DOM.wizPeakDb) DOM.wizPeakDb.textContent = `${maxDb.toFixed(1)} dB`;
    if (DOM.wizMeterFill) {
      const pct = Math.min(100, Math.max(0, (maxDb + 80) * 1.25));
      DOM.wizMeterFill.style.width = `${pct}%`;
    }

    if (calib.phase === 1) {
      calib.ambientSamples.push(maxDb);
    } else if (calib.phase === 2) {
      calib.soundPeakSamples.push(maxDb);
    }
  }

  function finishCalibration() {
    calib.active = false;

    let ambientDb = -75.0;
    if (calib.ambientSamples.length > 0) {
      calib.ambientSamples.sort((a, b) => a - b);
      const medianIdx = Math.floor(calib.ambientSamples.length * 0.5);
      ambientDb = calib.ambientSamples[medianIdx];
    }

    let maxSoundDb = -20.0;
    if (calib.soundPeakSamples.length > 0) {
      maxSoundDb = Math.max(...calib.soundPeakSamples);
    }

    const noiseGate = Math.min(-30, Math.max(-95, Math.round(ambientDb + 4.5)));
    const dynamicRange = Math.max(15, Math.round((maxSoundDb - noiseGate) * 10) / 10);
    const gainBoost = Math.min(5.0, Math.max(0.6, Math.round((95.0 / dynamicRange) * 10) / 10));
    const contrast = 1.35;

    config.noiseGate = noiseGate;
    config.gain = gainBoost;
    config.contrast = contrast;

    DOM.noiseGateRange.value = noiseGate;
    DOM.noiseGateVal.textContent = `${noiseGate} dB`;

    DOM.gainRange.value = gainBoost;
    DOM.gainVal.textContent = `${gainBoost.toFixed(1)}x`;

    DOM.contrastRange.value = contrast;
    DOM.contrastVal.textContent = `${contrast.toFixed(1)}`;

    calib.profile = {
      ambientDb: Math.round(ambientDb * 10) / 10,
      maxSoundDb: Math.round(maxSoundDb * 10) / 10,
      noiseGate: noiseGate,
      dynamicRange: dynamicRange,
      gainBoost: gainBoost,
      timestamp: Date.now()
    };

    localStorage.setItem('beatbox_calib_profile', JSON.stringify(calib.profile));
    updateCalibProfileUI();
    closeCalibrationModal();
  }

  function updateCalibProfileUI() {
    if (!calib.profile) return;
    DOM.calStatusBadge.textContent = 'SET';
    DOM.calStatusBadge.classList.add('set');
    DOM.calDescText.textContent = `Calibrated for Beatboxing! (Noise Gate: ${calib.profile.noiseGate} dB | Dynamic Range: ${calib.profile.dynamicRange} dB).`;
    DOM.calGateVal.textContent = `${calib.profile.noiseGate} dB`;
    DOM.calRangeVal.textContent = `${calib.profile.dynamicRange} dB`;
    DOM.calGainVal.textContent = `${calib.profile.gainBoost}x`;
    DOM.calDetails.classList.remove('hidden');
  }

  function loadSavedProfile() {
    try {
      const saved = localStorage.getItem('beatbox_calib_profile');
      if (saved) {
        calib.profile = JSON.parse(saved);
        config.noiseGate = calib.profile.noiseGate;
        config.gain = calib.profile.gainBoost;

        DOM.noiseGateRange.value = config.noiseGate;
        DOM.noiseGateVal.textContent = `${config.noiseGate} dB`;
        DOM.gainRange.value = config.gain;
        DOM.gainVal.textContent = `${config.gain.toFixed(1)}x`;

        updateCalibProfileUI();
      }
    } catch (e) {}
  }

  // --- Polyphonic Sustained Note Detection Engine (Zero-Lag 60 FPS) ---
  const sustainedNoteTracker = new Map(); // noteName -> { noteName, freqHz, db, octave, firstSeen, lastSeen }
  let confirmedSustainedNotes = [];

  function detectPitchAndTuning() {
    if (!timeData || !frequencyData || !isRunning) {
      confirmedSustainedNotes = [];
      updateTunerHUD(0, 0, 0, 'LISTENING...', []);
      return;
    }

    const now = performance.now();
    const numBins = frequencyData.length;
    const nyquist = sampleRate / 2;
    const maxBinIndex = Math.floor((config.maxFreq / nyquist) * numBins);

    // Sensitivity Settings Map (Level 1: Strict ... 3: Balanced Default (Old Level 5) ... 5: Max Sensitive)
    const sensMap = {
      1: { cutoffDb: -56, minPeakVal: -60, prominence: 3.0, requiredHits: 4, minHoldMs: 100 },
      2: { cutoffDb: -68, minPeakVal: -72, prominence: 1.8, requiredHits: 2, minHoldMs: 30  },
      3: { cutoffDb: -80, minPeakVal: -84, prominence: 0.7, requiredHits: 1, minHoldMs: 10  }, // OLD LEVEL 5 IS NOW LEVEL 3 DEFAULT!
      4: { cutoffDb: -88, minPeakVal: -90, prominence: 0.4, requiredHits: 1, minHoldMs: 0   },
      5: { cutoffDb: -96, minPeakVal: -98, prominence: 0.2, requiredHits: 1, minHoldMs: 0   }
    };
    const sens = sensMap[config.noteSensitivity || 3];

    // Find loudest spectral peak in current frame
    let maxSpectralDb = -100;
    for (let i = 1; i < maxBinIndex; i++) {
      if (frequencyData[i] > maxSpectralDb) maxSpectralDb = frequencyData[i];
    }

    // VOLUME CUTOFF: Check frame sound level against current sensitivity cutoff
    if (maxSpectralDb < sens.cutoffDb) {
      sustainedNoteTracker.forEach((entry, key) => {
        entry.hits -= 2;
        if (entry.hits <= 0) sustainedNoteTracker.delete(key);
      });
      confirmedSustainedNotes = [];
      updateTunerHUD(0, 0, 0, 'LISTENING...', []);
      return;
    }

    const currentGate = config.autoAdjust ? effectiveNoiseGate : config.noiseGate;
    const peakVolumeThreshold = Math.max(sens.minPeakVal, currentGate + 4.0);

    const framePeaks = [];
    const lowerBinLimit = Math.max(2, Math.floor((20 / nyquist) * numBins));
    const upperBinLimit = Math.min(maxBinIndex - 4, Math.floor((8000 / nyquist) * numBins));

    for (let i = lowerBinLimit; i < upperBinLimit; i++) {
      const val = frequencyData[i];

      if (val < peakVolumeThreshold) continue;

      // Local maximum check
      if (
        val > frequencyData[i - 1] &&
        val > frequencyData[i - 2] &&
        val > frequencyData[i + 1] &&
        val > frequencyData[i + 2]
      ) {
        // Prominence check against surrounding background floor at i-16 and i+16
        const bg1 = frequencyData[Math.max(0, i - 16)];
        const bg2 = frequencyData[Math.min(numBins - 1, i + 16)];
        const bgFloor = (bg1 + bg2) / 2;
        const prominence = val - bgFloor;

        if (prominence >= sens.prominence) {
          const freqHz = (i * nyquist) / numBins;
          const noteNum = 12 * Math.log2(freqHz / 440) + 69;
          const roundNote = Math.round(noteNum);
          const octave = Math.floor(roundNote / 12) - 1;
          const noteIdx = ((roundNote % 12) + 12) % 12;
          const noteName = `${NOTE_NAMES[noteIdx]}${octave}`;

          framePeaks.push({ noteName, freqHz, db: val, octave });
        }
      }
    }

    // 2. Track Persistence based on sensitivity requiredHits
    const currentFrameNoteNames = new Set(framePeaks.map(p => p.noteName));

    framePeaks.forEach(peak => {
      if (sustainedNoteTracker.has(peak.noteName)) {
        const existing = sustainedNoteTracker.get(peak.noteName);
        existing.hits = Math.min(35, existing.hits + 1);
        existing.lastSeen = now;
        existing.db = peak.db;
        existing.freqHz = peak.freqHz;
      } else {
        sustainedNoteTracker.set(peak.noteName, {
          noteName: peak.noteName,
          freqHz: peak.freqHz,
          db: peak.db,
          octave: peak.octave,
          hits: 1,
          firstSeen: now,
          lastSeen: now
        });
      }
    });

    // Decay notes not present in current frame
    sustainedNoteTracker.forEach((entry, key) => {
      if (!currentFrameNoteNames.has(key)) {
        entry.hits -= 2;
        if (entry.hits <= 0 || now - entry.lastSeen > 200) {
          sustainedNoteTracker.delete(key);
        }
      }
    });

    // Confirmed notes: check against sens.requiredHits & sens.minHoldMs
    confirmedSustainedNotes = [];
    sustainedNoteTracker.forEach((entry) => {
      if (entry.hits >= sens.requiredHits && (now - entry.firstSeen >= sens.minHoldMs)) {
        confirmedSustainedNotes.push(entry);
      }
    });

    // Sort confirmed notes by loudness (unlimited polyphonic note count)
    confirmedSustainedNotes.sort((a, b) => b.db - a.db);

    // 3. Update Tuner HUD Display
    if (confirmedSustainedNotes.length === 0) {
      updateTunerHUD(0, 0, 0, 'LISTENING...', []);
    } else {
      const top = confirmedSustainedNotes[0];
      const noteNum = 12 * Math.log2(top.freqHz / 440) + 69;
      const roundNote = Math.round(noteNum);
      const centsOffset = (noteNum - roundNote) * 100;
      const targetFreq = 440 * Math.pow(2, (roundNote - 69) / 12);

      updateTunerHUD(top.freqHz, targetFreq, centsOffset, top.noteName, confirmedSustainedNotes);
    }
  }

  function updateTunerHUD(freqHz, targetFreqHz, centsOffset, noteStr, activeNoteList) {
    if (!DOM.pitchTunerHud) return;

    // Render Polyphonic Multi-Note Pills List
    if (DOM.multiNoteList) {
      if (!activeNoteList || activeNoteList.length === 0) {
        DOM.multiNoteList.innerHTML = '<span class="note-pill idle">None</span>';
      } else {
        const pillsHtml = activeNoteList.map(n => {
          const typeClass = n.octave <= 2 ? 'bass' : (n.octave >= 5 ? 'treble' : '');
          return `<span class="note-pill ${typeClass}">${n.noteName}</span>`;
        }).join('');
        DOM.multiNoteList.innerHTML = pillsHtml;
      }
    }

    if (freqHz === 0 || noteStr === 'LISTENING...' || noteStr === 'UNPITCHED') {
      DOM.tunerNoteBadge.textContent = '---';
      DOM.tunerNoteBadge.className = 'tuner-note-badge';
      DOM.tunerFreqVal.textContent = '0.0 Hz';
      DOM.tunerTargetVal.textContent = 'Ref: --- Hz';
      DOM.tunerNeedle.style.left = '50%';
      DOM.tunerNeedle.className = 'tuner-needle';
      DOM.tunerStatusBadge.textContent = 'LISTENING...';
      DOM.tunerStatusBadge.className = 'tuner-status-badge';
      return;
    }

    if (noteStr !== 'STABLE') {
      DOM.tunerNoteBadge.textContent = noteStr;
    }
    DOM.tunerFreqVal.textContent = `${freqHz.toFixed(1)} Hz`;
    DOM.tunerTargetVal.textContent = `Target: ${targetFreqHz.toFixed(1)} Hz`;

    const clampedCents = Math.max(-50, Math.min(50, centsOffset));
    const needlePercent = 50 + (clampedCents / 50) * 45;
    DOM.tunerNeedle.style.left = `${needlePercent}%`;

    const tolerance = config.tunerTolerance || 35;
    const absCents = Math.abs(centsOffset);
    if (absCents <= tolerance) {
      DOM.tunerNoteBadge.className = 'tuner-note-badge in-tune';
      DOM.tunerNeedle.className = 'tuner-needle in-tune';
      DOM.tunerStatusBadge.className = 'tuner-status-badge in-tune';
      if (absCents <= Math.floor(tolerance / 2)) {
        DOM.tunerStatusBadge.textContent = 'PERFECT (IN TUNE)';
      } else {
        DOM.tunerStatusBadge.textContent = `IN TUNE (${centsOffset > 0 ? '+' : ''}${centsOffset.toFixed(0)}c)`;
      }
    } else if (centsOffset < -tolerance) {
      DOM.tunerNoteBadge.className = 'tuner-note-badge too-low';
      DOM.tunerNeedle.className = 'tuner-needle too-low';
      DOM.tunerStatusBadge.className = 'tuner-status-badge too-low';
      DOM.tunerStatusBadge.textContent = `FLAT / TOO LOW (${centsOffset.toFixed(0)}c)`;
    } else {
      DOM.tunerNoteBadge.className = 'tuner-note-badge too-high';
      DOM.tunerNeedle.className = 'tuner-needle too-high';
      DOM.tunerStatusBadge.className = 'tuner-status-badge too-high';
      DOM.tunerStatusBadge.textContent = `SHARP / TOO HIGH (+${centsOffset.toFixed(0)}c)`;
    }
  }

  function createUltraContrastLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0;
      if (t < 0.15) {
        const k = t / 0.15;
        r = 0; g = 0; b = Math.floor(k * 120);
      } else if (t < 0.35) {
        const k = (t - 0.15) / 0.2;
        r = 0; g = Math.floor(k * 220); b = Math.floor(120 + k * 135);
      } else if (t < 0.65) {
        const k = (t - 0.35) / 0.3;
        r = Math.floor(k * 255); g = Math.floor(220 - k * 180); b = Math.floor(255 - k * 50);
      } else if (t < 0.88) {
        const k = (t - 0.65) / 0.23;
        r = 255; g = Math.floor(40 + k * 215); b = Math.floor(205 - k * 205);
      } else {
        const k = (t - 0.88) / 0.12;
        r = 255; g = 255; b = Math.floor(k * 255);
      }
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createVolcanoContrastLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0;
      if (t < 0.2) {
        const k = t / 0.2;
        r = Math.floor(k * 120); g = 0; b = Math.floor(k * 20);
      } else if (t < 0.5) {
        const k = (t - 0.2) / 0.3;
        r = Math.floor(120 + k * 135); g = Math.floor(k * 40); b = 0;
      } else if (t < 0.8) {
        const k = (t - 0.5) / 0.3;
        r = 255; g = Math.floor(40 + k * 215); b = 0;
      } else {
        const k = (t - 0.8) / 0.2;
        r = 255; g = 255; b = Math.floor(k * 255);
      }
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createCyberpunkLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0;
      if (t < 0.33) {
        const k = t / 0.33;
        r = 0; g = Math.floor(k * 240); b = Math.floor(k * 255);
      } else if (t < 0.66) {
        const k = (t - 0.33) / 0.33;
        r = Math.floor(k * 255); g = Math.floor(240 * (1 - k)); b = 255;
      } else {
        const k = (t - 0.66) / 0.34;
        r = 255; g = Math.floor(k * 240); b = Math.floor(255 * (1 - k));
      }
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createViridisLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(Math.sin(t * Math.PI * 0.8) * 255);
      const g = Math.floor(t * 255);
      const b = Math.floor(Math.cos(t * Math.PI * 0.5) * 220);
      lut.push([Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))]);
    }
    return lut;
  }

  function createInfernoLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(Math.min(255, t * 1.5 * 255));
      const g = Math.floor(Math.max(0, (t - 0.3) * 1.4 * 255));
      const b = Math.floor(Math.max(0, Math.sin(t * Math.PI) * 180 - t * 100));
      lut.push([Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))]);
    }
    return lut;
  }

  function createPlasmaLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor((0.5 + 0.5 * Math.sin(t * 6.28 + 0.0)) * 255);
      const g = Math.floor((0.5 + 0.5 * Math.sin(t * 6.28 + 2.0)) * 255);
      const b = Math.floor((0.5 + 0.5 * Math.sin(t * 6.28 + 4.0)) * 255);
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createMagmaLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(t * 255);
      const g = Math.floor(Math.pow(t, 2) * 230);
      const b = Math.floor(Math.pow(t, 0.5) * 180);
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createMatrixLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.floor(t > 0.85 ? (t - 0.85) * 6.6 * 255 : 0);
      const g = Math.floor(t * 255);
      const b = Math.floor(t > 0.7 ? (t - 0.7) * 3.3 * 180 : 0);
      lut.push([r, g, b]);
    }
    return lut;
  }

  function createRainbowLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const h = (1 - t) * 0.8;
      const rgb = hsvToRgb(h, 1.0, t > 0.05 ? 1.0 : t * 20);
      lut.push(rgb);
    }
    return lut;
  }

  function createGrayscaleLUT() {
    const lut = [];
    for (let i = 0; i < 256; i++) {
      lut.push([i, i, i]);
    }
    return lut;
  }

  function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
  }

  // --- Reference Piano Synth Engine (Speaker Output Only, Bypasses Spectrogram) ---
  let pianoBaseOctave = 4;
  const activePianoVoices = new Map();

  const PIANO_KEY_MAP = [
    { note: 'C', isBlack: false, shortcut: 'A' },
    { note: 'C#', isBlack: true, shortcut: 'W' },
    { note: 'D', isBlack: false, shortcut: 'S' },
    { note: 'D#', isBlack: true, shortcut: 'E' },
    { note: 'E', isBlack: false, shortcut: 'D' },
    { note: 'F', isBlack: false, shortcut: 'F' },
    { note: 'F#', isBlack: true, shortcut: 'T' },
    { note: 'G', isBlack: false, shortcut: 'G' },
    { note: 'G#', isBlack: true, shortcut: 'Y' },
    { note: 'A', isBlack: false, shortcut: 'H' },
    { note: 'A#', isBlack: true, shortcut: 'U' },
    { note: 'B', isBlack: false, shortcut: 'J' },
    { note: 'C', isBlack: false, shortcut: 'K' },
    { note: 'C#', isBlack: true, shortcut: 'O' },
    { note: 'D', isBlack: false, shortcut: 'L' },
    { note: 'D#', isBlack: true, shortcut: 'P' },
    { note: 'E', isBlack: false, shortcut: ';' }
  ];

  function initPianoKeyboard() {
    if (!DOM.pianoKeyboard) return;
    DOM.pianoKeyboard.innerHTML = '';

    DOM.pianoOctaveText.textContent = `Octave: C${pianoBaseOctave} - C${pianoBaseOctave + 1}`;

    PIANO_KEY_MAP.forEach((item, idx) => {
      const octaveOffset = idx >= 12 ? 1 : 0;
      const octave = pianoBaseOctave + octaveOffset;
      const noteName = `${item.note}${octave}`;

      const noteIdxInOctave = NOTE_NAMES.indexOf(item.note);
      const midiNote = (octave + 1) * 12 + noteIdxInOctave;
      const freqHz = 440 * Math.pow(2, (midiNote - 69) / 12);

      const keyElem = document.createElement('div');
      keyElem.className = `piano-key ${item.isBlack ? 'black' : 'white'}`;
      keyElem.dataset.freq = freqHz;
      keyElem.dataset.note = noteName;
      keyElem.dataset.shortcut = item.shortcut;

      keyElem.innerHTML = `
        <span class="key-shortcut">${item.shortcut}</span>
        <span class="key-label">${noteName}</span>
      `;

      keyElem.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handlePianoKeyPress(freqHz, noteName, keyElem);
      });

      keyElem.addEventListener('mouseup', (e) => {
        e.preventDefault();
        handlePianoKeyRelease(freqHz, keyElem);
      });

      keyElem.addEventListener('mouseleave', (e) => {
        handlePianoKeyRelease(freqHz, keyElem);
      });

      keyElem.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePianoKeyPress(freqHz, noteName, keyElem);
      });

      keyElem.addEventListener('touchend', (e) => {
        e.preventDefault();
        handlePianoKeyRelease(freqHz, keyElem);
      });

      DOM.pianoKeyboard.appendChild(keyElem);
    });
  }

  function handlePianoKeyPress(freqHz, noteName, keyElem) {
    const isSustain = DOM.pianoSustainCheck && DOM.pianoSustainCheck.checked;

    if (isSustain) {
      if (activePianoVoices.has(freqHz)) {
        stopPianoTone(freqHz, keyElem);
      } else {
        playPianoTone(freqHz, noteName, keyElem);
      }
    } else {
      playPianoTone(freqHz, noteName, keyElem);
    }
  }

  function handlePianoKeyRelease(freqHz, keyElem) {
    const isSustain = DOM.pianoSustainCheck && DOM.pianoSustainCheck.checked;
    if (!isSustain) {
      stopPianoTone(freqHz, keyElem);
    }
  }

  function playPianoTone(freqHz, noteName, keyElem) {
    try {
      if (!pianoAudioCtx) {
        pianoAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (pianoAudioCtx.state === 'suspended') {
        pianoAudioCtx.resume();
      }

      stopPianoTone(freqHz, keyElem, true);

      const now = pianoAudioCtx.currentTime;

      const osc1 = pianoAudioCtx.createOscillator();
      const osc2 = pianoAudioCtx.createOscillator();
      const gainNode = pianoAudioCtx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freqHz, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freqHz * 2, now);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.015);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(pianoAudioCtx.destination);

      osc1.start(now);
      osc2.start(now);

      if (keyElem) keyElem.classList.add('active');

      activePianoVoices.set(freqHz, { osc1, osc2, gainNode, keyElem });
    } catch (err) {
      console.warn('Piano tone play notice:', err);
    }
  }

  function stopPianoTone(freqHz, keyElem, immediate = false) {
    if (!activePianoVoices.has(freqHz)) return;
    const voice = activePianoVoices.get(freqHz);
    activePianoVoices.delete(freqHz);

    if (keyElem) keyElem.classList.remove('active');
    if (voice.keyElem) voice.keyElem.classList.remove('active');

    try {
      const now = pianoAudioCtx ? pianoAudioCtx.currentTime : 0;
      if (immediate || !pianoAudioCtx) {
        voice.gainNode.gain.setValueAtTime(0.0001, now);
        voice.osc1.stop(now);
        voice.osc2.stop(now);
        voice.osc1.disconnect();
        voice.osc2.disconnect();
        voice.gainNode.disconnect();
      } else {
        const currentGain = Math.max(0.0001, voice.gainNode.gain.value);
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(currentGain, now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.15);
        voice.osc1.stop(now + 0.16);
        voice.osc2.stop(now + 0.16);
        setTimeout(() => {
          try {
            voice.osc1.disconnect();
            voice.osc2.disconnect();
            voice.gainNode.disconnect();
          } catch (e) {}
        }, 200);
      }
    } catch (err) {
      console.warn('Piano tone stop notice:', err);
    }
  }

  function stopAllPianoVoices() {
    activePianoVoices.forEach((voice, freq) => {
      stopPianoTone(freq, voice.keyElem, true);
    });
  }

  // --- Game 2: Spectral Echo Matcher & Vocal Challenge Engine ---
  let g2State = {
    isRecordingRef: false,
    isPlayingRef: false,
    isMatching: false,
    refSpectra: [],
    refMediaRecorder: null,
    recordedChunks: [],
    refAudioUrl: null,
    refAudioElement: null,
    matchScores: [],
    attemptSpectra: [],
    refDurationSec: 0,
    startTime: 0,
    matchStartTime: 0,
    lastMatchX: 0,
    playAnimFrameId: null
  };

  let targetSpectroCtx = null;
  let attemptSpectroCtx = null;
  let targetCacheCanvas = null;
  let targetCacheCtx = null;

  async function g2ToggleRecordRef() {
    if (g2State.isRecordingRef) {
      g2StopRecordRef();
    } else {
      await g2StartRecordRef();
    }
  }

  async function g2StartRecordRef() {
    if (!isRunning) {
      await startMicrophone();
    }
    if (!mediaStream) return;

    g2State.isRecordingRef = true;
    g2State.refSpectra = [];
    g2State.recordedChunks = [];
    g2State.startTime = performance.now();

    if (DOM.g2RecordRefBtnText) DOM.g2RecordRefBtnText.textContent = '⏹️ Stop Recording';
    if (DOM.g2RecordRefBtn) DOM.g2RecordRefBtn.classList.replace('btn-primary', 'btn-accent');
    if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Recording Target...';
    if (DOM.g2PlayRefBtn) DOM.g2PlayRefBtn.disabled = true;
    if (DOM.g2StartMatchBtn) DOM.g2StartMatchBtn.disabled = true;

    try {
      g2State.refMediaRecorder = new MediaRecorder(mediaStream);
      g2State.refMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) g2State.recordedChunks.push(e.data);
      };
      g2State.refMediaRecorder.onstop = () => {
        const blob = new Blob(g2State.recordedChunks, { type: 'audio/webm' });
        if (g2State.refAudioUrl) URL.revokeObjectURL(g2State.refAudioUrl);
        g2State.refAudioUrl = URL.createObjectURL(blob);
        g2State.refAudioElement = new Audio(g2State.refAudioUrl);
      };
      g2State.refMediaRecorder.start();
    } catch (err) {
      console.warn('MediaRecorder notice:', err);
    }
  }

  function g2StopRecordRef() {
    g2State.isRecordingRef = false;
    g2State.refDurationSec = (performance.now() - g2State.startTime) / 1000;

    if (g2State.refMediaRecorder && g2State.refMediaRecorder.state !== 'inactive') {
      g2State.refMediaRecorder.stop();
    }

    if (DOM.g2RecordRefBtnText) DOM.g2RecordRefBtnText.textContent = '🔴 Record Target';
    if (DOM.g2RecordRefBtn) DOM.g2RecordRefBtn.classList.replace('btn-accent', 'btn-primary');
    if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Target Recorded';
    if (DOM.targetDurationBadge) DOM.targetDurationBadge.textContent = `${g2State.refDurationSec.toFixed(1)}s`;

    if (DOM.g2PlayRefBtn) DOM.g2PlayRefBtn.disabled = false;
    if (DOM.g2StartMatchBtn) DOM.g2StartMatchBtn.disabled = false;

    if (DOM.g2RatingBadge) DOM.g2RatingBadge.textContent = 'READY TO ATTEMPT';

    redrawTargetSpectrogram();
  }

  function g2PlayRef() {
    if (!g2State.refAudioElement) return;

    g2State.isPlayingRef = true;
    g2State.refAudioElement.currentTime = 0;
    g2State.refAudioElement.play();

    if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Replaying Target...';

    const animatePlayback = () => {
      if (g2State.refAudioElement && !g2State.refAudioElement.paused) {
        const progress = g2State.refAudioElement.currentTime / g2State.refAudioElement.duration;
        redrawTargetSpectrogram(progress);
        g2State.playAnimFrameId = requestAnimationFrame(animatePlayback);
      } else {
        g2State.isPlayingRef = false;
        if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Target Playback Ended';
        redrawTargetSpectrogram();
      }
    };
    animatePlayback();
  }

  async function g2ToggleMatch() {
    if (g2State.isMatching) {
      g2StopMatch();
    } else {
      await g2StartMatch();
    }
  }

  async function g2StartMatch() {
    if (!isRunning) {
      await startMicrophone();
    }
    g2State.isMatching = true;
    g2State.attemptSpectra = [];
    g2State.matchScores = [];
    g2State.matchStartTime = performance.now();
    g2State.lastMatchX = 0;

    if (DOM.g2StartMatchBtnText) DOM.g2StartMatchBtnText.textContent = '⏹️ Stop Attempt';
    if (DOM.g2StartMatchBtn) DOM.g2StartMatchBtn.classList.replace('btn-accent', 'btn-secondary');
    if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Matching Live Attempt...';
    if (DOM.attemptStatusBadge) DOM.attemptStatusBadge.textContent = 'MATCHING LIVE';

    // Clear attempt canvas to dark background
    if (!attemptSpectroCtx && DOM.attemptSpectrogramCanvas) {
      attemptSpectroCtx = DOM.attemptSpectrogramCanvas.getContext('2d');
    }
    if (attemptSpectroCtx && DOM.attemptSpectrogramCanvas) {
      attemptSpectroCtx.fillStyle = '#030509';
      attemptSpectroCtx.fillRect(0, 0, DOM.attemptSpectrogramCanvas.width, DOM.attemptSpectrogramCanvas.height);
    }

    // Automatically trigger audio playback of recorded target so user can sing along!
    if (g2State.refAudioElement) {
      g2State.refAudioElement.currentTime = 0;
      g2State.refAudioElement.play();
    }
  }

  function g2StopMatch() {
    g2State.isMatching = false;
    if (g2State.refAudioElement) {
      g2State.refAudioElement.pause();
    }
    if (DOM.g2StartMatchBtnText) DOM.g2StartMatchBtnText.textContent = '🎤 Start Attempt';
    if (DOM.g2StartMatchBtn) DOM.g2StartMatchBtn.classList.replace('btn-secondary', 'btn-accent');
    if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Attempt Completed';

    // Auto-detect and align microphone/device output latency!
    autoDetectAndAlignLatency();

    redrawTargetSpectrogram();
    redrawAttemptSpectrogram();
  }

  function g2Reset() {
    g2State.isRecordingRef = false;
    g2State.isPlayingRef = false;
    g2State.isMatching = false;
    g2State.refSpectra = [];
    g2State.attemptSpectra = [];
    g2State.matchScores = [];

    if (g2State.refAudioElement) {
      g2State.refAudioElement.pause();
      g2State.refAudioElement = null;
    }

    if (DOM.g2RecordRefBtnText) DOM.g2RecordRefBtnText.textContent = '🔴 Record Target';
    if (DOM.g2PlayRefBtn) DOM.g2PlayRefBtn.disabled = true;
    if (DOM.g2StartMatchBtn) DOM.g2StartMatchBtn.disabled = true;
    if (DOM.game2StatusText) DOM.game2StatusText.textContent = 'Idle';
    if (DOM.targetDurationBadge) DOM.targetDurationBadge.textContent = '0.0s';
    if (DOM.attemptStatusBadge) DOM.attemptStatusBadge.textContent = 'READY';

    if (DOM.g2ScoreVal) DOM.g2ScoreVal.textContent = '0%';
    if (DOM.g2ScoreBarFill) DOM.g2ScoreBarFill.style.width = '0%';
    if (DOM.g2RatingBadge) {
      DOM.g2RatingBadge.textContent = 'RECORD TARGET FIRST';
      DOM.g2RatingBadge.className = 'rating-badge';
    }

    if (targetSpectroCtx && DOM.targetSpectrogramCanvas) {
      targetSpectroCtx.clearRect(0, 0, DOM.targetSpectrogramCanvas.width, DOM.targetSpectrogramCanvas.height);
    }
    if (attemptSpectroCtx && DOM.attemptSpectrogramCanvas) {
      attemptSpectroCtx.clearRect(0, 0, DOM.attemptSpectrogramCanvas.width, DOM.attemptSpectrogramCanvas.height);
    }
  }

  function resizeGame2Canvases() {
    if (!DOM.targetSpectrogramCanvas || !DOM.attemptSpectrogramCanvas) return;
    const parentTarget = DOM.targetSpectrogramCanvas.parentElement;
    const parentAttempt = DOM.attemptSpectrogramCanvas.parentElement;
    if (parentTarget && parentAttempt) {
      const rectTarget = parentTarget.getBoundingClientRect();
      const rectAttempt = parentAttempt.getBoundingClientRect();
      if (rectTarget.width > 0 && rectTarget.height > 0) {
        DOM.targetSpectrogramCanvas.width = Math.floor(rectTarget.width);
        DOM.targetSpectrogramCanvas.height = Math.floor(rectTarget.height);
        redrawTargetSpectrogram();
      }
      if (rectAttempt.width > 0 && rectAttempt.height > 0) {
        DOM.attemptSpectrogramCanvas.width = Math.floor(rectAttempt.width);
        DOM.attemptSpectrogramCanvas.height = Math.floor(rectAttempt.height);
      }
    }
  }

  function drawColumnToCanvas(canvas, ctx, frequencyData) {
    if (!canvas || !ctx || !frequencyData) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    const speed = 2;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    ctx.fillStyle = '#030509';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, -speed, 0);

    const colImg = ctx.createImageData(speed, height);
    const data = colImg.data;
    const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
    const nyquist = sampleRate / 2;
    const numBins = frequencyData.length;
    const minFreq = 20;
    const maxFreq = Math.min(config.maxFreq, nyquist);
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    for (let y = 0; y < height; y++) {
      const normY = 1 - (y / (height - 1));
      let freq = normY * maxFreq;
      if (config.scale === 'logarithmic') {
        freq = Math.pow(10, logMin + normY * (logMax - logMin));
      }

      const binFloat = (freq / nyquist) * numBins;
      const binLow = Math.floor(binFloat);
      const binHigh = Math.min(numBins - 1, binLow + 1);
      const weight = binFloat - binLow;

      let db = -100;
      if (binLow >= 0 && binHigh < numBins) {
        db = frequencyData[binLow] * (1 - weight) + frequencyData[binHigh] * weight;
      }

      const currentGate = config.autoAdjust ? effectiveNoiseGate : config.noiseGate;
      const currentGain = config.autoAdjust ? effectiveGain : config.gain;
      const currentContrast = config.autoAdjust ? effectiveContrast : config.contrast;

      if (db < currentGate) db = -100;
      let normVal = Math.max(0, Math.min(1, (db + 100) / 100));
      normVal = Math.pow(Math.min(1, normVal * currentGain), currentContrast);
      const colorIdx = Math.min(255, Math.max(0, Math.floor(normVal * 255)));
      const color = lut[colorIdx];

      for (let s = 0; s < speed; s++) {
        const pixelIdx = (y * speed + s) * 4;
        data[pixelIdx] = color[0];
        data[pixelIdx + 1] = color[1];
        data[pixelIdx + 2] = color[2];
        data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(colImg, width - speed, 0);
  }

  function redrawTargetSpectrogram(progress = null) {
    if (!DOM.targetSpectrogramCanvas) return;
    if (!targetSpectroCtx) {
      targetSpectroCtx = DOM.targetSpectrogramCanvas.getContext('2d');
    }
    const ctx = targetSpectroCtx;
    if (!ctx) return;

    const width = DOM.targetSpectrogramCanvas.width;
    const height = DOM.targetSpectrogramCanvas.height;
    if (width === 0 || height === 0) return;

    if (!targetCacheCanvas) {
      targetCacheCanvas = document.createElement('canvas');
    }
    if (targetCacheCanvas.width !== width || targetCacheCanvas.height !== height) {
      targetCacheCanvas.width = width;
      targetCacheCanvas.height = height;
      targetCacheCtx = targetCacheCanvas.getContext('2d');
    }

    if (progress === null || !targetCacheCtx) {
      if (!targetCacheCtx) targetCacheCtx = targetCacheCanvas.getContext('2d');
      targetCacheCtx.fillStyle = '#030509';
      targetCacheCtx.fillRect(0, 0, width, height);

      const spectra = g2State.refSpectra;
      if (spectra && spectra.length > 0) {
        const frameWidth = width / spectra.length;
        const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
        const nyquist = sampleRate / 2;
        const minFreq = 20;
        const maxFreq = Math.min(config.maxFreq, nyquist);
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);

        for (let t = 0; t < spectra.length; t++) {
          const frame = spectra[t];
          const x = t * frameWidth;
          const numBins = frame.length;

          for (let y = 0; y < height; y++) {
            const normY = 1 - (y / (height - 1));
            let freq = normY * maxFreq;
            if (config.scale === 'logarithmic') {
              freq = Math.pow(10, logMin + normY * (logMax - logMin));
            }

            const binFloat = (freq / nyquist) * numBins;
            const binLow = Math.floor(binFloat);
            const binHigh = Math.min(numBins - 1, binLow + 1);
            const weight = binFloat - binLow;

            let db = -100;
            if (binLow >= 0 && binHigh < numBins) {
              db = frame[binLow] * (1 - weight) + frame[binHigh] * weight;
            }

            const currentGate = config.autoAdjust ? effectiveNoiseGate : config.noiseGate;
            const currentGain = config.autoAdjust ? effectiveGain : config.gain;
            const currentContrast = config.autoAdjust ? effectiveContrast : config.contrast;

            if (db < currentGate) db = -100;
            let normVal = Math.max(0, Math.min(1, (db + 100) / 100));
            normVal = Math.pow(Math.min(1, normVal * currentGain), currentContrast);
            const colorIdx = Math.min(255, Math.max(0, Math.floor(normVal * 255)));
            const color = lut[colorIdx];

            targetCacheCtx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
            targetCacheCtx.fillRect(x, y, Math.ceil(frameWidth), 1);
          }
        }
      }
    }

    ctx.drawImage(targetCacheCanvas, 0, 0);

    if (progress !== null) {
      const cursorX = width * progress;
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();
    }
  }

  function redrawAttemptSpectrogram(progress = null) {
    if (!DOM.attemptSpectrogramCanvas) return;
    if (!attemptSpectroCtx) {
      attemptSpectroCtx = DOM.attemptSpectrogramCanvas.getContext('2d');
    }
    const ctx = attemptSpectroCtx;
    if (!ctx) return;

    const width = DOM.attemptSpectrogramCanvas.width;
    const height = DOM.attemptSpectrogramCanvas.height;
    if (width === 0 || height === 0) return;

    ctx.fillStyle = '#030509';
    ctx.fillRect(0, 0, width, height);

    const spectra = g2State.alignedAttemptSpectra || g2State.attemptSpectra;
    if (!spectra || spectra.length === 0) return;

    const frameWidth = width / spectra.length;
    const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
    const nyquist = sampleRate / 2;
    const minFreq = 20;
    const maxFreq = Math.min(config.maxFreq, nyquist);
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    for (let t = 0; t < spectra.length; t++) {
      const frame = spectra[t];
      const x = t * frameWidth;
      const numBins = frame.length;

      for (let y = 0; y < height; y++) {
        const normY = 1 - (y / (height - 1));
        let freq = normY * maxFreq;
        if (config.scale === 'logarithmic') {
          freq = Math.pow(10, logMin + normY * (logMax - logMin));
        }

        const binFloat = (freq / nyquist) * numBins;
        const binLow = Math.floor(binFloat);
        const binHigh = Math.min(numBins - 1, binLow + 1);
        const weight = binFloat - binLow;

        let db = -100;
        if (binLow >= 0 && binHigh < numBins) {
          db = frame[binLow] * (1 - weight) + frame[binHigh] * weight;
        }

        const currentGate = config.autoAdjust ? effectiveNoiseGate : config.noiseGate;
        const currentGain = config.autoAdjust ? effectiveGain : config.gain;
        const currentContrast = config.autoAdjust ? effectiveContrast : config.contrast;

        if (db < currentGate) db = -100;
        let normVal = Math.max(0, Math.min(1, (db + 100) / 100));
        normVal = Math.pow(Math.min(1, normVal * currentGain), currentContrast);
        const colorIdx = Math.min(255, Math.max(0, Math.floor(normVal * 255)));
        const color = lut[colorIdx];

        ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        ctx.fillRect(x, y, Math.ceil(frameWidth), 1);
      }
    }

    if (progress !== null) {
      const cursorX = width * progress;
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();
    }
  }

  function computeSpectralSimilarity(liveFrame, refFrame) {
    if (!liveFrame || !refFrame) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    const length = Math.min(liveFrame.length, refFrame.length);

    for (let i = 0; i < length; i++) {
      const a = Math.max(0, liveFrame[i] + 100);
      const b = Math.max(0, refFrame[i] + 100);
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;
    const cosineSim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0, Math.min(1, cosineSim));
  }

  function getEffectiveSampleRate() {
    if (audioCtx && audioCtx.sampleRate) return audioCtx.sampleRate;
    return sampleRate || 44100;
  }

  function extractFastPitchAndNote(frame) {
    if (!frame || frame.length === 0) return { freq: 0, note: '---', isPercussive: false, energy: -100 };

    const sr = getEffectiveSampleRate();
    let maxDb = -100;
    let maxBin = 0;
    let totalEnergy = 0;
    const nyquist = sr / 2;
    const numBins = frame.length;
    const searchMaxBin = Math.floor((4000 / nyquist) * numBins);

    for (let i = 2; i < searchMaxBin; i++) {
      let db = frame[i];
      if (!Number.isFinite(db)) db = -100;
      if (db > -90) totalEnergy += Math.pow(10, db / 20);
      if (db > maxDb) {
        maxDb = db;
        maxBin = i;
      }
    }

    const dynGate = config.autoAdjust ? Math.min(-70, effectiveNoiseGate + 8) : -72;
    if (maxDb < dynGate) {
      return { freq: 0, note: '---', isPercussive: false, energy: maxDb };
    }

    let exactBin = maxBin;
    if (maxBin > 0 && maxBin < numBins - 1) {
      let alpha = frame[maxBin - 1];
      let beta = frame[maxBin];
      let gamma = frame[maxBin + 1];
      if (!Number.isFinite(alpha)) alpha = -100;
      if (!Number.isFinite(beta)) beta = -100;
      if (!Number.isFinite(gamma)) gamma = -100;

      const denom = alpha - 2 * beta + gamma;
      if (Math.abs(denom) > 0.00001) {
        const delta = 0.5 * (alpha - gamma) / denom;
        exactBin = maxBin + Math.max(-0.5, Math.min(0.5, delta));
      }
    }

    const freq = Math.round(exactBin * (sr / (numBins * 2)));

    let harmonicEnergy = 0;
    for (let h = -2; h <= 2; h++) {
      const b = Math.round(maxBin + h);
      if (b >= 0 && b < numBins) {
        let val = frame[b];
        if (Number.isFinite(val)) harmonicEnergy += Math.pow(10, val / 20);
      }
    }

    const tonalityRatio = totalEnergy > 0 ? (harmonicEnergy / totalEnergy) : 0;
    const isPitched = tonalityRatio > 0.20 && Number.isFinite(freq) && freq >= 50 && freq <= 3500;

    if (isPitched) {
      const note = freqToNote(freq);
      return { freq, note, isPercussive: false, energy: maxDb };
    } else {
      return { freq: 0, note: '🥁 DRUM', isPercussive: true, energy: maxDb };
    }
  }

  function extractFramePeakEnergy(frame) {
    if (!frame) return -100;
    let maxDb = -100;
    for (let i = 0; i < frame.length; i++) {
      let db = frame[i];
      if (!Number.isFinite(db)) db = -100;
      if (db > maxDb) maxDb = db;
    }
    return maxDb;
  }

  function computeAdvancedMusicalMatch(attFrame, refFrame) {
    if (!attFrame || !refFrame) return 0;

    const refInfo = extractFastPitchAndNote(refFrame);
    const attInfo = extractFastPitchAndNote(attFrame);

    const silenceThreshold = config.autoAdjust ? Math.min(-70, effectiveNoiseGate + 8) : -72;
    const refActive = refInfo.energy > silenceThreshold;
    const attActive = attInfo.energy > silenceThreshold;

    if (!refActive && !attActive) {
      return null;
    }

    if (refActive && !attActive) {
      return 0.0;
    }

    if (!refActive && attActive) {
      return 0.1;
    }

    const shapeSim = computeSpectralSimilarity(attFrame, refFrame);

    // CASE 1: TARGET IS A DRUM / PERCUSSIVE STRIKE (NO PITCH NOTE)
    if (refInfo.isPercussive || refInfo.freq === 0) {
      const energyDiff = Math.abs(refInfo.energy - attInfo.energy);
      const energyScore = Math.max(0, 1 - (energyDiff / 35));

      const drumScore = (shapeSim * 0.70) + (energyScore * 0.30);
      return Math.max(0.0, Math.min(1.0, Number.isFinite(drumScore) ? drumScore : shapeSim));
    }

    // CASE 2: TARGET IS A PITCHED NOTE (VOCALS / INSTRUMENT)
    if (refInfo.freq > 0 && attInfo.freq > 0) {
      const freqRatio = attInfo.freq / refInfo.freq;
      if (Number.isFinite(freqRatio) && freqRatio > 0) {
        const centsDiff = Math.abs(1200 * Math.log2(freqRatio));

        let pitchScore = 0;
        if (centsDiff <= 30) {
          pitchScore = 1.0;
        } else if (centsDiff <= 60) {
          pitchScore = 0.90;
        } else if (centsDiff <= 120) {
          pitchScore = 0.75;
        } else if (centsDiff <= 250) {
          pitchScore = 0.40;
        } else if (centsDiff <= 500) {
          pitchScore = 0.20;
        } else {
          pitchScore = 0.05;
        }

        const vocalScore = (pitchScore * 0.70) + (shapeSim * 0.30);
        return Math.max(0.0, Math.min(1.0, Number.isFinite(vocalScore) ? vocalScore : shapeSim));
      }
    }

    return Math.max(0.0, Math.min(1.0, shapeSim));
  }

  function scaleToFullRangeScore(rawScore) {
    if (rawScore <= 0.20) return 0.0;

    const normalized = (rawScore - 0.20) / (0.78 - 0.20);
    const clamped = Math.max(0.0, Math.min(1.0, normalized));

    let scaled = Math.pow(clamped, 1.3);

    if (clamped >= 0.75) {
      scaled = 0.78 + (clamped - 0.75) * 0.88;
    }

    return Math.max(0.0, Math.min(1.0, scaled));
  }

  function autoDetectAndAlignLatency() {
    const refSpectra = g2State.refSpectra;
    const attSpectra = g2State.attemptSpectra;

    if (!refSpectra || !attSpectra || refSpectra.length === 0 || attSpectra.length === 0) return 0;

    const nRef = refSpectra.length;
    const nAtt = attSpectra.length;

    // Search range: -15 frames to +70 frames (up to ~1000ms mobile/bluetooth latency)
    const minShift = -15;
    const maxShift = Math.min(70, Math.floor(nAtt * 0.45));

    let bestShift = 0;
    let maxTotalScore = -1;

    for (let shift = minShift; shift <= maxShift; shift++) {
      let sumScore = 0;
      let count = 0;

      for (let t = 0; t < nRef; t++) {
        const attProgress = (t / nRef) + (shift / nRef);
        const attIdx = Math.floor(attProgress * nAtt);

        if (attIdx >= 0 && attIdx < nAtt) {
          const matchScore = computeAdvancedMusicalMatch(attSpectra[attIdx], refSpectra[t]);
          if (matchScore !== null) {
            sumScore += matchScore;
            count++;
          }
        }
      }

      if (count > 0) {
        const avgScore = sumScore / count;
        if (avgScore > maxTotalScore) {
          maxTotalScore = avgScore;
          bestShift = shift;
        }
      }
    }

    const msPerFrame = (g2State.refDurationSec * 1000) / nRef;
    const detectedLatencyMs = Math.round(bestShift * msPerFrame);
    g2State.detectedLatencyMs = detectedLatencyMs;
    g2State.bestFrameShift = bestShift;

    // Build Time-Aligned Attempt Array mapped 1-to-1 with Target time axis
    const alignedAttempt = new Array(nRef);
    for (let t = 0; t < nRef; t++) {
      const attProgress = (t / nRef) + (bestShift / nRef);
      const attIdx = Math.max(0, Math.min(nAtt - 1, Math.floor(attProgress * nAtt)));
      alignedAttempt[t] = attSpectra[attIdx];
    }
    g2State.alignedAttemptSpectra = alignedAttempt;

    const scaledScore = scaleToFullRangeScore(maxTotalScore);
    const scorePercent = Math.max(0, Math.min(100, Math.round(scaledScore * 100)));
    g2State.finalCompensatedScore = scorePercent;

    if (DOM.g2ScoreVal) DOM.g2ScoreVal.textContent = `${scorePercent}%`;
    if (DOM.g2ScoreBarFill) DOM.g2ScoreBarFill.style.width = `${scorePercent}%`;

    if (DOM.g2RatingBadge) {
      if (scorePercent >= 88) {
        DOM.g2RatingBadge.textContent = '🌟 PERFECT MATCH!';
        DOM.g2RatingBadge.className = 'rating-badge perfect';
      } else if (scorePercent >= 68) {
        DOM.g2RatingBadge.textContent = '🔥 GREAT VOCAL MATCH!';
        DOM.g2RatingBadge.className = 'rating-badge great';
      } else if (scorePercent >= 40) {
        DOM.g2RatingBadge.textContent = '👍 GOOD ATTEMPT';
        DOM.g2RatingBadge.className = 'rating-badge good';
      } else {
        DOM.g2RatingBadge.textContent = 'KEEP TRYING...';
        DOM.g2RatingBadge.className = 'rating-badge';
      }
    }

    if (DOM.attemptStatusBadge) {
      const latStr = detectedLatencyMs >= 0 ? `+${detectedLatencyMs}ms` : `${detectedLatencyMs}ms`;
      DOM.attemptStatusBadge.textContent = `LATENCY ALIGNED (${latStr})`;
    }

    return detectedLatencyMs;
  }

  function drawFrameToCanvasAtX(canvas, ctx, frequencyData, xPos, colWidth) {
    if (!canvas || !ctx || !frequencyData) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    const w = Math.max(2, Math.ceil(colWidth));
    const colImg = ctx.createImageData(w, height);
    const data = colImg.data;
    const lut = COLORMAPS[config.colormap] || COLORMAPS.viridis;
    const nyquist = sampleRate / 2;
    const numBins = frequencyData.length;
    const minFreq = 20;
    const maxFreq = Math.min(config.maxFreq, nyquist);
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    for (let y = 0; y < height; y++) {
      const normY = 1 - (y / (height - 1));
      let freq = normY * maxFreq;
      if (config.scale === 'logarithmic') {
        freq = Math.pow(10, logMin + normY * (logMax - logMin));
      }

      const binFloat = (freq / nyquist) * numBins;
      const binLow = Math.floor(binFloat);
      const binHigh = Math.min(numBins - 1, binLow + 1);
      const weight = binFloat - binLow;

      let db = -100;
      if (binLow >= 0 && binHigh < numBins) {
        db = frequencyData[binLow] * (1 - weight) + frequencyData[binHigh] * weight;
      }

      const currentGate = config.autoAdjust ? effectiveNoiseGate : config.noiseGate;
      const currentGain = config.autoAdjust ? effectiveGain : config.gain;
      const currentContrast = config.autoAdjust ? effectiveContrast : config.contrast;

      if (db < currentGate) db = -100;
      let normVal = Math.max(0, Math.min(1, (db + 100) / 100));
      normVal = Math.pow(Math.min(1, normVal * currentGain), currentContrast);
      const colorIdx = Math.min(255, Math.max(0, Math.floor(normVal * 255)));
      const color = lut[colorIdx];

      for (let s = 0; s < w; s++) {
        const pixelIdx = (y * w + s) * 4;
        data[pixelIdx] = color[0];
        data[pixelIdx + 1] = color[1];
        data[pixelIdx + 2] = color[2];
        data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(colImg, Math.max(0, Math.floor(xPos)), 0);
  }

  function processGame2LiveFrame(liveFrequencyData) {
    // Case 1: Recording Target Audio
    if (g2State.isRecordingRef && DOM.targetSpectrogramCanvas) {
      const frameCopy = new Float32Array(liveFrequencyData);
      g2State.refSpectra.push(frameCopy);

      if (!targetSpectroCtx) {
        targetSpectroCtx = DOM.targetSpectrogramCanvas.getContext('2d');
      }
      drawColumnToCanvas(DOM.targetSpectrogramCanvas, targetSpectroCtx, liveFrequencyData);

      // Live note badge update during target recording
      const refInfo = extractFastPitchAndNote(liveFrequencyData);
      if (DOM.targetNoteBadge) DOM.targetNoteBadge.textContent = `Note: ${refInfo.note}`;
    }

    // Case 2: Live Attempt (Synchronized Time-Aligned Left-to-Right Engine)
    if (g2State.isMatching && DOM.attemptSpectrogramCanvas && g2State.refDurationSec > 0) {
      if (!attemptSpectroCtx) {
        attemptSpectroCtx = DOM.attemptSpectrogramCanvas.getContext('2d');
      }
      const ctx = attemptSpectroCtx;
      const canvas = DOM.attemptSpectrogramCanvas;
      const width = canvas.width;
      const height = canvas.height;

      // Extend max attempt recording duration by +1.2 seconds to capture latency-delayed end notes!
      const maxAttemptDurationSec = g2State.refDurationSec + 1.2;
      const elapsedSec = (performance.now() - g2State.matchStartTime) / 1000;

      const sweepProgress = Math.min(1.0, elapsedSec / g2State.refDurationSec);
      const overallProgress = Math.min(1.0, elapsedSec / maxAttemptDurationSec);
      const posX = Math.floor(sweepProgress * width);

      if (width > 0 && height > 0) {
        const stepWidth = Math.max(3, posX - g2State.lastMatchX);
        drawFrameToCanvasAtX(canvas, ctx, liveFrequencyData, g2State.lastMatchX, stepWidth);
        g2State.lastMatchX = posX;

        // Update playback sweep line on top target canvas to match bottom attempt cursor!
        redrawTargetSpectrogram(sweepProgress);
      }

      // Save live frame for attempt summary
      const frameCopy = new Float32Array(liveFrequencyData);
      g2State.attemptSpectra.push(frameCopy);

      // Calculate Real-time Pitch & Rhythm Match against reference clip frame & Update Live HUD Note Badges!
      if (g2State.refSpectra.length > 0) {
        const frameIndex = Math.min(g2State.refSpectra.length - 1, Math.floor(sweepProgress * g2State.refSpectra.length));
        const refFrame = g2State.refSpectra[frameIndex];

        const refInfo = extractFastPitchAndNote(refFrame);
        const attInfo = extractFastPitchAndNote(liveFrequencyData);

        if (DOM.targetNoteBadge) DOM.targetNoteBadge.textContent = `Target: ${refInfo.note}`;
        if (DOM.attemptNoteBadge) DOM.attemptNoteBadge.textContent = `Your Note: ${attInfo.note}`;

        const match = computeAdvancedMusicalMatch(liveFrequencyData, refFrame);
        if (match !== null) {
          g2State.matchScores.push(match);
          const avgRaw = g2State.matchScores.reduce((a, b) => a + b, 0) / g2State.matchScores.length;
          const scaled = scaleToFullRangeScore(avgRaw);
          const scorePercent = Math.round(scaled * 100);

          if (DOM.g2ScoreVal) DOM.g2ScoreVal.textContent = `${scorePercent}%`;
          if (DOM.g2ScoreBarFill) DOM.g2ScoreBarFill.style.width = `${scorePercent}%`;

          if (DOM.g2RatingBadge) {
            if (scorePercent >= 88) {
              DOM.g2RatingBadge.textContent = '🌟 PERFECT MATCH!';
              DOM.g2RatingBadge.className = 'rating-badge perfect';
            } else if (scorePercent >= 68) {
              DOM.g2RatingBadge.textContent = '🔥 GREAT VOCAL MATCH!';
              DOM.g2RatingBadge.className = 'rating-badge great';
            } else if (scorePercent >= 40) {
              DOM.g2RatingBadge.textContent = '👍 GOOD ATTEMPT';
              DOM.g2RatingBadge.className = 'rating-badge good';
            } else {
              DOM.g2RatingBadge.textContent = 'KEEP TRYING...';
              DOM.g2RatingBadge.className = 'rating-badge';
            }
          }
        }
      }

      // Automatically complete attempt when extended duration (T_ref + 1.2s) elapses!
      if (overallProgress >= 1.0) {
        g2StopMatch();
      }
    }
  }

})();
