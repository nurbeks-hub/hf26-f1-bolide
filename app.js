/**
 * HF-26 APEX ULTRA — Minimal Spatial Showroom Controller (v2)
 * 94% Unobstructed 3D Viewport · 3D Spatial Hotspots · Contextual Dossier · Bilingual RU/EN
 */

import { ASSEMBLY_CATALOG } from './catalog.js';
import { HF26Stage3D } from './stage3d.js';
import { F1AudioEngine } from './audio.js';

const HOTSPOT_DEFS = [
  {
    id: 'front_wing',
    num: '01',
    assemblyId: 'front_wing',
    cameraPreset: 'front_wing',
    anchorB2T: [0.55, -2.48, 0.22],
    label_ru: 'Антикрыло',
    label_en: 'Front Wing',
  },
  {
    id: 'brakes_fl',
    num: '02',
    assemblyId: 'brakes_fl',
    cameraPreset: 'wheel_macro',
    anchorB2T: [-0.82, -1.80, 0.38],
    label_ru: 'Карбон-тормоза',
    label_en: 'Carbon Brakes',
  },
  {
    id: 'steering_wheel',
    num: '03',
    assemblyId: 'steering_wheel',
    cameraPreset: 'cockpit',
    anchorB2T: [0.0, -0.52, 0.68],
    label_ru: 'Кокпит и руль',
    label_en: 'Cockpit & Wheel',
  },
  {
    id: 'radiators_cooling',
    num: '04',
    assemblyId: 'radiators_cooling',
    cameraPreset: 'engine',
    needsCoverOff: true,
    anchorB2T: [0.54, 0.02, 0.44],
    label_ru: 'Охлаждение',
    label_en: 'Cooling Cores',
  },
  {
    id: 'power_unit_v6',
    num: '05',
    assemblyId: 'power_unit_v6',
    cameraPreset: 'engine',
    needsCoverOff: true,
    anchorB2T: [0.0, 0.62, 0.72],
    label_ru: 'Гибридный V6',
    label_en: '1.6L V6 Hybrid',
  },
  {
    id: 'exhaust_inconel',
    num: '06',
    assemblyId: 'exhaust_inconel',
    cameraPreset: 'engine',
    needsCoverOff: true,
    anchorB2T: [0.0, 1.48, 0.50],
    label_ru: 'Выхлоп Inconel',
    label_en: 'Inconel Exhaust',
  },
  {
    id: 'rear_wing_drs',
    num: '07',
    assemblyId: 'rear_wing_drs',
    cameraPreset: 'rear_quarter',
    anchorB2T: [0.0, 2.38, 0.88],
    label_ru: 'Крыло DRS',
    label_en: 'DRS Rear Wing',
  },
];

const INTERNAL_ASSEMBLIES = new Set([
  'power_unit_v6',
  'turbo_mguh',
  'exhaust_inconel',
  'radiators_cooling',
  'energy_store_ers',
  'gearbox_cassette',
]);

const CATEGORY_NAMES = {
  ru: {
    all: 'Все',
    aero: 'Аэродинамика',
    chassis: 'Шасси и кокпит',
    powertrain: 'Силовая установка',
    suspension: 'Подвеска',
    wheels: 'Колёса и тормоза',
  },
  en: {
    all: 'All',
    aero: 'Aerodynamics',
    chassis: 'Chassis & Cockpit',
    powertrain: 'Powertrain V6',
    suspension: 'Suspension',
    wheels: 'Wheels & Brakes',
  },
};

