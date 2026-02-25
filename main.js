import * as THREE from "https://unpkg.com/three@0.164.0/build/three.module.js";

const root = document.getElementById("game-root");
const winOverlay = document.getElementById("win-overlay");
const newLevelBtn = document.getElementById("new-level-btn");
const difficultyOverlay = document.getElementById("difficulty-overlay");
const difficultyButtons = document.querySelectorAll("[data-difficulty]");
let gameStarted = false;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 16);
camera.lookAt(0, 0, 0);

// Slightly brighter ambient light so the overall maze shape stays visible
const ambientLight = new THREE.AmbientLight(0x202438, 0.55);
scene.add(ambientLight);

// Group that contains the cube walls + maze + ball
const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

// Cube "container"
const cubeSize = 10;
const cubeGeom = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const cubeMat = new THREE.MeshStandardMaterial({
  color: 0x1e2740,
  transparent: true,
  opacity: 0.08,
  roughness: 0.3,
  metalness: 0.75,
  emissive: 0x1a3066,
  emissiveIntensity: 0.4,
  side: THREE.BackSide,
});
const cubeMesh = new THREE.Mesh(cubeGeom, cubeMat);
cubeGroup.add(cubeMesh);

// Decorative edges to clarify cube shape
const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(cubeGeom),
  new THREE.LineBasicMaterial({ color: 0x2d5cff })
);
cubeGroup.add(edges);

// Simple 3D-ish maze: build "walls" inside the cube
const mazeWalls = [];
let startPos = new THREE.Vector3();
let goalPos = new THREE.Vector3();
const wallThickness = 0.4;
const inner = cubeSize / 2 - 0.7;

const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0x1f4c9c, // brighter blue so the edges stand out
  transparent: true,
  opacity: 0.42,
  roughness: 0.8,
  metalness: 0.25,
  emissive: 0x0b1533,
  emissiveIntensity: 0.3,
});

// Blue edge lines for maze walls, same style as the cube's outer edges
const mazeEdgeMaterial = new THREE.LineBasicMaterial({
  color: 0x2d5cff,
  transparent: true,
  opacity: 0.9,
});

function addWall(x, y, z, w, h, d) {
  const geom = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geom, wallMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  cubeGroup.add(mesh);

  const edgeGeom = new THREE.EdgesGeometry(geom);
  const edgeLines = new THREE.LineSegments(edgeGeom, mazeEdgeMaterial);
  edgeLines.position.copy(mesh.position);
  cubeGroup.add(edgeLines);

  mazeWalls.push({ mesh, half: new THREE.Vector3(w / 2, h / 2, d / 2), edgeLines });
}

// Floors/levels that fill almost the entire inner cube
const levelYs = [-inner + 2.0, 0, inner - 2.0];

// Grid parameters so we can place random start/goal cells
let cellsPerSide = 4;
let usableSpan = inner * 2 - 0.8;
let cellSize = usableSpan / cellsPerSide;
let cellOffset = -usableSpan / 2 + cellSize / 2;
const playLevelIndex = 1; // use the middle level as the main play layer

function setDifficultyParameters(difficulty) {
  if (difficulty === "easy") {
    cellsPerSide = 3;
  } else if (difficulty === "hard") {
    cellsPerSide = 6;
  } else {
    cellsPerSide = 4;
  }
  usableSpan = inner * 2 - 0.8;
  cellSize = usableSpan / cellsPerSide;
  cellOffset = -usableSpan / 2 + cellSize / 2;
}

function randomCell(levelIndex) {
  const ix = Math.floor(Math.random() * cellsPerSide);
  const iz = Math.floor(Math.random() * cellsPerSide);
  return { ix, iz, levelIndex };
}

function cellToPosition(cell) {
  return new THREE.Vector3(
    cellOffset + cell.ix * cellSize,
    levelYs[cell.levelIndex],
    cellOffset + cell.iz * cellSize
  );
}

function clearMaze() {
  for (const wall of mazeWalls) {
    cubeGroup.remove(wall.mesh);
    cubeGroup.remove(wall.edgeLines);
    wall.mesh.geometry.dispose();
    wall.edgeLines.geometry.dispose();
  }
  mazeWalls.length = 0;
}

function rebuildLevel() {
  clearMaze();

  // Base floors
  levelYs.forEach((y) => {
    const span = inner * 2 - 0.8;
    addWall(0, y, 0, span, wallThickness, span);
  });

  // New random start/goal cells
  const startCell = randomCell(playLevelIndex);
  let goalCell = randomCell(playLevelIndex);
  while (
    goalCell.levelIndex === startCell.levelIndex &&
    Math.abs(goalCell.ix - startCell.ix) + Math.abs(goalCell.iz - startCell.iz) < 2
  ) {
    goalCell = randomCell(playLevelIndex);
  }
  startPos = cellToPosition(startCell);
  goalPos = cellToPosition(goalCell);

  // Vertical walls to create a grid-like maze that fills the cube volume with a bit of randomness
  levelYs.forEach((y) => {
    const edgeOffset = cellOffset - cellSize / 2;

    // Walls running along Z
    for (let ix = 0; ix <= cellsPerSide; ix++) {
      if (Math.random() < 0.45) continue;
      const x = edgeOffset + ix * cellSize;
      addWall(x, y, 0, wallThickness, 2.4, usableSpan);
    }

    // Walls running along X
    for (let iz = 0; iz <= cellsPerSide; iz++) {
      if (Math.random() < 0.45) continue;
      const z = edgeOffset + iz * cellSize;
      addWall(0, y, z, usableSpan, 2.4, wallThickness);
    }
  });
}

