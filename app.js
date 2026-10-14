/**
 * HF-26 APEX ULTRA — Main Application Controller, Bilingual Telemetry UI,
 * Assembly Explorer, Audio Controller & Deterministic Automation Hooks (window.__HF26).
 */

import { ASSEMBLY_CATALOG, CAMERA_PRESETS, I18N } from './catalog.js';
import { HF26Stage3D } from './stage3d.js';
import { F1AudioEngine } from './audio.js';

class HF26AtelierApp {
  constructor() {
    this.lang = 'en';
    this.searchQuery = '';
    this.audio = new F1AudioEngine();

    this.canvas = document.getElementById('stage-canvas');
    this.stage = new HF26Stage3D(this.canvas, {
      onReady: (stats) => this._onStageReady(stats),
      onSelectAssembly: (spec) => this._renderDossier(spec),
      onStateChange: () => this._syncUIControls(),
    });

    this._initCameraButtons();
    this._bindUIEvents();
    this._renderAssemblyList();
    this._renderDossier(ASSEMBLY_CATALOG.power_unit_v6);
    this._applyLanguage('en');
    this._exposeAutomationHooks();
    this._startLoop();
  }

  _onStageReady(stats) {
    const badge = document.getElementById('mesh-counter-badge');
    if (badge) {
      badge.textContent = `${stats.assemblyCount} / 32`;
    }
    this._syncUIControls();
  }

  _initCameraButtons() {
    const container = document.getElementById('camera-tabs');
    if (!container) return;
    container.innerHTML = '';

    for (const preset of Object.values(CAMERA_PRESETS)) {
      const btn = document.createElement('button');
      btn.className = `cam-btn ${preset.id === 'hero' ? 'active' : ''}`;
      btn.dataset.cam = preset.id;
      btn.textContent = this.lang === 'ru' ? preset.name_ru : preset.name_en;
      btn.addEventListener('click', () => {
        this.setCameraPreset(preset.id);
      });
      container.appendChild(btn);
    }
  }

