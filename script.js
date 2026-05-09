let scene;
let camera;
let renderer;
let sceneContainer;
let roofGroup;
let panelGroup;
let robot;
let ledMesh;
let leftBrush;
let rightBrush;
let leftNozzle;
let rightNozzle;
let leftNozzleGlow;
let rightNozzleGlow;
let sprayDrops = [];
const sprayForwardDir = new THREE.Vector3(0, 0, -1);
let sprayTurnDampTime = 0;
let dirtLayers = [];
let panelData = [];
let zigzagPath = [];
let currentSegment = 0;
let segmentProgress = 0;
let simRunning = true;
let missionCompleted = false;

const clock = new THREE.Clock();
let orbitState;

const config = {
  panelRows: 2,
  panelCols: 5,
  panelW: 1.35,
  panelH: 0.9,
  gapX: 0.2,
  gapZ: 0.24,
  roofTiltDeg: 30,
  robotClearance: 0.085,
  baseSpeed: 0.55,
  speedMultiplier: 1.0,
  brushBaseRPM: 320,
  dirtPercent: 50,
  cleanRadius: 0.62,
  cleanRate: 42,
  minSpeedFactor: 0.45,
  sprayMaxDrops: 140
};

const ui = {
  dirtRange: document.getElementById("dirtRange"),
  dirtValue: document.getElementById("dirtValue"),
  speedRange: document.getElementById("speedRange"),
  speedValue: document.getElementById("speedValue"),
  speedMetric: document.getElementById("speedMetric"),
  rpmMetric: document.getElementById("rpmMetric"),
  analysisMetric: document.getElementById("analysisMetric"),
  toggleBtn: document.getElementById("toggleBtn"),
  resetBtn: document.getElementById("resetBtn")
};

init();
animate();

function init() {
  sceneContainer = document.getElementById("scene-container");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x86a6ca);
  scene.fog = new THREE.Fog(0x89a8c9, 12, 62);

  const initialWidth = Math.max(sceneContainer.clientWidth, 300);
  const initialHeight = Math.max(sceneContainer.clientHeight, 300);
  camera = new THREE.PerspectiveCamera(55, initialWidth / initialHeight, 0.1, 200);
  camera.position.set(0, 5.4, 9.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(initialWidth, initialHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  sceneContainer.appendChild(renderer.domElement);

  initMouseOrbit(renderer.domElement);
  ui.analysisMetric.textContent = "Orbit kontrol aktif, panel taramasi baslatildi.";

  setupLighting();
  createSkyAndFactory();
  createRoofAndPanels();
  createRobot();
  buildZigZagPath();
  bindUI();
  setDirtLevel(config.dirtPercent, true);
  initBackgroundParallax();

  window.addEventListener("resize", onWindowResize);
}

function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x2f3c52, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.12);
  sun.position.set(8, 12, 5);
  scene.add(sun);
}