const UI_STRINGS = {
  ru: {
    exp_studio: 'Студия',
    exp_engine: 'Мотор V6',
    exp_cfd: 'Аэропоток CFD',
    exp_dyno: 'Дино 15 000',
    exp_xray: 'Рентген CAD',
    exp_thermal: 'Тепловизор',
    hotspots: 'Точки',
    allParts: (n) => `Все узлы (${n})`,
    audioOff: 'Звук V6',
    audioOn: 'V6 Live',
    cam_hero: '3/4',
    cam_cockpit: 'Кокпит',
    cam_engine: 'Мотор V6',
    cam_wheel_macro: 'Тормоза',
    cam_rear_quarter: 'Диффузор',
    cam_top_down: 'Сверху',
    explode: 'Разбор',
    coverOff: 'Снять кожух',
    coverOn: 'Закрыть кожух',
    isolate: 'Изолировать деталь',
    unisolate: 'Показать весь болид',
    resetView: 'Общий план',
    mass: 'Масса',
    temp: 'Температура',
    mat: 'Конструкционный материал',
    drawerEyebrow: 'СПЕЦИФИКАЦИЯ FIA 2026',
    drawerTitle: '32 инженерных узла',
    searchPlaceholder: 'Найти узел (V6, Inconel, руль, днище…)',
    cat_all: 'Все',
    cat_aero: 'Аэро',
    cat_chassis: 'Шасси',
    cat_powertrain: 'Мотор V6',
    cat_suspension: 'Подвеска',
    cat_wheels: 'Колёса',
    loaderSub: 'Инициализация 3D-шасси и PBR-шейдеров…',
    infoTitle: 'HF-26 APEX ULTRA — Архитектура болида',
    infoBody:
      'Процедурная инженерная 3D-модель болида Формулы-1 (292 268 треугольников, 681 деталь в 32 независимых сборочных узлах). Открытая карбоновая ванна кокпита со сквозным педальным туннелем, съёмный кожух двигателя 1.6L 90° V6, сплит-турбина MGU-H, гидроформованный выхлоп Inconel 625 со сварными швами TIG, 800-вольтовая батарея ERS в золотой фольге Kapton, наклонные радиаторы в понтонах и перфорированные карбон-керамические тормоза.',
    rpmUnit: 'ОБ/МИН',
    speedUnit: 'КМ/Ч',
  },
  en: {
    exp_studio: 'Studio',
    exp_engine: 'V6 Bay',
    exp_cfd: 'CFD Aero',
    exp_dyno: 'Dyno 15K',
    exp_xray: 'X-Ray CAD',
    exp_thermal: 'Thermal',
    hotspots: 'Pins',
    allParts: (n) => `All Parts (${n})`,
    audioOff: 'V6 Sound',
    audioOn: 'V6 Live',
    cam_hero: '3/4 View',
    cam_cockpit: 'Cockpit',
    cam_engine: 'V6 Engine',
    cam_wheel_macro: 'Brakes',
    cam_rear_quarter: 'Diffuser',
    cam_top_down: 'Top View',
    explode: 'Explode',
    coverOff: 'Open Engine Bay',
    coverOn: 'Close Bodywork',
    isolate: 'Isolate Assembly',
    unisolate: 'Show Full Car',
    resetView: 'Reset View',
    mass: 'Mass',
    temp: 'Operating Temp',
    mat: 'Material Specification',
    drawerEyebrow: 'FIA 2026 SPECIFICATION',
    drawerTitle: '32 Engineering Assemblies',
    searchPlaceholder: 'Search assembly (V6, Inconel, steering, floor…)',
    cat_all: 'All',
    cat_aero: 'Aero',
    cat_chassis: 'Chassis',
    cat_powertrain: 'V6 Unit',
    cat_suspension: 'Suspension',
    cat_wheels: 'Wheels',
    loaderSub: 'Initializing 3D chassis & PBR shaders…',
    infoTitle: 'HF-26 APEX ULTRA — Vehicle Architecture',
    infoBody:
      'Procedural engineering 3D Formula 1 model (292,268 triangles, 681 parts across 32 independent assemblies). Open-cavity carbon monocoque with through-footwell pedal tunnel, removable 1.6L 90° V6 engine cover, split-axle MGU-H turbo, hydroformed Inconel 625 exhaust with TIG weld collars, 800V Kapton-foiled ERS battery pack, canted sidepod radiators, and cross-drilled carbon-ceramic brakes.',
    rpmUnit: 'RPM',
    speedUnit: 'KM/H',
  },
};

class HF26ShowroomApp {
  constructor() {
    this.lang = 'en';
    this.searchQuery = '';
    this.hotspotsVisible = true;
    this.drawerOpen = false;
    this.activeExp = 'studio';
    this.audio = new F1AudioEngine();
    this.hotspotElements = new Map();

    this.canvas = document.getElementById('stage-canvas');
    this._setLoaderProgress(38);

    this.stage = new HF26Stage3D(this.canvas, {
      onReady: (stats) => this._onStageReady(stats),
      onSelectAssembly: (spec) => this._onAssemblySelected(spec),
      onStateChange: () => this._syncUI(),
    });

    this._buildHotspotsDOM();
    this._bindEvents();
    this._renderPartsDrawerList();
    this._applyLanguage('en');
    this._exposeAutomationHooks();
    this._startLoop();
  }

