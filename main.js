import * as THREE from "https://unpkg.com/three@0.164.0/build/three.module.js";

const root = document.getElementById("game-root");
const winOverlay = document.getElementById("win-overlay");
const newLevelBtn = document.getElementById("new-level-btn");
const difficultyOverlay = document.getElementById("difficulty-overlay");
const restartBtn = document.getElementById("restart-btn");
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
const floorThickness = 0.25;
const wallThickness = 0.06; // very thin, almost like planes
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

// Floors/levels inside the cube (bottom and top)
const levelYs = [-inner + 2.0, inner - 2.0];

// Grid parameters so we can place start/goal cells and generate a proper maze
let cellsPerSide = 4;
let usableSpan = inner * 2 - 0.8;
let cellSize = usableSpan / cellsPerSide;
let cellOffset = -usableSpan / 2 + cellSize / 2;
const playLevelIndex = 1; // use the top level as the starting play layer

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

function generateMaze() {
  const n = cellsPerSide;
  const visited = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false)
  );
  // Vertical walls indexed by grid line (x) and cell row (z):
  // vertWalls[ix][iz] is wall between (ix-1,iz) and (ix,iz), ix in [0..n]
  const vertWalls = Array.from({ length: n + 1 }, () =>
    Array.from({ length: n }, () => true)
  );
  // Horizontal walls indexed by cell column (x) and grid line (z):
  // horizWalls[ix][iz] is wall between (ix,iz-1) and (ix,iz), iz in [0..n]
  const horizWalls = Array.from({ length: n }, () =>
    Array.from({ length: n + 1 }, () => true)
  );

  // For building a 3D-like route, we also remember the BFS tree
  const prev = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => null)
  );

  const stack = [];
  const startX = Math.floor(Math.random() * n);
  const startZ = Math.floor(Math.random() * n);
  stack.push({ x: startX, z: startZ });
  visited[startX][startZ] = true;

  function neighbors(x, z) {
    const result = [];
    if (x > 0 && !visited[x - 1][z]) result.push({ x: x - 1, z });
    if (x < n - 1 && !visited[x + 1][z]) result.push({ x: x + 1, z });
    if (z > 0 && !visited[x][z - 1]) result.push({ x, z: z - 1 });
    if (z < n - 1 && !visited[x][z + 1]) result.push({ x, z: z + 1 });
    return result;
  }

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const x = current.x;
    const z = current.z;
    const neigh = neighbors(x, z);
    if (neigh.length === 0) {
      stack.pop();
      continue;
    }
    const next = neigh[Math.floor(Math.random() * neigh.length)];
    const nx = next.x;
    const nz = next.z;

    // Remove walls between (x,z) and (nx,nz)
    if (nx === x + 1) {
      vertWalls[x + 1][z] = false;
    } else if (nx === x - 1) {
      vertWalls[x][z] = false;
    } else if (nz === z + 1) {
      horizWalls[x][z + 1] = false;
    } else if (nz === z - 1) {
      horizWalls[x][z] = false;
    }

    visited[nx][nz] = true;
    stack.push({ x: nx, z: nz });
  }

  // Find farthest cell from the starting cell using BFS to pick a good goal
  const dist = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => -1)
  );
  const queue = [];
  dist[startX][startZ] = 0;
  queue.push({ x: startX, z: startZ });
  let farthest = { x: startX, z: startZ };

  while (queue.length > 0) {
    const { x, z } = queue.shift();
    const d = dist[x][z];
    if (d > dist[farthest.x][farthest.z]) {
      farthest = { x, z };
    }
    // Neighbors according to carved passages (no wall)
    if (x > 0 && !vertWalls[x][z] && dist[x - 1][z] === -1) {
      dist[x - 1][z] = d + 1;
      prev[x - 1][z] = { x, z };
      queue.push({ x: x - 1, z });
    }
    if (x < n - 1 && !vertWalls[x + 1][z] && dist[x + 1][z] === -1) {
      dist[x + 1][z] = d + 1;
      prev[x + 1][z] = { x, z };
      queue.push({ x: x + 1, z });
    }
    if (z > 0 && !horizWalls[x][z] && dist[x][z - 1] === -1) {
      dist[x][z - 1] = d + 1;
      prev[x][z - 1] = { x, z };
      queue.push({ x, z: z - 1 });
    }
    if (z < n - 1 && !horizWalls[x][z + 1] && dist[x][z + 1] === -1) {
      dist[x][z + 1] = d + 1;
      prev[x][z + 1] = { x, z };
      queue.push({ x, z: z + 1 });
    }
  }

  // Reconstruct path from start to farthest
  const path = [];
  let cx = farthest.x;
  let cz = farthest.z;
  while (!(cx === startX && cz === startZ)) {
    path.push({ x: cx, z: cz });
    const p = prev[cx][cz];
    if (!p) break;
    cx = p.x;
    cz = p.z;
  }
  path.push({ x: startX, z: startZ });
  path.reverse();

  // Pick a middle cell along the path as a drop position (if path is long enough)
  let dropCell = null;
  if (path.length >= 3) {
    const midIndex = Math.floor(path.length / 2);
    dropCell = { ix: path[midIndex].x, iz: path[midIndex].z };
  }

  const hasDrop = !!dropCell;
  const goalLevelIndex = hasDrop ? 0 : playLevelIndex; // bottom if we have a drop, otherwise top-only

  return {
    startCell: { ix: startX, iz: startZ, levelIndex: playLevelIndex },
    goalCell: { ix: farthest.x, iz: farthest.z, levelIndex: goalLevelIndex },
    dropCell,
    vertWalls,
    horizWalls,
  };
}