  _bindUIEvents() {
    // 1. Render Mode Tabs
    document.querySelectorAll('#mode-tabs .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMode(btn.dataset.mode);
      });
    });

    // 2. Environment Tabs
    document.querySelectorAll('#env-tabs .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setEnvironment(btn.dataset.env);
      });
    });

    // 3. Language Tabs
    document.querySelectorAll('#lang-tabs .lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setLanguage(btn.dataset.lang);
      });
    });

    // 4. Audio Synth Button
    const audioBtn = document.getElementById('btn-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const on = this.audio.toggle();
        audioBtn.classList.toggle('active', on);
        const dict = I18N[this.lang] || I18N.en;
        audioBtn.textContent = on ? dict.audioBtnOn : dict.audioBtnMute;
      });
    }

    // 5. Category Filter Pills
    document.querySelectorAll('#category-tabs .cat-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        this.stage.setCategoryFilter(cat);
        document.querySelectorAll('#category-tabs .cat-pill').forEach((b) => {
          b.classList.toggle('active', b.dataset.cat === cat);
        });
        this._renderAssemblyList();
      });
    });

    // 6. Search Input
    const searchInput = document.getElementById('assembly-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target.value || '').trim().toLowerCase();
        this._renderAssemblyList();
      });
    }

    // 7. Sliders: Explode, Steering, RPM
    const explodeSlider = document.getElementById('slider-explode');
    if (explodeSlider) {
      explodeSlider.addEventListener('input', (e) => {
        this.setExplode(Number(e.target.value) / 100.0);
      });
    }

    const steeringSlider = document.getElementById('slider-steering');
    if (steeringSlider) {
      steeringSlider.addEventListener('input', (e) => {
        this.setSteering(Number(e.target.value));
      });
    }

    const rpmSlider = document.getElementById('slider-rpm');
    if (rpmSlider) {
      rpmSlider.addEventListener('input', (e) => {
        const nextRpm = Number(e.target.value);
        const prevGear = Math.ceil(((this.stage.rpm - 4000) / 11000) * 8);
        const nextGear = Math.ceil(((nextRpm - 4000) / 11000) * 8);
        if (nextGear !== prevGear) {
          this.audio.triggerGearshift();
        }
        this.setRPM(nextRpm);
      });
    }

    // 8. Mechanical Action Buttons
    document.getElementById('btn-cover-off')?.addEventListener('click', () => {
      this.setCoverOff(!this.stage.coverOff);
    });

    document.getElementById('btn-drs')?.addEventListener('click', () => {
      this.setDRS(!this.stage.drsOpen);
    });

    document.getElementById('btn-isolate')?.addEventListener('click', () => {
      this.isolateSelected(!this.stage.isolated);
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.setCoverOff(false);
      this.setExplode(0);
      this.setSteering(0);
      this.setDRS(false);
      this.setRPM(3800);
      this.selectAssembly(null);
      this.setMode('studio');
      this.setEnvironment('atelier');
      this.setCameraPreset('hero');
    });

    // 9. Livery Swatches & Tire Compounds
    document.querySelectorAll('#livery-tabs .livery-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setLivery(btn.dataset.livery);
      });
    });

    document.querySelectorAll('#tire-tabs .tire-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTireCompound(btn.dataset.tire);
      });
    });

    // 10. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const key = e.key.toLowerCase();
      if (key === 'e') {
        this.setExplode(this.stage.targetExplodeAmount > 0.1 ? 0.0 : 0.85);
      } else if (key === 'c') {
        this.setCoverOff(!this.stage.coverOff);
      } else if (key === 'd') {
        this.setDRS(!this.stage.drsOpen);
      } else if (key === 'x') {
        this.setMode(this.stage.mode === 'xray' ? 'studio' : 'xray');
      } else if (key === 't') {
        this.setMode(this.stage.mode === 'thermal' ? 'studio' : 'thermal');
      }
    });
  }

  _renderAssemblyList() {
    if (!this.stage) return;
    const listEl = document.getElementById('assembly-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const activeCat = this.stage.activeCategory;
    const entries = Object.values(ASSEMBLY_CATALOG).filter((item) => {
      if (activeCat !== 'all' && item.category !== activeCat) return false;
      if (this.searchQuery) {
        const hay = `${item.id} ${item.name_en} ${item.name_ru} ${item.fia_reg} ${item.material_spec}`.toLowerCase();
        return hay.includes(this.searchQuery);
      }
      return true;
    });

    for (const item of entries) {
      const btn = document.createElement('button');
      btn.className = `asm-item ${this.stage.selectedAssemblyId === item.id ? 'selected' : ''}`;
      btn.dataset.asmId = item.id;

      const title = this.lang === 'ru' ? item.name_ru : item.name_en;
      btn.innerHTML = `
        <div class="asm-item-left">
          <span class="asm-item-title">${title}</span>
          <span class="asm-item-sub">${item.fia_reg} • ${item.weight_kg} kg</span>
        </div>
        <span class="asm-item-badge">${item.category.toUpperCase().slice(0, 4)}</span>
      `;
      btn.addEventListener('click', () => {
        if (this.stage.selectedAssemblyId === item.id) {
          this.selectAssembly(null);
        } else {
          this.selectAssembly(item.id);
        }
      });
      listEl.appendChild(btn);
    }
  }

  _renderDossier(spec) {
    const selId = this.stage ? this.stage.selectedAssemblyId : null;
    const item = spec || ASSEMBLY_CATALOG[selId] || ASSEMBLY_CATALOG.power_unit_v6;
    const isRu = this.lang === 'ru';

    const catEl = document.getElementById('dossier-cat');
    const nameEl = document.getElementById('dossier-name');
    const descEl = document.getElementById('dossier-desc');
    const matEl = document.getElementById('dossier-mat');
    const weightEl = document.getElementById('dossier-weight');
    const tempEl = document.getElementById('dossier-temp');
    const aeroEl = document.getElementById('dossier-aero');
    const fiaEl = document.getElementById('dossier-fia');

    if (catEl) catEl.textContent = item.category.toUpperCase();
    if (nameEl) nameEl.textContent = isRu ? item.name_ru : item.name_en;
    if (descEl) descEl.textContent = isRu ? item.desc_ru : item.desc_en;
    if (matEl) matEl.textContent = item.material_spec;
    if (weightEl) weightEl.textContent = `${item.weight_kg.toFixed(1)} kg`;
    if (tempEl) tempEl.textContent = `${item.operating_temp_c} °C`;
    if (aeroEl) aeroEl.textContent = `${item.aero_load_n.toLocaleString()} N`;
    if (fiaEl) fiaEl.textContent = item.fia_reg;
  }

  _syncUIControls() {
    if (!this.stage) return;
    // Sync mode buttons
    document.querySelectorAll('#mode-tabs .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.stage.mode);
    });

    // Sync environment buttons
    document.querySelectorAll('#env-tabs .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.env === this.stage.environmentName);
    });

    // Sync sliders & labels
    const expPct = Math.round(this.stage.targetExplodeAmount * 100);
    const expSlider = document.getElementById('slider-explode');
    if (expSlider && Number(expSlider.value) !== expPct) expSlider.value = String(expPct);
    const expVal = document.getElementById('val-explode');
    if (expVal) expVal.textContent = `${expPct}%`;

    const steerSlider = document.getElementById('slider-steering');
    if (steerSlider && Number(steerSlider.value) !== this.stage.targetSteeringDeg) {
      steerSlider.value = String(this.stage.targetSteeringDeg);
    }
    const steerVal = document.getElementById('val-steering');
    if (steerVal) {
      const s = this.stage.targetSteeringDeg;
      steerVal.textContent = `${s > 0 ? '+' : ''}${s.toFixed(1)}°`;
    }

    const rpmSlider = document.getElementById('slider-rpm');
    if (rpmSlider && Number(rpmSlider.value) !== Math.round(this.stage.targetRpm)) {
      rpmSlider.value = String(Math.round(this.stage.targetRpm));
    }
    const rpmVal = document.getElementById('val-rpm');
    if (rpmVal) rpmVal.textContent = `${Math.round(this.stage.targetRpm).toLocaleString()} RPM`;

    // Sync mechanical buttons
    document.getElementById('btn-cover-off')?.classList.toggle('active', this.stage.coverOff);
    document.getElementById('btn-drs')?.classList.toggle('active', this.stage.drsOpen);
    document.getElementById('btn-isolate')?.classList.toggle('active', this.stage.isolated);

    // Sync livery & tire buttons
    document.querySelectorAll('#livery-tabs .livery-swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.livery === this.stage.liveryId);
    });
    document.querySelectorAll('#tire-tabs .tire-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tire === this.stage.tireCompound);
    });

    // Sync camera preset buttons
    document.querySelectorAll('#camera-tabs .cam-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cam === this.stage.currentCameraPreset);
    });

    // Sync selected assembly in list
    document.querySelectorAll('#assembly-list .asm-item').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.asmId === this.stage.selectedAssemblyId);
    });

    this._renderDossier();
    this._updateBottomTelemetry();
  }

  _updateBottomTelemetry() {
    const rpm = Math.round(this.stage.rpm);
    const rpmNorm = Math.max(0, Math.min(1, (rpm - 3500) / (15000 - 3500)));
    const topSpeed = this.stage.drsOpen ? 352 : 334;
    const speed = Math.round(92 + rpmNorm * (topSpeed - 92));
    const gear = rpm < 4200 ? '1' : String(Math.min(8, Math.max(1, Math.ceil(rpmNorm * 8))));
    const downforce = Math.round(
      (3800 + Math.pow(speed / 340, 2) * 28400) * (this.stage.drsOpen ? 0.86 : 1.0)
    );
    const brakeTemp = Math.round(320 + rpmNorm * 610);
    const exhTemp = Math.round(490 + rpmNorm * 455);

    const elSpeed = document.getElementById('tel-speed');
    const elGear = document.getElementById('tel-gear');
    const elRpm = document.getElementById('tel-rpm');
    const elDf = document.getElementById('tel-downforce');
    const elBrk = document.getElementById('tel-braketemp');
    const elExh = document.getElementById('tel-exhtemp');

    if (elSpeed) elSpeed.innerHTML = `${speed} <small>KM/H</small>`;
    if (elGear) elGear.textContent = gear;
    if (elRpm) elRpm.textContent = rpm.toLocaleString();
    if (elDf) elDf.innerHTML = `${downforce.toLocaleString()} <small>N</small>`;
    if (elBrk) elBrk.innerHTML = `${brakeTemp} <small>°C</small>`;
    if (elExh) elExh.innerHTML = `${exhTemp} <small>°C</small>`;
  }

  _applyLanguage(lang) {
    this.lang = lang === 'ru' ? 'ru' : 'en';
    const dict = I18N[this.lang];

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    document.querySelectorAll('#lang-tabs .lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === this.lang);
    });

    this._initCameraButtons();
    this._renderAssemblyList();
    this._syncUIControls();
  }

  // =========================================================================
  // PUBLIC API & WINDOW.__HF26 AUTOMATION HOOKS
  // =========================================================================

  setMode(mode) {
    this.stage.setMode(mode);
    this._syncUIControls();
  }

  setEnvironment(env) {
    this.stage.setEnvironment(env);
    this._syncUIControls();
  }

  setExplode(val) {
    this.stage.setExplode(val);
    this._syncUIControls();
  }

  setCoverOff(flag) {
    this.stage.setCoverOff(flag);
    this._syncUIControls();
  }

  setDRS(flag) {
    this.stage.setDRS(flag);
    this._syncUIControls();
  }

  setSteering(deg) {
    this.stage.setSteering(deg);
    this._syncUIControls();
  }

  setRPM(rpm) {
    this.stage.setRPM(rpm);
    this._syncUIControls();
  }

  setLivery(liveryId) {
    this.stage.setLivery(liveryId);
    this._syncUIControls();
  }

  setTireCompound(compound) {
    this.stage.setTireCompound(compound);
    this._syncUIControls();
  }

  selectAssembly(assemblyId) {
    this.stage.selectAssembly(assemblyId);
    this._syncUIControls();
  }

  isolateSelected(flag) {
    this.stage.isolateSelected(flag);
    this._syncUIControls();
  }

  setCameraPreset(presetName, immediate = false) {
    this.stage.setCameraPreset(presetName, immediate);
    this._syncUIControls();
  }

  setLanguage(lang) {
    this._applyLanguage(lang);
  }

  _exposeAutomationHooks() {
    window.__HF26 = {
      isReady: () => Boolean(this.stage && this.stage.ready),
      getStats: () => this.stage.getStats(),
      setMode: (m) => this.setMode(m),
      setEnvironment: (e) => this.setEnvironment(e),
      setExplode: (v) => this.setExplode(v),
      setCoverOff: (f) => this.setCoverOff(f),
      setDRS: (f) => this.setDRS(f),
      setSteering: (d) => this.setSteering(d),
      setRPM: (r) => this.setRPM(r),
      setLivery: (l) => this.setLivery(l),
      setTireCompound: (c) => this.setTireCompound(c),
      selectAssembly: (id) => this.selectAssembly(id),
      isolateSelected: (f) => this.isolateSelected(f),
      setCameraPreset: (p, imm = false) => this.setCameraPreset(p, imm),
      setOrbitCamera: (az, el, dist, tgt) => this.stage?.setOrbitCamera(az, el, dist, tgt),
      stepFrame: (dt) => this.stage?.stepFrame(dt),
      setLanguage: (l) => this.setLanguage(l),
    };
  }

  _startLoop() {
    const tick = () => {
      requestAnimationFrame(tick);
      this.stage.update();
      this.audio.update(this.stage.rpm, 0.016);
      this._updateBottomTelemetry();
    };
    requestAnimationFrame(tick);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new HF26AtelierApp();
});
