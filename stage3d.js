/**
 * HF-26 APEX ULTRA — Three.js r186 Super-Realism 3D Stage, PBR Material Upgrade Pipeline,
 * 3 Switchable Architectural Environments (Atelier / CFD Wind Tunnel / Night Pit Dyno),
 * Live PCU-8D OLED Steering Wheel Display, X-Ray CAD & FLIR Thermal Vision.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  ASSEMBLY_CATALOG,
  MATERIAL_SPECS,
  LIVERY_PRESETS,
  CAMERA_PRESETS,
} from './catalog.js';

const XRAY_SHELL_ASSEMBLIES = new Set([
  'nosecone',
  'engine_cover',
  'sidepod_left',
  'sidepod_right',
  'monocoque',
  'underfloor_venturi',
  'diffuser_rear',
]);

const COVER_OFF_OFFSETS_BLENDER = {
  engine_cover: [0.0, 0.55, 1.38],
  sidepod_left: [-1.18, 0.05, 0.42],
  sidepod_right: [1.18, 0.05, 0.42],
  nosecone: [0.0, -1.28, 0.28],
};

const BRAKE_TO_WHEEL_PULLOFF = {
  brakes_fl: { wheelId: 'wheel_fl', bx: -0.62 },
  brakes_fr: { wheelId: 'wheel_fr', bx: 0.62 },
  brakes_rl: { wheelId: 'wheel_rl', bx: -0.62 },
  brakes_rr: { wheelId: 'wheel_rr', bx: 0.62 },
};

export class HF26Stage3D {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.ready = false;
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    // Coordinate sign mapping between Blender (X_right, Y_rear, Z_up) and Three.js (X_right, Y_up, Z_front)
    this.zSign = -1; // Default glTF +Y up maps Blender Y -> -Z

    // Interactive state
    this.mode = 'studio'; // 'studio' | 'cfd' | 'dyno' | 'xray' | 'thermal'
    this.environmentName = 'atelier'; // 'atelier' | 'windtunnel' | 'pitlane'
    this.liveryId = 'factory';
    this.tireCompound = 'soft';
    this.explodeAmount = 0.0;
    this.targetExplodeAmount = 0.0;
    this.coverOff = false;
    this.coverOffFactor = 0.0;
    this.drsOpen = false;
    this.drsFactor = 0.0;
    this.steeringDeg = 0.0;
    this.targetSteeringDeg = 0.0;
    this.rpm = 3800;
    this.targetRpm = 3800;
    this.activeCategory = 'all';
    this.selectedAssemblyId = null;
    this.isolated = false;

    // Scene collections
    this.assemblyGroups = new Map(); // id -> { group, pivotGroup, spinGroup, drsFlapMeshes, baseCenter, meshes, xrayEdges, datumLine }
    this.allMeshes = [];
    this.pbrMaterials = new Map(); // mat_tag -> THREE.MeshPhysicalMaterial
    this.meshOriginalMaterials = new WeakMap();
    this.meshXrayMaterials = new WeakMap();
    this.meshThermalMaterials = new WeakMap();

    // Model stats
    this.stats = {
      ready: false,
      assemblyCount: 0,
      meshCount: 0,
      vertexCount: 0,
      triangleCount: 0,
      assembliesLoaded: [],
      boundingBox: null,
    };

    // Camera transition state
    this.camLerp = {
      active: false,
      t: 1.0,
      duration: 0.38,
      startPos: new THREE.Vector3(),
      endPos: new THREE.Vector3(),
      startTarget: new THREE.Vector3(),
      endTarget: new THREE.Vector3(),
      startFov: 36,
      endFov: 36,
    };

    this._initRenderer();
    this._initSceneAndLights();
    this._initPostProcessing();
    this._initOledDisplayCanvas();
    this._initTextures();
    this._initEnvironments();
    this._initInteraction();
    this._loadModelWithRetry();
  }

  /**
   * Maps Blender engineering coordinates (bx, by, bz) to Three.js world Vector3.
   */
  b2t(bx, by, bz) {
    return new THREE.Vector3(bx, bz, this.zSign * by);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1.5, 2.0));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initSceneAndLights() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080c);
    this.scene.fog = new THREE.FogExp2(0x06080c, 0.025);

    this.camera = new THREE.PerspectiveCamera(
      36,
      window.innerWidth / window.innerHeight,
      0.08,
      120.0
    );
    this.camera.position.set(3.35, 1.15, 3.22);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.492;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 14.5;
    this.controls.target.set(0.0, 0.40, -0.05);
    this.controls.update();

    // Procedural studio softbox environment cubemap (calibrated for rich dark carbon contrast)
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    const studioEnvScene = this._createProceduralStudioEnvScene();
    this.proceduralEnvMap = this.pmremGenerator.fromScene(studioEnvScene, 0.035).texture;
    this.scene.environment = this.proceduralEnvMap;
    this.scene.environmentIntensity = 0.56;

    // Main overhead key light with high-res soft shadows
    this.keyLight = new THREE.DirectionalLight(0xf6f9ff, 1.35);
    this.keyLight.position.set(3.8, 6.2, 3.4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 16.0;
    const d = 3.8;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.012;
    this.scene.add(this.keyLight);

    // Cool rim light from rear-left
    this.rimLight1 = new THREE.DirectionalLight(0x88c8ff, 0.72);
    this.rimLight1.position.set(-4.5, 2.8, -3.8);
    this.scene.add(this.rimLight1);

    // Warm lateral grazing fill light for carbon weave highlights
    this.rimLight2 = new THREE.DirectionalLight(0xffe4c4, 0.55);
    this.rimLight2.position.set(4.5, 1.4, -2.5);
    this.scene.add(this.rimLight2);

    // Dedicated cockpit & footwell interior spotlight so open footwell + pedals are crystal clear
    this.cockpitLight = new THREE.SpotLight(0xffffff, 0.52, 4.5, Math.PI * 0.38, 0.78, 1.0);
    this.cockpitLight.position.set(0.0, 2.1, 0.35);
    this.cockpitLight.target.position.set(0.0, 0.28, 0.65);
    this.scene.add(this.cockpitLight);
    this.scene.add(this.cockpitLight.target);

    // Dedicated V6 engine bay spotlight
    this.engineBayLight = new THREE.SpotLight(0xfff4e8, 0.58, 4.5, Math.PI * 0.42, 0.72, 1.0);
    this.engineBayLight.position.set(0.85, 2.25, -0.65);
    this.engineBayLight.target.position.set(0.0, 0.45, -0.65);
    this.scene.add(this.engineBayLight);
    this.scene.add(this.engineBayLight.target);

    // Wheel & brake macro fill light
    this.wheelLight = new THREE.PointLight(0xeef6ff, 0.42, 3.8);
    this.wheelLight.position.set(-1.75, 0.52, 1.95);
    this.scene.add(this.wheelLight);

    // Ambient hemisphere light
    this.hemiLight = new THREE.HemisphereLight(0xdce8ff, 0x141a24, 0.44);
    this.scene.add(this.hemiLight);

    // Car root container
    this.carRoot = new THREE.Group();
    this.carRoot.name = 'HF26_CarRoot';
    this.scene.add(this.carRoot);

    // CAD Explode datum lines container
    this.datumLinesGroup = new THREE.Group();
    this.datumLinesGroup.name = 'HF26_DatumLines';
    this.scene.add(this.datumLinesGroup);
  }

  _createProceduralStudioEnvScene() {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x06080c);

    const stripGeo = new THREE.PlaneGeometry(10, 1.4);
    const stripMat1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.5), side: THREE.DoubleSide });
    const stripMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.8, 2.4), side: THREE.DoubleSide });
    const stripMatWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.6, 1.2), side: THREE.DoubleSide });

    // Overhead main softbox bank
    const topStrip = new THREE.Mesh(stripGeo, stripMat1);
    topStrip.position.set(0, 6.0, 0);
    topStrip.rotation.x = Math.PI / 2;
    envScene.add(topStrip);

    // Left & right grazing reflection strips
    const leftStrip = new THREE.Mesh(stripGeo, stripMat2);
    leftStrip.position.set(-5.5, 2.4, 0);
    leftStrip.rotation.y = Math.PI / 2;
    leftStrip.rotation.z = 0.15;
    envScene.add(leftStrip);

    const rightStrip = new THREE.Mesh(stripGeo, stripMatWarm);
    rightStrip.position.set(5.5, 2.2, 0);
    rightStrip.rotation.y = -Math.PI / 2;
    envScene.add(rightStrip);

    // Front & rear accent strips
    const frontStrip = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), stripMat1);
    frontStrip.position.set(0, 3.2, 6.0);
    envScene.add(frontStrip);

    const rearStrip = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), stripMat2);
    rearStrip.position.set(0, 3.0, -6.0);
    envScene.add(rearStrip);

    return envScene;
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.16, // subtle atmospheric bloom strength
      0.24, // tight radius
      1.65  // high HDR threshold so ONLY glowing LEDs, OLED, and 940°C brakes/exhaust bloom
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  _initOledDisplayCanvas() {
    this.oledCanvas = document.createElement('canvas');
    this.oledCanvas.width = 512;
    this.oledCanvas.height = 320;
    this.oledCtx = this.oledCanvas.getContext('2d');
    this.oledTexture = new THREE.CanvasTexture(this.oledCanvas);
    this.oledTexture.colorSpace = THREE.SRGBColorSpace;
    this.oledTexture.needsUpdate = true;
    this._drawOledTelemetry(0);
  }

  _drawOledTelemetry(time) {
    const ctx = this.oledCtx;
    if (!ctx) return;
    const w = 512;
    const h = 320;

    // Deep OLED background
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, w, h);

    // Subtle bezel border
    ctx.strokeStyle = '#1b2838';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // 15-LED Shift Light Array across top
    const rpmNorm = Math.max(0, Math.min(1, (this.rpm - 4000) / (15000 - 4000)));
    const activeLeds = Math.round(rpmNorm * 15);
    for (let i = 0; i < 15; i++) {
      const lx = 26 + i * 31;
      const ly = 22;
      let color = '#141c24';
      if (i < activeLeds) {
        if (i < 5) color = '#00ff66';
        else if (i < 10) color = '#ff3b00';
        else color = '#00d8ff';
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(lx, ly - 8, 22, 14, 3);
      ctx.fill();
    }

    // RPM Bar
    ctx.fillStyle = '#101822';
    ctx.fillRect(24, 44, w - 48, 16);
    const grad = ctx.createLinearGradient(24, 0, w - 24, 0);
    grad.addColorStop(0.0, '#00ff88');
    grad.addColorStop(0.65, '#ccff00');
    grad.addColorStop(0.85, '#ff3b00');
    grad.addColorStop(1.0, '#00e5ff');
    ctx.fillStyle = grad;
    ctx.fillRect(24, 44, (w - 48) * rpmNorm, 16);

    // Compute live Gear & Speed from RPM
    const speedKmh = Math.round(Math.min(352, ((this.rpm - 3500) / 11500) * (this.drsOpen ? 352 : 334)));
    const gear = this.rpm < 4200 ? '1' : String(Math.min(8, Math.max(1, Math.ceil(rpmNorm * 8))));

    // Center Gear Box
    ctx.fillStyle = '#0c131d';
    ctx.strokeStyle = '#ccff00';
    ctx.lineWidth = 2;
    ctx.fillRect(196, 74, 120, 138);
    ctx.strokeRect(196, 74, 120, 138);

    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GEAR', 256, 94);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 92px monospace';
    ctx.fillText(gear, 256, 186);

    // Left column: RPM & SPEED
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('ICE RPM', 26, 94);
    ctx.fillStyle = '#ccff00';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(String(Math.round(this.rpm)), 26, 130);

    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('SPEED KM/H', 26, 164);
    ctx.fillStyle = '#f0f6fc';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(String(speedKmh), 26, 202);

    // Right column: ERS & DRS
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('800V ERS SOC', w - 26, 94);
    const soc = Math.max(18, Math.round(92 - rpmNorm * 28));
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(`${soc}%`, w - 26, 130);

    // DRS Status Pill
    ctx.fillStyle = this.drsOpen ? '#ccff00' : '#1b2634';
    ctx.fillRect(w - 166, 152, 140, 44);
    ctx.fillStyle = this.drsOpen ? '#05080c' : '#8da2b8';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.drsOpen ? 'DRS OPEN' : 'DRS STBY', w - 96, 181);

    // Bottom telemetry strip: Brake Temp, Exhaust Temp, Lap Delta
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(24, 228, w - 48, 68);
    ctx.strokeStyle = '#1f2e42';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 228, w - 48, 68);

    const brakeTemp = Math.round(320 + rpmNorm * 610);
    const exhTemp = Math.round(490 + rpmNorm * 455);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('BRK TEMP', 38, 250);
    ctx.fillStyle = brakeTemp > 750 ? '#ff4d00' : '#ffaa00';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${brakeTemp}°C`, 38, 282);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('LAP DELTA', 256, 250);
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('-0.284s', 256, 282);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#7b8fa6';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('INCONEL EXH', w - 38, 250);
    ctx.fillStyle = '#ff3b00';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${exhTemp}°C`, w - 38, 282);

    if (this.oledTexture) {
      this.oledTexture.needsUpdate = true;
    }
  }

  _initTextures() {
    this.texLoader = new THREE.TextureLoader();
    this.textures = {};

    const loadTex = (key, url, opts = {}) => {
      const tex = this.texLoader.load(
        url,
        (t) => {
          t.needsUpdate = true;
        },
        undefined,
        () => {}
      );
      tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (opts.repeat) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(opts.repeat[0], opts.repeat[1]);
      }
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.textures[key] = tex;
      return tex;
    };

    loadTex('carbon_albedo', './assets/textures/carbon_twill_albedo.png', { srgb: true, repeat: [16, 16] });
    loadTex('carbon_normal', './assets/textures/carbon_twill_normal.png', { srgb: false, repeat: [16, 16] });
    loadTex('carbon_roughness', './assets/textures/carbon_twill_roughness.png', { srgb: false, repeat: [16, 16] });
    loadTex('cnc_normal', './assets/textures/cnc_metal_normal.png', { srgb: false, repeat: [12, 12] });
    loadTex('gold_normal', './assets/textures/gold_foil_normal.png', { srgb: false, repeat: [10, 10] });

    loadTex('tire_soft', './assets/textures/tire_sidewall_soft.png', { srgb: true });
    loadTex('tire_medium', './assets/textures/tire_sidewall_medium.png', { srgb: true });
    loadTex('tire_hard', './assets/textures/tire_sidewall_hard.png', { srgb: true });
    loadTex('tire_sidewall_normal', './assets/textures/tire_sidewall_normal.png', { srgb: false });
    loadTex('tire_tread_normal', './assets/textures/tire_tread_normal.png', { srgb: false, repeat: [6, 2] });
    loadTex('tire_tread_roughness', './assets/textures/tire_tread_roughness.png', { srgb: false, repeat: [6, 2] });

    loadTex('brake_albedo', './assets/textures/brake_disc_albedo.png', { srgb: true });
    loadTex('brake_normal', './assets/textures/brake_disc_normal.png', { srgb: false });
    loadTex('brake_emissive', './assets/textures/brake_disc_emissive.png', { srgb: true });

    loadTex('inconel_albedo', './assets/textures/inconel_exhaust_albedo.png', { srgb: true, repeat: [3, 3] });
    loadTex('env_atelier_bg', './assets/textures/env_atelier_bg.jpg', { srgb: true });
    loadTex('env_pitlane_bg', './assets/textures/env_pitlane_bg.jpg', { srgb: true });
  }

  _buildPbrMaterial(matTag) {
    if (this.pbrMaterials.has(matTag)) {
      return this.pbrMaterials.get(matTag);
    }

    const spec = MATERIAL_SPECS[matTag] || MATERIAL_SPECS.MAT_CARBON_TWILL;
    const [r, g, b] = spec.base_color;
    const mat = new THREE.MeshPhysicalMaterial({
      name: matTag,
      color: new THREE.Color(r, g, b),
      metalness: spec.metallic ?? 0.2,
      roughness: spec.roughness ?? 0.3,
      clearcoat: spec.coat_weight ?? 0.0,
      clearcoatRoughness: spec.coat_roughness ?? 0.1,
      envMapIntensity: 0.85,
      side: THREE.DoubleSide,
    });

    if (spec.emission) {
      const [er, eg, eb] = spec.emission;
      mat.emissive = new THREE.Color(er, eg, eb);
      mat.emissiveIntensity = spec.emission_strength ?? 1.5;
    }

    // Specialized PBR upgrades per material tag
    if (matTag === 'MAT_CARBON_TWILL' || matTag === 'MAT_LIVERY_CARBON_GLOSS' || matTag === 'MAT_CARBON_MATTE') {
      mat.normalMap = this.textures.carbon_normal;
      mat.normalScale = new THREE.Vector2(0.42, 0.42);
      mat.roughnessMap = this.textures.carbon_roughness;
      if (matTag !== 'MAT_CARBON_MATTE') {
        mat.clearcoat = 0.92;
        mat.clearcoatRoughness = 0.075;
        mat.anisotropy = 0.55;
      }
    } else if (matTag === 'MAT_TITANIUM_BRUSHED' || matTag === 'MAT_ALUMINUM_CNC') {
      mat.normalMap = this.textures.cnc_normal;
      mat.normalScale = new THREE.Vector2(0.20, 0.20);
      mat.anisotropy = 0.65;
    } else if (matTag === 'MAT_GOLD_FOIL') {
      mat.color.setHex(0xf8b624);
      mat.metalness = 0.99;
      mat.roughness = 0.16;
      mat.normalMap = this.textures.gold_normal;
      mat.normalScale = new THREE.Vector2(0.55, 0.55);
      mat.clearcoat = 0.35;
    } else if (matTag === 'MAT_TIRE_SIDEWALL') {
      mat.color.setHex(0xffffff); // Let tire_sidewall_*.png drive albedo & colored Pirelli ring
      mat.map = this.textures.tire_soft;
      mat.normalMap = this.textures.tire_sidewall_normal;
      mat.normalScale = new THREE.Vector2(0.65, 0.65);
      mat.roughness = 0.44;
      mat.metalness = 0.04;
      mat.clearcoat = 0.15;
    } else if (matTag === 'MAT_TIRE_TREAD') {
      mat.normalMap = this.textures.tire_tread_normal;
      mat.normalScale = new THREE.Vector2(0.35, 0.35);
      mat.roughnessMap = this.textures.tire_tread_roughness;
      mat.roughness = 0.52;
    } else if (matTag === 'MAT_BRAKE_DISC') {
      mat.color.setHex(0xffffff);
      mat.map = this.textures.brake_albedo;
      mat.normalMap = this.textures.brake_normal;
      mat.normalScale = new THREE.Vector2(0.75, 0.75);
      mat.emissiveMap = this.textures.brake_emissive;
      mat.emissive = new THREE.Color(0xff3b00);
      mat.emissiveIntensity = 0.18; // Subtle warm glow at idle, blazes up to 3.6 at 15,000 RPM / dyno
    } else if (matTag === 'MAT_INCONEL_EXHAUST') {
      mat.color.setHex(0xd8b8a8);
      mat.map = this.textures.inconel_albedo;
      mat.metalness = 0.90;
      mat.roughness = 0.26;
      mat.iridescence = 0.72;
      mat.iridescenceIOR = 1.42;
      mat.emissive = new THREE.Color(0xff3300);
      mat.emissiveIntensity = 0.12;
    } else if (matTag === 'MAT_OLED_SCREEN') {
      mat.color.setHex(0xffffff);
      mat.map = this.oledTexture;
      mat.emissiveMap = this.oledTexture;
      mat.emissive = new THREE.Color(0xffffff);
      mat.emissiveIntensity = 1.35;
      mat.roughness = 0.05;
      mat.clearcoat = 1.0;
    }

    this.pbrMaterials.set(matTag, mat);
    return mat;
  }

  _initEnvironments() {
    this.envGroups = {
      atelier: new THREE.Group(),
      windtunnel: new THREE.Group(),
      pitlane: new THREE.Group(),
    };
    this.scene.add(this.envGroups.atelier);
    this.scene.add(this.envGroups.windtunnel);
    this.scene.add(this.envGroups.pitlane);

    // Real-time planar floor mirror shared under semi-transparent floors (subtle, museum-grade satin reflection)
    const reflectorGeo = new THREE.CircleGeometry(11.5, 64);
    this.floorReflector = new Reflector(reflectorGeo, {
      clipBias: 0.003,
      textureWidth: Math.floor(window.innerWidth * 0.75),
      textureHeight: Math.floor(window.innerHeight * 0.75),
      color: 0x0e1116,
    });
    this.floorReflector.rotation.x = -Math.PI / 2;
    this.floorReflector.position.y = -0.004;
    this.scene.add(this.floorReflector);

    this._buildAtelierEnvironment(this.envGroups.atelier);
    this._buildWindTunnelEnvironment(this.envGroups.windtunnel);
    this._buildPitlaneEnvironment(this.envGroups.pitlane);

    this.setEnvironment('atelier');
  }

  _buildAtelierEnvironment(group) {
    // 1. Museum-grade satin dark basalt podium (Polestar / Porsche showcase look — no noisy grid lines or white floor glare)
    const platformGeo = new THREE.CylinderGeometry(8.5, 8.8, 0.04, 96);
    const platformMat = new THREE.MeshPhysicalMaterial({
      color: 0x07090d,
      metalness: 0.12,
      roughness: 0.52,
      clearcoat: 0.06,
      clearcoatRoughness: 0.38,
      envMapIntensity: 0.12,
      transparent: true,
      opacity: 0.88,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.021;
    platform.receiveShadow = true;
    group.add(platform);

    // 2. Soft grounding ambient-occlusion contact shadow directly under the car wheelbase
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = 512;
    aoCanvas.height = 512;
    const actx = aoCanvas.getContext('2d');
    const grad = actx.createRadialGradient(256, 256, 20, 256, 256, 245);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.90)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.62)');
    grad.addColorStop(0.82, 'rgba(0, 0, 0, 0.20)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    actx.fillStyle = grad;
    actx.fillRect(0, 0, 512, 512);
    const aoTex = new THREE.CanvasTexture(aoCanvas);
    const aoShadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.65, 6.35),
      new THREE.MeshBasicMaterial({
        map: aoTex,
        transparent: true,
        depthWrite: false,
      })
    );
    aoShadowPlane.rotation.x = -Math.PI / 2;
    aoShadowPlane.position.y = 0.0012;
    group.add(aoShadowPlane);

    // 3. Outer dark architectural studio floor skirt
    const outerFloor = new THREE.Mesh(
      new THREE.RingGeometry(8.5, 24.0, 96),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.65, metalness: 0.1, envMapIntensity: 0.1 })
    );
    outerFloor.rotation.x = -Math.PI / 2;
    outerFloor.position.y = -0.002;
    outerFloor.receiveShadow = true;
    group.add(outerFloor);

    // 4. Ultra-subtle hairline turntable rim ring (whisper-quiet graphite/white, zero neon glare)
    const subtleRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.11,
    });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(3.85, 3.862, 128), subtleRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.0015;
    group.add(innerRing);

    // 5. Curved Studio Cyclorama Dome mapped with env_atelier_bg.jpg (darkened so car silhouette pops)
    const cycGeo = new THREE.CylinderGeometry(17.5, 17.5, 10.0, 64, 1, true);
    const cycMat = new THREE.MeshBasicMaterial({
      map: this.textures.env_atelier_bg,
      color: 0x1c222c,
      side: THREE.BackSide,
    });
    const cyc = new THREE.Mesh(cycGeo, cycMat);
    cyc.position.y = 4.4;
    group.add(cyc);
  }

  _buildWindTunnelEnvironment(group) {
    // 1. Slotted steel rolling-road belt floor under the car
    const beltCanvas = document.createElement('canvas');
    beltCanvas.width = 512;
    beltCanvas.height = 512;
    const bctx = beltCanvas.getContext('2d');
    bctx.fillStyle = '#11161e';
    bctx.fillRect(0, 0, 512, 512);
    bctx.strokeStyle = '#202b3a';
    bctx.lineWidth = 4;
    for (let y = 0; y < 512; y += 32) {
      bctx.beginPath();
      bctx.moveTo(0, y);
      bctx.lineTo(512, y);
      bctx.stroke();
    }
    bctx.fillStyle = '#00d8ff';
    bctx.fillRect(14, 0, 4, 512);
    bctx.fillRect(494, 0, 4, 512);

    this.rollingRoadTex = new THREE.CanvasTexture(beltCanvas);
    this.rollingRoadTex.wrapS = THREE.RepeatWrapping;
    this.rollingRoadTex.wrapT = THREE.RepeatWrapping;
    this.rollingRoadTex.repeat.set(1, 6);

    const beltMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 7.6),
      new THREE.MeshStandardMaterial({
        map: this.rollingRoadTex,
        roughness: 0.35,
        metalness: 0.65,
      })
    );
    beltMesh.rotation.x = -Math.PI / 2;
    beltMesh.position.y = 0.002;
    beltMesh.receiveShadow = true;
    group.add(beltMesh);

    // Surrounding wind tunnel floor deck
    const tunnelDeck = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 22),
      new THREE.MeshStandardMaterial({
        color: 0x090d14,
        roughness: 0.32,
        metalness: 0.75,
        transparent: true,
        opacity: 0.85,
      })
    );
    tunnelDeck.rotation.x = -Math.PI / 2;
    tunnelDeck.position.y = -0.001;
    tunnelDeck.receiveShadow = true;
    group.add(tunnelDeck);

    // 2. Cylindrical Wind Tunnel ribs
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x182232, metalness: 0.85, roughness: 0.28 });
    const cyanStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.0, 1.4, 2.2) });
    for (let z = -7.5; z <= 7.5; z += 2.5) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.09, 16, 64, Math.PI), ribMat);
      arch.position.set(0, 0.0, z);
      group.add(arch);

      const lightArc = new THREE.Mesh(new THREE.TorusGeometry(4.48, 0.025, 8, 64, Math.PI), cyanStripMat);
      lightArc.position.set(0, 0.0, z);
      group.add(lightArc);
    }

    // 3. Giant Upstream 3D Spinning Turbine Fan (positioned dynamically in front of nose via zSign)
    this.windTunnelTurbineGroup = new THREE.Group();
    const hub = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a384c, metalness: 0.9, roughness: 0.2 })
    );
    hub.rotation.x = Math.PI / 2;
    this.windTunnelTurbineGroup.add(hub);

    const bladeGeo = new THREE.BoxGeometry(0.28, 3.6, 0.04);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x566b86, metalness: 0.92, roughness: 0.22 });
    this.turbineBlades = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const bWrap = new THREE.Group();
      bWrap.rotation.z = (i * Math.PI * 2) / 14;
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 2.1;
      blade.rotation.y = 0.42;
      bWrap.add(blade);
      this.turbineBlades.add(bWrap);
    }
    this.windTunnelTurbineGroup.add(this.turbineBlades);

    const shroud = new THREE.Mesh(
      new THREE.TorusGeometry(3.95, 0.22, 20, 64),
      new THREE.MeshStandardMaterial({ color: 0x121a26, metalness: 0.85, roughness: 0.3 })
    );
    this.windTunnelTurbineGroup.add(shroud);
    this.windTunnelTurbineGroup.position.set(0, 1.55, 7.2); // Updated on GLB calibration
    group.add(this.windTunnelTurbineGroup);

    // 4. Laser PIV vertical aero measurement sheet
    const pivGeo = new THREE.PlaneGeometry(0.01, 2.2);
    this.pivSheet = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 1.65),
      new THREE.MeshBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.pivSheet.rotation.y = Math.PI / 2;
    this.pivSheet.position.set(0.0, 0.82, 0.0);
    group.add(this.pivSheet);

    // 5. 64 GPU-Animated 3D Volumetric Aerodynamic Streamline Ribbons
    this.cfdStreamlinesGroup = new THREE.Group();
    this.cfdRibbons = [];
    this._createFlowPulseTexture();
    this._rebuildCfdStreamlines();
    this.scene.add(this.cfdStreamlinesGroup);
  }

  _createFlowPulseTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 16;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.0, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.55, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    g.addColorStop(1.0, 'rgba(255,255,255,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 16);

    this.cfdPulseTex = new THREE.CanvasTexture(c);
    this.cfdPulseTex.wrapS = THREE.RepeatWrapping;
    this.cfdPulseTex.wrapT = THREE.RepeatWrapping;
    this.cfdPulseTex.repeat.set(3, 1);
  }

  _velocityToCfdColor(vNorm) {
    // 0.0 (Blue) -> 0.3 (Cyan) -> 0.55 (Emerald) -> 0.8 (Yellow) -> 1.0 (Crimson)
    const c = new THREE.Color();
    if (vNorm < 0.3) {
      c.lerpColors(new THREE.Color(0x0055ff), new THREE.Color(0x00f0ff), vNorm / 0.3);
    } else if (vNorm < 0.58) {
      c.lerpColors(new THREE.Color(0x00f0ff), new THREE.Color(0x00ff77), (vNorm - 0.3) / 0.28);
    } else if (vNorm < 0.82) {
      c.lerpColors(new THREE.Color(0x00ff77), new THREE.Color(0xffe600), (vNorm - 0.58) / 0.24);
    } else {
      c.lerpColors(new THREE.Color(0xffe600), new THREE.Color(0xff2200), (vNorm - 0.82) / 0.18);
    }
    return c;
  }

  _rebuildCfdStreamlines() {
    while (this.cfdStreamlinesGroup.children.length > 0) {
      const ch = this.cfdStreamlinesGroup.children.pop();
      if (ch.geometry) ch.geometry.dispose();
    }
    this.cfdRibbons = [];

    const paths = [];

    // Family A: Central Nosecone -> S-Duct -> Halo -> Airbox -> Rear Wing (14 streamlines)
    for (let i = 0; i < 14; i++) {
      const frac = (i / 13) * 2 - 1; // -1..+1
      const bx = frac * 0.34;
      const zBias = Math.abs(frac) * 0.06;
      const drsDrop = this.drsOpen ? -0.07 : 0.0;
      paths.push({
        radius: 0.0085,
        speed: 1.25,
        pts: [
          [bx * 0.9, -3.55, 0.12 + zBias],
          [bx * 0.92, -2.55, 0.16 + zBias],
          [bx * 0.78, -1.65, 0.44 + zBias],
          [bx * 0.65, -0.55, 0.74 + (1 - Math.abs(frac)) * 0.14],
          [bx * 0.52, 0.45, 0.88 + (1 - Math.abs(frac)) * 0.12],
          [bx * 0.60, 1.55, 0.82],
          [bx * 0.68, 2.48, 0.88 + drsDrop],
          [bx * 0.75, 3.65, 0.98 + drsDrop * 1.6],
        ],
        vels: [0.22, 0.55, 0.68, 0.78, 0.65, 0.72, 0.92, 0.48],
      });
    }

    // Family B: Front Wing Outwash & Sidepod Undercut / Coke-Bottle Channels (18 streamlines)
    for (const side of [-1, 1]) {
      for (let j = 0; j < 9; j++) {
        const t = j / 8;
        const bx0 = side * (0.38 + t * 0.46);
        const bz0 = 0.10 + (j % 3) * 0.09;
        paths.push({
          radius: 0.008,
          speed: 1.45,
          pts: [
            [bx0 * 0.92, -3.50, bz0],
            [bx0 * 1.04, -2.35, bz0 + 0.08],
            [side * (0.56 + t * 0.32), -1.15, bz0 + 0.18],
            [side * (0.58 + t * 0.16), -0.15, 0.26 + t * 0.24],
            [side * (0.38 + t * 0.15), 0.95, 0.22 + t * 0.20],
            [side * (0.34 + t * 0.18), 1.95, 0.26 + t * 0.18],
            [side * (0.42 + t * 0.24), 3.55, 0.48 + t * 0.22],
          ],
          vels: [0.25, 0.72, 0.58, 0.84, 0.88, 0.76, 0.42],
        });
      }
    }

    // Family C: Ground-Effect Underfloor Venturi Tunnels -> Steep Diffuser Extraction (18 streamlines)
    for (const side of [-1, 1]) {
      for (let j = 0; j < 9; j++) {
        const t = (j + 0.5) / 9;
        const bx = side * (0.14 + t * 0.48);
        paths.push({
          radius: 0.009,
          speed: 1.75,
          pts: [
            [bx * 0.85, -3.40, 0.06],
            [bx * 0.90, -1.95, 0.07],
            [bx * 0.82, -0.75, 0.055],
            [bx * 0.74, 0.25, 0.045], // Venturi throat peak suction!
            [bx * 0.85, 1.35, 0.065],
            [bx * 0.96, 2.38, 0.28 + t * 0.12], // Diffuser expansion ramp
            [bx * 1.12, 3.65, 0.54 + t * 0.18],
          ],
          vels: [0.30, 0.55, 0.82, 0.98, 0.92, 0.75, 0.45],
        });
      }
    }

    // Family D: Rear Wing Tip Helical Vortex Spirals (14 streamlines)
    for (const side of [-1, 1]) {
      for (let j = 0; j < 7; j++) {
        const phase0 = (j / 7) * Math.PI * 2;
        const spiralPts = [
          [side * 0.46, 0.65, 0.72 + (j - 3) * 0.03],
          [side * 0.48, 1.65, 0.84 + (j - 3) * 0.025],
          [side * 0.50, 2.35, 0.90],
        ];
        const spiralVels = [0.60, 0.75, 0.95];
        for (let s = 1; s <= 8; s++) {
          const by = 2.35 + s * 0.22;
          const r = 0.04 + s * 0.016;
          const ang = phase0 + s * 0.95 * side;
          spiralPts.push([
            side * 0.50 + Math.cos(ang) * r,
            by,
            0.90 + Math.sin(ang) * r + s * 0.015,
          ]);
          spiralVels.push(Math.max(0.35, 0.98 - s * 0.07));
        }
        paths.push({
          radius: 0.0075,
          speed: 1.6,
          pts: spiralPts,
          vels: spiralVels,
        });
      }
    }

    for (const p of paths) {
      const worldPts = p.pts.map(([bx, by, bz]) => this.b2t(bx, by, bz));
      const curve = new THREE.CatmullRomCurve3(worldPts);
      const tubularSegments = 64;
      const radialSegments = 6;
      const geom = new THREE.TubeGeometry(curve, tubularSegments, p.radius * 0.46, radialSegments, false);

      // Assign vertex colors along the tube length based on local velocity array
      const posAttr = geom.attributes.position;
      const uvAttr = geom.attributes.uv;
      const colors = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        const u = uvAttr.getX(i); // 0..1 along curve
        const vIdx = u * (p.vels.length - 1);
        const i0 = Math.floor(vIdx);
        const i1 = Math.min(p.vels.length - 1, i0 + 1);
        const f = vIdx - i0;
        const vNorm = p.vels[i0] * (1 - f) + p.vels[i1] * f;
        const col = this._velocityToCfdColor(vNorm);
        colors[i * 3] = col.r * 1.15;
        colors[i * 3 + 1] = col.g * 1.15;
        colors[i * 3 + 2] = col.b * 1.15;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        map: this.cfdPulseTex,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geom, mat);
      this.cfdStreamlinesGroup.add(mesh);
      this.cfdRibbons.push({ mesh, speed: p.speed });
    }

    this.cfdStreamlinesGroup.visible = this.mode === 'cfd' || this.environmentName === 'windtunnel';
  }

  _buildPitlaneEnvironment(group) {
    // 1. Wet night asphalt pit-apron with painted FIA pit-box markings
    const pitCanvas = document.createElement('canvas');
    pitCanvas.width = 1024;
    pitCanvas.height = 1024;
    const pctx = pitCanvas.getContext('2d');
    pctx.fillStyle = '#0c0f14';
    pctx.fillRect(0, 0, 1024, 1024);

    // Asphalt micro-speckle
    for (let i = 0; i < 6000; i++) {
      const v = 14 + Math.floor(Math.random() * 18);
      pctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      pctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // FIA Pit-Box Lines (Yellow & Red wheel marks + White corridor lines)
    pctx.fillStyle = '#f0f4f8';
    pctx.fillRect(80, 0, 18, 1024);
    pctx.fillRect(926, 0, 18, 1024);

    pctx.fillStyle = '#ff3b00';
    pctx.fillRect(140, 180, 744, 16);
    pctx.fillStyle = '#ccff00';
    pctx.fillRect(220, 240, 110, 22);
    pctx.fillRect(694, 240, 110, 22);
    pctx.fillRect(220, 760, 110, 22);
    pctx.fillRect(694, 760, 110, 22);

    pctx.fillStyle = 'rgba(204, 255, 0, 0.85)';
    pctx.font = 'bold 44px monospace';
    pctx.textAlign = 'center';
    pctx.fillText('01 • HIGGSFIELD RACING • PIT BOX', 512, 130);

    this.pitAsphaltTex = new THREE.CanvasTexture(pitCanvas);
    this.pitAsphaltTex.colorSpace = THREE.SRGBColorSpace;
    this.pitAsphaltTex.wrapS = THREE.RepeatWrapping;
    this.pitAsphaltTex.wrapT = THREE.RepeatWrapping;

    const pitFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(14.0, 16.0),
      new THREE.MeshPhysicalMaterial({
        map: this.pitAsphaltTex,
        roughness: 0.24,
        metalness: 0.15,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.82,
      })
    );
    pitFloor.rotation.x = -Math.PI / 2;
    pitFloor.position.y = 0.001;
    pitFloor.receiveShadow = true;
    group.add(pitFloor);

    // 2. Overhead Pit Boom & Stadium Floodlights
    const boomMat = new THREE.MeshStandardMaterial({ color: 0x1a222d, metalness: 0.85, roughness: 0.25 });
    const boomPylon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.28), boomMat);
    boomPylon.position.set(-2.9, 1.7, 0.0);
    group.add(boomPylon);

    const boomArm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.24), boomMat);
    boomArm.position.set(-1.3, 3.1, 0.0);
    group.add(boomArm);

    const floodMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.7) });
    for (const zPos of [-1.8, 0.0, 1.8]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.35), floodMat);
      lamp.position.set(0.0, 3.0, zPos);
      group.add(lamp);
    }

    // 3. Curved Night Pit Backdrop mapped with env_pitlane_bg.jpg
    const pitSky = new THREE.Mesh(
      new THREE.CylinderGeometry(16.5, 16.5, 9.5, 64, 1, true),
      new THREE.MeshBasicMaterial({
        map: this.textures.env_pitlane_bg,
        color: 0x5c6878,
        side: THREE.BackSide,
      })
    );
    pitSky.position.y = 4.2;
    group.add(pitSky);

    // 4. Titanium Skid-Block Spark Particle System (erupting under plank at high RPM / Dyno)
    this._initSparkSystem();
  }

  _initSparkSystem() {
    this.sparkCount = 240;
    const positions = new Float32Array(this.sparkCount * 6); // 2 vertices per streak line
    const colors = new Float32Array(this.sparkCount * 6);
    this.sparkState = [];

    for (let i = 0; i < this.sparkCount; i++) {
      this.sparkState.push({
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: Math.random(),
        maxLife: 0.25 + Math.random() * 0.45,
      });
      // Head color: white-hot yellow; Tail color: bright orange-red
      colors[i * 6 + 0] = 3.5;
      colors[i * 6 + 1] = 2.6;
      colors[i * 6 + 2] = 1.2;
      colors[i * 6 + 3] = 2.8;
      colors[i * 6 + 4] = 0.7;
      colors[i * 6 + 5] = 0.1;
    }

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const sparkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    this.sparkLines = new THREE.LineSegments(sparkGeo, sparkMat);
    this.sparkLines.frustumCulled = false;
    this.sparkLines.visible = false;
    this.scene.add(this.sparkLines);
  }

  _respawnSpark(s) {
    // Spawn at one of 3 titanium skid pads under the plank: front-skid, mid-skid, rear-diffuser throat
    const pads = [
      [0.0, -0.35, 0.025],
      [-0.14, 0.65, 0.022],
      [0.14, 0.65, 0.022],
      [0.0, 1.55, 0.028],
    ];
    const pad = pads[Math.floor(Math.random() * pads.length)];
    const worldOrigin = this.b2t(
      pad[0] + (Math.random() - 0.5) * 0.18,
      pad[1] + (Math.random() - 0.5) * 0.22,
      pad[2]
    );
    s.x = worldOrigin.x;
    s.y = worldOrigin.y;
    s.z = worldOrigin.z;

    // Shoot rearward along +by (which is this.zSign * +1 in Three.js Z)
    const speedRear = 8.5 + Math.random() * 9.5;
    s.vx = (Math.random() - 0.5) * 2.8;
    s.vy = 0.6 + Math.random() * 2.2;
    s.vz = this.zSign * speedRear;
    s.life = 0.0;
    s.maxLife = 0.18 + Math.random() * 0.32;
  }

  _updateSparks(dt) {
    const active = this.mode === 'dyno' || this.environmentName === 'pitlane';
    this.sparkLines.visible = active && this.rpm > 6500;
    if (!this.sparkLines.visible) return;

    const posAttr = this.sparkLines.geometry.attributes.position;
    const arr = posAttr.array;
    const intensityFactor = Math.max(0.2, (this.rpm - 6500) / (15000 - 6500));

    for (let i = 0; i < this.sparkCount; i++) {
      const s = this.sparkState[i];
      s.life += dt;
      if (s.life >= s.maxLife || s.y < -1) {
        if (Math.random() < intensityFactor) {
          this._respawnSpark(s);
        } else {
          arr[i * 6 + 1] = -10;
          arr[i * 6 + 4] = -10;
          continue;
        }
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= 9.8 * dt; // Gravity
      if (s.y < 0.008) {
        s.y = 0.008;
        s.vy = Math.abs(s.vy) * (0.45 + Math.random() * 0.35);
        s.vx += (Math.random() - 0.5) * 1.4;
      }

      const tailDt = 0.022;
      arr[i * 6 + 0] = s.x;
      arr[i * 6 + 1] = s.y;
      arr[i * 6 + 2] = s.z;
      arr[i * 6 + 3] = s.x - s.vx * tailDt;
      arr[i * 6 + 4] = Math.max(0.005, s.y - s.vy * tailDt);
      arr[i * 6 + 5] = s.z - s.vz * tailDt;
    }
    posAttr.needsUpdate = true;
  }

  _loadModelWithRetry() {
    const loader = new GLTFLoader();
    const attemptLoad = () => {
      loader.load(
        './assets/hf26.glb',
        (gltf) => {
          this._onModelLoaded(gltf);
        },
        undefined,
        () => {
          setTimeout(attemptLoad, 1000);
        }
      );
    };
    attemptLoad();
  }

  _parseMeshIdentity(obj) {
    const candidates = [obj.name, obj.parent?.name, obj.userData?.name].filter(Boolean);
    for (const raw of candidates) {
      if (raw.includes('__')) {
        const parts = raw.split('__');
        const assemblyId = parts[0];
        const subpart = parts[1] || 'part';
        let matTag = parts.slice(2).join('__').replace(/(\.\d+|_mesh)$/i, '');
        if (!MATERIAL_SPECS[matTag]) {
          // Try prefix match against MATERIAL_SPECS
          const foundMat = Object.keys(MATERIAL_SPECS).find((k) => matTag.startsWith(k));
          if (foundMat) matTag = foundMat;
        }
        if (ASSEMBLY_CATALOG[assemblyId]) {
          return { assemblyId, subpart, matTag: MATERIAL_SPECS[matTag] ? matTag : 'MAT_CARBON_TWILL' };
        }
      }
    }

    // Fallback to userData properties exported by Blender custom properties
    const ud = obj.userData || obj.parent?.userData || {};
    if (ud.assembly_id && ASSEMBLY_CATALOG[ud.assembly_id]) {
      return {
        assemblyId: ud.assembly_id,
        subpart: ud.subpart || 'part',
        matTag: ud.mat_tag && MATERIAL_SPECS[ud.mat_tag] ? ud.mat_tag : 'MAT_CARBON_TWILL',
      };
    }

    // Substring match against known assembly IDs
    const lower = (obj.name || '').toLowerCase();
    for (const id of Object.keys(ASSEMBLY_CATALOG)) {
      if (lower.startsWith(id)) {
        return { assemblyId: id, subpart: 'body', matTag: 'MAT_CARBON_TWILL' };
      }
    }
    return { assemblyId: 'monocoque', subpart: obj.name || 'part', matTag: 'MAT_CARBON_TWILL' };
  }

  _normalizeSpecialUVs(geom, matTag) {
    const posAttr = geom.attributes.position;
    let uvAttr = geom.attributes.uv;
    if (!posAttr) return;
    if (!uvAttr) {
      uvAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2);
      geom.setAttribute('uv', uvAttr);
    }

    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;

    if (matTag === 'MAT_TIRE_SIDEWALL' || matTag === 'MAT_BRAKE_DISC') {
      // Wheel sidewall and brake disc lie in the Y-Z plane (normal along X)
      const cy = 0.5 * (bb.min.y + bb.max.y);
      const cz = 0.5 * (bb.min.z + bb.max.z);
      const ry = Math.max(0.04, 0.5 * (bb.max.y - bb.min.y));
      const rz = Math.max(0.04, 0.5 * (bb.max.z - bb.min.z));
      const rMax = Math.max(ry, rz);
      const signX = (bb.min.x + bb.max.x) < 0 ? 1 : -1;
      for (let i = 0; i < posAttr.count; i++) {
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);
        const u = 0.5 + signX * 0.49 * ((pz - cz) / rMax);
        const v = 0.5 + 0.49 * ((py - cy) / rMax);
        uvAttr.setXY(i, u, v);
      }
      uvAttr.needsUpdate = true;
    } else if (matTag === 'MAT_OLED_SCREEN') {
      // Steering wheel OLED display lies in the X-Y plane facing the driver
      const dx = Math.max(0.01, bb.max.x - bb.min.x);
      const dy = Math.max(0.01, bb.max.y - bb.min.y);
      for (let i = 0; i < posAttr.count; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const u = (px - bb.min.x) / dx;
        const v = (py - bb.min.y) / dy;
        uvAttr.setXY(i, u, v);
      }
      uvAttr.needsUpdate = true;
    }
  }

  _onModelLoaded(gltf) {
    const rawRoot = gltf.scene;
    rawRoot.updateMatrixWorld(true);

    // Collect all meshes and bake their world transforms into geometry so every vertex is in clean GLB root space
    const rawMeshes = [];
    rawRoot.traverse((node) => {
      if (node.isMesh && node.geometry) {
        rawMeshes.push(node);
      }
    });

    const buckets = new Map();
    for (const id of Object.keys(ASSEMBLY_CATALOG)) {
      buckets.set(id, []);
    }

    let totalVerts = 0;
    let totalTris = 0;
    const overallBox = new THREE.Box3();

    for (const srcMesh of rawMeshes) {
      let { assemblyId, subpart, matTag } = this._parseMeshIdentity(srcMesh);
      const spLower = subpart.toLowerCase();

      // Skip blocky low-poly rectangular patch decals & duplicate sidepod mirror stalks
      if (
        spLower.includes('livery_chevron_') ||
        spLower.includes('driver_number_') ||
        spLower.includes('shark_fin_number_panel') ||
        spLower.includes('monocoque_livery_orange_slash') ||
        ((assemblyId === 'sidepod_left' || assemblyId === 'sidepod_right') && spLower.includes('mirror_'))
      ) {
        continue;
      }

      // Keep Halo aero winglets & stripes in sculpted carbon weave so there are no bright patches on the Halo curve
      if (assemblyId === 'halo' && (spLower.includes('winglet') || spLower.includes('livery_stripe'))) {
        matTag = 'MAT_CARBON_TWILL';
      }

      const geom = srcMesh.geometry.clone();
      geom.applyMatrix4(srcMesh.matrixWorld);
      geom.computeVertexNormals();
      this._normalizeSpecialUVs(geom, matTag);
      geom.computeBoundingBox();

      overallBox.union(geom.boundingBox);
      const vCount = geom.attributes.position ? geom.attributes.position.count : 0;
      const tCount = geom.index ? geom.index.count / 3 : vCount / 3;
      totalVerts += vCount;
      totalTris += Math.round(tCount);

      const pbrMat = this._buildPbrMaterial(matTag);
      const mesh = new THREE.Mesh(geom, pbrMat);
      mesh.name = `${assemblyId}__${subpart}__${matTag}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { assemblyId, subpart, matTag };

      this.meshOriginalMaterials.set(mesh, pbrMat);
      this.allMeshes.push(mesh);
      buckets.get(assemblyId).push(mesh);
    }

    // Ground the car so lowest tire contact patch sits cleanly at y = 0.000
    const groundShiftY = -overallBox.min.y;
    for (const mesh of this.allMeshes) {
      mesh.geometry.translate(0, groundShiftY, 0);
      mesh.geometry.computeBoundingBox();
    }

    // Build structured assembly groups with exact geometric pivots
    for (const [assemblyId, meshes] of buckets.entries()) {
      if (meshes.length === 0) continue;

      const asmBox = new THREE.Box3();
      for (const m of meshes) {
        asmBox.union(m.geometry.boundingBox);
      }
      const baseCenter = asmBox.getCenter(new THREE.Vector3());

      // Outer group translates during Explode / Cover Off / Wheel Pull-off
      const group = new THREE.Group();
      group.name = `ASM_${assemblyId}`;

      // Pivot group centered at assembly's true 3D geometric center for steering/rotation
      const pivotGroup = new THREE.Group();
      pivotGroup.position.copy(baseCenter);
      group.add(pivotGroup);

      // Spin group for wheel rotation around X axle
      const spinGroup = new THREE.Group();
      pivotGroup.add(spinGroup);

      const drsFlapMeshes = [];
      const xrayEdges = [];

      for (const m of meshes) {
        // Offset mesh vertices by -baseCenter so local (0,0,0) IS the assembly's exact geometric center!
        m.geometry.translate(-baseCenter.x, -baseCenter.y, -baseCenter.z);
        m.geometry.computeBoundingBox();
        m.geometry.computeBoundingSphere();

        // Check if this is the movable DRS upper flap inside rear_wing_drs
        const spLower = m.userData.subpart.toLowerCase();
        if (
          assemblyId === 'rear_wing_drs' &&
          (spLower.includes('drs') || spLower.includes('flap') || spLower.includes('upper'))
        ) {
          // Create a local hinge pivot for the DRS flap
          const flapBox = m.geometry.boundingBox;
          const flapCenter = flapBox.getCenter(new THREE.Vector3());
          const flapPivot = new THREE.Group();
          flapPivot.position.copy(flapCenter);
          m.geometry.translate(-flapCenter.x, -flapCenter.y, -flapCenter.z);
          flapPivot.add(m);
          spinGroup.add(flapPivot);
          drsFlapMeshes.push(flapPivot);
        } else {
          spinGroup.add(m);
        }

        // Pre-build CAD wireframe edge overlay for X-Ray mode on outer bodywork
        if (XRAY_SHELL_ASSEMBLIES.has(assemblyId)) {
          const edgeGeo = new THREE.EdgesGeometry(m.geometry, 28);
          const edgeLine = new THREE.LineSegments(
            edgeGeo,
            new THREE.LineBasicMaterial({
              color: 0x00f0ff,
              transparent: true,
              opacity: 0.42,
              depthWrite: false,
            })
          );
          edgeLine.visible = false;
          m.add(edgeLine);
          xrayEdges.push(edgeLine);
        }
      }

      // Create CAD explode datum line connecting original baseCenter to exploded position
      const datumGeo = new THREE.BufferGeometry().setFromPoints([
        baseCenter.clone(),
        baseCenter.clone(),
      ]);
      const datumLine = new THREE.Line(
        datumGeo,
        new THREE.LineBasicMaterial({
          color: 0xccff00,
          transparent: true,
          opacity: 0.55,
        })
      );
      datumLine.visible = false;
      this.datumLinesGroup.add(datumLine);

      this.carRoot.add(group);
      this.assemblyGroups.set(assemblyId, {
        id: assemblyId,
        group,
        pivotGroup,
        spinGroup,
        drsFlapMeshes,
        baseCenter,
        meshes,
        xrayEdges,
        datumLine,
      });
    }

    // Calibrate longitudinal zSign from front_wing vs rear_wing_drs centers
    const fw = this.assemblyGroups.get('front_wing');
    const rw = this.assemblyGroups.get('rear_wing_drs');
    if (fw && rw) {
      this.zSign = fw.baseCenter.z >= rw.baseCenter.z ? -1 : 1;
    }

    // Couple front brake steering pivot centers to front wheel kingpin centers so wheel + brake turn as one rigid unit
    for (const [brakeId, wheelId] of [['brakes_fl', 'wheel_fl'], ['brakes_fr', 'wheel_fr']]) {
      const brk = this.assemblyGroups.get(brakeId);
      const whl = this.assemblyGroups.get(wheelId);
      if (brk && whl) {
        const delta = new THREE.Vector3().subVectors(brk.baseCenter, whl.baseCenter);
        brk.pivotGroup.position.copy(whl.baseCenter);
        brk.spinGroup.position.copy(delta);
      }
    }

    // Position upstream wind tunnel fan in front of the nosecone
    if (this.windTunnelTurbineGroup) {
      this.windTunnelTurbineGroup.position.copy(this.b2t(0, -6.8, 1.55));
    }

    // Rebuild CFD streamlines with calibrated zSign
    this._rebuildCfdStreamlines();

    // Update cockpit and engine bay light targets using calibrated coordinates
    this.cockpitLight.position.copy(this.b2t(0.0, -0.15, 2.2));
    this.cockpitLight.target.position.copy(this.b2t(0.0, -0.75, 0.32));
    this.engineBayLight.position.copy(this.b2t(0.85, 0.72, 2.2));
    this.engineBayLight.target.position.copy(this.b2t(0.0, 0.72, 0.45));
    this.wheelLight.position.copy(this.b2t(-1.85, -1.95, 0.55));

    // Apply initial hero camera & livery
    this.setLivery(this.liveryId);
    this.setCameraPreset('hero', true);

    this.stats = {
      ready: true,
      assemblyCount: this.assemblyGroups.size,
      meshCount: this.allMeshes.length,
      vertexCount: totalVerts,
      triangleCount: totalTris,
      assembliesLoaded: Array.from(this.assemblyGroups.keys()),
      boundingBox: {
        min: [
          Number(overallBox.min.x.toFixed(3)),
          0.0,
          Number(overallBox.min.z.toFixed(3)),
        ],
        max: [
          Number(overallBox.max.x.toFixed(3)),
          Number((overallBox.max.y + groundShiftY).toFixed(3)),
          Number(overallBox.max.z.toFixed(3)),
        ],
      },
    };
    this.ready = true;
    if (this.callbacks.onReady) {
      this.callbacks.onReady(this.stats);
    }
  }

  _initInteraction() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    this.canvas.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 6) return; // Dragged orbit controls, not a click

      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const visibleMeshes = this.allMeshes.filter((m) => m.visible && m.parent?.visible);
      const hits = this.raycaster.intersectObjects(visibleMeshes, false);

      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const asmId = hitMesh.userData?.assemblyId;
        if (asmId) {
          this.selectAssembly(asmId);
        }
      }
    });

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  // =========================================================================
  // DETERMINISTIC CONTROL API (Exposed to UI & window.__HF26)
  // =========================================================================

  setEnvironment(envName) {
    const clean = String(envName || 'atelier').toLowerCase();
    let target = 'atelier';
    if (clean.includes('wind') || clean.includes('cfd')) target = 'windtunnel';
    else if (clean.includes('pit') || clean.includes('dyno') || clean.includes('night')) target = 'pitlane';

    this.environmentName = target;
    this.envGroups.atelier.visible = target === 'atelier';
    this.envGroups.windtunnel.visible = target === 'windtunnel';
    this.envGroups.pitlane.visible = target === 'pitlane';

    if (this.cfdStreamlinesGroup) {
      this.cfdStreamlinesGroup.visible = this.mode === 'cfd' || target === 'windtunnel';
    }

    if (target === 'atelier') {
      this.scene.background.setHex(0x06080c);
      this.scene.fog.color.setHex(0x06080c);
      this.keyLight.intensity = 1.35;
    } else if (target === 'windtunnel') {
      this.scene.background.setHex(0x040810);
      this.scene.fog.color.setHex(0x040810);
      this.keyLight.intensity = 1.15;
    } else {
      this.scene.background.setHex(0x05060a);
      this.scene.fog.color.setHex(0x05060a);
      this.keyLight.intensity = 1.10;
    }

    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setMode(modeName) {
    const clean = String(modeName || 'studio').toLowerCase();
    this.mode = clean;

    if (clean === 'cfd') {
      this.setEnvironment('windtunnel');
      if (this.targetRpm < 11500) this.setRPM(12800);
    } else if (clean === 'dyno') {
      this.setEnvironment('pitlane');
      if (this.targetRpm < 13500) this.setRPM(14800);
    } else {
      if (this.environmentName !== 'atelier') {
        this.setEnvironment('atelier');
      }
      if (this.targetRpm > 4500) {
        this.setRPM(3800);
      }
    }

    if (this.cfdStreamlinesGroup) {
      this.cfdStreamlinesGroup.visible = clean === 'cfd' || this.environmentName === 'windtunnel';
    }

    this._applyRenderModeMaterials();
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  _getXrayMaterial(mesh, isOuterShell) {
    if (!this.meshXrayMaterials.has(mesh)) {
      if (isOuterShell) {
        this.meshXrayMaterials.set(
          mesh,
          new THREE.MeshPhysicalMaterial({
            color: 0x071526,
            emissive: 0x00a8ff,
            emissiveIntensity: 0.22,
            metalness: 0.1,
            roughness: 0.12,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
      } else {
        const orig = this.meshOriginalMaterials.get(mesh);
        const m = orig.clone();
        m.emissive = new THREE.Color(0x004466);
        m.emissiveIntensity = Math.max(orig.emissiveIntensity || 0, 0.28);
        this.meshXrayMaterials.set(mesh, m);
      }
    }
    return this.meshXrayMaterials.get(mesh);
  }

  _tempToFlirColor(tempC) {
    const t = Math.max(0, Math.min(1, (tempC - 35) / (940 - 35)));
    const c = new THREE.Color();
    if (t < 0.22) {
      c.lerpColors(new THREE.Color(0x120a48), new THREE.Color(0x0088ff), t / 0.22);
    } else if (t < 0.45) {
      c.lerpColors(new THREE.Color(0x0088ff), new THREE.Color(0x00ff66), (t - 0.22) / 0.23);
    } else if (t < 0.72) {
      c.lerpColors(new THREE.Color(0x00ff66), new THREE.Color(0xff9900), (t - 0.45) / 0.27);
    } else {
      c.lerpColors(new THREE.Color(0xff9900), new THREE.Color(0xfff4cc), (t - 0.72) / 0.28);
    }
    return c;
  }

  _applyRenderModeMaterials() {
    for (const [asmId, entry] of this.assemblyGroups.entries()) {
      const isShell = XRAY_SHELL_ASSEMBLIES.has(asmId);
      const spec = ASSEMBLY_CATALOG[asmId];

      for (const edge of entry.xrayEdges) {
        edge.visible = this.mode === 'xray';
      }

      for (const mesh of entry.meshes) {
        if (this.mode === 'xray') {
          mesh.material = this._getXrayMaterial(mesh, isShell);
        } else if (this.mode === 'thermal') {
          if (!this.meshThermalMaterials.has(mesh)) {
            const col = this._tempToFlirColor(spec.operating_temp_c);
            this.meshThermalMaterials.set(
              mesh,
              new THREE.MeshStandardMaterial({
                color: col,
                emissive: col,
                emissiveIntensity: 0.48,
                roughness: 0.35,
                metalness: 0.15,
              })
            );
          }
          mesh.material = this.meshThermalMaterials.get(mesh);
        } else {
          mesh.material = this.meshOriginalMaterials.get(mesh);
        }
      }
    }
    this._updateSelectionHighlight();
  }

  setExplode(value, immediate = false) {
    let v = Number(value) || 0;
    if (v > 1.0) v = v / 100.0;
    this.targetExplodeAmount = Math.max(0, Math.min(1, v));
    if (immediate) this.explodeAmount = this.targetExplodeAmount;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setCoverOff(flag, immediate = false) {
    this.coverOff = Boolean(flag);
    if (immediate) this.coverOffFactor = this.coverOff ? 1.0 : 0.0;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setDRS(flag, immediate = false) {
    const next = Boolean(flag);
    if (next !== this.drsOpen) {
      this.drsOpen = next;
      if (this.cfdStreamlinesGroup) {
        this._rebuildCfdStreamlines();
      }
    }
    if (immediate) this.drsFactor = this.drsOpen ? 1.0 : 0.0;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setSteering(deg, immediate = false) {
    this.targetSteeringDeg = Math.max(-22, Math.min(22, Number(deg) || 0));
    if (immediate) this.steeringDeg = this.targetSteeringDeg;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setRPM(rpmVal) {
    this.targetRpm = Math.max(3500, Math.min(15000, Number(rpmVal) || 3800));
    this.rpm = this.targetRpm; // Immediate sync for deterministic telemetry & shader glow
    this._updateThermalMaterialsGlow();
    this._drawOledTelemetry(this.elapsed);
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setLivery(liveryId) {
    const preset = LIVERY_PRESETS[liveryId] || LIVERY_PRESETS.factory;
    this.liveryId = preset.id;
    for (const [matTag, props] of Object.entries(preset.materials)) {
      const mat = this._buildPbrMaterial(matTag);
      if (props.color !== undefined) mat.color.setHex(props.color);
      if (props.metalness !== undefined) mat.metalness = props.metalness;
      if (props.roughness !== undefined) mat.roughness = props.roughness;
      if (props.clearcoat !== undefined) mat.clearcoat = props.clearcoat;
      if (props.clearcoatRoughness !== undefined) mat.clearcoatRoughness = props.clearcoatRoughness;
      mat.needsUpdate = true;
    }
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setTireCompound(compound) {
    const clean = String(compound || 'soft').toLowerCase();
    this.tireCompound = clean.includes('med') ? 'medium' : clean.includes('hard') ? 'hard' : 'soft';
    const mat = this._buildPbrMaterial('MAT_TIRE_SIDEWALL');
    if (this.tireCompound === 'medium') mat.map = this.textures.tire_medium;
    else if (this.tireCompound === 'hard') mat.map = this.textures.tire_hard;
    else mat.map = this.textures.tire_soft;
    mat.needsUpdate = true;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setCategoryFilter(category) {
    this.activeCategory = String(category || 'all').toLowerCase();
    this._updateVisibilityAndIsolation();
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  selectAssembly(assemblyId) {
    if (!assemblyId || !ASSEMBLY_CATALOG[assemblyId]) {
      this.selectedAssemblyId = null;
      this.isolated = false;
    } else {
      this.selectedAssemblyId = assemblyId;
    }
    this._updateVisibilityAndIsolation();
    this._updateSelectionHighlight();
    if (this.callbacks.onSelectAssembly) {
      this.callbacks.onSelectAssembly(
        this.selectedAssemblyId ? ASSEMBLY_CATALOG[this.selectedAssemblyId] : null
      );
    }
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  isolateSelected(flag) {
    this.isolated = typeof flag === 'boolean' ? flag : !this.isolated;
    if (!this.selectedAssemblyId) this.isolated = false;
    this._updateVisibilityAndIsolation();
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  _updateVisibilityAndIsolation() {
    for (const [asmId, entry] of this.assemblyGroups.entries()) {
      const spec = ASSEMBLY_CATALOG[asmId];
      const matchesCat = this.activeCategory === 'all' || spec.category === this.activeCategory;
      const matchesIso = !this.isolated || asmId === this.selectedAssemblyId;
      entry.group.visible = matchesCat && matchesIso;
    }
  }

  _updateSelectionHighlight() {
    for (const [asmId, entry] of this.assemblyGroups.entries()) {
      const isSelected = asmId === this.selectedAssemblyId;
      for (const mesh of entry.meshes) {
        if (this.mode === 'studio' || this.mode === 'cfd' || this.mode === 'dyno') {
          const baseMat = this.meshOriginalMaterials.get(mesh);
          if (isSelected) {
            if (!mesh.userData.highlightMat) {
              const hm = baseMat.clone();
              hm.emissive = new THREE.Color(0x385800);
              hm.emissiveIntensity = Math.max(baseMat.emissiveIntensity || 0, 0.35);
              mesh.userData.highlightMat = hm;
            }
            mesh.material = mesh.userData.highlightMat;
          } else {
            mesh.material = baseMat;
          }
        }
      }
    }
  }

  setCameraPreset(presetName, immediate = false) {
    const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.hero;
    const endPos = this.b2t(preset.pos[0], preset.pos[1], preset.pos[2]);
    const endTarget = this.b2t(preset.target[0], preset.target[1], preset.target[2]);

    if (immediate) {
      this.camera.position.copy(endPos);
      this.controls.target.copy(endTarget);
      this.camera.fov = preset.fov || 36;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.camLerp.active = false;
    } else {
      this.camLerp.active = true;
      this.camLerp.t = 0.0;
      this.camLerp.duration = 0.32;
      this.camLerp.startPos.copy(this.camera.position);
      this.camLerp.endPos.copy(endPos);
      this.camLerp.startTarget.copy(this.controls.target);
      this.camLerp.endTarget.copy(endTarget);
      this.camLerp.startFov = this.camera.fov;
      this.camLerp.endFov = preset.fov || 36;
    }

    this.currentCameraPreset = preset.id;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange();
  }

  setOrbitCamera(azRad, elRad, dist, targetArr = [0, 0.38, 0], presetTag = null) {
    this.camLerp.active = false;
    if (presetTag) {
      this.currentCameraPreset = presetTag;
    }
    const tx = targetArr[0] || 0;
    const ty = targetArr[1] || 0.38;
    const tz = targetArr[2] || 0;
    this.controls.target.set(tx, ty, tz);
    const cosEl = Math.cos(elRad);
    this.camera.position.set(
      tx + Math.sin(azRad) * cosEl * dist,
      ty + Math.sin(elRad) * dist,
      tz + Math.cos(azRad) * cosEl * dist
    );
    this.controls.update();
  }

  setOrbitBlender(azRad, elRad, dist, blenderTarget = [0, 0.0, 0.40], fov = 36, presetTag = null) {
    this.camLerp.active = false;
    if (presetTag) {
      this.currentCameraPreset = presetTag;
    }
    const tgt = this.b2t(blenderTarget[0], blenderTarget[1], blenderTarget[2]);
    this.controls.target.copy(tgt);
    const cosEl = Math.cos(elRad);
    // In Three.js after b2t: +Z is front (by < 0), -Z is rear (by > 0), +X is right, +Y is up
    this.camera.position.set(
      tgt.x + Math.sin(azRad) * cosEl * dist,
      tgt.y + Math.sin(elRad) * dist,
      tgt.z + Math.cos(azRad) * cosEl * dist
    );
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }

  stepFrame(dt = 0.0333) {
    this.update(dt);
  }

  _updateThermalMaterialsGlow() {
    const rpmNorm = Math.max(0, Math.min(1, (this.rpm - 3800) / (15000 - 3800)));
    const dynoBoost = this.mode === 'dyno' ? 1.0 : rpmNorm;

    const brakeMat = this.pbrMaterials.get('MAT_BRAKE_DISC');
    if (brakeMat) {
      // Glowing cherry-orange drilled carbon rotor under load or when brake is inspected
      const inspectBoost =
        this.selectedAssemblyId && this.selectedAssemblyId.startsWith('brakes_') ? 0.85 : 0.0;
      const heat = Math.max(dynoBoost, inspectBoost);
      brakeMat.emissive.setHex(0xff3b00);
      brakeMat.emissiveIntensity = 0.18 + heat * 3.1;
    }

    const inconelMat = this.pbrMaterials.get('MAT_INCONEL_EXHAUST');
    if (inconelMat) {
      const inspectBoost = this.selectedAssemblyId === 'exhaust_inconel' ? 0.65 : 0.0;
      const heat = Math.max(dynoBoost, inspectBoost);
      inconelMat.emissive.setHex(0xff3300);
      inconelMat.emissiveIntensity = 0.15 + heat * 2.65;
    }
  }

  // =========================================================================
  // MAIN FRAME UPDATE & RENDER LOOP
  // =========================================================================

  update(forcedDt = null) {
    const dt = forcedDt !== null ? forcedDt : Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    // 1. Camera preset smooth interpolation
    if (this.camLerp.active) {
      this.camLerp.t += dt / this.camLerp.duration;
      const k = Math.min(1.0, this.camLerp.t);
      const ease = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.camLerp.startPos, this.camLerp.endPos, ease);
      this.controls.target.lerpVectors(this.camLerp.startTarget, this.camLerp.endTarget, ease);
      this.camera.fov = this.camLerp.startFov + (this.camLerp.endFov - this.camLerp.startFov) * ease;
      this.camera.updateProjectionMatrix();
      if (k >= 1.0) this.camLerp.active = false;
    }
    this.controls.update();

    // 2. Smooth state interpolators (fast response for deterministic QA + silky interactive feel)
    const rate = Math.min(1.0, dt * 14.0);
    this.explodeAmount += (this.targetExplodeAmount - this.explodeAmount) * rate;
    this.coverOffFactor += ((this.coverOff ? 1.0 : 0.0) - this.coverOffFactor) * rate;
    this.drsFactor += ((this.drsOpen ? 1.0 : 0.0) - this.drsFactor) * rate;
    this.steeringDeg += (this.targetSteeringDeg - this.steeringDeg) * rate;
    this.rpm += (this.targetRpm - this.rpm) * rate;

    // 3. Update assembly positions (Explode + Cover Off + Brake Inspection Wheel Pull-Off)
    const pullOffInfo = BRAKE_TO_WHEEL_PULLOFF[this.selectedAssemblyId];

    for (const [asmId, entry] of this.assemblyGroups.entries()) {
      const spec = ASSEMBLY_CATALOG[asmId];
      const [ex, ey, ez] = spec.explode_vec;
      const explodeVec3 = this.b2t(ex, ey, ez).multiplyScalar(this.explodeAmount);

      // Add removable cover lift when coverOff is active
      if (COVER_OFF_OFFSETS_BLENDER[asmId] && this.coverOffFactor > 0.001) {
        const [cx, cy, cz] = COVER_OFF_OFFSETS_BLENDER[asmId];
        explodeVec3.add(this.b2t(cx, cy, cz).multiplyScalar(this.coverOffFactor));
      }

      // Automatic pit-gun wheel pull-off when inspecting a brake assembly so the rotor & caliper are 100% visible!
      if (pullOffInfo && pullOffInfo.wheelId === asmId) {
        explodeVec3.add(this.b2t(pullOffInfo.bx, 0, 0));
      }

      entry.group.position.copy(explodeVec3);

      // Update CAD datum line ONLY when Explode slider is active (> 2%)
      if (entry.datumLine) {
        const distSq = explodeVec3.lengthSq();
        entry.datumLine.visible = this.explodeAmount > 0.02 && distSq > 0.002 && entry.group.visible;
        if (entry.datumLine.visible) {
          const posAttr = entry.datumLine.geometry.attributes.position;
          posAttr.setXYZ(0, entry.baseCenter.x, entry.baseCenter.y, entry.baseCenter.z);
          posAttr.setXYZ(
            1,
            entry.baseCenter.x + explodeVec3.x,
            entry.baseCenter.y + explodeVec3.y,
            entry.baseCenter.z + explodeVec3.z
          );
          posAttr.needsUpdate = true;
        }
      }
    }

    // 4. Kinematic animations: Steering, Wheel Spin, and DRS Rear Flap
    const steerRad = THREE.MathUtils.degToRad(this.steeringDeg);
    const swEntry = this.assemblyGroups.get('steering_wheel');
    if (swEntry) {
      swEntry.pivotGroup.rotation.z = -steerRad * 4.5;
    }
    for (const frontId of ['wheel_fl', 'wheel_fr', 'brakes_fl', 'brakes_fr']) {
      const entry = this.assemblyGroups.get(frontId);
      if (entry) {
        entry.pivotGroup.rotation.y = -steerRad;
      }
    }

    // Spin wheels when in CFD Wind Tunnel, Night Pit Dyno, or high RPM
    const shouldSpinWheels =
      this.mode === 'cfd' ||
      this.mode === 'dyno' ||
      this.environmentName === 'windtunnel' ||
      this.environmentName === 'pitlane' ||
      this.rpm > 6000;
    if (shouldSpinWheels && this.explodeAmount < 0.05 && !pullOffInfo) {
      const angularVel = ((this.rpm - 3500) / 11500) * 32.0 + 4.0;
      for (const wId of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
        const wEntry = this.assemblyGroups.get(wId);
        if (wEntry) {
          wEntry.spinGroup.rotation.x += this.zSign * angularVel * dt;
        }
      }
    } else {
      for (const wId of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
        const wEntry = this.assemblyGroups.get(wId);
        if (wEntry) {
          wEntry.spinGroup.rotation.x = 0;
        }
      }
    }

    // Rotate DRS Rear Wing Flap (-26 degrees when open)
    const rwEntry = this.assemblyGroups.get('rear_wing_drs');
    if (rwEntry && rwEntry.drsFlapMeshes.length > 0) {
      const drsAngle = this.zSign * THREE.MathUtils.degToRad(26.0) * this.drsFactor;
      for (const flapPivot of rwEntry.drsFlapMeshes) {
        flapPivot.rotation.x = drsAngle;
      }
    }

    // 5. Environment animations (Wind Tunnel Turbine, CFD Flow Pulses, Rolling Road, Sparks)
    if (this.turbineBlades && this.envGroups.windtunnel.visible) {
      this.turbineBlades.rotation.z += dt * 4.8;
    }
    if (this.cfdPulseTex && this.cfdStreamlinesGroup?.visible) {
      this.cfdPulseTex.offset.x -= dt * 2.4;
    }
    if (this.rollingRoadTex && this.envGroups.windtunnel.visible) {
      this.rollingRoadTex.offset.y += this.zSign * dt * 3.2;
    }

    this._updateThermalMaterialsGlow();
    this._updateSparks(dt);
    this._drawOledTelemetry(this.elapsed);

    // 6. Render via EffectComposer (ACES Filmic + UnrealBloom)
    this.composer.render();
  }

  getHotspotScreenPositions(hotspotDefs) {
    if (!this.ready || !hotspotDefs) return [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const out = [];
    const tmp = new THREE.Vector3();
    const camDist = this.camera.position.distanceTo(this.controls.target);

    for (const def of hotspotDefs) {
      const entry = this.assemblyGroups.get(def.assemblyId);
      if (def.anchorB2T && entry) {
        tmp.copy(this.b2t(def.anchorB2T[0], def.anchorB2T[1], def.anchorB2T[2])).add(entry.group.position);
      } else if (entry) {
        tmp.copy(entry.baseCenter).add(entry.group.position);
        if (def.offset) {
          tmp.add(this.b2t(def.offset[0], def.offset[1], def.offset[2]));
        }
      } else if (def.pos) {
        tmp.copy(this.b2t(def.pos[0], def.pos[1], def.pos[2]));
      } else {
        continue;
      }

      const distToTarget = tmp.distanceTo(this.controls.target);
      const allowedByZoom = camDist >= 2.85 || distToTarget < 1.38 || this.selectedAssemblyId === def.assemblyId;

      tmp.project(this.camera);
      const inFront = tmp.z > -1.0 && tmp.z < 1.0;
      const sx = (tmp.x * 0.5 + 0.5) * w;
      const sy = (-tmp.y * 0.5 + 0.5) * h;
      const onScreen = inFront && sx > 70 && sx < w - 70 && sy > 75 && sy < h - 90;

      // Filter pins on close-up macro presets so background pins don't float over foreground parts
      let allowedOnPreset = true;
      if (this.currentCameraPreset === 'wheel_macro') {
        allowedOnPreset = def.assemblyId === 'brakes_fl' || def.assemblyId === 'front_wing';
      } else if (this.currentCameraPreset === 'cockpit') {
        allowedOnPreset = def.assemblyId === 'steering_wheel' || def.assemblyId === 'front_wing';
      } else if (this.currentCameraPreset === 'engine') {
        allowedOnPreset =
          def.assemblyId === 'radiators_cooling' ||
          def.assemblyId === 'power_unit_v6' ||
          def.assemblyId === 'exhaust_inconel';
      }

      out.push({
        ...def,
        x: sx,
        y: sy,
        visible:
          onScreen &&
          allowedByZoom &&
          allowedOnPreset &&
          (this.explodeAmount < 0.35 || !this.selectedAssemblyId || this.selectedAssemblyId === def.assemblyId) &&
          (!this.isolated || this.selectedAssemblyId === def.assemblyId),
      });
    }
    return out;
  }

  getStats() {
    return {
      ...this.stats,
      mode: this.mode,
      environment: this.environmentName,
      livery: this.liveryId,
      tireCompound: this.tireCompound,
      explode: Number(this.explodeAmount.toFixed(2)),
      coverOff: this.coverOff,
      drsOpen: this.drsOpen,
      rpm: Math.round(this.rpm),
      selectedAssembly: this.selectedAssemblyId,
    };
  }
}