function rebuildLevel() {
  clearMaze();

  // Generate a 2D maze pattern and derive a 3D-like route with a drop between floors
  const { startCell, goalCell, dropCell, vertWalls, horizWalls } = generateMaze();
  startPos = cellToPosition(startCell);
  goalPos = cellToPosition(goalCell);

  // Position the ball centre just above the start floor, fully inside the inner maze cube
  startPos.y =
    levelYs[startCell.levelIndex] +
    floorThickness * 0.5 +
    ballRadius * 0.8;

  // Position the goal cube so that it sits entirely above its floor (no part below)
  goalPos.y =
    levelYs[goalCell.levelIndex] +
    floorThickness * 0.5 +
    goalHeight * 0.5;

  // Per-cell floors so we can carve a hole at the drop position on the top floor
  for (let li = 0; li < levelYs.length; li++) {
    const y = levelYs[li];
    for (let ix = 0; ix < cellsPerSide; ix++) {
      for (let iz = 0; iz < cellsPerSide; iz++) {
        if (
          li === playLevelIndex &&
          dropCell &&
          ix === dropCell.ix &&
          iz === dropCell.iz
        ) {
          // Hole in the top floor so the ball can fall down
          continue;
        }
        const x = cellOffset + ix * cellSize;
        const z = cellOffset + iz * cellSize;
        addWall(x, y, z, cellSize, floorThickness, cellSize);
      }
    }
  }

  // Make sure maze walls touch the bottom floor and the top floor (no vertical gap)
  const bottomFloorY = levelYs[0];
  const topFloorY = levelYs[levelYs.length - 1];
  const mazeWallY = (bottomFloorY + topFloorY) / 2;
  const mazeWallHeight = Math.max(
    0.5,
    topFloorY - bottomFloorY + floorThickness
  );

  const edgeX0 = cellOffset - cellSize / 2;
  const edgeZ0 = cellOffset - cellSize / 2;

  // Vertical walls (oriented along Z)
  for (let ix = 0; ix <= cellsPerSide; ix++) {
    for (let iz = 0; iz < cellsPerSide; iz++) {
      if (!vertWalls[ix][iz]) continue;
      const x = edgeX0 + ix * cellSize;
      const z = cellOffset + iz * cellSize;
      addWall(x, mazeWallY, z, wallThickness, mazeWallHeight, cellSize);
    }
  }

  // Horizontal walls (oriented along X)
  for (let ix = 0; ix < cellsPerSide; ix++) {
    for (let iz = 0; iz <= cellsPerSide; iz++) {
      if (!horizWalls[ix][iz]) continue;
      const x = cellOffset + ix * cellSize;
      const z = edgeZ0 + iz * cellSize;
      addWall(x, mazeWallY, z, cellSize, mazeWallHeight, wallThickness);
    }
  }
}