// Ball
const ballRadius = 0.45;
const ballGeom = new THREE.SphereGeometry(ballRadius, 32, 16);
const ballMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x00e1ff,
  emissiveIntensity: 2.2,
  roughness: 0.15,
  metalness: 0.3,
});
let ballMesh = new THREE.Mesh(ballGeom, ballMat);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
cubeGroup.add(ballMesh);

// Local light that illuminates the maze only near the ball
const ballLight = new THREE.PointLight(0x3bfffe, 4.6, 9.0, 1.8);
ballLight.castShadow = true;
ballLight.shadow.mapSize.set(1024, 1024);
ballLight.shadow.bias = -0.0005;
ballMesh.add(ballLight);

// Goal: glowing light-green cube, same size as the grid cells
let goalCellSize = cellSize * 0.9;
let goalRadius = goalCellSize / 2;
let goalGeom = new THREE.BoxGeometry(goalCellSize, goalCellSize, goalCellSize);
const goalMat = new THREE.MeshStandardMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.0,
  emissive: 0x000000,
  emissiveIntensity: 0.0,
  roughness: 0.0,
  metalness: 0.0,
  depthWrite: false,
});
let goalMesh = new THREE.Mesh(goalGeom, goalMat);
goalMesh.castShadow = true;
cubeGroup.add(goalMesh);
const goalLight = new THREE.PointLight(0x9dffb0, 4.8, 8.5, 1.8);
goalMesh.add(goalLight);

// Only green edges for the goal, same style as the cube's edges
let goalEdgeGeom = new THREE.EdgesGeometry(goalGeom);
const goalEdgeMat = new THREE.LineBasicMaterial({
  color: 0x9dffb0,
  transparent: true,
  opacity: 1.0,
});
let goalEdges = new THREE.LineSegments(goalEdgeGeom, goalEdgeMat);
goalMesh.add(goalEdges);

// Slightly stronger fill light that gently brings out maze surfaces
const hemiLight = new THREE.HemisphereLight(0x1e3bff, 0x000000, 0.5);
scene.add(hemiLight);

// Physics state
const ballVelocity = new THREE.Vector3(0.0, 0.0, 0.0);
const gravity = new THREE.Vector3(0.0, -8.0, 0.0);
const damping = 0.995;
const restitution = 0.35;
let hasWon = false;

// For collision math, we track the ball in cube-local space, then convert to world space
const tmpLocalPos = new THREE.Vector3();
const tmpWorldPos = new THREE.Vector3();

function sphereVsAabb(localPos, radius, wall) {
  const half = wall.half;
  const center = wall.mesh.position;

  const dx = Math.max(-half.x, Math.min(localPos.x - center.x, half.x));
  const dy = Math.max(-half.y, Math.min(localPos.y - center.y, half.y));
  const dz = Math.max(-half.z, Math.min(localPos.z - center.z, half.z));

  const closestX = center.x + dx;
  const closestY = center.y + dy;
  const closestZ = center.z + dz;

  const nx = localPos.x - closestX;
  const ny = localPos.y - closestY;
  const nz = localPos.z - closestZ;
  const distSq = nx * nx + ny * ny + nz * nz;

  if (distSq >= radius * radius || distSq === 0) return null;

  const dist = Math.sqrt(distSq);
  const penetration = radius - dist;
  return {
    normal: new THREE.Vector3(nx / dist, ny / dist, nz / dist),
    penetration,
  };
}

function triggerWin() {
  if (hasWon) return;
  hasWon = true;
  ballVelocity.set(0, 0, 0);
  if (winOverlay) {
    winOverlay.classList.add("visible");
  }
}

function resetLevel() {
  if (winOverlay) {
    winOverlay.classList.remove("visible");
  }
  hasWon = false;
  rebuildLevel();
  // Place the ball and goal at the new positions
  ballMesh.position.copy(startPos).add(new THREE.Vector3(0, ballRadius * 0.4, 0));
  goalMesh.position.copy(goalPos).add(new THREE.Vector3(0, ballRadius * 0.4, 0));
  ballVelocity.set(0, 0, 0);
}

if (newLevelBtn) {
  newLevelBtn.addEventListener("click", () => {
    resetLevel();
  });
}

const difficultySettings = {
  easy: { scale: 0.8 },
  medium: { scale: 1.0 },
  hard: { scale: 1.25 },
};

