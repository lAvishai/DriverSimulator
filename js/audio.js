/**
 * Emergency Crossroad Simulator — Web Audio API + Web Speech Synthesis Engine
 * Generates sirens (Wail, Yelp, Phaser), Air Horn, Engine RPM, Brake Screech,
 * ECG Heart Monitor beeps, Procedural Pain Screams/Groans, and Web Speech callouts.
 */
(function () {
  class EmergencyAudioEngine {
    constructor() {
      this.ctx = null;
      this.initialized = false;
      this.sirenMode = 'OFF'; // OFF | WAIL | YELP | PHASER
      this.vehicleType = 'AMBULANCE'; // AMBULANCE | FIRETRUCK | POLICE
      this.voiceMode = 'INTENSE'; // NORMAL | INTENSE | MUTE_VOICE

      // Continuous nodes
      this.sirenOsc1 = null;
      this.sirenOsc2 = null;
      this.sirenGain = null;
      this.engineOsc = null;
      this.engineGain = null;
      this.hornOsc1 = null;
      this.hornOsc2 = null;
      this.hornGain = null;
      this.hornActive = false;

      // Timing
      this.sirenPhase = 0;
      this.lastEcgBeep = 0;
      this.lastVocalTime = 0;
      this.commsTimeout = null;
      this.isFocusMuted = false;
    }

    init() {
      if (this.initialized) {
        if (!this.isFocusMuted && this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.initialized = true;

      // Master compressor to prevent clipping when siren + horn + scream overlap
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(20, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      // 1. Siren Oscillators
      this.sirenOsc1 = this.ctx.createOscillator();
      this.sirenOsc2 = this.ctx.createOscillator();
      this.sirenOsc1.type = 'sawtooth';
      this.sirenOsc2.type = 'triangle';

      this.sirenFilter = this.ctx.createBiquadFilter();
      this.sirenFilter.type = 'bandpass';
      this.sirenFilter.frequency.value = 950;
      this.sirenFilter.Q.value = 1.4;

      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;

      this.sirenOsc1.connect(this.sirenFilter);
      this.sirenOsc2.connect(this.sirenFilter);
      this.sirenFilter.connect(this.sirenGain);
      this.sirenGain.connect(this.compressor);

      this.sirenOsc1.start();
      this.sirenOsc2.start();

      // 2. Engine Hum Oscillator
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 140;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.compressor);
      this.engineOsc.start();

      // 3. Air Horn Oscillators
      this.hornOsc1 = this.ctx.createOscillator();
      this.hornOsc2 = this.ctx.createOscillator();
      this.hornOsc1.type = 'sawtooth';
      this.hornOsc2.type = 'sawtooth';
      this.hornOsc1.frequency.value = 146.8; // D3
      this.hornOsc2.frequency.value = 185.0; // F#3

      this.hornFilter = this.ctx.createBiquadFilter();
      this.hornFilter.type = 'lowpass';
      this.hornFilter.frequency.value = 680;

      this.hornGain = this.ctx.createGain();
      this.hornGain.gain.value = 0.0;

      this.hornOsc1.connect(this.hornFilter);
      this.hornOsc2.connect(this.hornFilter);
      this.hornFilter.connect(this.hornGain);
      this.hornGain.connect(this.compressor);

      this.hornOsc1.start();
      this.hornOsc2.start();
    }

    setScenarioConfig(vehicleType, voiceMode) {
      this.vehicleType = vehicleType;
      this.voiceMode = voiceMode;
      if (!this.initialized) return;

      // Adjust horn pitch per vehicle
      const now = this.ctx.currentTime;
      if (vehicleType === 'FIRETRUCK') {
        this.hornOsc1.frequency.setValueAtTime(110, now);
        this.hornOsc2.frequency.setValueAtTime(138.6, now);
      } else if (vehicleType === 'AMBULANCE') {
        this.hornOsc1.frequency.setValueAtTime(146.8, now);
        this.hornOsc2.frequency.setValueAtTime(185.0, now);
      } else {
        this.hornOsc1.frequency.setValueAtTime(164.8, now);
        this.hornOsc2.frequency.setValueAtTime(207.6, now);
      }
    }

    setSirenMode(mode) {
      this.init();
      this.sirenMode = mode;
      if (!this.initialized) return;

      const now = this.ctx.currentTime;
      if (mode === 'OFF') {
        this.sirenGain.gain.setTargetAtTime(0.0, now, 0.06);
      } else {
        const vol = mode === 'PHASER' ? 0.22 : 0.18;
        this.sirenGain.gain.setTargetAtTime(vol, now, 0.05);
      }
    }

    setAirHorn(active) {
      this.init();
      this.hornActive = active;
      if (!this.initialized) return;

      const now = this.ctx.currentTime;
      this.hornGain.gain.setTargetAtTime(active ? 0.28 : 0.0, now, 0.03);
    }

    setFocusMuted(muted) {
      this.isFocusMuted = muted;
      if (!this.initialized || !this.ctx) return;

      if (muted) {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        if (this.ctx.state === 'running') {
          this.ctx.suspend();
        }
      } else if (!document.hidden && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    stopAll() {
      if (!this.initialized) return;
      const now = this.ctx.currentTime;
      this.sirenGain.gain.setTargetAtTime(0.0, now, 0.05);
      this.hornGain.gain.setTargetAtTime(0.0, now, 0.05);
      this.engineGain.gain.setTargetAtTime(0.0, now, 0.05);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }

    update(dt, speedKmh, bpm, isPaused) {
      if (!this.initialized || isPaused) return;
      const now = this.ctx.currentTime;

      // 1. Update Siren Modulation
      if (this.sirenMode !== 'OFF') {
        let rate = 0.35; // WAIL
        let minF = 560;
        let maxF = 1220;

        if (this.vehicleType === 'FIRETRUCK') {
          minF = 420;
          maxF = 980;
        } else if (this.vehicleType === 'POLICE') {
          minF = 640;
          maxF = 1420;
        }

        if (this.sirenMode === 'YELP') {
          rate = 3.6;
        } else if (this.sirenMode === 'PHASER') {
          rate = 13.5;
          minF += 120;
          maxF += 180;
        }

        this.sirenPhase = (this.sirenPhase + dt * rate) % 1.0;
        // Triangle sweep wave 0 -> 1 -> 0
        const tri = this.sirenPhase < 0.5 ? this.sirenPhase * 2 : (1 - this.sirenPhase) * 2;
        const shaped = Math.pow(tri, 0.85);
        const freq = minF + (maxF - minF) * shaped;

        this.sirenOsc1.frequency.setTargetAtTime(freq, now, 0.015);
        this.sirenOsc2.frequency.setTargetAtTime(freq * 1.006, now, 0.015);
        this.sirenFilter.frequency.setTargetAtTime(freq * 1.15, now, 0.02);
      }

      // 2. Update Engine Sound
      const basePitch = this.vehicleType === 'FIRETRUCK' ? 42 : this.vehicleType === 'AMBULANCE' ? 54 : 64;
      const pitch = basePitch + Math.abs(speedKmh) * 1.35;
      this.engineOsc.frequency.setTargetAtTime(pitch, now, 0.05);
      this.engineGain.gain.setTargetAtTime(0.06 + Math.min(0.08, Math.abs(speedKmh) * 0.0008), now, 0.08);

      // 3. Update Ambulance ECG Heart Monitor Beep
      if (this.vehicleType === 'AMBULANCE') {
        const beatInterval = 60 / Math.max(45, bpm);
        if (now - this.lastEcgBeep >= beatInterval) {
          this.lastEcgBeep = now;
          this.playEcgBeep(bpm > 125);
        }
      }
    }

    playEcgBeep(isCritical) {
      if (!this.initialized) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isCritical ? 1046 : 880, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.095);
    }

    playBrakeScreech(intensity) {
      if (!this.initialized) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400 + Math.random() * 350, now);
      osc.frequency.linearRampToValueAtTime(980, now + 0.25);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1350;
      filter.Q.value = 4.0;

      gain.gain.setValueAtTime(Math.min(0.14, intensity * 0.08), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.27);
    }

    playCollisionCrash() {
      this.init();
      if (!this.initialized) return;
      const now = this.ctx.currentTime;

      // White noise burst + low thud
      const bufferSize = this.ctx.sampleRate * 0.55;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.14));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 950;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.54);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);
      noise.start(now);
    }

    /**
     * Synthesizes a procedural vocal pain cry / gasp using formant filters
     * so the player hears immediate physical screaming/groaning from the back cabin.
     */
    playProceduralScreamSynth(isHighPitchScream) {
      if (!this.initialized) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      subOsc.type = 'triangle';

      const baseF = isHighPitchScream ? 440 : 230;
      const peakF = isHighPitchScream ? 760 : 340;

      osc.frequency.setValueAtTime(baseF, now);
      osc.frequency.linearRampToValueAtTime(peakF, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.78, now + 0.62);

      subOsc.frequency.setValueAtTime(baseF * 1.49, now);
      subOsc.frequency.linearRampToValueAtTime(peakF * 1.5, now + 0.14);
      subOsc.frequency.exponentialRampToValueAtTime(baseF, now + 0.62);

      // Vocal tract formant bandpass
      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(isHighPitchScream ? 1150 : 750, now);
      formant.Q.value = 3.2;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.64);

      osc.connect(formant);
      subOsc.connect(formant);
      formant.connect(gain);
      gain.connect(this.compressor);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + 0.66);
      subOsc.stop(now + 0.66);
    }

    /**
     * Triggers a back-cabin scream / paramedic / crew / suspect vocal event
     * with both procedural audio and Web Speech synthesis + HUD banner.
     */
    triggerCabinVocal(reason, force = false) {
      this.init();
      const nowMs = performance.now();
      const cooldown = this.voiceMode === 'INTENSE' ? 3200 : 5200;
      if (!force && nowMs - this.lastVocalTime < cooldown) return;
      this.lastVocalTime = nowMs;

      const lines = this.getLinesForEvent(reason);
      if (!lines || lines.length === 0) return;
      const chosen = lines[Math.floor(Math.random() * lines.length)];

      // 1. Show HUD Comms Banner
      this.showCommsBanner(chosen.icon, chosen.speaker, chosen.text, chosen.isScream);

      // 2. Play Procedural Scream / Radio Click SFX
      if (chosen.isScream) {
        this.playProceduralScreamSynth(chosen.highPitch);
      } else {
        this.playRadioClick();
      }

      // 3. Speak via Web Speech Synthesis if enabled
      if (this.voiceMode !== 'MUTE_VOICE' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(chosen.speechText || chosen.text);
          utter.pitch = chosen.pitch || 1.0;
          utter.rate = chosen.rate || 1.15;
          utter.volume = 0.95;
          window.speechSynthesis.speak(utter);
        } catch (err) {
          // Ignore speech synthesis errors on restricted browsers
        }
      }
    }

    triggerPAVoice() {
      this.init();
      this.playRadioClick();
      const msg = 'Emergency vehicle approaching! Clear the crossroad immediately!';
      this.showCommsBanner('📢', 'EXTERNAL PA MEGAPHONE', `"${msg}"`, false);

      if (this.voiceMode !== 'MUTE_VOICE' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(msg);
          utter.pitch = 0.85;
          utter.rate = 1.22;
          utter.volume = 1.0;
          window.speechSynthesis.speak(utter);
        } catch (e) {}
      }
    }

    playRadioClick() {
      if (!this.initialized) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1650, now);
      osc.frequency.setValueAtTime(1200, now + 0.03);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.075);
    }

    showCommsBanner(icon, speaker, text, isScream) {
      const banner = document.getElementById('cabin-comms-banner');
      const iconEl = document.getElementById('comms-icon');
      const speakerEl = document.getElementById('comms-speaker');
      const textEl = document.getElementById('comms-text');
      if (!banner) return;

      iconEl.textContent = icon;
      speakerEl.textContent = speaker;
      textEl.textContent = text;

      banner.classList.remove('hidden');
      if (isScream) {
        banner.classList.add('scream-alert');
      } else {
        banner.classList.remove('scream-alert');
      }

      if (this.commsTimeout) clearTimeout(this.commsTimeout);
      this.commsTimeout = setTimeout(() => {
        banner.classList.add('hidden');
      }, 3400);
    }

    getLinesForEvent(reason) {
      if (this.vehicleType === 'AMBULANCE') {
        const dict = {
          HARD_BRAKE: [
            { icon: '😫', speaker: 'PATIENT (REAR STRETCHER)', text: '"AAAAAGH! My chest! Stop slamming the brakes!"', speechText: 'Aaaagh! My chest! Stop slamming the brakes!', pitch: 1.45, rate: 1.25, isScream: true, highPitch: true },
            { icon: '🩺', speaker: 'PARAMEDIC (REAR CABIN)', text: '"Whoa! Easy on the brakes! You just tore the IV line!"', speechText: 'Whoa! Easy on the brakes! You just tore the IV line!', pitch: 1.15, rate: 1.25, isScream: true, highPitch: false },
            { icon: '😱', speaker: 'PATIENT (REAR STRETCHER)', text: '"OWWW! Please, it hurts so much! Drive smoother!"', speechText: 'Owww! Please, it hurts so much! Drive smoother!', pitch: 1.5, rate: 1.2, isScream: true, highPitch: true }
          ],
          SHARP_SWERVE: [
            { icon: '🤢', speaker: 'PATIENT (REAR STRETCHER)', text: '"AAAH! My leg! Stop throwing me side to side!"', speechText: 'Aaah! My leg! Stop throwing me side to side!', pitch: 1.4, rate: 1.22, isScream: true, highPitch: true },
            { icon: '🩺', speaker: 'PARAMEDIC (REAR CABIN)', text: '"Hold the wheel steady! I am trying to intubate back here!"', speechText: 'Hold the wheel steady! I am trying to intubate back here!', pitch: 1.1, rate: 1.25, isScream: false }
          ],
          CROSSROAD_APPROACH_SILENT: [
            { icon: '🩺', speaker: 'PARAMEDIC (REAR CABIN)', text: '"Red light ahead! Turn on the YELP siren before we get T-boned!"', speechText: 'Red light ahead! Turn on the yelp siren before we get T-boned!', pitch: 1.15, rate: 1.25, isScream: false },
            { icon: '😰', speaker: 'PATIENT (REAR STRETCHER)', text: '"Why aren\'t the sirens on?! Hurry, I can\'t breathe!"', speechText: 'Why are not the sirens on?! Hurry, I cannot breathe!', pitch: 1.4, rate: 1.22, isScream: true, highPitch: true }
          ],
           AMBIENT_PAIN: [
            { icon: '😣', speaker: 'PATIENT (REAR STRETCHER)', text: '"Aaaahhh... doctor, please hurry! Everything is spinning!"', speechText: 'Aaaahhh... doctor, please hurry! Everything is spinning!', pitch: 1.38, rate: 1.15, isScream: true, highPitch: false },
            { icon: '😰', speaker: 'PATIENT (REAR STRETCHER)', text: '"Anat please help me !"', speechText: 'Anat, please help me!', pitch: 1.42, rate: 1.18, isScream: true, highPitch: true },
            { icon: '🩺', speaker: 'PARAMEDIC (REAR CABIN)', text: '"Blood pressure dropping! Clear this next crossroad fast!"', speechText: 'Blood pressure dropping! Clear this next crossroad fast!', pitch: 1.12, rate: 1.22, isScream: false }
          ],
          NEAR_MISS: [
            { icon: '😱', speaker: 'PARAMEDIC (REAR CABIN)', text: '"WATCH THE CROSSWALK! Check your side mirrors!"', speechText: 'Watch the crosswalk! Check your side mirrors!', pitch: 1.25, rate: 1.3, isScream: true, highPitch: false }
          ]
        };
        return dict[reason] || dict.AMBIENT_PAIN;
      } else if (this.vehicleType === 'FIRETRUCK') {
        const dict = {
          HARD_BRAKE: [
            { icon: '🧑‍🚒', speaker: 'FIRE CAPTAIN (CAB)', text: '"Easy on the air brakes! 20 tons of water shifting in the tank!"', speechText: 'Easy on the air brakes! Twenty tons of water shifting in the tank!', pitch: 0.85, rate: 1.18, isScream: false },
            { icon: '🧑‍🚒', speaker: 'ENGINE CREW (REAR)', text: '"Whoa! Hang on back here! Watch the stopping distance!"', speechText: 'Whoa! Hang on back here! Watch the stopping distance!', pitch: 0.9, rate: 1.22, isScream: true, highPitch: false }
          ],
          SHARP_SWERVE: [
            { icon: '🧑‍🚒', speaker: 'FIRE CAPTAIN (CAB)', text: '"Watch the tail swing in your wing mirrors! Don\'t roll the rig!"', speechText: 'Watch the tail swing in your wing mirrors! Do not roll the rig!', pitch: 0.85, rate: 1.2, isScream: false }
          ],
          CROSSROAD_APPROACH_SILENT: [
            { icon: '🧑‍🚒', speaker: 'FIRE CAPTAIN (CAB)', text: '"Hit the Q-Siren and Air Horn! Cross traffic does not see us!"', speechText: 'Hit the siren and air horn! Cross traffic does not see us!', pitch: 0.88, rate: 1.22, isScream: false }
          ],
          AMBIENT_PAIN: [
            { icon: '📻', speaker: 'FIRE DISPATCH', text: '"Engine 9, structural fire upgraded to 3-alarm! Expedite through intersection!"', speechText: 'Engine 9, structural fire upgraded to three alarm! Expedite through intersection!', pitch: 0.95, rate: 1.22, isScream: false }
          ],
          NEAR_MISS: [
            { icon: '🧑‍🚒', speaker: 'FIRE CAPTAIN (CAB)', text: '"Pedestrian in the blind spot! Blast the horn!"', speechText: 'Pedestrian in the blind spot! Blast the horn!', pitch: 0.92, rate: 1.28, isScream: true, highPitch: false }
          ]
        };
        return dict[reason] || dict.AMBIENT_PAIN;
      } else {
        // POLICE
        const dict = {
          HARD_BRAKE: [
            { icon: '🤬', speaker: 'SUSPECT (REAR CAGE)', text: '"AAARGH! My face hit the divider! You crazy cop!"', speechText: 'Aaargh! My face hit the divider! You crazy cop!', pitch: 1.3, rate: 1.25, isScream: true, highPitch: false },
            { icon: '👮', speaker: 'PARTNER (PASSENGER SEAT)', text: '"Watch the brakes! Keep your eyes on the intersection box!"', speechText: 'Watch the brakes! Keep your eyes on the intersection box!', pitch: 1.0, rate: 1.22, isScream: false }
          ],
          SHARP_SWERVE: [
            { icon: '🤬', speaker: 'SUSPECT (REAR CAGE)', text: '"HEY! Let me out of here! Stop swerving like a maniac!"', speechText: 'Hey! Let me out of here! Stop swerving like a maniac!', pitch: 1.32, rate: 1.25, isScream: true, highPitch: true }
          ],
          CROSSROAD_APPROACH_SILENT: [
            { icon: '👮', speaker: 'PARTNER (PASSENGER SEAT)', text: '"Light is red! Flip on the Yelp or Phaser before clearing!"', speechText: 'Light is red! Flip on the Yelp or Phaser before clearing!', pitch: 1.02, rate: 1.25, isScream: false }
          ],
          AMBIENT_PAIN: [
            { icon: '📻', speaker: 'POLICE DISPATCH', text: '"Unit 42, shots fired at Metro Plaza! Clear traffic and proceed Code 3!"', speechText: 'Unit 42, shots fired at Metro Plaza! Clear traffic and proceed Code 3!', pitch: 1.05, rate: 1.25, isScream: false },
            { icon: '🤬', speaker: 'SUSPECT (REAR CAGE)', text: '"You\'ll never make it through this traffic! Let me out!"', speechText: 'You will never make it through this traffic! Let me out!', pitch: 1.28, rate: 1.2, isScream: true, highPitch: false }
          ],
          NEAR_MISS: [
            { icon: '👮', speaker: 'PARTNER (PASSENGER SEAT)', text: '"Watch the jaywalker! Check your right wing mirror!"', speechText: 'Watch the jaywalker! Check your right wing mirror!', pitch: 1.1, rate: 1.3, isScream: true, highPitch: false }
          ]
        };
        return dict[reason] || dict.AMBIENT_PAIN;
      }
    }
  }

  window.EmergencyAudioEngine = EmergencyAudioEngine;
})();