// Ball
const ballRadius = 0.45;
const ballGeom = new THREE.SphereGeometry(ballRadius, 32, 16);
const ballMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x00e1ff,
  emissiveIntensity: 3.0,
  roughness: 0.15,
  metalness: 0.3,
});
let ballMesh = new THREE.Mesh(ballGeom, ballMat);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
cubeGroup.add(ballMesh);

// Local light that illuminates the maze only near the ball
const ballLight = new THREE.PointLight(0x3bfffe, 6.0, 12.0, 1.8);
ballLight.castShadow = true;
ballLight.shadow.mapSize.set(1024, 1024);
ballLight.shadow.bias = -0.0005;
ballMesh.add(ballLight);

// Goal: glowing light-green cube, same size as the grid cells
let goalCellSize = cellSize * 0.9; // X/Z footprint inside one cell
let goalHeight = floorThickness + ballRadius * 1.1; // only above the floor
let goalRadius = goalCellSize / 2;
let goalGeom = new THREE.BoxGeometry(goalCellSize, goalHeight, goalCellSize);
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

// Physics state (all in cubeGroup-local space)
const ballVelocity = new THREE.Vector3(0.0, 0.0, 0.0);
const gravityWorld = new THREE.Vector3(0.0, -8.0, 0.0);
const damping = 0.995;
const restitution = 0.35;
let hasWon = false;

// Temp helpers
const tmpQuat = new THREE.Quaternion();
const tmpGravityLocal = new THREE.Vector3();

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

  // If the sphere center is inside the box (or exactly on the closest point),
  // distSq becomes 0. Handle that robustly by pushing out along the nearest face.
  if (distSq === 0) {
    const lx = localPos.x - center.x;
    const ly = localPos.y - center.y;
    const lz = localPos.z - center.z;

    const distToFaceX = half.x - Math.abs(lx);
    const distToFaceY = half.y - Math.abs(ly);
    const distToFaceZ = half.z - Math.abs(lz);

    let minDist = distToFaceX;
    let normal = new THREE.Vector3(Math.sign(lx) || 1, 0, 0);

    if (distToFaceY < minDist) {
      minDist = distToFaceY;
      normal = new THREE.Vector3(0, Math.sign(ly) || 1, 0);
    }
    if (distToFaceZ < minDist) {
      minDist = distToFaceZ;
      normal = new THREE.Vector3(0, 0, Math.sign(lz) || 1);
    }

    if (minDist >= radius) return null;
    return { normal, penetration: radius - minDist };
  }

  if (distSq >= radius * radius) return null;

  const dist = Math.sqrt(distSq);
  return {
    normal: new THREE.Vector3(nx / dist, ny / dist, nz / dist),
    penetration: radius - dist,
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
  ballMesh.position.copy(startPos);
  goalMesh.position.copy(goalPos);
  ballVelocity.set(0, 0, 0);
}

if (newLevelBtn) {
  newLevelBtn.addEventListener("click", () => {
    resetLevel();
  });
}

function restartGame() {
  // Reset visual and physics state and return to difficulty selection
  cubeGroup.rotation.set(0, 0, 0);
  cubeGroup.scale.set(1, 1, 1);
  ballVelocity.set(0, 0, 0);
  hasWon = false;
  gameStarted = false;
  if (winOverlay) {
    winOverlay.classList.remove("visible");
  }
  // Reset to default parameters so the next chosen difficulty starts from a clean state
  setDifficultyParameters("medium");
  rebuildLevel();
  ballMesh.position.copy(startPos).add(new THREE.Vector3(0, ballRadius * 0.4, 0));
  goalMesh.position.copy(goalPos).add(new THREE.Vector3(0, ballRadius * 0.4, 0));
  if (difficultyOverlay) {
    difficultyOverlay.classList.remove("hidden");
  }
}

