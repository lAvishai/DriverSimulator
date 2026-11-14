/**
 * Emergency Crossroad Simulator — Main Application & Multi-Viewport Renderer
 * Connects Free-Play Scenario Configurator, 3D Cockpit + 3 Functional Mirrors,
 * Siren/Horn/PA controls, ECG Monitor, and Crossroad Progression.
 */
(function () {
  class EmergencySimulatorApp {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.autoClear = false;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;

      this.scene = new THREE.Scene();
      this.audio = new window.EmergencyAudioEngine();
      this.world = new window.WorldBuilder(this.scene);
      this.traffic = new window.TrafficAndObstacleManager(this.scene);
      this.player = new window.PlayerEmergencyVehicle(this.scene);

      // Scenario Configuration State
      this.config = {
        vehicle: 'AMBULANCE',
        difficulty: 2,
        weather: 'DAY',
        sameDirTraffic: 'MEDIUM',
        pedestrians: 'MEDIUM',
        screamIntensity: 'INTENSE',
        crossingsGoal: 3
      };

      // Gameplay State
      this.isRunning = false;
      this.sirenMode = 'OFF'; // OFF | WAIL | YELP | PHASER
      this.hornActive = false;
      this.paActiveTimer = 0;
      this.crossingsCleared = 0;
      this.nearMissCount = 0;
      this.elapsedTime = 0;
      this.lastAmbientVocalElapsed = 0;
      this.silentApproachWarnedIndex = -1;

      // Input state
      this.input = {
        forward: false,
        brake: false,
        left: false,
        right: false,
        steerAxis: 0,
        lookLeft: false,
        lookRight: false
      };

      // ECG Canvas state
      this.ecgCanvas = document.getElementById('ecg-canvas');
      this.ecgCtx = this.ecgCanvas.getContext('2d');
      this.ecgPoints = new Array(120).fill(26);
      this.ecgPhase = 0;

      this.viewportW = window.innerWidth;
      this.viewportH = window.innerHeight;
      this.mirrorRects = {};
      this.hudCache = {};
      this.lastHudValues = {};
      this.cacheHUDElements();

      this.bindUIEvents();
      this.bindKeyboardEvents();
      this.bindMobileControls();
      window.addEventListener('resize', () => this.onResize());
      document.addEventListener('visibilitychange', () => {
        this.audio.setFocusMuted(document.hidden);
      });
      window.addEventListener('blur', () => {
        this.audio.setFocusMuted(true);
      });
      window.addEventListener('focus', () => {
        if (!document.hidden) {
          this.audio.setFocusMuted(false);
        }
      });

      // Build an initial preview background scene behind the configurator modal
      this.world.buildScenarioWorld(this.config);
      this.traffic.spawnForScenario(this.config, this.world.crossroadZPositions);
      this.player.configure(this.config.vehicle, this.config.weather);
      this.updateMirrorRects();

      this.lastFrameTime = performance.now();
      requestAnimationFrame((t) => this.animate(t));
    }

    bindUIEvents() {
      // Vehicle Selector Cards
      document.querySelectorAll('#vehicle-selector .select-card').forEach((card) => {
        card.addEventListener('click', () => {
          document.querySelectorAll('#vehicle-selector .select-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          this.config.vehicle = card.dataset.vehicle;
        });
      });

      // Difficulty Selector Cards
      document.querySelectorAll('#difficulty-selector .select-card').forEach((card) => {
        card.addEventListener('click', () => {
          document.querySelectorAll('#difficulty-selector .select-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          this.config.difficulty = parseInt(card.dataset.difficulty, 10);
        });
      });

      // Launch Scenario Button
      document.getElementById('start-scenario-btn').addEventListener('click', () => {
        this.readDropdownConfigs();
        this.startScenario();
      });

      // Top HUD Configure Scenario Button
      document.getElementById('open-config-btn').addEventListener('click', () => {
        this.openScenarioConfigurator();
      });

      // Debrief Modal Buttons
      document.getElementById('retry-scenario-btn').addEventListener('click', () => {
        document.getElementById('debrief-modal').classList.add('hidden');
        this.startScenario();
      });

      document.getElementById('reconfigure-btn').addEventListener('click', () => {
        document.getElementById('debrief-modal').classList.add('hidden');
        this.openScenarioConfigurator();
      });

      // Siren Mode Buttons
      document.querySelectorAll('.siren-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.setSirenMode(btn.dataset.mode);
        });
      });

      // Air Horn Button (hold or click)
      const hornBtn = document.getElementById('airhorn-btn');
      const startHorn = (e) => {
        e.preventDefault();
        this.setHorn(true);
      };
      const stopHorn = () => this.setHorn(false);
      hornBtn.addEventListener('mousedown', startHorn);
      hornBtn.addEventListener('touchstart', startHorn);
      window.addEventListener('mouseup', stopHorn);
      window.addEventListener('touchend', stopHorn);

      // Strobe Lights Button
      document.getElementById('lights-toggle-btn').addEventListener('click', () => {
        this.toggleStrobes();
      });

      // PA Megaphone Button
      document.getElementById('pa-voice-btn').addEventListener('click', () => {
        this.triggerPAMegaphone();
      });

      // Center Mirror Rear vs. Cabin Toggle Button
      document.getElementById('toggle-cabin-cam-btn').addEventListener('click', () => {
        this.toggleCenterMirrorMode();
      });

      // Head-Check Pills (Look Left / Right)
      const leftPill = document.getElementById('look-left-pill');
      const rightPill = document.getElementById('look-right-pill');
      leftPill.addEventListener('mousedown', () => {
        this.input.lookLeft = true;
        leftPill.classList.add('active');
      });
      rightPill.addEventListener('mousedown', () => {
        this.input.lookRight = true;
        rightPill.classList.add('active');
      });
      window.addEventListener('mouseup', () => {
        this.input.lookLeft = false;
        this.input.lookRight = false;
        leftPill.classList.remove('active');
        rightPill.classList.remove('active');
      });
    }

    bindMobileControls() {
      const isTouchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isTouchCapable) {
        document.body.classList.add('is-touch-device');
      }

      // 1. Proportional Multi-Touch Steering Pad (Left Thumb)
      const steerPad = document.getElementById('touch-steer-pad');
      const steerKnob = document.getElementById('touch-steer-knob');
      let steerPointerId = null;

      const updateSteerFromClientX = (clientX) => {
        if (!steerPad || !steerKnob) return;
        const rect = steerPad.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const maxOffset = Math.max(24, rect.width / 2 - 28);
        const dx = THREE.MathUtils.clamp(clientX - centerX, -maxOffset, maxOffset);
        const norm = dx / maxOffset; // -1 (left) .. +1 (right)
        // Vehicle heading uses +1 for left, -1 for right
        this.input.steerAxis = -norm;
        steerKnob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
      };

      const resetSteerPad = () => {
        steerPointerId = null;
        this.input.steerAxis = 0;
        if (steerKnob) {
          steerKnob.style.transform = 'translate(-50%, -50%)';
        }
        if (steerPad) steerPad.classList.remove('active');
      };

      if (steerPad) {
        steerPad.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          steerPointerId = e.pointerId;
          steerPad.setPointerCapture(e.pointerId);
          steerPad.classList.add('active');
          updateSteerFromClientX(e.clientX);
        });

        steerPad.addEventListener('pointermove', (e) => {
          if (e.pointerId !== steerPointerId) return;
          e.preventDefault();
          updateSteerFromClientX(e.clientX);
        });

        steerPad.addEventListener('pointerup', (e) => {
          if (e.pointerId === steerPointerId) resetSteerPad();
        });
        steerPad.addEventListener('pointercancel', (e) => {
          if (e.pointerId === steerPointerId) resetSteerPad();
        });
      }

      // 2. Multi-Touch Pedals & Quick Horn (Right Thumb)
      const bindHoldButton = (btnId, onDown, onUp) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        let activePointerId = null;

        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          activePointerId = e.pointerId;
          btn.setPointerCapture(e.pointerId);
          btn.classList.add('pressing');
          onDown();
        });

        const release = (e) => {
          if (e.pointerId !== activePointerId) return;
          activePointerId = null;
          btn.classList.remove('pressing');
          onUp();
        };

        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
      };

      bindHoldButton(
        'touch-gas-btn',
        () => { this.input.forward = true; },
        () => { this.input.forward = false; }
      );
      bindHoldButton(
        'touch-brake-btn',
        () => { this.input.brake = true; },
        () => { this.input.brake = false; }
      );
      bindHoldButton(
        'touch-horn-btn',
        () => { this.setHorn(true); },
        () => { this.setHorn(false); }
      );

      // 3. Touch Support for Look Left / Look Right Pills
      const leftPill = document.getElementById('look-left-pill');
      const rightPill = document.getElementById('look-right-pill');
      if (leftPill) {
        leftPill.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.input.lookLeft = true;
          leftPill.classList.add('active');
        }, { passive: false });
        leftPill.addEventListener('touchend', () => {
          this.input.lookLeft = false;
          leftPill.classList.remove('active');
        });
        leftPill.addEventListener('touchcancel', () => {
          this.input.lookLeft = false;
          leftPill.classList.remove('active');
        });
      }
      if (rightPill) {
        rightPill.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.input.lookRight = true;
          rightPill.classList.add('active');
        }, { passive: false });
        rightPill.addEventListener('touchend', () => {
          this.input.lookRight = false;
          rightPill.classList.remove('active');
        });
        rightPill.addEventListener('touchcancel', () => {
          this.input.lookRight = false;
          rightPill.classList.remove('active');
        });
      }

      // 4. Tap Center Mirror to Toggle Rear Traffic vs. Back Cabin View
      const centerMirrorRect = document.getElementById('mirror-center-rect');
      if (centerMirrorRect) {
        centerMirrorRect.addEventListener('click', () => {
          if (this.isRunning) this.toggleCenterMirrorMode();
        });
      }

      // 5. Swipe Left / Right on Windshield Canvas for 90° Head-Checks
      const canvas = this.canvas;
      let swipePointerId = null;
      let swipeStartX = 0;

      const clearSwipeLook = () => {
        swipePointerId = null;
        this.input.lookLeft = false;
        this.input.lookRight = false;
        if (leftPill) leftPill.classList.remove('active');
        if (rightPill) rightPill.classList.remove('active');
      };

      canvas.addEventListener('pointerdown', (e) => {
        if (!this.isRunning || e.pointerType === 'mouse') return;
        swipePointerId = e.pointerId;
        swipeStartX = e.clientX;
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!this.isRunning || e.pointerId !== swipePointerId) return;
        const dx = e.clientX - swipeStartX;
        if (dx < -28) {
          this.input.lookLeft = true;
          this.input.lookRight = false;
          if (leftPill) leftPill.classList.add('active');
          if (rightPill) rightPill.classList.remove('active');
        } else if (dx > 28) {
          this.input.lookRight = true;
          this.input.lookLeft = false;
          if (rightPill) rightPill.classList.add('active');
          if (leftPill) leftPill.classList.remove('active');
        } else {
          this.input.lookLeft = false;
          this.input.lookRight = false;
          if (leftPill) leftPill.classList.remove('active');
          if (rightPill) rightPill.classList.remove('active');
        }
      });

      canvas.addEventListener('pointerup', (e) => {
        if (e.pointerId === swipePointerId) clearSwipeLook();
      });
      canvas.addEventListener('pointercancel', (e) => {
        if (e.pointerId === swipePointerId) clearSwipeLook();
      });

      // 6. Portrait Orientation Warning Prompt
      const rotateOverlay = document.getElementById('rotate-device-overlay');
      const dismissRotateBtn = document.getElementById('dismiss-rotate-btn');
      let rotateDismissed = false;

      const checkOrientation = () => {
        if (!rotateOverlay) return;
        const isPortraitMobile = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
        rotateOverlay.classList.toggle('hidden', !isPortraitMobile || rotateDismissed);
      };

      if (dismissRotateBtn) {
        dismissRotateBtn.addEventListener('click', () => {
          rotateDismissed = true;
          rotateOverlay.classList.add('hidden');
        });
      }

      window.addEventListener('resize', checkOrientation);
      window.addEventListener('orientationchange', checkOrientation);
      checkOrientation();
    }

    bindKeyboardEvents() {
      window.addEventListener('keydown', (e) => {
        if (!this.isRunning) {
          if (e.code === 'Enter') {
            const modalVisible = !document.getElementById('scenario-modal').classList.contains('hidden');
            if (modalVisible) {
              this.readDropdownConfigs();
              this.startScenario();
            }
          }
          return;
        }

        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            this.input.forward = true;
            break;
          case 'KeyS':
          case 'ArrowDown':
            this.input.brake = true;
            break;
          case 'KeyA':
          case 'ArrowLeft':
            this.input.left = true;
            break;
          case 'KeyD':
          case 'ArrowRight':
            this.input.right = true;
            break;
          case 'KeyQ':
            this.input.lookLeft = true;
            document.getElementById('look-left-pill').classList.add('active');
            break;
          case 'KeyE':
            this.input.lookRight = true;
            document.getElementById('look-right-pill').classList.add('active');
            break;
          case 'Digit1':
            this.setSirenMode('OFF');
            break;
          case 'Digit2':
            this.setSirenMode('WAIL');
            break;
          case 'Digit3':
            this.setSirenMode('YELP');
            break;
          case 'Digit4':
            this.setSirenMode('PHASER');
            break;
          case 'Space':
            e.preventDefault();
            this.setHorn(true);
            break;
          case 'KeyL':
            this.toggleStrobes();
            break;
          case 'KeyC':
            this.toggleCenterMirrorMode();
            break;
          case 'KeyV':
            this.triggerPAMegaphone();
            break;
          case 'Escape':
            this.openScenarioConfigurator();
            break;
        }
      });

      window.addEventListener('keyup', (e) => {
        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            this.input.forward = false;
            break;
          case 'KeyS':
          case 'ArrowDown':
            this.input.brake = false;
            break;
          case 'KeyA':
          case 'ArrowLeft':
            this.input.left = false;
            break;
          case 'KeyD':
          case 'ArrowRight':
            this.input.right = false;
            break;
          case 'KeyQ':
            this.input.lookLeft = false;
            document.getElementById('look-left-pill').classList.remove('active');
            break;
          case 'KeyE':
            this.input.lookRight = false;
            document.getElementById('look-right-pill').classList.remove('active');
            break;
          case 'Space':
            this.setHorn(false);
            break;
        }
      });
    }

    readDropdownConfigs() {
      this.config.weather = document.getElementById('cfg-weather').value;
      const sameDirEl = document.getElementById('cfg-same-dir-traffic');
      this.config.sameDirTraffic = sameDirEl ? sameDirEl.value : 'MEDIUM';
      this.config.pedestrians = document.getElementById('cfg-pedestrians').value;
      this.config.screamIntensity = document.getElementById('cfg-scream-intensity').value;
      this.config.crossingsGoal = parseInt(document.getElementById('cfg-crossings-goal').value, 10);
    }

    openScenarioConfigurator() {
      this.isRunning = false;
      this.audio.stopAll();
      document.getElementById('scenario-modal').classList.remove('hidden');
    }

    startScenario() {
      document.getElementById('scenario-modal').classList.add('hidden');
      document.getElementById('debrief-modal').classList.add('hidden');

      this.audio.init();
      this.audio.setScenarioConfig(this.config.vehicle, this.config.screamIntensity);

      this.world.buildScenarioWorld(this.config);
      this.traffic.spawnForScenario(this.config, this.world.crossroadZPositions);
      this.player.configure(this.config.vehicle, this.config.weather);

      // Update Dashboard Titles per Vehicle
      const hubBadge = document.getElementById('wheel-hub-badge');
      const monitorTitle = document.getElementById('cabin-monitor-title');
      const stabilityLabel = document.getElementById('stability-label');

      if (this.config.vehicle === 'AMBULANCE') {
        hubBadge.textContent = 'EMS';
        monitorTitle.textContent = 'PATIENT VITALS & CABIN STRESS';
        stabilityLabel.textContent = 'PATIENT STABILITY';
        // Default Center Mirror to show the Patient in the Back Cabin on Ambulance start!
        this.player.showCabinInCenterMirror = true;
      } else if (this.config.vehicle === 'FIRETRUCK') {
        hubBadge.textContent = 'FD';
        monitorTitle.textContent = 'CREW & RIG STABILITY MONITOR';
        stabilityLabel.textContent = 'TANK & CREW SAFETY';
        this.player.showCabinInCenterMirror = false;
      } else {
        hubBadge.textContent = 'PD';
        monitorTitle.textContent = 'SUSPECT CAGE & PURSUIT MONITOR';
        stabilityLabel.textContent = 'CABIN ORDER';
        this.player.showCabinInCenterMirror = true;
      }
      this.syncCenterMirrorUI();

      // Default to WAIL siren and Strobes ON at dispatch launch
      this.player.strobesOn = true;
      this.syncStrobeUI();
      this.setSirenMode('WAIL');

      this.crossingsCleared = 0;
      this.nearMissCount = 0;
      this.elapsedTime = 0;
      this.lastAmbientVocalElapsed = 0;
      this.silentApproachWarnedIndex = -1;
      this.lastHudValues = {};
      this.isRunning = true;
      this.updateMirrorRects();

      // Initial dispatch/patient vocal callout
      setTimeout(() => {
        if (this.isRunning) {
          this.audio.triggerCabinVocal('AMBIENT_PAIN', true);
        }
      }, 650);
    }

    setSirenMode(mode) {
      this.sirenMode = mode;
      this.audio.setSirenMode(mode);
      document.querySelectorAll('.siren-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
    }

    setHorn(active) {
      this.hornActive = active;
      this.audio.setAirHorn(active);
      document.getElementById('airhorn-btn').classList.toggle('pressing', active);
    }

    toggleStrobes() {
      this.player.strobesOn = !this.player.strobesOn;
      this.syncStrobeUI();
    }

    syncStrobeUI() {
      const btn = document.getElementById('lights-toggle-btn');
      const overlay = document.getElementById('strobe-overlay');
      btn.classList.toggle('active', this.player.strobesOn);
      btn.innerHTML = `<span class="key-hint">L</span> 🚨 STROBES: ${this.player.strobesOn ? 'ON' : 'OFF'}`;
      overlay.className = this.player.strobesOn ? 'strobe-on' : 'strobe-off';
    }

    toggleCenterMirrorMode() {
      this.player.showCabinInCenterMirror = !this.player.showCabinInCenterMirror;
      this.syncCenterMirrorUI();
    }

    syncCenterMirrorUI() {
      const label = document.getElementById('center-mirror-label');
      const btn = document.getElementById('toggle-cabin-cam-btn');
      const overlay = document.getElementById('cabin-status-overlay');
      if (this.player.showCabinInCenterMirror) {
        label.textContent = 'LIVE BACK CABIN CAM';
        btn.textContent = '[C] REAR TRAFFIC';
        overlay.classList.remove('hidden');
      } else {
        label.textContent = 'REAR TRAFFIC MIRROR';
        btn.textContent = '[C] CABIN VIEW';
        overlay.classList.add('hidden');
      }
    }

    triggerPAMegaphone() {
      this.paActiveTimer = 2.8;
      this.audio.triggerPAVoice();
    }

    endScenario(success, reasonText) {
      this.isRunning = false;
      this.audio.stopAll();

      const modal = document.getElementById('debrief-modal');
      const badge = document.getElementById('debrief-badge');
      const title = document.getElementById('debrief-title');
      const reason = document.getElementById('debrief-reason');

      modal.classList.remove('hidden');
      badge.textContent = success ? 'EMERGENCY DISPATCH COMPLETE' : 'CRITICAL INCIDENT REPORT';
      title.textContent = success ? 'All Crossroads Cleared Safely!' : 'Emergency Run Terminated';
      reason.textContent = reasonText;

      document.getElementById('debrief-crossings').textContent = `${this.crossingsCleared} / ${this.config.crossingsGoal}`;
      const stab = Math.round(this.player.stability);
      document.getElementById('debrief-stability').textContent = `${stab}%`;
      document.getElementById('debrief-nearmisses').textContent = `${this.nearMissCount}`;

      let grade = 'FAILED';
      if (success) {
        if (stab >= 85) grade = 'EXCELLENT';
        else if (stab >= 70) grade = 'GOOD';
        else if (stab >= 50) grade = 'FAIR';
        else grade = 'POOR';
      }
      document.getElementById('debrief-grade').textContent = grade;
    }

    cacheHUDElements() {
      this.hudCache = {
        speedVal: document.getElementById('speed-val'),
        gearVal: document.getElementById('gear-val'),
        wheelRim: document.querySelector('#steering-wheel-visual .wheel-rim'),
        stabBar: document.getElementById('stability-bar-fill'),
        stabPct: document.getElementById('stability-pct'),
        gforceBar: document.getElementById('gforce-bar-fill'),
        gforceVal: document.getElementById('gforce-val'),
        bpmEl: document.getElementById('vitals-bpm'),
        cabinStateEl: document.getElementById('cabin-passenger-state'),
        vignette: document.getElementById('stress-vignette'),
        leftBlindspot: document.getElementById('left-blindspot-alert'),
        rightBlindspot: document.getElementById('right-blindspot-alert'),
        sirenRadiusBadge: document.getElementById('siren-alert-radius-badge'),
        crossroadDist: document.getElementById('crossroad-dist-val'),
        signalDot: document.getElementById('hud-signal-dot'),
        signalText: document.getElementById('hud-signal-text'),
        crossingsCount: document.getElementById('crossings-count-val'),
        missionTimer: document.getElementById('mission-timer-val'),
        mirrorLeft: document.getElementById('mirror-left-rect'),
        mirrorRight: document.getElementById('mirror-right-rect'),
        mirrorCenter: document.getElementById('mirror-center-rect')
      };
    }

    updateMirrorRects() {
      const h = this.viewportH;
      const entries = [
        ['mirror-left-rect', this.hudCache.mirrorLeft],
        ['mirror-right-rect', this.hudCache.mirrorRight],
        ['mirror-center-rect', this.hudCache.mirrorCenter]
      ];
      for (let i = 0; i < entries.length; i++) {
        const [id, el] = entries[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.mirrorRects[id] = {
            left: Math.round(rect.left),
            bottom: Math.round(h - rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            aspect: rect.width / rect.height
          };
        } else {
          delete this.mirrorRects[id];
        }
      }
    }

    updateHUD(nextCrossroad, trafficStatus) {
      const h = this.hudCache;
      const prev = this.lastHudValues;

      const speedKmh = Math.round(Math.abs(this.player.speedMs) * 3.6);
      if (prev.speedKmh !== speedKmh) {
        prev.speedKmh = speedKmh;
        h.speedVal.textContent = speedKmh;
      }

      const gear = this.player.speedMs < -0.2 ? 'R' : 'D';
      if (prev.gear !== gear) {
        prev.gear = gear;
        h.gearVal.textContent = gear;
      }

      // Steering wheel rotation visual
      if (h.wheelRim) {
        const deg = Math.round(-this.player.steerAngle * 115);
        if (prev.wheelDeg !== deg) {
          prev.wheelDeg = deg;
          h.wheelRim.style.transform = `rotate(${deg}deg)`;
        }
      }

      // Patient Stability & G-Force bars
      const stab = Math.round(this.player.stability);
      if (prev.stab !== stab) {
        prev.stab = stab;
        h.stabBar.style.width = `${stab}%`;
        h.stabBar.className = `progress-bar-fill ${stab > 65 ? 'good' : stab > 35 ? 'warn' : 'danger'}`;
        h.stabPct.textContent = `${stab}%`;
      }

      const gVal = this.player.totalG.toFixed(1);
      if (prev.gVal !== gVal) {
        prev.gVal = gVal;
        const gPct = Math.min(100, Math.round(this.player.totalG * 55));
        h.gforceBar.style.width = `${gPct}%`;
        h.gforceVal.textContent = `${gVal} G`;
      }

      const bpm = Math.round(this.player.bpm);
      if (prev.bpm !== bpm) {
        prev.bpm = bpm;
        h.bpmEl.textContent = `♥ ${bpm} BPM`;
        h.bpmEl.classList.toggle('critical', bpm > 125);
      }

      // Cabin status badge in Center Mirror
      const cabinMode = this.player.totalG > 0.75 ? 2 : stab < 45 ? 1 : 0;
      if (prev.cabinMode !== cabinMode) {
        prev.cabinMode = cabinMode;
        if (cabinMode === 2) {
          h.cabinStateEl.textContent = '⚠ SCREAMING / HIGH G!';
          h.cabinStateEl.style.color = '#f87171';
        } else if (cabinMode === 1) {
          h.cabinStateEl.textContent = '⚠ CRITICAL DISTRESS';
          h.cabinStateEl.style.color = '#fbbf24';
        } else {
          h.cabinStateEl.textContent = 'STABLE';
          h.cabinStateEl.style.color = '#4ade80';
        }
      }

      // Red vignette when patient stability is low or G-force is high
      const vignetteActive = this.player.totalG > 0.85 || stab < 35;
      if (prev.vignetteActive !== vignetteActive) {
        prev.vignetteActive = vignetteActive;
        h.vignette.style.boxShadow = vignetteActive
          ? 'inset 0 0 85px rgba(239, 68, 68, 0.55)'
          : 'inset 0 0 0px rgba(239, 68, 68, 0)';
      }

      // Left & Right Wing Mirror Blind-Spot Alert LEDs
      if (prev.leftBlind !== trafficStatus.leftBlindSpotDanger) {
        prev.leftBlind = trafficStatus.leftBlindSpotDanger;
        h.leftBlindspot.classList.toggle('danger', trafficStatus.leftBlindSpotDanger);
      }
      if (prev.rightBlind !== trafficStatus.rightBlindSpotDanger) {
        prev.rightBlind = trafficStatus.rightBlindSpotDanger;
        h.rightBlindspot.classList.toggle('danger', trafficStatus.rightBlindSpotDanger);
      }

      // Siren Alert Radius Badge
      if (prev.alertRadius !== trafficStatus.alertRadius) {
        prev.alertRadius = trafficStatus.alertRadius;
        h.sirenRadiusBadge.textContent = `ALERT: ${trafficStatus.alertRadius}m`;
      }

      // Top Crossroad HUD
      if (nextCrossroad) {
        if (prev.crossDist !== nextCrossroad.distance) {
          prev.crossDist = nextCrossroad.distance;
          h.crossroadDist.textContent = `${nextCrossroad.distance} m`;
        }
        if (prev.crossState !== nextCrossroad.state) {
          prev.crossState = nextCrossroad.state;
          h.signalDot.className = `signal-dot ${nextCrossroad.state.toLowerCase()}`;
          h.signalText.textContent = `${nextCrossroad.state} LIGHT`;
        }
      } else if (prev.crossDist !== 'CLEAR') {
        prev.crossDist = 'CLEAR';
        h.crossroadDist.textContent = 'CLEAR';
      }

      if (prev.crossCleared !== this.crossingsCleared) {
        prev.crossCleared = this.crossingsCleared;
        h.crossingsCount.textContent = `${this.crossingsCleared} / ${this.config.crossingsGoal}`;
      }

      const timerTenth = Math.floor(this.elapsedTime * 10);
      if (prev.timerTenth !== timerTenth) {
        prev.timerTenth = timerTenth;
        const mins = String(Math.floor(this.elapsedTime / 60)).padStart(2, '0');
        const secs = (this.elapsedTime % 60).toFixed(1).padStart(4, '0');
        h.missionTimer.textContent = `${mins}:${secs}`;
      }
    }

    updateEcgCanvas(dt) {
      const ctx = this.ecgCtx;
      const w = this.ecgCanvas.width;
      const h = this.ecgCanvas.height;

      this.ecgPhase += dt * (this.player.bpm / 60) * Math.PI * 2;
      let y = h / 2;

      // Generate QRS spike waveform
      const mod = this.ecgPhase % (Math.PI * 2);
      if (mod > 2.6 && mod < 2.85) y -= 18;
      else if (mod >= 2.85 && mod < 3.05) y += 14;
      else if (mod >= 3.3 && mod < 3.7) y -= 6;

      // Add G-force noise jitter when braking/swerving hard
      y += (Math.random() - 0.5) * this.player.totalG * 10;

      this.ecgPoints.push(THREE.MathUtils.clamp(y, 4, h - 4));
      if (this.ecgPoints.length > w / 2) {
        this.ecgPoints.shift();
      }

      ctx.fillStyle = '#060b12';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Waveform line
      ctx.strokeStyle = this.player.bpm > 125 ? '#ff3b4e' : '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.ecgPoints.length; i++) {
        const px = i * 2;
        const py = this.ecgPoints[i];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.viewportW = w;
      this.viewportH = h;
      this.renderer.setSize(w, h);
      this.player.driverCamera.aspect = w / h;
      this.player.driverCamera.updateProjectionMatrix();
      this.updateMirrorRects();
    }

    renderMirrorViewport(domElementId, camera) {
      const rect = this.mirrorRects[domElementId];
      if (!rect) return;

      if (Math.abs(camera.aspect - rect.aspect) > 0.001) {
        camera.aspect = rect.aspect;
        camera.updateProjectionMatrix();
      }

      this.renderer.setViewport(rect.left, rect.bottom, rect.width, rect.height);
      this.renderer.setScissor(rect.left, rect.bottom, rect.width, rect.height);
      this.renderer.setScissorTest(true);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, camera);
    }

    renderSceneAndMirrors() {
      const w = this.viewportW;
      const h = this.viewportH;
      const cabinGroup = this.player.cabinInteriorGroup;

      // Update shadow map only ONCE per frame (instead of 4x across all mirrors)
      this.renderer.shadowMap.needsUpdate = true;

      // 1. Render Main First-Person Cockpit View (show front hood/pillars, hide back cabin box)
      this.player.chassisGroup.visible = true;
      if (cabinGroup) cabinGroup.visible = false;

      this.renderer.setViewport(0, 0, w, h);
      this.renderer.setScissor(0, 0, w, h);
      this.renderer.setScissorTest(false);
      this.renderer.clear();
      this.renderer.render(this.scene, this.player.driverCamera);

      // Skip mirror passes while configurator/debrief modal is open
      if (!this.isRunning) return;

      // 2. Render Left & Right Side Wing Mirrors (hide all car interior & cockpit meshes)
      this.player.chassisGroup.visible = false;
      if (cabinGroup) cabinGroup.visible = false;

      this.renderMirrorViewport('mirror-left-rect', this.player.leftMirrorCamera);
      this.renderMirrorViewport('mirror-right-rect', this.player.rightMirrorCamera);

      // 3. Render Center Mirror (show 3D cabin interior ONLY if Cabin View is active)
      if (this.player.showCabinInCenterMirror) {
        if (cabinGroup) cabinGroup.visible = true;
        this.renderMirrorViewport('mirror-center-rect', this.player.cabinCamera);
        if (cabinGroup) cabinGroup.visible = false;
      } else {
        this.renderMirrorViewport('mirror-center-rect', this.player.rearMirrorCamera);
      }

      this.player.chassisGroup.visible = true;
      this.renderer.setScissorTest(false);
    }

    animate(now) {
      requestAnimationFrame((t) => this.animate(t));
      const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      if (this.isRunning) {
        this.elapsedTime += dt;
        if (this.paActiveTimer > 0) this.paActiveTimer = Math.max(0, this.paActiveTimer - dt);

        // Update Player Vehicle
        this.player.update(dt, this.input, this.audio);

        // Update World (Traffic Signals & Rain)
        this.world.update(dt, this.player.z);

        // Update Traffic, Pedestrians & Blind-Spot Cyclists
        const trafficStatus = this.traffic.update(dt, {
          x: this.player.x,
          z: this.player.z,
          speedMs: this.player.speedMs,
          halfW: this.player.halfW,
          halfL: this.player.halfL,
          sirenMode: this.sirenMode,
          hornActive: this.hornActive,
          paActive: this.paActiveTimer > 0,
          lightsOn: this.player.strobesOn
        });

        // Update Audio Engine
        const speedKmh = Math.abs(this.player.speedMs) * 3.6;
        this.audio.update(dt, speedKmh, this.player.bpm, false);

        // Check Crossroad Approach & Progression
        const nextCross = this.world.getNextCrossroadInfo(this.player.z);
        if (nextCross) {
          this.crossingsCleared = nextCross.index;
          // Warn player if approaching a red-light crossroad within 75m with Siren OFF!
          if (
            nextCross.distance < 75 &&
            nextCross.distance > 20 &&
            this.sirenMode === 'OFF' &&
            this.silentApproachWarnedIndex !== nextCross.index
          ) {
            this.silentApproachWarnedIndex = nextCross.index;
            this.audio.triggerCabinVocal('CROSSROAD_APPROACH_SILENT', true);
          }
        } else {
          // Passed all crossroads!
          this.crossingsCleared = this.config.crossingsGoal;
          this.endScenario(
            true,
            `You cleared all ${this.config.crossingsGoal} emergency crossroads in ${this.elapsedTime.toFixed(1)}s!`
          );
        }

        // Periodic ambient patient screaming / dispatch urgency in back cabin
        const ambientInterval = this.config.screamIntensity === 'INTENSE' ? 9.5 : 16.0;
        if (this.elapsedTime - this.lastAmbientVocalElapsed > ambientInterval) {
          this.lastAmbientVocalElapsed = this.elapsedTime;
          this.audio.triggerCabinVocal('AMBIENT_PAIN');
        }

        // Near-miss callout
        if (trafficStatus.nearMissTriggered) {
          this.nearMissCount++;
          this.audio.triggerCabinVocal('NEAR_MISS');
        }

        // Check Collision
        if (trafficStatus.collisionObj) {
          this.audio.playCollisionCrash();
          this.endScenario(
            false,
            `Collision with ${trafficStatus.collisionObj.label}! Always check wing mirrors and clear crossroads with Yelp/Phaser + Air Horn.`
          );
        }

        // Check Patient Stability / Cabin Failure
        if (this.player.stability <= 0) {
          this.endScenario(
            false,
            'Patient vitals flatlined due to excessive braking jolts and high-G swerves! Clear traffic early with sirens so you can brake smoothly.'
          );
        }

        this.updateHUD(nextCross, trafficStatus);
        this.updateEcgCanvas(dt);
      }

      this.renderSceneAndMirrors();
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.simApp = new EmergencySimulatorApp();
  });
})();