function createSkyAndFactory() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 24),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: makeSkyTexture() })
  );
  scene.add(sky);

  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x253246, roughness: 1, metalness: 0 });
  for (let i = 0; i < 12; i++) {
    const w = 1 + Math.random() * 1.6;
    const h = 0.8 + Math.random() * 2.4;
    const d = 0.8 + Math.random() * 1.3;
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    block.position.set(-12 + i * 2.2, -0.4 + h * 0.5, -15 - Math.random() * 2);
    group.add(block);
    if (Math.random() > 0.58) {
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.3, 16), mat);
      chimney.position.set(block.position.x + (Math.random() - 0.5) * 0.6, block.position.y + h * 0.5 + 1, block.position.z);
      group.add(chimney);
    }
  }
  scene.add(group);

  // Hafif sis katmani ile atmosferik derinlik
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(70, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xa5bfdc,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    })
  );
  scene.add(haze);

  // Alt kisimdaki boslugu dolduran endustriyel zemin
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({
      map: makeGroundTexture(),
      color: 0x7a8089,
      roughness: 0.96,
      metalness: 0.03
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.15;
  scene.add(ground);

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 42),
    new THREE.MeshStandardMaterial({ color: 0x4d5663, roughness: 0.94, metalness: 0.04 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, -1.135, 8);
  scene.add(asphalt);

  // Yol cizgileri
  for (let i = 0; i < 11; i++) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xc7c9bb })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, -1.128, -12 + i * 3.6);
    scene.add(line);
  }

  // Cati altinda ana fabrika yapisi
  const factoryBody = new THREE.Mesh(
    new THREE.BoxGeometry(14, 3.2, 8.5),
    new THREE.MeshStandardMaterial({ color: 0x4f5f72, roughness: 0.82, metalness: 0.25 })
  );
  factoryBody.position.set(0, -2.2, 0.35);
  scene.add(factoryBody);

  // Fabrika pencere ve cephe detaylari
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x9ec7e3,
    emissive: 0x1c3248,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.1
  });
  for (let i = 0; i < 12; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.45), winMat);
    win.position.set(-5 + i * 0.9, -1.45 + (i % 2 === 0 ? 0.24 : -0.04), 4.64);
    scene.add(win);
  }

  // Cevre servis platformlari
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x6a7686, roughness: 0.8, metalness: 0.35 });
  const platformLeft = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 7.8), platformMat);
  platformLeft.position.set(-8.8, -1.35, 0.2);
  scene.add(platformLeft);
  const platformRight = platformLeft.clone();
  platformRight.position.x = 8.8;
  scene.add(platformRight);

  // Boru hatlari ve tanklar
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x8796a8, roughness: 0.45, metalness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 10.5, 16), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, -1.45 - i * 0.18, -2.6 + i * 0.16);
    scene.add(pipe);
  }

  for (let i = 0; i < 4; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.82, 2.8, 24),
      new THREE.MeshStandardMaterial({ color: 0x5c6a7d, roughness: 0.7, metalness: 0.4 })
    );
    tank.position.set(-11 + i * 7.3, -1.6, 5.2);
    scene.add(tank);
  }

  // Cevre tel cit ve direkler
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x7f8d9b, roughness: 0.72, metalness: 0.62 });
  for (let i = 0; i < 18; i++) {
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), fenceMat);
    postL.position.set(-16.5 + i * 1.95, -0.75, 10.4);
    scene.add(postL);
    if (i < 17) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.04, 0.04), fenceMat);
      rail.position.set(-15.53 + i * 1.95, -0.55, 10.4);
      scene.add(rail);
    }
  }

  // Bacalardan cikan hafif duman (sprite benzeri plane bulutlar)
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0xb9c3cf,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const smokeSources = [
    new THREE.Vector3(-8, 1.2, -1.8),
    new THREE.Vector3(0, 1.3, -2.1),
    new THREE.Vector3(8, 1.25, -1.7)
  ];
  for (let s = 0; s < smokeSources.length; s++) {
    for (let i = 0; i < 10; i++) {
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + Math.random() * 0.7, 0.55 + Math.random() * 0.5), smokeMat.clone());
      puff.position.copy(smokeSources[s]);
      puff.position.x += (Math.random() - 0.5) * 0.35;
      puff.position.y += i * 0.22;
      puff.position.z += (Math.random() - 0.5) * 0.35;
      puff.rotation.y = Math.random() * Math.PI;
      scene.add(puff);
    }
  }

  // Arka kisimda ek bina siluetleri (derinlik dolulugu)
  const bgMat = new THREE.MeshStandardMaterial({ color: 0x2c394b, roughness: 1, metalness: 0 });
  for (let i = 0; i < 14; i++) {
    const w = 1.2 + Math.random() * 2.2;
    const h = 1.6 + Math.random() * 3.1;
    const d = 1 + Math.random() * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bgMat);
    b.position.set(-18 + i * 2.8, -0.35 + h * 0.5, 14 + Math.random() * 3);
    scene.add(b);
  }
}

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#6d747d";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = 0.04 + Math.random() * 0.12;
    const g = 90 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${g},${g},${g},${a})`;
    ctx.fillRect(x, y, 2 + Math.random() * 2, 2 + Math.random() * 2);
  }

  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(50,50,50,${0.06 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRoofAndPanels() {
  roofGroup = new THREE.Group();
  roofGroup.position.set(0, 1, 0);
  roofGroup.rotation.x = -THREE.MathUtils.degToRad(config.roofTiltDeg);
  scene.add(roofGroup);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 0.28, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x717a86, roughness: 0.75, metalness: 0.25 })
  );
  roof.position.y = -0.18;
  roofGroup.add(roof);

  panelGroup = new THREE.Group();
  roofGroup.add(panelGroup);

  const panelMat = new THREE.MeshStandardMaterial({
    map: makeMonocrystalTexture(),
    metalness: 0.74,
    roughness: 0.24,
    color: 0x9fb2d7
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xa7b2bf, metalness: 0.84, roughness: 0.25 });

  const totalW = config.panelCols * config.panelW + (config.panelCols - 1) * config.gapX;
  const totalZ = config.panelRows * config.panelH + (config.panelRows - 1) * config.gapZ;
  const startX = -totalW * 0.5 + config.panelW * 0.5;
  const startZ = -totalZ * 0.5 + config.panelH * 0.5;

  for (let r = 0; r < config.panelRows; r++) {
    for (let c = 0; c < config.panelCols; c++) {
      const x = startX + c * (config.panelW + config.gapX);
      const z = startZ + r * (config.panelH + config.gapZ);

      const panel = new THREE.Mesh(new THREE.BoxGeometry(config.panelW, 0.045, config.panelH), panelMat);
      panel.position.set(x, 0.03, z);
      panelGroup.add(panel);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(config.panelW + 0.06, 0.022, config.panelH + 0.06), frameMat);
      frame.position.set(x, 0.006, z);
      panelGroup.add(frame);

      const dirt = new THREE.Mesh(
        new THREE.PlaneGeometry(config.panelW * 0.97, config.panelH * 0.95),
        new THREE.MeshStandardMaterial({
          color: 0x6f655d,
          transparent: true,
          opacity: 0.5,
          roughness: 1,
          metalness: 0
        })
      );
      dirt.rotation.x = -Math.PI / 2;
      dirt.position.set(x, 0.055, z);
      panelGroup.add(dirt);

      dirtLayers.push(dirt);
      panelData.push({
        center: new THREE.Vector3(x, config.robotClearance, z),
        size: new THREE.Vector2(config.panelW, config.panelH),
        dirtBias: (Math.random() * 2 - 1) * 26,
        dirtPercent: config.dirtPercent,
        dirtMesh: dirt
      });

      const dustCount = 180;
      const dustGeo = new THREE.BufferGeometry();
      const dustPos = new Float32Array(dustCount * 3);
      const halfW = (config.panelW * 0.95) * 0.5;
      const halfH = (config.panelH * 0.9) * 0.5;
      for (let i = 0; i < dustCount; i++) {
        const i3 = i * 3;
        dustPos[i3] = x + (Math.random() * 2 - 1) * halfW;
        dustPos[i3 + 1] = 0.058 + Math.random() * 0.004;
        dustPos[i3 + 2] = z + (Math.random() * 2 - 1) * halfH;
      }
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
      const dustMat = new THREE.PointsMaterial({
        color: 0xf0cf58,
        size: 0.022,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      const dustPoints = new THREE.Points(dustGeo, dustMat);
      panelGroup.add(dustPoints);
      panelData[panelData.length - 1].dustPoints = dustPoints;
      panelData[panelData.length - 1].dustMat = dustMat;
    }
  }
}

function createRobot() {
  robot = new THREE.Group();

  const metalMain = new THREE.MeshStandardMaterial({ color: 0xc4cbd4, metalness: 0.9, roughness: 0.18 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x7f8a99, metalness: 0.88, roughness: 0.28 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.2, roughness: 0.76 });

  const baseBody = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.2, 0.58), metalMain);
  baseBody.position.y = 0.16;
  robot.add(baseBody);

  const topBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.38), metalMain);
  topBody.position.y = 0.3;
  robot.add(topBody);

  const sideRailL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.56), metalDark);
  sideRailL.position.set(-0.39, 0.15, 0);
  robot.add(sideRailL);

  const sideRailR = sideRailL.clone();
  sideRailR.position.x = 0.39;
  robot.add(sideRailR);

  const frontGuard = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), metalDark);
  frontGuard.position.set(0, 0.09, -0.31);
  robot.add(frontGuard);

  const rearGuard = frontGuard.clone();
  rearGuard.position.z = 0.31;
  robot.add(rearGuard);

  const brushHousing = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.12), metalDark);
  brushHousing.position.set(0, 0.11, -0.26);
  robot.add(brushHousing);

  const cameraPod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 18), metalDark);
  cameraPod.rotation.x = Math.PI / 2;
  cameraPod.position.set(0, 0.34, -0.08);
  robot.add(cameraPod);

  const cameraLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.4 })
  );
  cameraLens.rotation.x = Math.PI / 2;
  cameraLens.position.set(0, 0.34, -0.11);
  robot.add(cameraLens);

  const lidarStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 10), metalDark);
  lidarStem.position.set(0, 0.37, 0);
  robot.add(lidarStem);
  const lidarHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.035, 20),
    new THREE.MeshStandardMaterial({ color: 0xd5dce7, metalness: 0.92, roughness: 0.16 })
  );
  lidarHead.position.set(0, 0.43, 0);
  robot.add(lidarHead);

  ledMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffc52d, emissive: 0x5a4306, metalness: 0.1, roughness: 0.35 })
  );
  ledMesh.position.set(0, 0.34, 0.18);
  robot.add(ledMesh);

  leftBrush = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.44, 24), blackMat);
  rightBrush = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.44, 24), blackMat);
  leftBrush.rotation.z = Math.PI / 2;
  rightBrush.rotation.z = Math.PI / 2;
  leftBrush.position.set(-0.18, 0.055, -0.29);
  rightBrush.position.set(0.18, 0.055, -0.29);
  robot.add(leftBrush, rightBrush);

  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e7, metalness: 0.92, roughness: 0.15 });
  leftNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.06, 12), nozzleMat);
  rightNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.06, 12), nozzleMat);
  leftNozzle.rotation.x = Math.PI / 2;
  rightNozzle.rotation.x = Math.PI / 2;
  leftNozzle.position.set(-0.14, 0.11, -0.31);
  rightNozzle.position.set(0.14, 0.11, -0.31);
  robot.add(leftNozzle, rightNozzle);

  const nozzleRingMat = new THREE.MeshStandardMaterial({
    color: 0xa4e5ff,
    emissive: 0x2b8fc1,
    emissiveIntensity: 0.35,
    metalness: 0.25,
    roughness: 0.2
  });
  const leftNozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 16), nozzleRingMat);
  const rightNozzleRing = leftNozzleRing.clone();
  leftNozzleRing.rotation.x = Math.PI / 2;
  rightNozzleRing.rotation.x = Math.PI / 2;
  leftNozzleRing.position.copy(leftNozzle.position);
  rightNozzleRing.position.copy(rightNozzle.position);
  robot.add(leftNozzleRing, rightNozzleRing);

  leftNozzleGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0x8ce7ff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    })
  );
  rightNozzleGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0x8ce7ff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    })
  );
  leftNozzleGlow.scale.set(0.14, 0.14, 0.14);
  rightNozzleGlow.scale.set(0.14, 0.14, 0.14);
  leftNozzleGlow.position.copy(leftNozzle.position);
  rightNozzleGlow.position.copy(rightNozzle.position);
  robot.add(leftNozzleGlow, rightNozzleGlow);

  const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.07, 16);
  const wheelPositions = [
    [-0.28, 0.055, -0.2],
    [0.28, 0.055, -0.2],
    [-0.28, 0.055, 0.2],
    [0.28, 0.055, 0.2]
  ];
  wheelPositions.forEach((pos) => {
    const wheel = new THREE.Mesh(wheelGeo, blackMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(pos[0], pos[1], pos[2]);
    robot.add(wheel);
  });

  const boltGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8);
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, metalness: 0.95, roughness: 0.2 });
  const boltPos = [
    [-0.31, 0.26, -0.21],
    [0.31, 0.26, -0.21],
    [-0.31, 0.26, 0.21],
    [0.31, 0.26, 0.21],
    [-0.12, 0.26, 0],
    [0.12, 0.26, 0]
  ];
  boltPos.forEach((p) => {
    const b = new THREE.Mesh(boltGeo, boltMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(p[0], p[1], p[2]);
    robot.add(b);
  });

  panelGroup.add(robot);
  createSprayDrops();
}

function buildZigZagPath() {
  zigzagPath = [];
  const totalW = config.panelCols * config.panelW + (config.panelCols - 1) * config.gapX;
  const totalZ = config.panelRows * config.panelH + (config.panelRows - 1) * config.gapZ;
  const startX = -totalW * 0.5 + config.panelW * 0.5;
  const startZ = -totalZ * 0.5 + config.panelH * 0.5;

  const rowX = [];
  for (let c = 0; c < config.panelCols; c++) {
    rowX.push(startX + c * (config.panelW + config.gapX));
  }
  for (let r = 0; r < config.panelRows; r++) {
    const z = startZ + r * (config.panelH + config.gapZ);
    if (r % 2 === 0) {
      for (let i = 0; i < rowX.length; i++) zigzagPath.push(new THREE.Vector3(rowX[i], config.robotClearance, z));
    } else {
      for (let i = rowX.length - 1; i >= 0; i--) zigzagPath.push(new THREE.Vector3(rowX[i], config.robotClearance, z));
    }
  }

  robot.position.copy(zigzagPath[0]);
  currentSegment = 0;
  segmentProgress = 0;
  missionCompleted = false;
}

function bindUI() {
  ui.dirtRange.addEventListener("input", (e) => setDirtLevel(Number(e.target.value), true));
  ui.speedRange.addEventListener("input", (e) => {
    config.speedMultiplier = Number(e.target.value);
    ui.speedValue.textContent = `${config.speedMultiplier.toFixed(2)}x`;
  });
  ui.toggleBtn.addEventListener("click", () => {
    if (missionCompleted) {
      buildZigZagPath();
      setDirtLevel(config.dirtPercent, true);
      missionCompleted = false;
    }
    simRunning = !simRunning;
    ui.toggleBtn.textContent = simRunning ? "Durdur" : "Baslat";
    ui.analysisMetric.textContent = simRunning ? "Gercek zamanli panel analizi suruyor..." : "Analiz beklemede.";
  });
  ui.resetBtn.addEventListener("click", () => {
    panelData.forEach((p) => {
      p.dirtBias = (Math.random() * 2 - 1) * 26;
    });
    buildZigZagPath();
    setDirtLevel(config.dirtPercent, true);
    ui.analysisMetric.textContent = "Rota sifirlandi, tarama yeniden baslatildi.";
    simRunning = true;
    ui.toggleBtn.textContent = "Durdur";
  });
}

function setDirtLevel(percent, applyAll) {
  config.dirtPercent = percent;
  ui.dirtValue.textContent = `${percent}%`;
  if (applyAll) {
    panelData.forEach((p) => {
      p.dirtPercent = THREE.MathUtils.clamp(percent + p.dirtBias, 2, 100);
      updatePanelDirtVisual(p);
    });
  }
  updateLedByAverageDirt();
}

function updatePanelDirtVisual(p) {
  p.dirtMesh.material.opacity = THREE.MathUtils.lerp(0.03, 0.55, p.dirtPercent / 100);
  p.dirtMesh.material.color.setHex(0x8f7d39);
  if (p.dustMat) {
    p.dustMat.opacity = THREE.MathUtils.lerp(0.02, 0.92, p.dirtPercent / 100);
    p.dustMat.size = THREE.MathUtils.lerp(0.009, 0.028, p.dirtPercent / 100);
    p.dustPoints.visible = p.dirtPercent > 1;
  }
}

function getLocalDirtLevel() {
  const r2 = config.cleanRadius * config.cleanRadius * 1.25;
  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < panelData.length; i++) {
    const p = panelData[i];
    const dx = robot.position.x - p.center.x;
    const dz = robot.position.z - p.center.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) {
      const w = 1 - d2 / r2;
      weighted += p.dirtPercent * w;
      weightSum += w;
    }
  }
  if (weightSum <= 0) return config.dirtPercent;
  return weighted / weightSum;
}

function updateLedByAverageDirt() {
  const avg = panelData.reduce((sum, p) => sum + p.dirtPercent, 0) / Math.max(panelData.length, 1);
  let ledColor = 0x2ee66b;
  let ledEmissive = 0x0d441e;
  if (avg >= 67) {
    ledColor = 0xff3b3b;
    ledEmissive = 0x5a1010;
  } else if (avg >= 34) {
    ledColor = 0xffc52d;
    ledEmissive = 0x5a4306;
  }
  ledMesh.material.color.setHex(ledColor);
  ledMesh.material.emissive.setHex(ledEmissive);
}

function moveRobot(delta) {
  if (zigzagPath.length < 2) return;

  const from = zigzagPath[currentSegment];
  const to = zigzagPath[(currentSegment + 1) % zigzagPath.length];
  const distance = from.distanceTo(to);
  const localDirt = getLocalDirtLevel();
  const dirtSlowFactor = THREE.MathUtils.lerp(1, config.minSpeedFactor, localDirt / 100);
  const speed = config.baseSpeed * config.speedMultiplier * dirtSlowFactor;
  const step = (speed * delta) / Math.max(distance, 0.0001);
  segmentProgress += step;

  if (segmentProgress >= 1) {
    segmentProgress = 0;
    if (currentSegment === zigzagPath.length - 1) {
      currentSegment = 0;
      robot.position.copy(zigzagPath[0]);
      simRunning = false;
      missionCompleted = true;
      ui.toggleBtn.textContent = "Baslat";
      ui.speedMetric.textContent = "0.00 m/s";
      ui.analysisMetric.textContent = "Temizlik tamamlandi. Robot baslangic noktasinda durdu.";
      return;
    }
    currentSegment += 1;
    // Yon degisimlerinde suyu kisa sure azaltip tekrar arttir.
    sprayTurnDampTime = 0.2;
  }

  const nextFrom = zigzagPath[currentSegment];
  const nextTo = zigzagPath[(currentSegment + 1) % zigzagPath.length];
  robot.position.lerpVectors(nextFrom, nextTo, segmentProgress);

  // Yonalim: hareket yonune baksin
  const dir = new THREE.Vector3().subVectors(nextTo, nextFrom).normalize();
  sprayForwardDir.copy(dir);
  robot.rotation.y = Math.atan2(dir.x, dir.z);

  // Surface snapping: panelin icine girmeyi engeller
  robot.position.y = Math.max(robot.position.y, config.robotClearance);

  // Firca RPM
  const rpm = config.brushBaseRPM * config.speedMultiplier * (0.75 + localDirt / 200);
  const rps = rpm / 60;
  const rotDelta = rps * Math.PI * 2 * delta;
  leftBrush.rotation.x += rotDelta;
  rightBrush.rotation.x += rotDelta;

  ui.speedMetric.textContent = `${speed.toFixed(2)} m/s`;
  ui.rpmMetric.textContent = `${Math.round(rpm)}`;

  updateSpray(localDirt, delta);
}

function applyCleaning(delta) {
  const r2 = config.cleanRadius * config.cleanRadius;
  const localDirt = getLocalDirtLevel();
  const adaptiveCleanRate = config.cleanRate * THREE.MathUtils.lerp(0.65, 1.45, localDirt / 100);
  for (let i = 0; i < panelData.length; i++) {
    const p = panelData[i];
    const dx = robot.position.x - p.center.x;
    const dz = robot.position.z - p.center.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) {
      const falloff = 1 - d2 / r2;
      p.dirtPercent = Math.max(0, p.dirtPercent - adaptiveCleanRate * falloff * delta);
      updatePanelDirtVisual(p);
    }
  }

  const avg = panelData.reduce((sum, p) => sum + p.dirtPercent, 0) / Math.max(panelData.length, 1);
  const cleanliness = Math.round(100 - avg);
  const row = Math.floor(currentSegment / config.panelCols) + 1;
  ui.analysisMetric.textContent = `Satir ${row}/${config.panelRows} taraniyor - Temizlik: %${cleanliness} - Toz: %${Math.round(localDirt)}`;
  updateLedByAverageDirt();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);
  if (simRunning) {
    moveRobot(delta);
    applyCleaning(delta);
  }
  renderer.render(scene, camera);
}

function onWindowResize() {
  const w = Math.max(sceneContainer.clientWidth, 300);
  const h = Math.max(sceneContainer.clientHeight, 300);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function initMouseOrbit(canvas) {
  orbitState = {
    target: new THREE.Vector3(0, 1.1, 0),
    radius: 10.4,
    theta: 0,
    phi: 1.05,
    minRadius: 4,
    maxRadius: 18,
    minPhi: 0.35,
    maxPhi: 1.5,
    dragging: false,
    px: 0,
    py: 0
  };

  const offset = new THREE.Vector3().subVectors(camera.position, orbitState.target);
  orbitState.radius = offset.length();
  orbitState.theta = Math.atan2(offset.x, offset.z);
  orbitState.phi = Math.acos(THREE.MathUtils.clamp(offset.y / orbitState.radius, -1, 1));
  updateCameraFromOrbit();

  canvas.addEventListener("pointerdown", (e) => {
    orbitState.dragging = true;
    orbitState.px = e.clientX;
    orbitState.py = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!orbitState.dragging) return;
    const dx = e.clientX - orbitState.px;
    const dy = e.clientY - orbitState.py;
    orbitState.px = e.clientX;
    orbitState.py = e.clientY;
    orbitState.theta -= dx * 0.005;
    orbitState.phi = THREE.MathUtils.clamp(orbitState.phi + dy * 0.004, orbitState.minPhi, orbitState.maxPhi);
    updateCameraFromOrbit();
  });

  canvas.addEventListener("pointerup", (e) => {
    orbitState.dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      orbitState.radius = THREE.MathUtils.clamp(orbitState.radius + e.deltaY * 0.01, orbitState.minRadius, orbitState.maxRadius);
      updateCameraFromOrbit();
    },
    { passive: false }
  );
}

function updateCameraFromOrbit() {
  const sinPhi = Math.sin(orbitState.phi);
  const x = orbitState.radius * sinPhi * Math.sin(orbitState.theta);
  const y = orbitState.radius * Math.cos(orbitState.phi);
  const z = orbitState.radius * sinPhi * Math.cos(orbitState.theta);
  camera.position.set(orbitState.target.x + x, orbitState.target.y + y, orbitState.target.z + z);
  camera.lookAt(orbitState.target);
}

function createSprayDrops() {
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x7dd9ff,
    emissive: 0x10344a,
    transparent: true,
    opacity: 0.78,
    roughness: 0.15,
    metalness: 0
  });
  const geo = new THREE.SphereGeometry(0.01, 8, 8);
  for (let i = 0; i < config.sprayMaxDrops; i++) {
    const drop = new THREE.Mesh(geo, waterMat.clone());
    drop.visible = false;
    drop.userData.life = 0;
    drop.userData.velocity = new THREE.Vector3();
    panelGroup.add(drop);
    sprayDrops.push(drop);
  }
}

function updateSpray(localDirt, delta) {
  // Su miktari toz yogunlugu ile dogru orantilidir.
  const baseIntensity = THREE.MathUtils.clamp(localDirt / 100, 0, 1);
  if (sprayTurnDampTime > 0) sprayTurnDampTime = Math.max(0, sprayTurnDampTime - delta);
  const turnRecover = sprayTurnDampTime > 0 ? 1 - sprayTurnDampTime / 0.2 : 1;
  const turnFactor = THREE.MathUtils.lerp(0.25, 1, turnRecover);
  const intensity = baseIntensity * turnFactor;
  const activeDrops = Math.floor(config.sprayMaxDrops * intensity);
  const glowOpacity = THREE.MathUtils.lerp(0.03, 0.48, intensity);
  leftNozzleGlow.material.opacity = glowOpacity;
  rightNozzleGlow.material.opacity = glowOpacity;
  const glowScale = THREE.MathUtils.lerp(0.1, 0.24, intensity);
  leftNozzleGlow.scale.set(glowScale, glowScale, glowScale);
  rightNozzleGlow.scale.set(glowScale, glowScale, glowScale);

  const forward = sprayForwardDir.clone().normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const frontCenter = robot.position.clone().addScaledVector(forward, 0.36).setY(robot.position.y + 0.11);
  const leftPos = frontCenter.clone().addScaledVector(side, -0.14);
  const rightPos = frontCenter.clone().addScaledVector(side, 0.14);

  for (let i = 0; i < sprayDrops.length; i++) {
    const drop = sprayDrops[i];
    if (i < activeDrops) {
      if (!drop.visible || drop.userData.life <= 0) {
        const src = i % 2 === 0 ? leftPos : rightPos;
        drop.visible = true;
        drop.position.copy(src);
        drop.userData.life = 0.26 + Math.random() * 0.24;
        const spread = (Math.random() - 0.5) * 0.12;
        const down = -(0.1 + Math.random() * 0.05);
        const forwardForce = 0.4 + Math.random() * 0.2 + intensity * 0.26;
        drop.userData.velocity.copy(forward).multiplyScalar(forwardForce);
        drop.userData.velocity.addScaledVector(side, spread);
        drop.userData.velocity.y += down;
      }

      drop.userData.life -= delta;
      drop.position.addScaledVector(drop.userData.velocity, delta * 9.5);
      drop.material.opacity = THREE.MathUtils.clamp(drop.userData.life * 3.2, 0, 0.86);
      if (drop.userData.life <= 0 || drop.position.y < 0.03) {
        drop.visible = false;
      }
    } else {
      drop.visible = false;
      drop.userData.life = 0;
    }
  }
}

function makeMonocrystalTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#0c1b43");
  grad.addColorStop(0.55, "#10285b");
  grad.addColorStop(1, "#0a1740");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(205,216,235,0.46)";
  ctx.lineWidth = 1.2;
  for (let x = 12; x < size; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(160,182,214,0.2)";
  for (let y = 16; y < size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSkyTexture() {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#a8d4ff");
  grad.addColorStop(0.5, "#87b9ef");
  grad.addColorStop(1, "#5d88bb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 36; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.6;
    const r = 30 + Math.random() * 80;
    const alpha = 0.03 + Math.random() * 0.06;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function initBackgroundParallax() {
  const orbs = document.querySelectorAll(".orb");
  const icons = document.querySelectorAll(".float-icon");
  const rings = document.querySelector(".solar-rings");

  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY;
    
    orbs.forEach((orb, idx) => {
      const speed = 0.1 + (idx * 0.05);
      orb.style.transform = `translateY(${scrollY * speed}px)`;
    });

    icons.forEach((icon, idx) => {
      const speed = 0.15 + (idx * 0.03);
      // Keep the floating animation and add parallax
      icon.style.marginTop = `${scrollY * speed}px`;
    });

    if (rings) {
      rings.style.transform = `translateY(${scrollY * 0.08}px)`;
    }
  });
}