function applyDifficulty(difficulty) {
  const setting = difficultySettings[difficulty] || difficultySettings.medium;
  setDifficultyParameters(difficulty);

  // Update goal geometry to match new cell size
  goalCellSize = cellSize * 0.9;
  goalRadius = goalCellSize / 2;
  goalGeom.dispose?.();
  goalEdgeGeom.dispose?.();

  goalGeom = new THREE.BoxGeometry(goalCellSize, goalCellSize, goalCellSize);
  goalEdgeGeom = new THREE.EdgesGeometry(goalGeom);

  goalMesh.geometry = goalGeom;
  goalMesh.remove(goalEdges);
  goalEdges = new THREE.LineSegments(goalEdgeGeom, goalEdgeMat);
  goalMesh.add(goalEdges);

  cubeGroup.scale.set(setting.scale, setting.scale, setting.scale);

  resetLevel();
  gameStarted = true;
  if (difficultyOverlay) {
    difficultyOverlay.classList.add("hidden");
  }
}

if (difficultyButtons && difficultyButtons.length > 0) {
  difficultyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const diff = btn.getAttribute("data-difficulty") || "medium";
      applyDifficulty(diff);
    });
  });
}

function integrateBall(dt) {
  // Apply gravity in world space
  ballVelocity.addScaledVector(gravity, dt);

  // Convert current position into cube-local space
  tmpLocalPos.copy(ballMesh.position);
  cubeGroup.worldToLocal(tmpLocalPos);

  // Integrate in local space
  tmpLocalPos.x += ballVelocity.x * dt;
  tmpLocalPos.y += ballVelocity.y * dt;
  tmpLocalPos.z += ballVelocity.z * dt;

  const innerLimit = cubeSize / 2 - ballRadius - 0.2;

  // Collide with inner cube walls
  if (tmpLocalPos.x < -innerLimit) {
    tmpLocalPos.x = -innerLimit;
    ballVelocity.x *= -restitution;
  } else if (tmpLocalPos.x > innerLimit) {
    tmpLocalPos.x = innerLimit;
    ballVelocity.x *= -restitution;
  }

  if (tmpLocalPos.y < -innerLimit) {
    tmpLocalPos.y = -innerLimit;
    ballVelocity.y *= -restitution;
  } else if (tmpLocalPos.y > innerLimit) {
    tmpLocalPos.y = innerLimit;
    ballVelocity.y *= -restitution;
  }

  if (tmpLocalPos.z < -innerLimit) {
    tmpLocalPos.z = -innerLimit;
    ballVelocity.z *= -restitution;
  } else if (tmpLocalPos.z > innerLimit) {
    tmpLocalPos.z = innerLimit;
    ballVelocity.z *= -restitution;
  }

  // Collide with maze walls
  for (const wall of mazeWalls) {
    const res = sphereVsAabb(tmpLocalPos, ballRadius, wall);
    if (!res) continue;

    // Push the ball out of the wall
    tmpLocalPos.x += res.normal.x * res.penetration;
    tmpLocalPos.y += res.normal.y * res.penetration;
    tmpLocalPos.z += res.normal.z * res.penetration;

    // Reflect velocity along the collision normal
    const vDotN =
      ballVelocity.x * res.normal.x +
      ballVelocity.y * res.normal.y +
      ballVelocity.z * res.normal.z;

    if (vDotN < 0) {
      ballVelocity.x -= (1 + restitution) * vDotN * res.normal.x;
      ballVelocity.y -= (1 + restitution) * vDotN * res.normal.y;
      ballVelocity.z -= (1 + restitution) * vDotN * res.normal.z;
    }
  }

  // Convert back into world space
  tmpWorldPos.copy(tmpLocalPos);
  cubeGroup.localToWorld(tmpWorldPos);
  ballMesh.position.copy(tmpWorldPos);

  // Damping
  ballVelocity.multiplyScalar(damping);

  // Check if the ball reached the goal
  if (!hasWon && goalMesh) {
    const dx = ballMesh.position.x - goalMesh.position.x;
    const dy = ballMesh.position.y - goalMesh.position.y;
    const dz = ballMesh.position.z - goalMesh.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const threshold = (ballRadius + goalRadius * 0.6) ** 2;
    if (distSq < threshold) {
      triggerWin();
    }
  }
}

// Mouse drag rotation of the cube (not the camera)
let isDragging = false;
let lastX = 0;
let lastY = 0;

function onPointerDown(e) {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
}

function onPointerMove(e) {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  const rotSpeed = 0.005;
  cubeGroup.rotation.y += dx * rotSpeed;
  cubeGroup.rotation.x += dy * rotSpeed;
}

function onPointerUp() {
  isDragging = false;
}

window.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointerleave", onPointerUp);

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener("resize", onResize);

// Initialize the first level (will be rebuilt once difficulty is chosen)
setDifficultyParameters("medium");
rebuildLevel();
ballMesh.position.copy(startPos).add(new THREE.Vector3(0, ballRadius * 0.4, 0));
goalMesh.position.copy(goalPos).add(new THREE.Vector3(0, ballRadius * 0.4, 0));

let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  if (gameStarted) {
    integrateBall(dt);
  }

  // Slight idle rotation so the cube feels alive
  cubeGroup.rotation.y += 0.0008;

  renderer.render(scene, camera);
}

animate(performance.now());