if (restartBtn) {
  restartBtn.addEventListener("click", () => {
    restartGame();
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
  goalHeight = floorThickness + ballRadius * 1.1;
  goalGeom.dispose?.();
  goalEdgeGeom.dispose?.();

  goalGeom = new THREE.BoxGeometry(goalCellSize, goalHeight, goalCellSize);
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
  // Thin walls need sub-stepping to avoid tunneling
  const maxStep = 1 / 120;
  const steps = Math.max(1, Math.ceil(dt / maxStep));
  const stepDt = dt / steps;

  // Convert world gravity into cube-local gravity (so tilting the cube changes "down")
  tmpQuat.copy(cubeGroup.quaternion).invert();
  tmpGravityLocal.copy(gravityWorld).applyQuaternion(tmpQuat);

  // Limits for containment: keep the ball inside both the cube shell and the maze footprint
  const outerHalf = cubeSize / 2 - ballRadius - 0.18;
  const mazeHalf = usableSpan / 2 - ballRadius * 0.3;
  const limitX = Math.min(outerHalf, mazeHalf);
  const limitZ = Math.min(outerHalf, mazeHalf);
  const bottomFloorY = levelYs[0];
  const topFloorY = levelYs[levelYs.length - 1];
  const bottomY =
    bottomFloorY +
    floorThickness * 0.5 -
    ballRadius * 0.4;
  const topY =
    topFloorY +
    floorThickness * 0.5 +
    ballRadius * 0.4;
  const localPos = ballMesh.position;

  for (let s = 0; s < steps; s++) {
    ballVelocity.addScaledVector(tmpGravityLocal, stepDt);
    localPos.addScaledVector(ballVelocity, stepDt);

    // Collide with outer/maze bounds (guaranteed containment)
    if (localPos.x < -limitX) {
      localPos.x = -limitX;
      if (ballVelocity.x < 0) ballVelocity.x *= -restitution;
    } else if (localPos.x > limitX) {
      localPos.x = limitX;
      if (ballVelocity.x > 0) ballVelocity.x *= -restitution;
    }

    if (localPos.y < bottomY) {
      localPos.y = bottomY;
      if (ballVelocity.y < 0) ballVelocity.y *= -restitution;
    } else if (localPos.y > topY) {
      localPos.y = topY;
      if (ballVelocity.y > 0) ballVelocity.y *= -restitution;
    }

    if (localPos.z < -limitZ) {
      localPos.z = -limitZ;
      if (ballVelocity.z < 0) ballVelocity.z *= -restitution;
    } else if (localPos.z > limitZ) {
      localPos.z = limitZ;
      if (ballVelocity.z > 0) ballVelocity.z *= -restitution;
    }

    // Collide with maze walls
    for (const wall of mazeWalls) {
      const res = sphereVsAabb(localPos, ballRadius, wall);
      if (!res) continue;

      // Push the ball out of the wall
      localPos.x += res.normal.x * res.penetration;
      localPos.y += res.normal.y * res.penetration;
      localPos.z += res.normal.z * res.penetration;

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

    // Containment clamp again in case a wall push moved us outside
    localPos.x = Math.max(-limitX, Math.min(limitX, localPos.x));
    localPos.y = Math.max(bottomY, Math.min(topY, localPos.y));
    localPos.z = Math.max(-limitZ, Math.min(limitZ, localPos.z));
  }

  // Damping
  ballVelocity.multiplyScalar(damping);

  // Check if the ball reached the goal
  if (!hasWon && goalMesh) {
    const dx = ballMesh.position.x - goalMesh.position.x;
    const dz = ballMesh.position.z - goalMesh.position.z;
    const distSqXZ = dx * dx + dz * dz;
    const horizThreshold = (cellSize * 0.45) ** 2;

    const y = ballMesh.position.y;
    const gy = goalMesh.position.y;
    // Only count as in-goal when the ball is on or slightly above the goal floor,
    // not far below or above it.
    const yOk =
      y >= gy &&
      y <= gy + floorThickness + ballRadius * 1.5;

    if (yOk && distSqXZ < horizThreshold) {
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
ballMesh.position.copy(startPos);
goalMesh.position.copy(goalPos);

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