  _setLoaderProgress(pct) {
    const fill = document.getElementById('loader-fill');
    if (fill) fill.style.width = `${pct}%`;
  }

  _onStageReady(stats) {
    this._setLoaderProgress(100);
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden', 'fade-out');
    }
    const lblAll = document.getElementById('lbl-all-parts');
    if (lblAll) {
      const s = UI_STRINGS[this.lang];
      lblAll.textContent = s.allParts(stats.assemblyCount || 32);
    }
    this._syncUI();
  }

  _buildHotspotsDOM() {
    const layer = document.getElementById('hotspots-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this.hotspotElements.clear();

    for (const def of HOTSPOT_DEFS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotspot-pin';
      btn.dataset.hotspotId = def.id;
      btn.dataset.assemblyId = def.assemblyId;
      btn.innerHTML = `
        <span class="hotspot-dot">${def.num}</span>
        <span class="hotspot-label">${this.lang === 'ru' ? def.label_ru : def.label_en}</span>
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleHotspotClick(def);
      });
      layer.appendChild(btn);
      this.hotspotElements.set(def.id, btn);
    }
  }

  _handleHotspotClick(def) {
    if (this.stage.selectedAssemblyId === def.assemblyId) {
      this.selectAssembly(null);
      return;
    }
    if (def.needsCoverOff && !this.stage.coverOff) {
      this.stage.setCoverOff(true);
    }
    if (def.cameraPreset) {
      this.stage.setCameraPreset(def.cameraPreset);
    }
    this.selectAssembly(def.assemblyId);
  }

  _updateHotspotsProjection() {
    if (!this.stage || !this.stage.ready) return;
    const layer = document.getElementById('hotspots-layer');
    if (!layer) return;

    if (!this.hotspotsVisible || this.stage.isolated) {
      for (const el of this.hotspotElements.values()) {
        el.classList.add('hidden-pin');
      }
      return;
    }

    const projected = this.stage.getHotspotScreenPositions(HOTSPOT_DEFS);
    for (const item of projected) {
      const el = this.hotspotElements.get(item.id);
      if (!el) continue;
      if (!item.visible) {
        el.classList.add('hidden-pin');
        continue;
      }
      el.classList.remove('hidden-pin');
      el.classList.toggle('active', this.stage.selectedAssemblyId === item.assemblyId);
      el.style.transform = `translate3d(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }

  _bindEvents() {
    // 1. Center Experience Capsule
    document.querySelectorAll('.mode-capsule .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exp = btn.dataset.exp;
        this._activateExperience(exp);
      });
    });

    // 2. Hotspots toggle
    const hsBtn = document.getElementById('btn-hotspots-toggle');
    if (hsBtn) {
      hsBtn.addEventListener('click', () => {
        this.hotspotsVisible = !this.hotspotsVisible;
        hsBtn.classList.toggle('active', this.hotspotsVisible);
        this._updateHotspotsProjection();
      });
    }

    // 3. Parts Catalog Drawer toggle
    const drawerBtn = document.getElementById('btn-catalog-drawer');
    const drawerEl = document.getElementById('parts-drawer');
    if (drawerBtn && drawerEl) {
      drawerBtn.addEventListener('click', () => {
        this.drawerOpen = !this.drawerOpen;
        drawerEl.classList.toggle('hidden', !this.drawerOpen);
        drawerBtn.classList.toggle('active', this.drawerOpen);
      });
    }
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
      this.drawerOpen = false;
      drawerEl?.classList.add('hidden');
      drawerBtn?.classList.remove('active');
    });

    // 4. Audio V6 Toggle
    const audioBtn = document.getElementById('btn-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const on = this.audio.toggle();
        audioBtn.classList.toggle('active', on);
        const lbl = document.getElementById('lbl-audio');
        const s = UI_STRINGS[this.lang];
        if (lbl) lbl.textContent = on ? s.audioOn : s.audioOff;
      });
    }

    // 5. Language Switcher (RU / EN)
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        this.setLanguage(this.lang === 'ru' ? 'en' : 'ru');
      });
    }

    // 6. Info Modal (ⓘ)
    const infoModal = document.getElementById('info-modal');
    document.getElementById('btn-info')?.addEventListener('click', () => {
      infoModal?.classList.toggle('hidden');
    });
    document.getElementById('btn-close-info')?.addEventListener('click', () => {
      infoModal?.classList.add('hidden');
    });
    infoModal?.addEventListener('click', (e) => {
      if (e.target === infoModal) infoModal.classList.add('hidden');
    });

    // 7. Contextual Dossier Card actions
    document.getElementById('btn-close-dossier')?.addEventListener('click', () => {
      this.selectAssembly(null);
    });
    document.getElementById('btn-isolate-part')?.addEventListener('click', () => {
      this.isolateSelected(!this.stage.isolated);
    });
    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      this.resetAll();
    });

    // 8. Drawer Search & Category Filters
    const searchInput = document.getElementById('part-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target.value || '').trim().toLowerCase();
        this._renderPartsDrawerList();
      });
    }
    document.querySelectorAll('#cat-pills .cat-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        this.stage.setCategoryFilter(cat);
        document.querySelectorAll('#cat-pills .cat-pill').forEach((b) => {
          b.classList.toggle('active', b.dataset.cat === cat);
        });
        this._renderPartsDrawerList();
      });
    });

    // 9. Bottom Dock: Camera Presets
    document.querySelectorAll('#cam-presets .cam-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cam = btn.dataset.cam;
        if (cam === 'engine' && !this.stage.coverOff) {
          this.stage.setCoverOff(true);
        }
        this.setCameraPreset(cam);
      });
    });

    // 10. Bottom Dock: Explode Scrubber
    const expSlider = document.getElementById('slider-explode');
    if (expSlider) {
      expSlider.addEventListener('input', (e) => {
        this.setExplode(Number(e.target.value) / 100.0);
      });
    }

    // 11. Bottom Dock: Cover Off & DRS
    document.getElementById('btn-cover-toggle')?.addEventListener('click', () => {
      const next = !this.stage.coverOff;
      this.setCoverOff(next);
      if (next && this.stage.currentCameraPreset === 'hero') {
        this.setCameraPreset('engine');
      }
    });
    document.getElementById('btn-drs-toggle')?.addEventListener('click', () => {
      this.setDRS(!this.stage.drsOpen);
    });

    // 12. Bottom Dock: Livery & Tire Swatches
    document.querySelectorAll('#livery-dots .swatch-dot').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setLivery(btn.dataset.livery);
      });
    });
    document.querySelectorAll('#tire-dots .tire-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTireCompound(btn.dataset.tire);
      });
    });

    // 13. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'c') {
        e.preventDefault();
        this.setCoverOff(!this.stage.coverOff);
      } else if (key === 'e') {
        this.setExplode(this.stage.targetExplodeAmount > 0.1 ? 0.0 : 0.85);
      } else if (key === 'd') {
        this.setDRS(!this.stage.drsOpen);
      } else if (key === 'x') {
        this._activateExperience(this.stage.mode === 'xray' ? 'studio' : 'xray');
      } else if (key === 't') {
        this._activateExperience(this.stage.mode === 'thermal' ? 'studio' : 'thermal');
      } else if (key === 'r' || key === 'escape') {
        this.resetAll();
      }
    });
  }

  _activateExperience(exp) {
    this.activeExp = exp;
    if (exp === 'studio') {
      this.stage.setMode('studio');
      this.stage.setCoverOff(false);
      this.stage.setCameraPreset('hero');
    } else if (exp === 'engine_open') {
      this.stage.setMode('studio');
      this.stage.setCoverOff(true);
      this.stage.setCameraPreset('engine');
      this.stage.selectAssembly('power_unit_v6');
    } else if (exp === 'cfd') {
      this.stage.setMode('cfd');
      this.stage.setCoverOff(false);
      this.stage.setCameraPreset('side_aero');
    } else if (exp === 'dyno') {
      this.stage.setMode('dyno');
      this.stage.setDRS(true);
      this.stage.setCameraPreset('rear_quarter');
    } else if (exp === 'xray') {
      this.stage.setMode('xray');
    } else if (exp === 'thermal') {
      this.stage.setMode('thermal');
    }
    this._syncUI();
  }

  resetAll() {
    this.activeExp = 'studio';
    this.stage.setCoverOff(false);
    this.stage.setExplode(0);
    this.stage.setSteering(0);
    this.stage.setDRS(false);
    this.stage.setRPM(3800);
    this.stage.selectAssembly(null);
    this.stage.setMode('studio');
    this.stage.setEnvironment('atelier');
    this.stage.setCameraPreset('hero');
    this._syncUI();
  }

  _onAssemblySelected(spec) {
    if (
      spec &&
      INTERNAL_ASSEMBLIES.has(spec.id) &&
      !this.stage.coverOff &&
      this.stage.mode === 'studio' &&
      this.stage.targetExplodeAmount < 0.15
    ) {
      this.stage.setCoverOff(true);
    }
    this._renderDossier(spec);
    this._syncUI();
  }

  _renderDossier(specOverride) {
    const card = document.getElementById('dossier-card');
    if (!card) return;

    const selId = this.stage ? this.stage.selectedAssemblyId : null;
    const item = specOverride !== undefined ? specOverride : selId ? ASSEMBLY_CATALOG[selId] : null;

    if (!item) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    const isRu = this.lang === 'ru';
    const catMap = CATEGORY_NAMES[this.lang] || CATEGORY_NAMES.ru;

    const catEl = document.getElementById('dossier-cat');
    const fiaEl = document.getElementById('dossier-fia');
    const titleEl = document.getElementById('dossier-title');
    const descEl = document.getElementById('dossier-desc');
    const massEl = document.getElementById('val-m-mass');
    const tempEl = document.getElementById('val-m-temp');
    const matEl = document.getElementById('val-m-mat');
    const isoBtn = document.getElementById('btn-isolate-part');

    if (catEl) catEl.textContent = (catMap[item.category] || item.category).toUpperCase();
    if (fiaEl) fiaEl.textContent = item.fia_reg.split(' ').slice(0, 2).join(' ');
    if (titleEl) titleEl.textContent = isRu ? item.name_ru : item.name_en;
    if (descEl) descEl.textContent = isRu ? item.desc_ru : item.desc_en;
    if (massEl) massEl.textContent = `${item.weight_kg.toFixed(1)} ${isRu ? 'кг' : 'kg'}`;
    if (tempEl) tempEl.textContent = `${item.operating_temp_c} °C`;
    if (matEl) matEl.textContent = item.material_spec;

    if (isoBtn) {
      const s = UI_STRINGS[this.lang];
      isoBtn.textContent = this.stage.isolated ? s.unisolate : s.isolate;
      isoBtn.classList.toggle('active', this.stage.isolated);
    }
  }

  _renderPartsDrawerList() {
    const listEl = document.getElementById('parts-list');
    if (!listEl || !this.stage) return;
    listEl.innerHTML = '';

    const activeCat = this.stage.activeCategory || 'all';
    const entries = Object.values(ASSEMBLY_CATALOG).filter((item) => {
      if (activeCat !== 'all' && item.category !== activeCat) return false;
      if (this.searchQuery) {
        const hay = `${item.id} ${item.name_en} ${item.name_ru} ${item.fia_reg} ${item.material_spec}`.toLowerCase();
        return hay.includes(this.searchQuery);
      }
      return true;
    });

    const isRu = this.lang === 'ru';
    for (const item of entries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `part-row ${this.stage.selectedAssemblyId === item.id ? 'selected' : ''}`;
      btn.dataset.asmId = item.id;

      const title = isRu ? item.name_ru : item.name_en;
      const unit = isRu ? 'кг' : 'kg';
      btn.innerHTML = `
        <div class="part-row-main">
          <span class="part-row-name">${title}</span>
          <span class="part-row-meta">${item.fia_reg} · ${item.weight_kg} ${unit}</span>
        </div>
        <span class="part-row-tag">${item.category.slice(0, 4).toUpperCase()}</span>
      `;
      btn.addEventListener('click', () => {
        if (this.stage.selectedAssemblyId === item.id) {
          this.selectAssembly(null);
        } else {
          if (INTERNAL_ASSEMBLIES.has(item.id) && !this.stage.coverOff) {
            this.stage.setCoverOff(true);
            this.stage.setCameraPreset('engine');
          }
          this.selectAssembly(item.id);
        }
      });
      listEl.appendChild(btn);
    }
  }

  _updateLiveHeaderPill() {
    const pill = document.getElementById('live-pill');
    if (!pill || !this.stage) return;
    const s = UI_STRINGS[this.lang];
    const rpm = Math.round(this.stage.rpm);
    const rpmNorm = Math.max(0, Math.min(1, (rpm - 3500) / (15000 - 3500)));
    const topSpeed = this.stage.drsOpen ? 352 : 334;
    const speed = Math.round(96 + rpmNorm * (topSpeed - 96));
    const tireMap = { soft: 'C5 SOFT', medium: 'C3 MED', hard: 'C1 HARD' };
    const tireTxt = tireMap[this.stage.tireCompound] || 'C5 SOFT';
    const drsTxt = this.stage.drsOpen ? ' · DRS OPEN' : '';
    const loc = this.lang === 'en' ? 'en-US' : 'ru-RU';
    pill.textContent = `${rpm.toLocaleString(loc)} ${s.rpmUnit} · ${speed} ${s.speedUnit} · ${tireTxt}${drsTxt}`;
  }

  _syncUI() {
    if (!this.stage) return;
    const s = UI_STRINGS[this.lang];

    // Determine active experience tab
    let exp = this.stage.mode;
    if (this.stage.mode === 'studio' && this.stage.coverOff) {
      exp = 'engine_open';
    }
    document.querySelectorAll('.mode-capsule .mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.exp === exp);
    });

    // Camera pills
    document.querySelectorAll('#cam-presets .cam-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cam === this.stage.currentCameraPreset);
    });

    // Explode slider
    const expPct = Math.round(this.stage.targetExplodeAmount * 100);
    const expSlider = document.getElementById('slider-explode');
    if (expSlider && Number(expSlider.value) !== expPct) {
      expSlider.value = String(expPct);
    }
    const expVal = document.getElementById('val-explode');
    if (expVal) expVal.textContent = `${expPct}%`;

    // Cover & DRS buttons
    const coverBtn = document.getElementById('btn-cover-toggle');
    if (coverBtn) {
      coverBtn.classList.toggle('active', this.stage.coverOff);
      coverBtn.textContent = this.stage.coverOff ? s.coverOn : s.coverOff;
    }
    document.getElementById('btn-drs-toggle')?.classList.toggle('active', this.stage.drsOpen);

    // Livery & tire swatches
    document.querySelectorAll('#livery-dots .swatch-dot').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.livery === this.stage.liveryId);
    });
    document.querySelectorAll('#tire-dots .tire-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tire === this.stage.tireCompound);
    });

    // Drawer selection highlight
    document.querySelectorAll('#parts-list .part-row').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.asmId === this.stage.selectedAssemblyId);
    });

    this._renderDossier();
    this._updateLiveHeaderPill();
  }

  _applyLanguage(lang) {
    this.lang = lang === 'en' ? 'en' : 'ru';
    document.documentElement.lang = this.lang;
    const s = UI_STRINGS[this.lang];

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setTxt('exp-studio', s.exp_studio);
    setTxt('exp-engine', s.exp_engine);
    setTxt('exp-cfd', s.exp_cfd);
    setTxt('exp-dyno', s.exp_dyno);
    setTxt('exp-xray', s.exp_xray);
    setTxt('exp-thermal', s.exp_thermal);
    setTxt('lbl-hotspots', s.hotspots);
    setTxt('lbl-all-parts', s.allParts(32));
    setTxt('lbl-audio', this.audio.enabled ? s.audioOn : s.audioOff);
    setTxt('btn-lang', this.lang.toUpperCase());
    setTxt('lbl-explode', s.explode);
    setTxt('lbl-m-mass', s.mass);
    setTxt('lbl-m-temp', s.temp);
    setTxt('lbl-m-mat', s.mat);
    setTxt('btn-reset-view', s.resetView);
    setTxt('drawer-eyebrow', s.drawerEyebrow);
    setTxt('drawer-title', s.drawerTitle);
    setTxt('loader-sub', s.loaderSub);
    setTxt('info-title', s.infoTitle);
    setTxt('info-body', s.infoBody);

    const searchEl = document.getElementById('part-search');
    if (searchEl) searchEl.placeholder = s.searchPlaceholder;

    // Camera buttons
    document.querySelectorAll('#cam-presets .cam-pill').forEach((btn) => {
      const key = `cam_${btn.dataset.cam}`;
      if (s[key]) btn.textContent = s[key];
    });

    // Category filter buttons
    document.querySelectorAll('#cat-pills .cat-pill').forEach((btn) => {
      const key = `cat_${btn.dataset.cat}`;
      if (s[key]) btn.textContent = s[key];
    });

    // Update 3D hotspot labels
    for (const def of HOTSPOT_DEFS) {
      const el = this.hotspotElements.get(def.id);
      const lbl = el?.querySelector('.hotspot-label');
      if (lbl) lbl.textContent = this.lang === 'ru' ? def.label_ru : def.label_en;
    }

    this._renderPartsDrawerList();
    this._syncUI();
  }

  // =========================================================================
  // PUBLIC API & WINDOW.__HF26 AUTOMATION HOOKS
  // =========================================================================

  setMode(mode) {
    this.stage.setMode(mode);
    this._syncUI();
  }

  setEnvironment(env) {
    this.stage.setEnvironment(env);
    this._syncUI();
  }

  setExplode(val, immediate = false) {
    this.stage.setExplode(val, immediate);
    this._syncUI();
  }

  setCoverOff(flag, immediate = false) {
    this.stage.setCoverOff(flag, immediate);
    this._syncUI();
  }

  setDRS(flag, immediate = false) {
    this.stage.setDRS(flag, immediate);
    this._syncUI();
  }

  setSteering(deg, immediate = false) {
    this.stage.setSteering(deg, immediate);
    this._syncUI();
  }

  setRPM(rpm) {
    this.stage.setRPM(rpm);
    this._syncUI();
  }

  setLivery(liveryId) {
    this.stage.setLivery(liveryId);
    this._syncUI();
  }

  setTireCompound(compound) {
    this.stage.setTireCompound(compound);
    this._syncUI();
  }

  selectAssembly(assemblyId) {
    this.stage.selectAssembly(assemblyId);
    this._syncUI();
  }

  isolateSelected(flag) {
    this.stage.isolateSelected(flag);
    this._syncUI();
  }

  setCameraPreset(presetName, immediate = false) {
    this.stage.setCameraPreset(presetName, immediate);
    this._syncUI();
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
      setExplode: (v, imm = false) => this.setExplode(v, imm),
      setCoverOff: (f, imm = false) => this.setCoverOff(f, imm),
      setDRS: (f, imm = false) => this.setDRS(f, imm),
      setSteering: (d, imm = false) => this.setSteering(d, imm),
      setRPM: (r) => this.setRPM(r),
      setLivery: (l) => this.setLivery(l),
      setTireCompound: (c) => this.setTireCompound(c),
      selectAssembly: (id) => this.selectAssembly(id),
      isolateSelected: (f) => this.isolateSelected(f),
      setCameraPreset: (p, imm = false) => this.setCameraPreset(p, imm),
      setOrbitCamera: (az, el, dist, tgt, presetTag = null) => {
        this.stage?.setOrbitCamera(az, el, dist, tgt, presetTag);
        this._syncUI();
      },
      setOrbitBlender: (az, el, dist, bTgt, fov = 36, presetTag = null) => {
        this.stage?.setOrbitBlender(az, el, dist, bTgt, fov, presetTag);
        this._syncUI();
      },
      stepFrame: (dt) => {
        this.stage?.stepFrame(dt);
        this._updateHotspotsProjection();
        this._updateLiveHeaderPill();
      },
      setLanguage: (l) => this.setLanguage(l),
    };
  }

  _startLoop() {
    const tick = () => {
      requestAnimationFrame(tick);
      this.stage.update();
      this.audio.update(this.stage.rpm, 0.016);
      this._updateHotspotsProjection();
      this._updateLiveHeaderPill();
    };
    requestAnimationFrame(tick);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new HF26ShowroomApp();
});
