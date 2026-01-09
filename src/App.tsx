import { useState, useRef, useEffect } from "react";
import { Canvas, useThree, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Line,
  Html,
  GizmoHelper,
  PerspectiveCamera,
  OrthographicCamera,
  Text,
} from "@react-three/drei";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "./pdfWorker";
import { TextureLoader, MOUSE } from "three";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc as string;

type PdfInfo = {

  textureUrl: string;
  pageWidthPt: number;
  pageHeightPt: number;
};

type Point3 = { x: number; y: number; z: number };

type Pillar = {
  id: number;
  type: "retangular" | "circular";
  x: number;
  y: number;
  height: number;
  width?: number;
  length?: number;
  diameter?: number;
  auto?: boolean;
};
type Beam = {
  id: number;
  startId: number;
  endId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;  // largura (m)
  height: number; // altura (m)
};

type BeamSegment = {
  id: string;
  beamId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
};

type MoveSelection = {
  start: Point3 | null;
  current: Point3 | null;
};


type OrthoView = "top" | "bottom" | "front" | "back" | "left" | "right";
type ViewMode = "3d" | OrthoView;

const POINT_TO_MM = 25.4 / 72;

// -------------------------------------------------------------
// CAMERA CONTROLLER
// -------------------------------------------------------------
function CameraController({
  viewMode,
  resetToken,
  allowPan = true,
}: {
  viewMode: ViewMode;
  resetToken: number;
  allowPan?: boolean;
}) {
  const { camera } = useThree();
  const controls = useRef<any>(null);

  useEffect(() => {
    if (!controls.current) return;

    camera.up.set(0, 1, 0);

    if (viewMode === "3d") {
      camera.position.set(0, 0, 60);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      controls.current.target.set(0, 0, 0);
      controls.current.enableRotate = true;
    } else if (viewMode === "top") {
      camera.position.set(0, 0, 100);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      controls.current.target.set(0, 0, 0);
      controls.current.enableRotate = false;
    } else if (viewMode === "bottom") {
      camera.position.set(0, 0, -100);
      camera.up.set(0, -1, 0);
      camera.lookAt(0, 0, 0);
      controls.current.target.set(0, 0, 0);
      controls.current.enableRotate = false;
    } else if (viewMode === "front") {
      camera.position.set(0, 100, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
      controls.current.target.set(0, 0, 0);
      controls.current.enableRotate = false;
    } else if (viewMode === "back") {
      camera.position.set(0, -100, 0);
      camera.up.set(0, 0, 1);
      camera.lookAt(0, 0, 0);
      controls.current.target.set(0, 0, 0);
      controls.current.enableRotate = false;
    } else if (viewMode === "right") {

      camera.position.set(100, 0, 0);

      camera.up.set(0, 1, 0);

      camera.lookAt(0, 0, 0);

      controls.current.target.set(0, 0, 0);

      controls.current.enableRotate = false;

    } else if (viewMode === "left") {

      camera.position.set(-100, 0, 0);

      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      controls.current.target.set(0, 0, 0);
      controls.current.enableRotate = false;
    }

    controls.current.update();
  }, [viewMode, camera, resetToken]);

  const canRotate = viewMode === "3d";

  return (
    <OrbitControls
      ref={controls}
      enablePan={allowPan}
      enableZoom
      enableRotate={canRotate}
      mouseButtons={{
        LEFT: MOUSE.PAN,
        RIGHT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
      }}
    />
  );
}

// -------------------------------------------------------------
// VIEW CUBE – versão que funcionou
// -------------------------------------------------------------
function ViewCube({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}) {
  const activeColor = "#ff4081";
  const baseColor = "#1976d2";

  function Face({
    face,
    label,
    position,
    rotation,
  }: {
    face: ViewMode;
    label: string;
    position: [number, number, number];
    rotation: [number, number, number];
  }) {
    const color = viewMode === face ? activeColor : baseColor;

    return (
      <group
        position={position}
        rotation={rotation}
        onClick={(e) => {
          e.stopPropagation();
          setViewMode(face);
        }}
      >
        {/* plaquinha da face */}
        <mesh>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial
            color={color}
            depthTest={false} // não "briga" com a cena
          />
        </mesh>

        {/* texto 3D pequeno */}
        <Text
          fontSize={0.28}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="black"
        >
          {label}
        </Text>
      </group>
    );
  }

  return (
    <group>
      {/* aramado do cubo */}
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color="white"
          wireframe
          depthTest={false} // sempre por cima
        />
      </mesh>

      {/* 6 faces */}
      <Face
        face="top"
        label="TOP"
        position={[0, 0.5, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <Face
        face="bottom"
        label="BOT"
        position={[0, -0.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <Face
        face="front"
        label="FRONT"
        position={[0, 0, 0.5]}
        rotation={[0, 0, 0]}
      />
      <Face
        face="back"
        label="BACK"
        position={[0, 0, -0.5]}
        rotation={[0, Math.PI, 0]}
      />
      <Face
        face="right"
        label="RIGHT"
        position={[0.5, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Face
        face="left"
        label="LEFT"
        position={[-0.5, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
    </group>
  );
}

// -------------------------------------------------------------
// PDF PLANE
// -------------------------------------------------------------
function PdfPlane({
  pdf,
  scaleDenominator,
  onPlaneClick,
  onPlaneMove,
  onPlaneUp,
  capturePointer = false,
}: {
  pdf: PdfInfo;
  scaleDenominator: number;
  onPlaneClick?: (p: Point3, e?: any) => void;
  onPlaneMove?: (p: Point3, e?: any) => void;
  onPlaneUp?: () => void;
  capturePointer?: boolean;
}) {
  const texture = useLoader(TextureLoader, pdf.textureUrl);

  const widthPaperMm = pdf.pageWidthPt * POINT_TO_MM;
  const heightPaperMm = pdf.pageHeightPt * POINT_TO_MM;

  const widthRealMm = widthPaperMm * scaleDenominator;
  const heightRealMm = heightPaperMm * scaleDenominator;

  const widthRealM = widthRealMm / 1000;
  const heightRealM = heightRealMm / 1000;

  const handlePointerDown = (e: any) => {
    if (capturePointer) e.stopPropagation();
    if (!onPlaneClick) return;
    const p = e.point;
    onPlaneClick({ x: p.x, y: p.y, z: p.z }, e);
  };

  const handlePointerMove = (e: any) => {
    if (capturePointer) e.stopPropagation();
    if (!onPlaneMove) return;
    const p = e.point;
    onPlaneMove({ x: p.x, y: p.y, z: p.z }, e);
  };

  const handlePointerUp = () => {
    // pointer up deve impedir o pan do orbit durante drag
    onPlaneUp && onPlaneUp();
  };

  return (
    <mesh
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <planeGeometry args={[widthRealM, heightRealM]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

// -------------------------------------------------------------
// DIMENSION LINE
// -------------------------------------------------------------
function DimensionLine({
  p1,
  p2,
  dist,
}: {
  p1: Point3;
  p2: Point3;
  dist: number;
}) {
  const mid = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2,
  };

  return (
    <group>
      <Line
        points={[
          [p1.x, p1.y, p1.z],
          [p2.x, p2.y, p2.z],
        ]}
        lineWidth={2}
        color="red"
      />
      <Html
        position={[mid.x, mid.y + 0.3, mid.z]}
        distanceFactor={10}
        style={{
          background: "white",
          padding: "2px 4px",
          borderRadius: "3px",
          border: "1px solid #333",
          fontSize: "12px",
        }}
      >
        {dist.toFixed(3)} m
      </Html>
    </group>
  );
}
// -------------------------------------------------------------
// BEAM MESH (VIGA 3D ENTRE DOIS PONTOS)
// -------------------------------------------------------------
function BeamMesh({
  beam,
  topZ,
  onClick,
  isSelected,
}: {
  beam: Beam | BeamSegment;
  topZ: number; // n vel do topo da viga (igual topo dos pilares)
  onClick?: () => void;
  isSelected?: boolean;
}) {
  const { x1, y1, x2, y2, width, height } = beam;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const span = Math.sqrt(dx * dx + dy * dy);
  if (span === 0) return null;

  const angle = Math.atan2(dy, dx);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // topo da viga em topZ, centro deslocado para baixo
  const centerZ = topZ - height / 2;

  return (
    <mesh
      position={[midX, midY, centerZ]}
      rotation={[0, 0, angle]}
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick();
      }}
    >
      {/* length (ao longo da viga), width (largura da se  o), height (altura em Z) */}
      <boxGeometry args={[span, width, height]} />
      <meshStandardMaterial color={isSelected ? "#ffcc00" : "#8888ff"} />
    </mesh>
  );
}
// -------------------------------------------------------------
// PILLAR MESH
// -------------------------------------------------------------
// -------------------------------------------------------------
function PillarMesh({
  pillar,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerMove,
  isSelected,
}: {
  pillar: Pillar;
  onClick?: () => void;
  onPointerDown?: (pillar: Pillar, e: any) => void;
  onPointerUp?: () => void;
  onPointerMove?: (p: Point3, e: any) => void;
  isSelected?: boolean;
}) {
  const { x, y, type, width, length, diameter, height } = pillar;

  const h = height ?? 3;
  const baseZ = 0;
  const centerZ = baseZ + h / 2;

  if (type === "retangular") {
    const w = width ?? 0.3;
    const l = length ?? 0.3;

    return (
      <mesh
        position={[x, y, centerZ]}
        onClick={(e) => {
          e.stopPropagation();
          onClick && onClick();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown && onPointerDown(pillar, e);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove &&
            onPointerMove({ x: e.point.x, y: e.point.y, z: e.point.z }, e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onPointerUp && onPointerUp();
        }}
      >
        <boxGeometry args={[w, l, h]} />
        <meshStandardMaterial color={isSelected ? "#ffcc00" : "#ffaa33"} />
      </mesh>
    );
  }

  const d = diameter ?? 0.4;
  const radius = d / 2;

  return (
    <mesh
      position={[x, y, centerZ]}
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown && onPointerDown(pillar, e);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onPointerMove &&
          onPointerMove({ x: e.point.x, y: e.point.y, z: e.point.z }, e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onPointerUp && onPointerUp();
      }}
    >
      <cylinderGeometry args={[radius, radius, h, 32]} />
      <meshStandardMaterial color={isSelected ? "#ffcc00" : "#55ccff"} />
    </mesh>
  );
}

// -------------------------------------------------------------
// APP
// -------------------------------------------------------------
function App() {
  const [pdf, setPdf] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [scaleDenominator, setScaleDenominator] = useState(100);

  const [measureMode, setMeasureMode] = useState(false);
  const [, setMeasurePoints] = useState<Point3[]>([]);
  const [lastMeasurement, setLastMeasurement] = useState<{
    p1: Point3;
    p2: Point3;
    dist: number;
  } | null>(null);

  const [resetToken, setResetToken] = useState(0);

  const [viewMode, setViewMode] = useState<ViewMode>("3d");

  const [pillarType, setPillarType] = useState<"retangular" | "circular">(
    "retangular"
  );
  const [pillarHeight, setPillarHeight] = useState(3);
  const [pillarWidth, setPillarWidth] = useState(0.3);
  const [pillarLength, setPillarLength] = useState(0.4);
  const [pillarDiameter, setPillarDiameter] = useState(0.4);
  // vãos máximos para geração automática de pilares
  const [maxSpanX, setMaxSpanX] = useState(6); // m
  const [maxSpanY, setMaxSpanY] = useState(6); // m

    // VIGAS
  const [beams, setBeams] = useState<Beam[]>([]);
  const [drawBeamMode, setDrawBeamMode] = useState(false);
  const [beamTempStart, setBeamTempStart] = useState<Point3 | null>(null);
  // modo retângulo de vigas (perímetro retangular)
  const [drawRectBeamMode, setDrawRectBeamMode] = useState(false);
  const [rectTempStart, setRectTempStart] = useState<Point3 | null>(null);

  // modo polilinha de vigas (perímetro qualquer)
  const [drawPolylineMode, setDrawPolylineMode] = useState(false);
  const [polyPoints, setPolyPoints] = useState<Point3[]>([]);
  const [drawAxisLock, setDrawAxisLock] = useState<"none" | "x" | "y">("none");
  const finalizePolyline = () => {
    if (polyPoints.length < 2) {
      setPolyPoints([]);
      setDrawPolylineMode(false);
      cleanupOrphanBeams();
      return;
    }

    const first = polyPoints[0];
    const last = polyPoints[polyPoints.length - 1];
    const dist = Math.hypot(first.x - last.x, first.y - last.y);

    if (dist > 1e-6) {
      addBeamBetween(last, first);
    }

    if (polyPoints.length >= 3) {
      generateGridInsidePolygon(polyPoints);
    }

    setPolyPoints([]);
    setDrawPolylineMode(false);
    cleanupOrphanBeams();
  };

const [selectedBeamId, setSelectedBeamId] = useState<number | null>(null);
const [selectedBeamSegment, setSelectedBeamSegment] = useState<
  BeamSegment | null
>(null);
const [selectedPillarId, setSelectedPillarId] = useState<number | null>(null);
const [selectedPillarIds, setSelectedPillarIds] = useState<number[]>([]);
const [moveMode, setMoveMode] = useState(false);
const [moveSelection, setMoveSelection] = useState<MoveSelection>({
  start: null,
  current: null,
});
const [moveDx, setMoveDx] = useState(0);
const [moveDy, setMoveDy] = useState(0);
const [moveAllowX, setMoveAllowX] = useState(true);
const [moveAllowY, setMoveAllowY] = useState(true);
const [isDraggingPillars, setIsDraggingPillars] = useState(false);
const [dragStartPoint, setDragStartPoint] = useState<Point3 | null>(null);
const [dragInitialPositions, setDragInitialPositions] = useState<
  Map<number, { x: number; y: number }>
>(new Map());
const dragPrevPositionsRef = useRef<Map<number, { x: number; y: number }>>(
  new Map()
);
const [editBeamWidth, setEditBeamWidth] = useState(0.15); // m
const [editBeamHeight, setEditBeamHeight] = useState(0.3); // m (valor inicial qualquer)


  const [insertMode, setInsertMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [pillars, setPillars] = useState<Pillar[]>([]);

  const [alignMode, setAlignMode] = useState<
    "livre" | "horizontal" | "vertical"
  >("livre");

const [activePanel, setActivePanel] = useState<"pdf" | "pillars" | "modify">(
  "pdf"
);

  const isOrtho = viewMode !== "3d";

  // SHIFT -> força 3D/perspectiva
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setViewMode("3d");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleFileChange = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = (pdfjsLib as any).getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");

    setPdf({
      textureUrl: dataUrl,
      pageWidthPt: viewport.width,
      pageHeightPt: viewport.height,
    });

    setMeasurePoints([]);
    setLastMeasurement(null);
    setLoading(false);
  };
  
  const buildGridPositions = (min: number, max: number, maxSpan: number) => {
    if (maxSpan <= 0) return [min, max];
    const positions = [min];
    let cur = min;
    while (cur + maxSpan < max - 1e-6) {
      cur += maxSpan;
      positions.push(cur);
    }
    if (Math.abs(cur - max) > 1e-6) {
      positions.push(max);
    }
    return positions;
  };

  const snapToPillarPoint = (p: Point3) => {
    const snapTol = 0.4; // 40 cm de raio para snap
    let best: Pillar | null = null;
    let bestD = Infinity;
    pillars.forEach((pl) => {
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (d < snapTol && d < bestD) {
        best = pl;
        bestD = d;
      }
    });
    if (!best) return p;
    const snapped = best as Pillar;
    return { ...p, x: snapped.x, y: snapped.y };
  };

  const buildPillarMap = (list: Pillar[]) => {
    const m = new Map<number, Pillar>();
    list.forEach((p) => m.set(p.id, p));
    return m;
  };

  const refreshBeamsFromAnchors = (beamList: Beam[], pillarList: Pillar[]) => {
    const map = buildPillarMap(pillarList);
    const next: Beam[] = [];
    beamList.forEach((b) => {
      const a = map.get(b.startId);
      const c = map.get(b.endId);
      if (!a || !c) return;
      const x1 = a.x;
      const y1 = a.y;
      const x2 = c.x;
      const y2 = c.y;
      const span = Math.hypot(x2 - x1, y2 - y1);
      const height = span / 10;
      next.push({ ...b, x1, y1, x2, y2, height });
    });
    return next;
  };

  const beamHasPillar = (beam: Beam, list?: Pillar[]) => {
    const arr: Pillar[] = list ?? pillars;
    const ids = new Set(arr.map((p) => p.id));
    return ids.has(beam.startId) && ids.has(beam.endId);
  };

  const cleanupOrphanBeams = (list?: Pillar[]) => {
    const ref = list ?? pillars;
    setBeams((prev) => prev.filter((b) => beamHasPillar(b, ref)));
  };

  const applyAddBeamBetween = (
    p1: Point3,
    p2: Point3,
    basePillars: Pillar[] = pillars,
    baseBeams: Beam[] = beams
  ) => {
    const snapTol = 0.4;
    let working = [...basePillars];
    const findNear = (pt: Point3) =>
      working.find((pl) => Math.hypot(pl.x - pt.x, pl.y - pt.y) <= snapTol);

    const ensurePillar = (pt: Point3) => {
      const found = findNear(pt);
      if (found) return found;
      const created = addPillarDirect(pt.x, pt.y);
      working.push(created);
      return created;
    };

    const a = ensurePillar(p1);
    const b = ensurePillar(p2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy);
    if (span === 0) return { pillars: working, beams: baseBeams };

    const width = 0.15;
    const height = span / 10;
    const id = Date.now() + Math.random();

    const newBeam: Beam = {
      id,
      startId: a.id,
      endId: b.id,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      width,
      height,
    };

    const exists = baseBeams.some(
      (bb) =>
        (bb.startId === newBeam.startId && bb.endId === newBeam.endId) ||
        (bb.startId === newBeam.endId && bb.endId === newBeam.startId)
    );
    const nextBeams = exists ? baseBeams : [...baseBeams, newBeam];
    const enforced = enforceAutoPillars(working, nextBeams);
    const refreshed = refreshBeamsFromAnchors(nextBeams, enforced);
    return { pillars: enforced, beams: refreshed };
  };

  const addBeamBetween = (p1: Point3, p2: Point3) => {
    const res = applyAddBeamBetween(p1, p2);
    setPillars(res.pillars);
    setBeams(res.beams);
  };

  const generateGridInsidePolygon = (
    poly: Point3[],
    basePillars: Pillar[] = pillars,
    baseBeams: Beam[] = beams
  ) => {
    if (!poly || poly.length < 3) return;
    const n = poly.length;

    let minX = poly[0].x;
    let maxX = poly[0].x;
    let minY = poly[0].y;
    let maxY = poly[0].y;

    poly.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const xs = buildGridPositions(minX, maxX, maxSpanX);
    const ys = buildGridPositions(minY, maxY, maxSpanY);

    // Caso o polígono seja um retângulo alinhado aos eixos, force a malha regular
    const isAxisAlignedRect =
      n === 4 &&
      poly.every((p, i) => {
        const q = poly[(i + 1) % n];
        return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6;
      });

    if (isAxisAlignedRect) {
      let curP: Pillar[] = [];
      let curB: Beam[] = [];
      const ensureP = (x: number, y: number) => {
        const found = curP.find((pp) => Math.hypot(pp.x - x, pp.y - y) < 1e-4);
        if (found) return found;
        const created = addPillarDirect(x, y);
        curP.push(created);
        return created;
      };
      const addEdge = (pa: Point3, pb: Point3) => {
        const res = applyAddBeamBetween(pa, pb, curP, curB);
        curP = res.pillars;
        curB = res.beams;
      };

      ys.forEach((y) => xs.forEach((x) => ensureP(x, y)));
      ys.forEach((y) => {
        for (let i = 0; i < xs.length - 1; i++) {
          addEdge({ x: xs[i], y, z: 0 }, { x: xs[i + 1], y, z: 0 });
        }
      });
      xs.forEach((x) => {
        for (let j = 0; j < ys.length - 1; j++) {
          addEdge({ x, y: ys[j], z: 0 }, { x, y: ys[j + 1], z: 0 });
        }
      });

      const enforced = enforceAutoPillars(curP, curB);
      const refreshed = refreshBeamsFromAnchors(curB, enforced);
      setPillars(enforced);
      setBeams(refreshed);
      return;
    }

    const pointInPoly = (x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;

        const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
        const dot = (x - xi) * (x - xj) + (y - yi) * (y - yj);
        if (Math.abs(cross) < 1e-8 && dot <= 1e-8) {
          return true;
        }

        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };

    let curPillars = [...basePillars];
    let curBeams = [...baseBeams];

    const addEdge = (pa: Point3, pb: Point3) => {
      const res = applyAddBeamBetween(pa, pb, curPillars, curBeams);
      curPillars = res.pillars;
      curBeams = res.beams;
    };

    const verticalSegments = (x0: number) => {
      const intersections: number[] = [];
      for (let i = 0; i < n; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % n];
        if (p1.x === p2.x) continue;
        const xMin = Math.min(p1.x, p2.x);
        const xMax = Math.max(p1.x, p2.x);
        if (x0 < xMin || x0 >= xMax) continue;
        const t = (x0 - p1.x) / (p2.x - p1.x);
        if (t < 0 || t > 1) continue;
        const y = p1.y + t * (p2.y - p1.y);
        intersections.push(y);
      }
      intersections.sort((a, b) => a - b);
      for (let k = 0; k + 1 < intersections.length; k += 2) {
        const y1 = intersections[k];
        const y2 = intersections[k + 1];
        addEdge({ x: x0, y: y1, z: 0 }, { x: x0, y: y2, z: 0 });
      }
    };

    const horizontalSegments = (y0: number) => {
      const intersections: number[] = [];
      for (let i = 0; i < n; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % n];
        if (p1.y === p2.y) continue;
        const yMin = Math.min(p1.y, p2.y);
        const yMax = Math.max(p1.y, p2.y);
        if (y0 < yMin || y0 >= yMax) continue;
        const t = (y0 - p1.y) / (p2.y - p1.y);
        if (t < 0 || t > 1) continue;
        const x = p1.x + t * (p2.x - p1.x);
        intersections.push(x);
      }
      intersections.sort((a, b) => a - b);
      for (let k = 0; k + 1 < intersections.length; k += 2) {
        const x1 = intersections[k];
        const x2 = intersections[k + 1];
        addEdge({ x: x1, y: y0, z: 0 }, { x: x2, y: y0, z: 0 });
      }
    };

    xs.forEach(verticalSegments);
    ys.forEach(horizontalSegments);

    const tolAdd = 1e-4;
    xs.forEach((x) => {
      ys.forEach((y) => {
        if (pointInPoly(x, y)) {
          const exists = curPillars.some((q) => Math.hypot(q.x - x, q.y - y) < tolAdd);
          if (!exists) curPillars.push(addPillarDirect(x, y));
        }
      });
    });

    const enforced = enforceAutoPillars(curPillars, curBeams);
    const refreshed = refreshBeamsFromAnchors(curBeams, enforced);
    setPillars(enforced);
    setBeams(refreshed);
  };

  const addPillarAt = (x: number, y: number) => {
    let newX = x;
    let newY = y;

    const last = pillars[pillars.length - 1];

    if (last && alignMode === "horizontal") {
      newY = last.y;
    } else if (last && alignMode === "vertical") {
      newX = last.x;
    }

    const id = Date.now() + Math.random();

    const base: Pillar = {
      id,
      type: pillarType,
      x: newX,
      y: newY,
      height: pillarHeight,
    };

    if (pillarType === "retangular") {
      base.width = pillarWidth;
      base.length = pillarLength;
    } else {
      base.diameter = pillarDiameter;
    }

    setPillars((prev) => {
      const next = [...prev, base];
      return next;
    });
  };

  const addPillarDirect = (x: number, y: number): Pillar => {
    const id = Date.now() + Math.random();
    const base: Pillar = {
      id,
      type: pillarType,
      x,
      y,
      height: pillarHeight,
    };
    if (pillarType === "retangular") {
      base.width = pillarWidth;
      base.length = pillarLength;
    } else {
      base.diameter = pillarDiameter;
    }
    return base;
  };

  const makeAutoPillar = (x: number, y: number): Pillar => ({
    id: Date.now() + Math.random(),
    type: pillarType,
    x,
    y,
    height: pillarHeight,
    width: pillarType === "retangular" ? pillarWidth : undefined,
    length: pillarType === "retangular" ? pillarLength : undefined,
    diameter: pillarType === "circular" ? pillarDiameter : undefined,
    auto: true,
  });

  // Insere pilares autom?ticos dividindo v?os acima do limite e removendo autos redundantes
  const enforceAutoPillars = (pillarList: Pillar[], beamList: Beam[]) => {
    const tolPerp = 0.02;
    const tolPos = 0.02;
    const pillarsWork: Pillar[] = [...pillarList];
    const key = (x: number, y: number) => `${x.toFixed(4)}|${y.toFixed(4)}`;

    const findAt = (x: number, y: number) =>
      pillarsWork.find((p) => Math.hypot(p.x - x, p.y - y) <= tolPos);

    const ensureAutoAt = (x: number, y: number) => {
      const found = findAt(x, y);
      if (found) return found.id;
      const created = makeAutoPillar(x, y);
      pillarsWork.push(created);
      return created.id;
    };

    beamList.forEach((b) => {
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const useX = Math.abs(dx) >= Math.abs(dy);
      const maxSpan = useX ? maxSpanX : maxSpanY;
      if (maxSpan <= 0) return;
      const ux = dx / len;
      const uy = dy / len;

      const aligned: { t: number; auto: boolean }[] = [];
      pillarsWork.forEach((p) => {
        const vx = p.x - b.x1;
        const vy = p.y - b.y1;
        const t = vx * ux + vy * uy;
        if (t < -tolPos || t > len + tolPos) return;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp <= tolPerp)
          aligned.push({ t: Math.max(0, Math.min(len, t)), auto: !!p.auto });
      });

      aligned.push({ t: 0, auto: false }, { t: len, auto: false });
      aligned.sort((a, b) => a.t - b.t);

      const desired: number[] = [0];
      for (let i = 1; i < aligned.length; i++) {
        const prevT = aligned[i - 1].t;
        const curT = aligned[i].t;
        desired.push(curT);
        let cursor = prevT;
        while (curT - cursor > maxSpan + tolPos) {
          cursor += maxSpan;
          if (cursor >= curT - tolPos) break;
          const x = b.x1 + ux * cursor;
          const y = b.y1 + uy * cursor;
          ensureAutoAt(x, y);
          desired.push(cursor);
        }
      }

      const desiredSet = new Set(desired.map((t) => Math.round(t * 10000)));
      for (let i = pillarsWork.length - 1; i >= 0; i--) {
        const p = pillarsWork[i];
        if (!p.auto) continue;
        const vx = p.x - b.x1;
        const vy = p.y - b.y1;
        const t = vx * ux + vy * uy;
        if (t < -tolPos || t > len + tolPos) continue;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp > tolPerp) continue;
        const tKey = Math.round(Math.max(0, Math.min(len, t)) * 10000);
        if (!desiredSet.has(tKey)) pillarsWork.splice(i, 1);
      }
    });

    // remove autos n?o usados em nenhuma viga
    const usedKeys = new Set<string>();
    beamList.forEach((b) => {
      usedKeys.add(key(b.x1, b.y1));
      usedKeys.add(key(b.x2, b.y2));
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const ux = dx / len;
      const uy = dy / len;
      pillarsWork.forEach((p) => {
        const vx = p.x - b.x1;
        const vy = p.y - b.y1;
        const t = vx * ux + vy * uy;
        if (t < -tolPos || t > len + tolPos) return;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp <= tolPerp) usedKeys.add(key(p.x, p.y));
      });
    });

    return pillarsWork.filter((p) => !p.auto || usedKeys.has(key(p.x, p.y)));
  };

  const roundCoord = (v: number) => Math.round(v * 10000) / 10000;
  const coordKey = (v: number) => roundCoord(v).toFixed(4);

  const isPillarOnBeam = (
    p: Pillar,
    b: Beam,
    tolPos = 1e-4,
    tolPerp = 1e-4
  ) => {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return false;
    const ux = dx / len;
    const uy = dy / len;
    const vx = p.x - b.x1;
    const vy = p.y - b.y1;
    const t = vx * ux + vy * uy;
    if (t < -tolPos || t > len + tolPos) return false;
    const perp = Math.abs(vx * -uy + vy * ux);
    return perp <= tolPerp;
  };

  const isPillarOnAnyBeam = (p: Pillar, beams: Beam[]) =>
    beams.some((b) => isPillarOnBeam(p, b));

  const pruneAutoOrphans = (pillarList: Pillar[], beams: Beam[]) =>
    pillarList.filter((p) => !p.auto || isPillarOnAnyBeam(p, beams));

  const recalcPillarsForMove = (
    pillarList: Pillar[],
    beamList: Beam[],
    allBeams: Beam[]
  ) => {
    const tolPerp = 1e-4;
    const tolPos = 1e-4;
    const next: Pillar[] = [...pillarList];
    const required = new Set<string>();

    const key = (x: number, y: number) => `${coordKey(x)}|${coordKey(y)}`;
    const findAt = (x: number, y: number) =>
      next.find((p) => key(p.x, p.y) === key(x, y));

    beamList.forEach((b) => {
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const useX = Math.abs(dx) >= Math.abs(dy);
      const maxSpan = useX ? maxSpanX : maxSpanY;
      const ux = dx / len;
      const uy = dy / len;

      const positions: number[] = [0, len];
      if (maxSpan > 0) {
        for (let t = maxSpan; t < len - tolPos; t += maxSpan) {
          positions.push(t);
        }
      }

      positions.forEach((t) => {
        const x = b.x1 + ux * t;
        const y = b.y1 + uy * t;
        const k = key(x, y);
        required.add(k);
        if (!findAt(x, y)) next.push(makeAutoPillar(x, y));
      });
    });

    const adjustIds = new Set(beamList.map((b) => b.id));
    const otherBeams = allBeams.filter((b) => !adjustIds.has(b.id));

    return next.filter((p) => {
      const onAdjusted = beamList.some((b) => isPillarOnBeam(p, b, tolPos, tolPerp));
      if (!onAdjusted) return true;
      const k = key(p.x, p.y);
      if (required.has(k)) return true;
      if (otherBeams.some((b) => isPillarOnBeam(p, b, tolPos, tolPerp)))
        return true;
      return false;
    });
  };

  const absorbPassedPillars = (
    pillarList: Pillar[],
    beamList: Beam[],
    movedIds: Set<number>,
    prevPositions: Map<number, { x: number; y: number }>,
    nextPositions: Map<number, { x: number; y: number }>,
    primaryMovedId: number | null
  ) => {
    if (movedIds.size === 0) {
      return { pillars: pillarList, beams: beamList, movedIds };
    }

    const remap = new Map<number, number>();
    const order = Array.from(movedIds).filter((id) => id !== primaryMovedId);
    if (primaryMovedId != null && movedIds.has(primaryMovedId)) {
      order.push(primaryMovedId);
    }

    const crossesOnPath = (
      prev: { x: number; y: number },
      next: { x: number; y: number },
      target: Pillar
    ) => {
      const prevX = roundCoord(prev.x);
      const prevY = roundCoord(prev.y);
      const nextX = roundCoord(next.x);
      const nextY = roundCoord(next.y);
      const tgtX = roundCoord(target.x);
      const tgtY = roundCoord(target.y);

      if (prevX === nextX && prevY === nextY) return false;

      if (moveAllowX && !moveAllowY) {
        if (prevY !== nextY || tgtY !== prevY) return false;
        const minX = Math.min(prevX, nextX);
        const maxX = Math.max(prevX, nextX);
        return tgtX >= minX && tgtX <= maxX;
      }

      if (moveAllowY && !moveAllowX) {
        if (prevX !== nextX || tgtX !== prevX) return false;
        const minY = Math.min(prevY, nextY);
        const maxY = Math.max(prevY, nextY);
        return tgtY >= minY && tgtY <= maxY;
      }

      const dx = roundCoord(nextX - prevX);
      const dy = roundCoord(nextY - prevY);
      const vx = roundCoord(tgtX - prevX);
      const vy = roundCoord(tgtY - prevY);
      const cross = roundCoord(vx * dy - vy * dx);
      if (cross !== 0) return false;
      const dot = vx * dx + vy * dy;
      if (dot < 0) return false;
      const lenSq = dx * dx + dy * dy;
      if (dot > lenSq) return false;
      return true;
    };

    order.forEach((movedId) => {
      const prev = prevPositions.get(movedId);
      const next = nextPositions.get(movedId);
      if (!prev || !next) return;
      pillarList.forEach((p) => {
        if (p.id === movedId) return;
        if (movedIds.has(p.id)) return;
        if (remap.has(p.id)) return;
        if (!crossesOnPath(prev, next, p)) return;
        const existing = remap.get(p.id);
        if (existing && movedId !== primaryMovedId) return;
        remap.set(p.id, movedId);
      });
    });

    if (remap.size === 0) {
      return { pillars: pillarList, beams: beamList, movedIds };
    }

    const remappedBeams = beamList
      .map((b) => {
        const startId = remap.get(b.startId) ?? b.startId;
        const endId = remap.get(b.endId) ?? b.endId;
        if (startId === b.startId && endId === b.endId) return b;
        return { ...b, startId, endId };
      })
      .filter((b) => b.startId !== b.endId);

    const seen = new Set<string>();
    const uniqueBeams: Beam[] = [];
    remappedBeams.forEach((b) => {
      const a = Math.min(b.startId, b.endId);
      const c = Math.max(b.startId, b.endId);
      const k = `${a}|${c}`;
      if (seen.has(k)) return;
      seen.add(k);
      uniqueBeams.push(b);
    });

    const nextPillars = pillarList.filter((p) => !remap.has(p.id));
    const nextMoved = new Set(
      Array.from(movedIds).map((id) => remap.get(id) ?? id)
    );
    return { pillars: nextPillars, beams: uniqueBeams, movedIds: nextMoved };
  };

  const mergeOverlappingPillars = (
    pillarList: Pillar[],
    beamList: Beam[],
    movedIds: Set<number>,
    primaryMovedId: number | null
  ) => {
    const groups = new Map<string, Pillar[]>();
    const posKey = (x: number, y: number) => `${coordKey(x)}|${coordKey(y)}`;
    pillarList.forEach((p) => {
      const k = posKey(p.x, p.y);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    });

    const remap = new Map<number, number>();
    groups.forEach((group) => {
      if (group.length < 2) return;
      let winner: Pillar | undefined;
      if (primaryMovedId != null) {
        winner = group.find((p) => p.id === primaryMovedId);
      }
      if (!winner) {
        const movedGroup = group.filter((p) => movedIds.has(p.id));
        if (movedGroup.length) {
          winner = movedGroup.sort((a, b) => a.id - b.id)[movedGroup.length - 1];
        }
      }
      if (!winner) winner = group[0];
      group.forEach((p) => {
        if (p.id !== winner!.id) remap.set(p.id, winner!.id);
      });
    });

    if (remap.size === 0) {
      return { pillars: pillarList, beams: beamList, movedIds };
    }

    const remappedBeams = beamList
      .map((b) => {
        const startId = remap.get(b.startId) ?? b.startId;
        const endId = remap.get(b.endId) ?? b.endId;
        if (startId === b.startId && endId === b.endId) return b;
        return { ...b, startId, endId };
      })
      .filter((b) => b.startId !== b.endId);

    const seen = new Set<string>();
    const uniqueBeams: Beam[] = [];
    remappedBeams.forEach((b) => {
      const a = Math.min(b.startId, b.endId);
      const c = Math.max(b.startId, b.endId);
      const k = `${a}|${c}`;
      if (seen.has(k)) return;
      seen.add(k);
      uniqueBeams.push(b);
    });

    const nextPillars = pillarList.filter((p) => !remap.has(p.id));
    const nextMoved = new Set(
      Array.from(movedIds).map((id) => remap.get(id) ?? id)
    );

    return { pillars: nextPillars, beams: uniqueBeams, movedIds: nextMoved };
  };

  const deletePillar = (id: number) => {
  setPillars((prev) => {
    const next = prev.filter((p) => p.id !== id);
    cleanupOrphanBeams(next);
    return next;
  });
  setSelectedPillarId((prev) => (prev === id ? null : prev));
  setSelectedPillarIds((prev) => prev.filter((pid) => pid !== id));
};

const deleteSelectedBeam = () => {
  if (selectedBeamId == null) return;
  setBeams((prev) => prev.filter((b) => b.id !== selectedBeamId));
  setSelectedBeamId(null);
  setSelectedBeamSegment(null);
};

const clearAllBeams = () => {
  setBeams([]);
  setSelectedBeamId(null);
  setSelectedBeamSegment(null);
};

const clearAllPillars = () => {
  setPillars([]);
  setSelectedPillarId(null);
  setSelectedPillarIds([]);
  setBeams([]);
  setSelectedBeamId(null);
  setSelectedBeamSegment(null);
  setMoveSelection({ start: null, current: null });
};

const applyBeamEdits = () => {
  if (selectedBeamId == null) return;
  setBeams((prev) =>
    prev.map((b) =>
      b.id === selectedBeamId
        ? { ...b, width: editBeamWidth, height: editBeamHeight }
        : b
    )
  );
};

const handlePillarClick = (id: number) => {
  if (deleteMode) {
    deletePillar(id);
    return;
  }
  if (moveMode) {
    setSelectedPillarIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
    setSelectedPillarId(id);
    setSelectedBeamId(null);
    setSelectedBeamSegment(null);
    return;
  }
  setSelectedPillarId(id);
  setSelectedPillarIds([id]);
  setSelectedBeamId(null);
  setSelectedBeamSegment(null);
};

const handlePillarPointerDown = (pillar: Pillar, e: any) => {
  if (!moveMode || e?.nativeEvent?.buttons !== 1) return;
  const ids = new Set<number>(selectedPillarIds);
  if (selectedPillarId != null) ids.add(selectedPillarId);
  ids.add(pillar.id);
  const idsArr = Array.from(ids);
  setSelectedPillarIds(idsArr);
  setSelectedPillarId(pillar.id);
  const origins = new Map<number, { x: number; y: number }>();
  pillars.forEach((pp) => {
    if (ids.has(pp.id)) origins.set(pp.id, { x: pp.x, y: pp.y });
  });
  dragPrevPositionsRef.current = new Map(origins);
  const p = e.point;
  setDragInitialPositions(origins);
  setDragStartPoint({ x: p.x, y: p.y, z: p.z });
  setIsDraggingPillars(true);
  setMoveSelection({ start: null, current: null });
};

const handleBeamClick = (item: Beam | BeamSegment) => {
  const beamId = "beamId" in item ? item.beamId : item.id;
  setSelectedBeamId(beamId);
  setSelectedBeamSegment("beamId" in item ? item : null);
  setSelectedPillarId(null);
  setSelectedPillarIds([]);
  const beam = beams.find((b) => b.id === beamId);
  if (beam) {
    setEditBeamWidth(beam.width);
    setEditBeamHeight(beam.height);
  }
};

  const movePillarsBy = (dx: number, dy: number) => {
    const adjDx = moveAllowX ? dx : 0;
    const adjDy = moveAllowY ? dy : 0;
    const targets = new Set<number>(selectedPillarIds);
    if (selectedPillarId != null) targets.add(selectedPillarId);
    if (targets.size === 0) return;

    const prevPositions = new Map<number, { x: number; y: number }>();
    pillars.forEach((p) => {
      if (targets.has(p.id)) prevPositions.set(p.id, { x: p.x, y: p.y });
    });

    const newPillars = pillars.map((p) =>
      targets.has(p.id) ? { ...p, x: p.x + adjDx, y: p.y + adjDy } : p
    );
    const nextPositions = new Map<number, { x: number; y: number }>();
    newPillars.forEach((p) => {
      if (targets.has(p.id)) nextPositions.set(p.id, { x: p.x, y: p.y });
    });

    const recalculated = refreshBeamsFromAnchors(beams, newPillars).filter(
      (b) => beamHasPillar(b, newPillars)
    );

    const absorbed = absorbPassedPillars(
      newPillars,
      recalculated,
      targets,
      prevPositions,
      nextPositions,
      selectedPillarId
    );

    const merged = mergeOverlappingPillars(
      absorbed.pillars,
      absorbed.beams,
      absorbed.movedIds,
      selectedPillarId
    );
    const mergedBeams = refreshBeamsFromAnchors(
      merged.beams,
      merged.pillars
    ).filter((b) => beamHasPillar(b, merged.pillars));

    const affectedBeams = mergedBeams.filter(
      (b) => merged.movedIds.has(b.startId) || merged.movedIds.has(b.endId)
    );
    const adjusted = recalcPillarsForMove(
      merged.pillars,
      affectedBeams,
      mergedBeams
    );
    const cleaned = pruneAutoOrphans(adjusted, mergedBeams);
    setPillars(cleaned);
    setBeams(refreshBeamsFromAnchors(mergedBeams, cleaned));
  };

const applyDragDelta = (
  dx: number,
  dy: number,
  origins: Map<number, { x: number; y: number }>
) => {
  const adjDx = moveAllowX ? dx : 0;
  const adjDy = moveAllowY ? dy : 0;
  const targets = new Set<number>(Array.from(origins.keys()));
  const prevPositions =
    dragPrevPositionsRef.current.size > 0
      ? dragPrevPositionsRef.current
      : new Map(origins);
  const newPillars = pillars.map((p) => {
    const origin = origins.get(p.id);
    if (!origin) return p;
    return { ...p, x: origin.x + adjDx, y: origin.y + adjDy };
  });
  const nextPositions = new Map<number, { x: number; y: number }>();
  newPillars.forEach((p) => {
    if (targets.has(p.id)) nextPositions.set(p.id, { x: p.x, y: p.y });
  });

  const newBeams = refreshBeamsFromAnchors(beams, newPillars).filter((b) =>
    beamHasPillar(b, newPillars)
  );

  const absorbed = absorbPassedPillars(
    newPillars,
    newBeams,
    targets,
    prevPositions,
    nextPositions,
    selectedPillarId
  );

  const merged = mergeOverlappingPillars(
    absorbed.pillars,
    absorbed.beams,
    absorbed.movedIds,
    selectedPillarId
  );
  const mergedBeams = refreshBeamsFromAnchors(
    merged.beams,
    merged.pillars
  ).filter((b) => beamHasPillar(b, merged.pillars));

  const affectedBeams = mergedBeams.filter(
    (b) => merged.movedIds.has(b.startId) || merged.movedIds.has(b.endId)
  );
  const adjusted = recalcPillarsForMove(
    merged.pillars,
    affectedBeams,
    mergedBeams
  );
  const cleaned = pruneAutoOrphans(adjusted, mergedBeams);
  setPillars(cleaned);
  setBeams(refreshBeamsFromAnchors(mergedBeams, cleaned));
  const nextPrev = new Map<number, { x: number; y: number }>();
  merged.movedIds.forEach((id) => {
    const p = cleaned.find((pp) => pp.id === id);
    if (p) nextPrev.set(id, { x: p.x, y: p.y });
  });
  dragPrevPositionsRef.current = nextPrev;
};

  const handlePlaneClick = (p: Point3, e?: any) => {
  if (
    moveMode &&
    (selectedPillarIds.length > 0 || selectedPillarId != null) &&
    e?.nativeEvent?.buttons === 1
  ) {
    const ids = new Set<number>([...selectedPillarIds]);
    if (selectedPillarId != null) ids.add(selectedPillarId);
    const origins = new Map<number, { x: number; y: number }>();
    pillars.forEach((pp) => {
      if (ids.has(pp.id)) origins.set(pp.id, { x: pp.x, y: pp.y });
    });
    dragPrevPositionsRef.current = new Map(origins);
    setDragInitialPositions(origins);
    setDragStartPoint(p);
    setIsDraggingPillars(true);
    setMoveSelection({ start: null, current: null });
    return;
  }
  const anyMode =
    drawRectBeamMode ||
    drawPolylineMode ||
    drawBeamMode ||
    insertMode ||
    measureMode ||
    deleteMode;
  if (!anyMode && !moveMode) {
    setSelectedBeamId(null);
    setSelectedPillarId(null);
    setSelectedPillarIds([]);
    setSelectedBeamSegment(null);
    setMoveSelection({ start: null, current: null });
  }

  if (moveMode) {
    if (!moveSelection.start) {
      setMoveSelection({ start: p, current: p });
    } else {
      const xMin = Math.min(moveSelection.start.x, p.x);
      const xMax = Math.max(moveSelection.start.x, p.x);
      const yMin = Math.min(moveSelection.start.y, p.y);
      const yMax = Math.max(moveSelection.start.y, p.y);
      const ids = pillars
        .filter(
          (pp) =>
            pp.x >= xMin && pp.x <= xMax && pp.y >= yMin && pp.y <= yMax
        )
        .map((pp) => pp.id);
      setSelectedPillarIds(ids);
      setSelectedPillarId(ids[0] ?? null);
      setMoveSelection({ start: null, current: null });
    }
    return;
  }
    
    // 0) MODO RETÂNGULO DE VIGAS (2 cliques = cantos opostos)
    if (drawRectBeamMode) {
      setSelectedBeamId(null);
      setSelectedPillarId(null);
      setSelectedBeamSegment(null);
      setSelectedPillarId(null);

      if (!rectTempStart) {
        // primeiro canto
        const snapped = snapToPillarPoint(p);
        setRectTempStart(snapped);
      } else {
        // segundo canto -> cria os 4 lados de vigas
        const snapped = snapToPillarPoint(p);
        const xMin = Math.min(rectTempStart.x, snapped.x);
        const xMax = Math.max(rectTempStart.x, snapped.x);
        const yMin = Math.min(rectTempStart.y, snapped.y);
        const yMax = Math.max(rectTempStart.y, snapped.y);

        const pA: Point3 = { x: xMin, y: yMin, z: 0 };
        const pB: Point3 = { x: xMax, y: yMin, z: 0 };
        const pC: Point3 = { x: xMax, y: yMax, z: 0 };
        const pD: Point3 = { x: xMin, y: yMax, z: 0 };

        let curP = [...pillars];
        let curB = [...beams];
        const addEdge = (pa: Point3, pb: Point3) => {
          const res = applyAddBeamBetween(pa, pb, curP, curB);
          curP = res.pillars;
          curB = res.beams;
        };

        addEdge(pA, pB);
        addEdge(pB, pC);
        addEdge(pC, pD);
        addEdge(pD, pA);

        const enforced = enforceAutoPillars(curP, curB);
        const refreshed = refreshBeamsFromAnchors(curB, enforced);
        setPillars(enforced);
        setBeams(refreshed);

        generateGridInsidePolygon([pA, pB, pC, pD], enforced, refreshed);

        setRectTempStart(null);
        setDrawRectBeamMode(false); // desativa modo após fechar retângulo
      }
      return;
    }

    // 0.5) MODO POLILINHA DE VIGAS (cada clique conecta com o anterior)
    if (drawPolylineMode) {
      setSelectedBeamId(null);
      setSelectedBeamSegment(null);

      setPolyPoints((prev) => {
        const snapped = snapToPillarPoint(p);
        if (prev.length === 0) {
          return [snapped];
        } else {
          const last = prev[prev.length - 1];
          addBeamBetween(last, snapped);
          return [...prev, snapped];
        }
      });
      return;
    }

    // 1) MODO DESENHAR VIGA (2 cliques)

    if (drawBeamMode) {
      setSelectedBeamId(null); // desmarca qualquer viga selecionada
      setSelectedPillarId(null);
      setSelectedBeamSegment(null);

      if (!beamTempStart) {
        // primeiro clique: guarda in?cio
        const snapped = snapToPillarPoint(p);
        setBeamTempStart(snapped);
      } else {
        // segundo clique: cria viga e limpa in?cio
        let end = snapToPillarPoint(p);
        if (drawAxisLock === "x") {
          end = { ...end, x: beamTempStart.x };
        } else if (drawAxisLock === "y") {
          end = { ...end, y: beamTempStart.y };
        }
        addBeamBetween(beamTempStart, end);
        setBeamTempStart(null);
      }
      return;
    }

    // 2) MODO INSERIR PILAR
    if (insertMode) {
      addPillarAt(p.x, p.y);
      return;
    }

    // 3) MODO MEDIR
    if (!measureMode) return;

    setMeasurePoints((prev) => {
      const updated = [...prev, p];
      if (updated.length === 2) {
        const [p1, p2] = updated;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        setLastMeasurement({ p1, p2, dist: d });
        return [];
      }
      return updated;
    });
  };

  const handlePlaneMove = (p: Point3, e?: any) => {
    if (moveMode && moveSelection.start && !isDraggingPillars) {
      setMoveSelection({ start: moveSelection.start, current: p });
    }
    if (!moveMode || !isDraggingPillars || !dragStartPoint) return;
    if (e?.nativeEvent?.buttons !== 1) return;
    const dx = p.x - dragStartPoint.x;
    const dy = p.y - dragStartPoint.y;
    applyDragDelta(dx, dy, dragInitialPositions);
  };

  const handlePlaneUp = () => {
    if (!isDraggingPillars) return;
    setIsDraggingPillars(false);
    setDragStartPoint(null);
    setDragInitialPositions(new Map());
    dragPrevPositionsRef.current = new Map();
  };


  const clearMeasurement = () => {
    setMeasurePoints([]);
    setLastMeasurement(null);
  };

  const selectedBeam = selectedBeamId
    ? beams.find((b) => b.id === selectedBeamId) || null
    : null;
  const selectedPillar = selectedPillarId
    ? pillars.find((p) => p.id === selectedPillarId) || null
    : null;

  const getBeamAlignedPillars = (beam: Beam) => {
    const { x1, y1, x2, y2 } = beam;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return null;

    const ux = dx / len;
    const uy = dy / len;
    const tolPerp = 0.05; // tolerância transversal (m)
    const margin = 0.05; // margem longitudinal (m)

    const candidates = pillars
      .map((p) => {
        const vx = p.x - x1;
        const vy = p.y - y1;
        const t = vx * ux + vy * uy; // projeção ao longo da viga
        const perp = Math.abs(vx * -uy + vy * ux); // dist. perpendicular
        return { p, t, perp };
      })
      .filter(
        (c) => c.perp <= tolPerp && c.t >= -margin && c.t <= len + margin
      )
      .sort((a, b) => a.t - b.t);

    return { len, points: candidates };
  };

  const getBeamPillarSpan = (beam: Beam) => {
    const data = getBeamAlignedPillars(beam);
    if (!data) return null;
    const { points } = data;
    if (points.length >= 2) {
      const start = points[0];
      const end = points[points.length - 1];
      return { start: start.p, end: end.p, span: end.t - start.t };
    }
    return null;
  };

  const splitBeamIntoSegments = (beam: Beam): BeamSegment[] => {
    const data = getBeamAlignedPillars(beam);
    if (!data || data.points.length < 2) {
      return [
        {
          id: `${beam.id}-0`,
          beamId: beam.id,
          x1: beam.x1,
          y1: beam.y1,
          x2: beam.x2,
          y2: beam.y2,
          width: beam.width,
          height: beam.height,
        },
      ];
    }

    const { points, len } = data;
    const segments: BeamSegment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const t1 = Math.max(a.t, 0);
      const t2 = Math.min(b.t, len);
      if (t2 - t1 < 1e-4) continue;

      const segLen = t2 - t1;
      const segHeight = segLen / 10; // regra h = vão/10 aplicada ao trecho

      const seg: BeamSegment = {
        id: `${beam.id}-${i}`,
        beamId: beam.id,
        x1: beam.x1 + (beam.x2 - beam.x1) * (t1 / len),
        y1: beam.y1 + (beam.y2 - beam.y1) * (t1 / len),
        x2: beam.x1 + (beam.x2 - beam.x1) * (t2 / len),
        y2: beam.y1 + (beam.y2 - beam.y1) * (t2 / len),
        width: beam.width,
        height: segHeight,
      };
      segments.push(seg);
    }

    if (segments.length === 0) {
      return [
        {
          id: `${beam.id}-0`,
          beamId: beam.id,
          x1: beam.x1,
          y1: beam.y1,
          x2: beam.x2,
          y2: beam.y2,
          width: beam.width,
          height:
            Math.sqrt(
              (beam.x2 - beam.x1) * (beam.x2 - beam.x1) +
                (beam.y2 - beam.y1) * (beam.y2 - beam.y1)
            ) / 10,
        },
      ];
    }

    return segments;
  };

  const beamInfo =
    selectedBeam &&
    (() => {
      const base = beams.find((b) => b.id === selectedBeamId);
      const seg = selectedBeamSegment;
      const source =
        seg ||
        (base && {
          x1: base.x1,
          y1: base.y1,
          x2: base.x2,
          y2: base.y2,
          width: base.width,
          height: base.height,
        });
      if (!source) return null;

      const dx = source.x2 - source.x1;
      const dy = source.y2 - source.y1;
      const span = Math.sqrt(dx * dx + dy * dy);
      const spanPillars = seg
        ? { span }
        : base
        ? getBeamPillarSpan(base)
        : null;

      return {
        span,
        dx,
        dy,
        width: source.width,
        height: source.height,
        spanPillars,
      };
    })();

  const selectionRect =
    moveMode && moveSelection.start && moveSelection.current
      ? (() => {
          const xMin = Math.min(moveSelection.start.x, moveSelection.current.x);
          const xMax = Math.max(moveSelection.start.x, moveSelection.current.x);
          const yMin = Math.min(moveSelection.start.y, moveSelection.current.y);
          const yMax = Math.max(moveSelection.start.y, moveSelection.current.y);
          return {
            xMin,
            xMax,
            yMin,
            yMax,
            width: xMax - xMin,
            height: yMax - yMin,
            center: {
              x: (xMin + xMax) / 2,
              y: (yMin + yMax) / 2,
              z: 0.01,
            },
          };
        })()
      : null;

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      {/* PAINEL LATERAL */}
      <div
        style={{
          width: 260,
          padding: 12,
          borderRight: "1px solid #333",
          background: "#111",
          color: "#f5f5f5",
          overflowY: "auto",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 18,
          }}
        >
          ☰
          <span style={{ marginLeft: 8 }}>Painel</span>
        </div>

        {/* SEÇÃO PDF */}
        <div
          style={{
            marginBottom: 8,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #333",
          }}
        >
          <button
            onClick={() => setActivePanel("pdf")}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              background:
                activePanel === "pdf" ? "#ff0080" : "rgba(255,255,255,0.04)",
              color: activePanel === "pdf" ? "#fff" : "#eee",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            📄 Projeto (PDF)
          </button>

          {activePanel === "pdf" && (
            <div
              style={{ padding: "10px 10px 12px 10px", background: "#181818" }}
            >
              <label style={{ display: "block", marginBottom: 10 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  Arquivo PDF da planta:
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  style={{ marginTop: 4, width: "100%" }}
                />
              </label>

              {loading && (
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  Carregando PDF…
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Escala:</span>
                <div style={{ marginTop: 4 }}>
                  1 :
                  <input
                    type="number"
                    value={scaleDenominator}
                    onChange={(e) =>
                      setScaleDenominator(Number(e.target.value))
                    }
                    style={{
                      width: 80,
                      marginLeft: 4,
                      background: "#111",
                      color: "#fff",
                      border: "1px solid #333",
                      borderRadius: 4,
                      padding: "2px 4px",
                    }}
                  />
                </div>
              </div>

              {/* vista 3D x top (atalho) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Vista:</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button
                    onClick={() => setViewMode("3d")}
                    style={{
                      flex: 1,
                      padding: 6,
                      borderRadius: 4,
                      border: "none",
                      cursor: "pointer",
                      background:
                        viewMode === "3d"
                          ? "#0077ff"
                          : "rgba(255,255,255,0.08)",
                      color: "#fff",
                      fontSize: 12,
                    }}
                  >
                    3D
                  </button>
                  <button
                    onClick={() => setViewMode("top")}
                    style={{
                      flex: 1,
                      padding: 6,
                      borderRadius: 4,
                      border: "none",
                      cursor: "pointer",
                      background:
                        viewMode === "top"
                          ? "#00aa66"
                          : "rgba(255,255,255,0.08)",
                      color: "#fff",
                      fontSize: 12,
                    }}
                  >
                    Planta (TOP)
                  </button>
                </div>
              </div>

              {/* medição */}
              <div style={{ marginBottom: 8 }}>
                <button
                  onClick={() => {
                    setMeasureMode((v) => !v);
                    setInsertMode(false);
                    setDeleteMode(false);
                    setMoveMode(false);
                    setMoveSelection({ start: null, current: null });
                  }}
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: measureMode ? "#ffdd00" : "#444",
                    color: "#fff",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {measureMode
                    ? "🔎 Medindo (clique em 2 pontos)"
                    : "📏 Medir distância"}
                </button>

                <button
                  onClick={clearMeasurement}
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "1px solid #555",
                    cursor: "pointer",
                    background: "#222",
                    color: "#ccc",
                    fontSize: 12,
                  }}
                >
                  Limpar medição
                </button>
              </div>

              <button
                onClick={() => {
                  setViewMode("3d");
                  setResetToken((t) => t + 1);
                }}
                style={{
                  width: "100%",
                  padding: 6,
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  background: "#0077ff",
                  color: "#fff",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                🔄 Resetar vista 3D
              </button>
            </div>
          )}
        </div>

       {/* SEÇÃO ELEMENTOS (PILARES + VIGAS) */}
        <div
          style={{
            marginBottom: 8,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #333",
          }}
        >
          <button
            onClick={() => setActivePanel("pillars")}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              background:
                activePanel === "pillars"
                  ? "#ff0080"
                  : "rgba(255,255,255,0.04)",
              color: activePanel === "pillars" ? "#fff" : "#eee",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            🧱 ELEMENTOS
          </button>

          {activePanel === "pillars" && (
            <div
              style={{ padding: "10px 10px 12px 10px", background: "#181818" }}
            >
              {/* ---------- PILARES ---------- */}
              <div style={{ marginBottom: 10, fontSize: 13 }}>
                <div style={{ marginBottom: 4, opacity: 0.8 }}>Tipo de pilar:</div>
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="tipoPilar"
                    value="retangular"
                    checked={pillarType === "retangular"}
                    onChange={() => setPillarType("retangular")}
                  />{" "}
                  Retangular
                </label>
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="tipoPilar"
                    value="circular"
                    checked={pillarType === "circular"}
                    onChange={() => setPillarType("circular")}
                  />{" "}
                  Circular
                </label>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Altura (m):</div>
                <input
                  type="number"
                  value={pillarHeight}
                  onChange={(e) => setPillarHeight(Number(e.target.value))}
                  style={{
                    width: "100%",
                    background: "#111",
                    color: "#fff",
                    border: "1px solid #333",
                    borderRadius: 4,
                    padding: "2px 4px",
                    marginTop: 4,
                  }}
                />
              </div>

              {pillarType === "retangular" && (
                <div style={{ marginBottom: 10, fontSize: 13 }}>
                  <div style={{ marginBottom: 4, opacity: 0.8 }}>
                    Dimensões (m):
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    Largura:
                    <input
                      type="number"
                      value={pillarWidth}
                      onChange={(e) => setPillarWidth(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 4,
                        padding: "2px 4px",
                        marginTop: 2,
                      }}
                    />
                  </div>
                  <div>
                    Comprimento:
                    <input
                      type="number"
                      value={pillarLength}
                      onChange={(e) => setPillarLength(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 4,
                        padding: "2px 4px",
                        marginTop: 2,
                      }}
                    />
                  </div>
                </div>
              )}

              {pillarType === "circular" && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Diâmetro (m):</div>
                  <input
                    type="number"
                    value={pillarDiameter}
                    onChange={(e) =>
                      setPillarDiameter(Number(e.target.value))
                    }
                    style={{
                      width: "100%",
                      background: "#111",
                      color: "#fff",
                      border: "1px solid #333",
                      borderRadius: 4,
                      padding: "2px 4px",
                      marginTop: 4,
                    }}
                  />
                </div>
              )}

              <div style={{ marginBottom: 10, fontSize: 13 }}>
                <div style={{ marginBottom: 4, opacity: 0.8 }}>
                  Alinhamento dos próximos pilares:
                </div>
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="alignMode"
                    value="livre"
                    checked={alignMode === "livre"}
                    onChange={() => setAlignMode("livre")}
                  />{" "}
                  Livre
                </label>
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="alignMode"
                    value="horizontal"
                    checked={alignMode === "horizontal"}
                    onChange={() => setAlignMode("horizontal")}
                  />{" "}
                  Horizontal (mesmo Y do último)
                </label>
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="alignMode"
                    value="vertical"
                    checked={alignMode === "vertical"}
                    onChange={() => setAlignMode("vertical")}
                  />{" "}
                  Vertical (mesmo X do último)
                </label>
              </div>

              <button
                onClick={() => {
                  setInsertMode((v) => {
                    const novo = !v;
                    if (novo) setViewMode("top");
                    return novo;
                  });
                  setMeasureMode(false);
                  setDeleteMode(false);
                  setMoveMode(false);
                  setMoveSelection({ start: null, current: null });
                }}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  background: insertMode ? "#ffddaa" : "#0077ff",
                  color: insertMode ? "#333" : "#fff",
                  fontSize: 13,
                  marginTop: 4,
                  marginBottom: 6,
                }}
              >
                {insertMode
                  ? "Clique no PDF para inserir pilar"
                  : "➕ Inserir Pilar (clicando no PDF)"}
              </button>

              <button
                onClick={() => {
                  setDeleteMode((v) => !v);
                  setInsertMode(false);
                  setMeasureMode(false);
                  setMoveMode(false);
                  setMoveSelection({ start: null, current: null });
                }}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  background: deleteMode ? "#ff6666" : "#772222",
                  color: "#fff",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {deleteMode
                  ? "🗑️ Clique em um pilar para apagar"
                  : "🗑️ Apagar Pilar"}
              </button>

              {/* ---------- VIGAS ---------- */}
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid #333",
                  fontSize: 13,
                }}
              >
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Vigas:</div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Vão máximo entre pilares:
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11 }}>Direção X (m):</div>
                      <input
                        type="number"
                        step="0.1"
                        value={maxSpanX}
                        onChange={(e) => setMaxSpanX(Number(e.target.value))}
                        style={{
                          width: "100%",
                          background: "#111",
                          color: "#fff",
                          border: "1px solid #333",
                          borderRadius: 4,
                          padding: "2px 4px",
                          marginTop: 2,
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11 }}>Direção Y (m):</div>
                      <input
                        type="number"
                        step="0.1"
                        value={maxSpanY}
                        onChange={(e) => setMaxSpanY(Number(e.target.value))}
                        style={{
                          width: "100%",
                          background: "#111",
                          color: "#fff",
                          border: "1px solid #333",
                          borderRadius: 4,
                          padding: "2px 4px",
                          marginTop: 2,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Trava de eixo (modo desenhar viga):
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <input
                        type="radio"
                        name="drawAxisLock"
                        value="none"
                        checked={drawAxisLock === "none"}
                        onChange={() => setDrawAxisLock("none")}
                      />
                      Livre
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <input
                        type="radio"
                        name="drawAxisLock"
                        value="x"
                        checked={drawAxisLock === "x"}
                        onChange={() => setDrawAxisLock("x")}
                      />
                      Travar X
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <input
                        type="radio"
                        name="drawAxisLock"
                        value="y"
                        checked={drawAxisLock === "y"}
                        onChange={() => setDrawAxisLock("y")}
                      />
                      Travar Y
                    </label>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const novo = !drawBeamMode;
                    setDrawBeamMode(novo);
                    setDrawRectBeamMode(false);
                    setDrawPolylineMode(false);
                    setBeamTempStart(null);
                    setRectTempStart(null);
                    setPolyPoints([]);
                    setInsertMode(false);
                    setMeasureMode(false);
                    setDeleteMode(false);
                    setMoveMode(false);
                    setMoveSelection({ start: null, current: null });
                  }}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: drawBeamMode ? "#ffddaa" : "#0055aa",
                    color: drawBeamMode ? "#333" : "#fff",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {drawBeamMode
                    ? "Clique em 2 pontos no PDF para criar viga"
                    : "➕ Desenhar Viga (2 cliques no PDF)"}
                </button>

                <button
                  onClick={() => {
                    const novo = !drawRectBeamMode;
                    setDrawRectBeamMode(novo);
                    setDrawBeamMode(false);
                    setDrawPolylineMode(false);
                    setBeamTempStart(null);
                    setRectTempStart(null);
                    setPolyPoints([]);
                    setInsertMode(false);
                    setMeasureMode(false);
                    setDeleteMode(false);
                    setMoveMode(false);
                    setMoveSelection({ start: null, current: null });
                  }}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: drawRectBeamMode ? "#ffddaa" : "#004488",
                    color: drawRectBeamMode ? "#333" : "#fff",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {drawRectBeamMode
                    ? "Clique em 2 cantos para criar retângulo de vigas"
                    : "⬛ Retângulo de vigas (perímetro)"}
                </button>

                <button
                  onClick={() => {
                    const novo = !drawPolylineMode;
                    setDrawPolylineMode(novo);
                    setDrawBeamMode(false);
                    setDrawRectBeamMode(false);
                    setBeamTempStart(null);
                    setRectTempStart(null);
                    setPolyPoints([]);
                    setInsertMode(false);
                    setMeasureMode(false);
                    setDeleteMode(false);
                    setMoveMode(false);
                    setMoveSelection({ start: null, current: null });
                  }}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: drawPolylineMode ? "#ffddaa" : "#3366aa",
                    color: drawPolylineMode ? "#333" : "#fff",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {drawPolylineMode
                    ? "Clique nos vértices da polilinha de vigas"
                    : "〰️ Polilinha de vigas"}
                </button>

                {beamTempStart && drawBeamMode && (
                  <div
                    style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}
                  >
                    Primeiro ponto da viga definido. Clique no segundo ponto.
                  </div>
                )}

                {rectTempStart && drawRectBeamMode && (
                  <div
                    style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}
                  >
                    Primeiro canto do retângulo definido. Clique no canto oposto.
                  </div>
                )}

                {drawPolylineMode && polyPoints.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.8,
                        marginBottom: 4,
                      }}
                    >
                      Polilinha em andamento. Clique em novos pontos para
                      continuar.
                    </div>
                    <button
                      onClick={finalizePolyline}
                      style={{
                        width: "100%",
                        padding: 6,
                        borderRadius: 4,
                        border: "1px solid #555",
                        cursor: "pointer",
                        background: "#222",
                        color: "#ccc",
                        fontSize: 12,
                      }}
                    >
                      Finalizar polilinha
                    </button>
                  </>
                )}

                {selectedBeamId != null && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 8,
                      borderRadius: 4,
                      background: "#111",
                      border: "1px solid #333",
                    }}
                  >
                    <div style={{ marginBottom: 6, opacity: 0.85 }}>
                      Editar viga selecionada:
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 12 }}>Largura (m): </span>
                      <input
                        type="number"
                        step="0.01"
                        value={editBeamWidth}
                        onChange={(e) =>
                          setEditBeamWidth(Number(e.target.value))
                        }
                        style={{
                          width: "100%",
                          background: "#111",
                          color: "#fff",
                          border: "1px solid #333",
                          borderRadius: 4,
                          padding: "2px 4px",
                          marginTop: 2,
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 12 }}>Altura (m): </span>
                      <input
                        type="number"
                        step="0.01"
                        value={editBeamHeight}
                        onChange={(e) =>
                          setEditBeamHeight(Number(e.target.value))
                        }
                        style={{
                          width: "100%",
                          background: "#111",
                          color: "#fff",
                          border: "1px solid #333",
                          borderRadius: 4,
                          padding: "2px 4px",
                          marginTop: 2,
                        }}
                      />
                    </div>

                    <button
                      onClick={applyBeamEdits}
                      style={{
                        width: "100%",
                        padding: 6,
                        borderRadius: 4,
                        border: "none",
                        cursor: "pointer",
                        background: "#00aa66",
                        color: "#fff",
                        fontSize: 12,
                      }}
                    >
                      Aplicar alterações na viga
                    </button>
                  </div>
                )}
              </div>
              {/* fim vigas */}
            </div>
          )}
        </div>

        {/* SE€ÇO MODIFICAR */}
        <div
          style={{
            marginBottom: 8,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #333",
          }}
        >
          <button
            onClick={() => setActivePanel("modify")}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              background:
                activePanel === "modify"
                  ? "#ff0080"
                  : "rgba(255,255,255,0.04)",
              color: activePanel === "modify" ? "#fff" : "#eee",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ✏️ Modificar
          </button>

          {activePanel === "modify" && (
            <div
              style={{ padding: "10px 10px 12px 10px", background: "#181818" }}
            >
              <div
                style={{
                  marginBottom: 12,
                  padding: 8,
                  borderRadius: 6,
                  background: "#111",
                  border: "1px solid #333",
                }}
              >
                <div style={{ marginBottom: 6, opacity: 0.85 }}>
                  Mover pilares
                </div>
                <button
                  onClick={() => {
                    const next = !moveMode;
                    setMoveMode(next);
                    if (next) {
                      setDrawBeamMode(false);
                      setDrawRectBeamMode(false);
                      setDrawPolylineMode(false);
                      setInsertMode(false);
                      setMeasureMode(false);
                      setDeleteMode(false);
                      setBeamTempStart(null);
                      setRectTempStart(null);
                      setPolyPoints([]);
                      setSelectedBeamId(null);
                      setSelectedBeamSegment(null);
                    } else {
                      setMoveSelection({ start: null, current: null });
                      setIsDraggingPillars(false);
                      setDragStartPoint(null);
                      setDragInitialPositions(new Map());
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: moveMode ? "#ffddaa" : "#225577",
                    color: moveMode ? "#333" : "#fff",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {moveMode
                    ? "Selecione pilares (clique ou retangulo)"
                    : "Modo mover pilares"}
                </button>
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.8,
                    marginBottom: 6,
                    lineHeight: "16px",
                  }}
                >
                  No modo mover, clique em pilares para selecionar ou clique
                  duas vezes na planta para criar um retangulo de selecao. Depois
                  aplique um deslocamento.
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={moveAllowX}
                      onChange={(e) => setMoveAllowX(e.target.checked)}
                    />
                    Deslocamento em X
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={moveAllowY}
                      onChange={(e) => setMoveAllowY(e.target.checked)}
                    />
                    Deslocamento em Y
                  </label>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11 }}>Delta X (m)</div>
                    <input
                      type="number"
                      step="0.01"
                      value={moveDx}
                      onChange={(e) => setMoveDx(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 4,
                        padding: "2px 4px",
                        marginTop: 2,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11 }}>Delta Y (m)</div>
                    <input
                      type="number"
                      step="0.01"
                      value={moveDy}
                      onChange={(e) => setMoveDy(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 4,
                        padding: "2px 4px",
                        marginTop: 2,
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => movePillarsBy(moveDx, moveDy)}
                  disabled={
                    selectedPillarIds.length === 0 && selectedPillarId == null
                  }
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "none",
                    cursor:
                      selectedPillarIds.length === 0 && selectedPillarId == null
                        ? "not-allowed"
                        : "pointer",
                    background:
                      selectedPillarIds.length === 0 && selectedPillarId == null
                        ? "#555"
                        : "#008855",
                    color: "#fff",
                    fontSize: 12,
                  }}
                >
                  Aplicar deslocamento
                </button>
              </div>

              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 6,
                  background: "#111",
                  border: "1px solid #333",
                }}
              >
                <div style={{ marginBottom: 6, opacity: 0.85 }}>
                  Limpeza / apagar
                </div>
                <button
                  onClick={deleteSelectedBeam}
                  disabled={selectedBeamId == null}
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "none",
                    cursor: selectedBeamId == null ? "not-allowed" : "pointer",
                    background: selectedBeamId == null ? "#555" : "#884444",
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Apagar viga selecionada
                </button>
                <button
                  onClick={clearAllBeams}
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: "#aa5500",
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Apagar todas as vigas
                </button>
                <button
                  onClick={clearAllPillars}
                  style={{
                    width: "100%",
                    padding: 6,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: "#aa2200",
                    color: "#fff",
                    fontSize: 12,
                  }}
                >
                  Apagar todos os pilares
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CANVAS */}
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas>
          <PerspectiveCamera
            makeDefault={!isOrtho}
            position={[0, 0, 60]}
            fov={45}
          />
          <OrthographicCamera
            makeDefault={isOrtho}
            position={[0, 0, 100]}
            zoom={80}
            near={0.1}
            far={1000}
          />

          <ambientLight />
          <CameraController
            viewMode={viewMode}
            resetToken={resetToken}
            allowPan={!(moveMode && isDraggingPillars)}
          />

          {!pdf && <gridHelper args={[50, 50]} />}
          {!pdf && <axesHelper args={[10]} />}

          {pdf && (
            <PdfPlane
              pdf={pdf}
              scaleDenominator={scaleDenominator}
              onPlaneClick={handlePlaneClick}
              onPlaneMove={handlePlaneMove}
              onPlaneUp={handlePlaneUp}
              capturePointer={
                moveMode ||
                drawBeamMode ||
                drawRectBeamMode ||
                drawPolylineMode ||
                insertMode ||
                measureMode ||
                deleteMode
              }
            />
          )}

      {pillars.map((p) => (
      <PillarMesh
        key={p.id}
        pillar={p}
        isSelected={
          selectedPillarId === p.id || selectedPillarIds.includes(p.id)
        }
        onClick={() => handlePillarClick(p.id)}
        onPointerDown={(pillar, e) => handlePillarPointerDown(pillar, e)}
        onPointerMove={(point, e) => handlePlaneMove(point, e)}
        onPointerUp={handlePlaneUp}
      />
    ))}
      
      {beams.flatMap((b) => splitBeamIntoSegments(b)).map((seg) => (
        <BeamMesh
          key={seg.id}
          beam={seg}
          topZ={pillarHeight}          // topo da viga = topo do pilar
          isSelected={selectedBeamSegment?.id === seg.id}
          onClick={() => handleBeamClick(seg)}
        />
      ))}

      {selectionRect && (
        <group>
          <Line
            raycast={(_r: any, _i: any) => null}
            points={[
              [selectionRect.xMin, selectionRect.yMin, 0.05],
              [selectionRect.xMax, selectionRect.yMin, 0.05],
              [selectionRect.xMax, selectionRect.yMax, 0.05],
              [selectionRect.xMin, selectionRect.yMax, 0.05],
              [selectionRect.xMin, selectionRect.yMin, 0.05],
            ]}
            color="#00aaff"
            lineWidth={1}
            dashed
          />
          <mesh
            raycast={(_r: any, _i: any) => null}
            position={[selectionRect.center.x, selectionRect.center.y, selectionRect.center.z]}
          >
            <planeGeometry args={[Math.max(selectionRect.width, 0.0001), Math.max(selectionRect.height, 0.0001)]} />
            <meshBasicMaterial color="#00aaff" transparent opacity={0.15} />
          </mesh>
        </group>
      )}


          {lastMeasurement && (
            <DimensionLine
              p1={lastMeasurement.p1}
              p2={lastMeasurement.p2}
              dist={lastMeasurement.dist}
            />
          )}

          {/* CUBO DE VISTAS – versão que funcionou */}
          <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
            <group scale={[40, 40, 40]}>
              <ambientLight intensity={1.2} />
              <ViewCube viewMode={viewMode} setViewMode={setViewMode} />
            </group>
          </GizmoHelper>
        </Canvas>

                {(selectedPillar || selectedBeam) && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              minWidth: 220,
              maxWidth: 280,
              background: "rgba(0,0,0,0.8)",
              color: "#fff",
              border: "1px solid #444",
              borderRadius: 8,
              padding: 10,
              fontSize: 12,
              pointerEvents: "auto",
            }}
          >
            <button
              onClick={() => {
                setSelectedBeamId(null);
                setSelectedPillarId(null);
              }}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "1px solid #555",
                background: "#222",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: "18px",
                textAlign: "center",
              }}
            >
              x
            </button>
            {selectedPillar && (
              <div style={{ marginBottom: selectedBeam ? 10 : 0 }}>

                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  Pilar selecionado
                </div>
                <div>Tipo: {selectedPillar.type}</div>
                <div>Altura: {selectedPillar.height?.toFixed(2)} m</div>
                {selectedPillar.type === "retangular" ? (
                  <>
                    <div>Largura: {selectedPillar.width?.toFixed(2)} m</div>
                    <div>Comprimento: {selectedPillar.length?.toFixed(2)} m</div>
                  </>

                ) : (

                  <div>Diametro: {selectedPillar.diameter?.toFixed(2)} m</div>

                )}

                <div>

                  Posicao: ({selectedPillar.x.toFixed(2)}, {" "}

                  {selectedPillar.y.toFixed(2)})

                </div>

              </div>

            )}



            {selectedBeam && beamInfo && (

              <div>

                <div style={{ fontWeight: 700, marginBottom: 4 }}>

                  Viga selecionada

                </div>

                <div>Comprimento: {beamInfo.span.toFixed(3)} m</div>

                {beamInfo.spanPillars && (

                  <div>
                    Vao entre pilares: {beamInfo.spanPillars.span.toFixed(3)} m

                  </div>

                )}

                <div>dX: {beamInfo.dx.toFixed(3)} m</div>
                <div>dY: {beamInfo.dy.toFixed(3)} m</div>

                <div>Largura: {beamInfo.width.toFixed(3)} m</div>

                <div>Altura: {beamInfo.height.toFixed(3)} m</div>
              </div>

            )}

          </div>

        )}

      </div>

    </div>

  );

}



export default App;

