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

type PillarKind = "pre" | "auto" | "temp" | "anchor";
type PillarState = "active" | "suspended";
type AnchorRole = "free" | "support";

type Pillar = {
  id: number;
  type: "retangular" | "circular";
  x: number;
  y: number;
  height: number;
  width?: number;
  length?: number;
  diameter?: number;
  kind: PillarKind;
  state?: PillarState;
  homeX?: number;
  homeY?: number;
  moveClone?: boolean;
  cloneOfId?: number;
  suspendedBy?: number;
  hidden?: boolean;
  anchorRole?: AnchorRole;
};
type Beam = {
  id: number;
  startId: number;
  endId: number;
  originStartId?: number;
  originEndId?: number;
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

type MoveSession = {
  active: boolean;
  cloneMap: Map<number, number>;
  cloneOrigins: Map<number, number>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  prevClonePositions: Map<number, { x: number; y: number }>;
  fullBorderOriginals: Set<number>;
};


type OrthoView = "top" | "bottom" | "front" | "back" | "left" | "right";
type ViewMode = "3d" | OrthoView;

const POINT_TO_MM = 25.4 / 72;

const isPillarActive = (p: Pillar) => p.state !== "suspended";
const isMoveClone = (p: Pillar) => !!p.moveClone;
const isAutoLike = (p: Pillar) =>
  (p.kind === "auto" || p.kind === "temp") && !p.moveClone;
const isPrePillar = (p: Pillar) => p.kind === "pre";

const isVisiblePillar = (p: Pillar) => isPillarActive(p) && !p.hidden;

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
  isSupportSource,
  isSupportTarget,
}: {
  beam: Beam | BeamSegment;
  topZ: number; // n vel do topo da viga (igual topo dos pilares)
  onClick?: () => void;
  isSelected?: boolean;
  isSupportSource?: boolean;
  isSupportTarget?: boolean;
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

  const color = isSupportTarget
    ? "#22cc88"
    : isSupportSource
      ? "#ff8844"
      : isSelected
        ? "#ffcc00"
        : "#8888ff";

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
      <meshStandardMaterial color={color} />
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
  isHoverAnchor,
  isHoverSnap,
}: {
  pillar: Pillar;
  onClick?: () => void;
  onPointerDown?: (pillar: Pillar, e: any) => void;
  onPointerUp?: () => void;
  onPointerMove?: (p: Point3, e: any) => void;
  isSelected?: boolean;
  isHoverAnchor?: boolean;
  isHoverSnap?: boolean;
}) {
  if (!isPillarActive(pillar) || pillar.hidden) return null;
  const { x, y, type, width, length, diameter, height } = pillar;

  const h = height ?? 3;
  const baseZ = 0;
  const centerZ = baseZ + h / 2;

  const color = isSelected
    ? "#ffcc00"
    : isHoverAnchor
      ? "#ff5555"
      : isHoverSnap
        ? "#ffee55"
        : type === "retangular"
          ? "#ffaa33"
          : "#55ccff";

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
        <meshStandardMaterial color={color} />
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
      <meshStandardMaterial color={color} />
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
  const [beamTempStart, setBeamTempStart] = useState<{
    point: Point3;
    pillarId: number;
  } | null>(null);
  const [beamHoverPillarId, setBeamHoverPillarId] = useState<number | null>(null);
  const [beamCantileverMode, setBeamCantileverMode] = useState(false);
  const [supportBeamMode, setSupportBeamMode] = useState(false);
  const [supportSourceBeamId, setSupportSourceBeamId] = useState<number | null>(null);
  const [supportTargetBeamId, setSupportTargetBeamId] = useState<number | null>(null);
  const [supportAngleInput, setSupportAngleInput] = useState("");
  // modo retângulo de vigas (perímetro retangular)
  const [drawRectBeamMode, setDrawRectBeamMode] = useState(false);
  const [rectTempStart, setRectTempStart] = useState<Point3 | null>(null);

  // modo polilinha de vigas (perímetro qualquer)
  const [drawPolylineMode, setDrawPolylineMode] = useState(false);
  const [polyPoints, setPolyPoints] = useState<Point3[]>([]);
  const [polyPreviewPoint, setPolyPreviewPoint] = useState<Point3 | null>(null);
  const [polyHoverPillarId, setPolyHoverPillarId] = useState<number | null>(
    null
  );
  const [snapGuideX, setSnapGuideX] = useState<number | null>(null);
  const [snapGuideY, setSnapGuideY] = useState<number | null>(null);
  const [drawAxisLock, setDrawAxisLock] = useState<"none" | "x" | "y">("none");
  const snapPolylinePoint = (
    target: Point3,
    origin: Point3,
    guideX: number | null = snapGuideX,
    guideY: number | null = snapGuideY
  ) => {
    if (drawAxisLock === "x") {
      const y = guideY != null ? guideY : target.y;
      return { ...target, x: origin.x, y };
    }
    if (drawAxisLock === "y") {
      const x = guideX != null ? guideX : target.x;
      return { ...target, x, y: origin.y };
    }
    const dx = Math.abs(target.x - origin.x);
    const dy = Math.abs(target.y - origin.y);
    if (dx >= dy) {
      const x = guideX != null ? guideX : target.x;
      return { ...target, x, y: origin.y };
    }
    const y = guideY != null ? guideY : target.y;
    return { ...target, x: origin.x, y };
  };
  const finalizePolyline = (
    points: Point3[] = polyPoints,
    basePillars: Pillar[] = pillars,
    baseBeams: Beam[] = beams
  ) => {
    if (points.length < 2) {
      setPolyPoints([]);
      setDrawPolylineMode(false);
      setPolyPreviewPoint(null);
      setPolyHoverPillarId(null);
      cleanupOrphanBeams();
      return;
    }

    let curP = [...basePillars];
    let curB = [...baseBeams];

    let closedPoints = [...points];
    const first = closedPoints[0];
    let last = closedPoints[closedPoints.length - 1];
    const dist = Math.hypot(first.x - last.x, first.y - last.y);

    if (dist > 1e-6) {
      const aligned =
        Math.abs(first.x - last.x) < 1e-6 || Math.abs(first.y - last.y) < 1e-6;
      if (!aligned) {
        const prev =
          closedPoints.length >= 2
            ? closedPoints[closedPoints.length - 2]
            : null;
        const prevHorizontal =
          prev && Math.abs(prev.y - last.y) <= Math.abs(prev.x - last.x);
        const mid: Point3 = prevHorizontal
          ? { x: last.x, y: first.y, z: 0 }
          : { x: first.x, y: last.y, z: 0 };
        if (Math.hypot(mid.x - last.x, mid.y - last.y) > 1e-6) {
          const res = applyAddBeamBetween(last, mid, curP, curB, "pre");
          curP = res.pillars;
          curB = res.beams;
          closedPoints.push(mid);
          last = mid;
        }
      }
      const res = applyAddBeamBetween(last, first, curP, curB, "pre");
      curP = res.pillars;
      curB = res.beams;
    }

    if (points.length >= 3) {
      const polyPoints =
        dist <= 1e-6 ? closedPoints.slice(0, -1) : closedPoints;
      const filtered = filterOutsidePolygon(polyPoints, curP, curB);
      generateGridInsidePolygon(
        polyPoints,
        filtered.pillars,
        filtered.beams,
        "contour"
      );
      setPolyPoints([]);
      setDrawPolylineMode(false);
      setPolyPreviewPoint(null);
      setPolyHoverPillarId(null);
      return;
    }

    const enforced = enforceAutoPillars(curP, curB);
    const refreshed = refreshBeamsFromAnchors(curB, enforced);
    setPillars(enforced);
    setBeams(refreshed);
    setPolyPoints([]);
    setDrawPolylineMode(false);
    setPolyPreviewPoint(null);
    setPolyHoverPillarId(null);
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
const moveSessionRef = useRef<MoveSession | null>(null);
const isClearingRef = useRef(false);
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
  useEffect(() => {
    if (!drawPolylineMode) {
      setPolyPreviewPoint(null);
      setPolyHoverPillarId(null);
      setSnapGuideX(null);
      setSnapGuideY(null);
    }
  }, [drawPolylineMode]);

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

  function pointInPolygon(poly: Point3[], x: number, y: number) {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;

      const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
      const dot = (x - xi) * (x - xj) + (y - yi) * (y - yj);
      if (Math.abs(cross) < 1e-8 && dot <= 1e-8) {
        return true;
      }

      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function filterOutsidePolygon(
    poly: Point3[],
    basePillars: Pillar[],
    baseBeams: Beam[]
  ) {
    const keptPillars = basePillars.filter(
      (p) => !pointInPolygon(poly, p.x, p.y)
    );
    const keptIds = new Set(keptPillars.map((p) => p.id));
    const keptBeams = baseBeams.filter(
      (b) => keptIds.has(b.startId) && keptIds.has(b.endId)
    );
    return { pillars: keptPillars, beams: keptBeams };
  }

  const snapToPillarPoint = (p: Point3) => {
    const snapTol = 0.4; // 40 cm de raio para snap
    let best: Pillar | null = null;
    let bestD = Infinity;
    pillars.forEach((pl) => {
      if (!isVisiblePillar(pl)) return;
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

  const computeSnapGuides = (p: Point3) => {
    const active = pillars.filter(isVisiblePillar);
    if (active.length === 0) {
      return { x: null, y: null };
    }
    const snapTol = 0.25;
    let bestX: number | null = null;
    let bestY: number | null = null;
    let bestDx = snapTol + 1;
    let bestDy = snapTol + 1;
    active.forEach((pl) => {
      const dx = Math.abs(pl.x - p.x);
      if (dx <= snapTol && dx < bestDx) {
        bestDx = dx;
        bestX = pl.x;
      }
      const dy = Math.abs(pl.y - p.y);
      if (dy <= snapTol && dy < bestDy) {
        bestDy = dy;
        bestY = pl.y;
      }
    });
    return { x: bestX, y: bestY };
  };

  const snapToGuides = (p: Point3, guideX = snapGuideX, guideY = snapGuideY) => {
    const x = guideX != null ? guideX : p.x;
    const y = guideY != null ? guideY : p.y;
    return { ...p, x, y };
  };

  const ensurePrePillarAtPoint = (
    pt: Point3,
    basePillars: Pillar[] = pillars
  ) => {
    const snapTol = 0.4;
    const found = basePillars.find(
      (pl) => isVisiblePillar(pl) && Math.hypot(pl.x - pt.x, pl.y - pt.y) <= snapTol
    );
    if (found) return { pillars: basePillars, pillar: found };
    const created = addPillarDirect(pt.x, pt.y, "pre");
    return { pillars: [...basePillars, created], pillar: created };
  };

  const getNearestPillar = (p: Point3, tol = 0.4): Pillar | null => {
    let best: Pillar | null = null;
    let bestD = tol;
    pillars.forEach((pl) => {
      if (!isVisiblePillar(pl)) return;
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (d <= bestD) {
        best = pl;
        bestD = d;
      }
    });
    return best;
  };

  const getNearestAlignedPillar = (
    p: Point3,
    origin: Point3,
    tol = 0.4,
    axisTol = 0.05
  ): Pillar | null => {
    const lockX = Math.abs(p.x - origin.x) < 1e-6;
    const lockY = Math.abs(p.y - origin.y) < 1e-6;
    if (!lockX && !lockY) return getNearestPillar(p, tol);
    let best: Pillar | null = null;
    let bestD = tol;
    pillars.forEach((pl) => {
      if (!isVisiblePillar(pl)) return;
      if (lockX && Math.abs(pl.x - origin.x) > axisTol) return;
      if (lockY && Math.abs(pl.y - origin.y) > axisTol) return;
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (d <= bestD) {
        best = pl;
        bestD = d;
      }
    });
    return best;
  };

  const getPreviewSegmentPoints = (start: Point3, end: Point3) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [];
    const useX = Math.abs(dx) >= Math.abs(dy);
    const isDiagonal = Math.abs(dx) > 1e-6 && Math.abs(dy) > 1e-6;
    const maxSpan = isDiagonal
      ? Math.max(maxSpanX, maxSpanY)
      : useX
        ? maxSpanX
        : maxSpanY;
    if (maxSpan <= 0) return [];
    const ux = dx / len;
    const uy = dy / len;
    const points: Point3[] = [];
    for (let t = maxSpan; t < len - 1e-6; t += maxSpan) {
      points.push({ x: start.x + ux * t, y: start.y + uy * t, z: 0 });
    }
    return points;
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
    baseBeams: Beam[] = beams,
    createKind: PillarKind = "pre"
  ) => {
    const snapTol = 0.4;
    let working = [...basePillars];
    const findNear = (pt: Point3) =>
      working.find(
        (pl) =>
          isVisiblePillar(pl) &&
          Math.hypot(pl.x - pt.x, pl.y - pt.y) <= snapTol
      );

    const ensurePillar = (pt: Point3) => {
      const found = findNear(pt);
      if (found) return found;
      const created = addPillarDirect(pt.x, pt.y, createKind);
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
      originStartId: a.id,
      originEndId: b.id,
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

  const buildBeamBetweenPillars = (
    a: Pillar,
    b: Pillar,
    width = 0.15
  ): Beam | null => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy);
    if (span === 0) return null;
    return {
      id: Date.now() + Math.random(),
      startId: a.id,
      endId: b.id,
      originStartId: a.id,
      originEndId: b.id,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      width,
      height: span / 10,
    };
  };

  const applyAddBeamBetweenPillars = (
    a: Pillar,
    b: Pillar,
    basePillars: Pillar[] = pillars,
    baseBeams: Beam[] = beams
  ) => {
    if (a.id === b.id) return { pillars: basePillars, beams: baseBeams };
    const newBeam = buildBeamBetweenPillars(a, b);
    if (!newBeam) return { pillars: basePillars, beams: baseBeams };
    const exists = baseBeams.some(
      (bb) =>
        (bb.startId === newBeam.startId && bb.endId === newBeam.endId) ||
        (bb.startId === newBeam.endId && bb.endId === newBeam.startId)
    );
    const nextBeams = exists ? baseBeams : [...baseBeams, newBeam];
    const enforced = enforceAutoPillars(basePillars, nextBeams);
    const refreshed = refreshBeamsFromAnchors(nextBeams, enforced);
    return { pillars: enforced, beams: refreshed };
  };

  const handleBeamPointClick = (point: Point3) => {
    setSelectedBeamId(null);
    setSelectedPillarId(null);
    setSelectedBeamSegment(null);

    const snapped = snapToPillarPoint(point);
    const startPoint = beamTempStart?.point ?? null;
    let target = snapped;
    if (startPoint) {
      if (drawAxisLock === "x") {
        target = { ...target, x: startPoint.x };
      } else if (drawAxisLock === "y") {
        target = { ...target, y: startPoint.y };
      }
    }

    let curP = [...pillars];
    let curB = [...beams];

    const findNearest = (pt: Point3, includeHidden = false, tol = 0.4): Pillar | null => {
      let best: Pillar | null = null;
      let bestD = tol;
      curP.forEach((pl) => {
        if (!isPillarActive(pl)) return;
        if (!includeHidden && pl.hidden) return;
        const d = Math.hypot(pl.x - pt.x, pl.y - pt.y);
        if (d <= bestD) {
          best = pl;
          bestD = d;
        }
      });
      return best;
    };

    if (!beamTempStart) {
      const existing = findNearest(target, false);
      if (existing) {
        setBeamTempStart({
          point: { x: existing.x, y: existing.y, z: 0 },
          pillarId: existing.id,
        });
        return;
      }
      const created = addPillarDirect(target.x, target.y, "pre");
      curP.push(created);
      setPillars(curP);
      setBeamTempStart({
        point: { x: created.x, y: created.y, z: 0 },
        pillarId: created.id,
      });
      return;
    }

    let startPillar = curP.find((p) => p.id === beamTempStart.pillarId) ?? null;
    if (!startPillar) {
      const fallback = addPillarDirect(
        beamTempStart.point.x,
        beamTempStart.point.y,
        "pre"
      );
      curP.push(fallback);
      setPillars(curP);
      setBeamTempStart({
        point: { x: fallback.x, y: fallback.y, z: 0 },
        pillarId: fallback.id,
      });
      return;
    }

    const endPillar =
      findNearest(target, false) ??
      (() => {
        const created = beamCantileverMode
          ? buildAnchorPillar(target.x, target.y, "free")
          : addPillarDirect(target.x, target.y, "pre");
        curP.push(created);
        return created;
      })();

    const res = applyAddBeamBetweenPillars(startPillar, endPillar, curP, curB);
    setPillars(res.pillars);
    setBeams(res.beams);
    setBeamTempStart({
      point: { x: endPillar.x, y: endPillar.y, z: 0 },
      pillarId: endPillar.id,
    });
  };

  const getBeamEndpoints = (beam: Beam, map: Map<number, Pillar>) => {
    const startP = map.get(beam.startId) || null;
    const endP = map.get(beam.endId) || null;
    const start = startP
      ? { x: startP.x, y: startP.y, z: 0 }
      : { x: beam.x1, y: beam.y1, z: 0 };
    const end = endP
      ? { x: endP.x, y: endP.y, z: 0 }
      : { x: beam.x2, y: beam.y2, z: 0 };
    return { start, end, startP, endP };
  };

  const distancePointToSegment = (p: Point3, a: Point3, b: Point3) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq < 1e-9) return Math.hypot(wx, wy);
    let t = (wx * vx + wy * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * vx;
    const projY = a.y + t * vy;
    return Math.hypot(p.x - projX, p.y - projY);
  };

  const intersectLineWithSegment = (
    origin: Point3,
    dir: { x: number; y: number },
    a: Point3,
    b: Point3
  ) => {
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = dir.x * sy - dir.y * sx;
    if (Math.abs(denom) < 1e-8) return null;
    const dx = a.x - origin.x;
    const dy = a.y - origin.y;
    const t = (dx * sy - dy * sx) / denom;
    const u = (dx * dir.y - dy * dir.x) / denom;
    if (u < -1e-6 || u > 1 + 1e-6) return null;
    return { x: origin.x + t * dir.x, y: origin.y + t * dir.y, z: 0 };
  };

  const getSupportIntersection = (
    origin: Point3,
    supportStart: Point3,
    supportEnd: Point3,
    angleDeg: number | null
  ) => {
    const sdx = supportEnd.x - supportStart.x;
    const sdy = supportEnd.y - supportStart.y;
    const len = Math.hypot(sdx, sdy);
    if (len < 1e-6) return null;
    const baseAngle = Math.atan2(sdy, sdx);
    const candidates: { point: Point3; dist: number }[] = [];
    const addCandidate = (dir: { x: number; y: number }) => {
      const hit = intersectLineWithSegment(origin, dir, supportStart, supportEnd);
      if (!hit) return;
      const dist = Math.hypot(hit.x - origin.x, hit.y - origin.y);
      candidates.push({ point: hit, dist });
    };
    if (angleDeg != null && Math.abs(angleDeg) > 1e-6) {
      const rad = (Math.abs(angleDeg) * Math.PI) / 180;
      addCandidate({
        x: Math.cos(baseAngle + rad),
        y: Math.sin(baseAngle + rad),
      });
      addCandidate({
        x: Math.cos(baseAngle - rad),
        y: Math.sin(baseAngle - rad),
      });
    } else {
      addCandidate({ x: -sdy / len, y: sdx / len });
    }
    if (candidates.length === 0 && angleDeg != null) {
      addCandidate({ x: -sdy / len, y: sdx / len });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].point;
  };

  const ensureSupportAnchorAt = (
    pt: Point3,
    supportBeam: Beam,
    basePillars: Pillar[]
  ) => {
    const tol = 0.4;
    let anchor = basePillars.find(
      (p) =>
        isPillarActive(p) &&
        Math.hypot(p.x - pt.x, p.y - pt.y) <= tol &&
        isPillarOnBeam(p, supportBeam)
    );
    let next = basePillars;
    if (anchor) {
      if (anchor.hidden && anchor.anchorRole !== "support") {
        anchor = { ...anchor, anchorRole: "support" };
        next = basePillars.map((p) => (p.id === anchor!.id ? anchor! : p));
      }
      return { pillars: next, pillar: anchor };
    }
    const created = buildAnchorPillar(pt.x, pt.y, "support");
    return { pillars: [...basePillars, created], pillar: created };
  };

  const splitBeamAtAnchor = (
    beam: Beam,
    anchor: Pillar,
    beamList: Beam[],
    map: Map<number, Pillar>
  ) => {
    const data = getBeamEndpoints(beam, map);
    const start = data.start;
    const end = data.end;
    const tol = 1e-4;
    if (Math.hypot(start.x - anchor.x, start.y - anchor.y) <= tol) return beamList;
    if (Math.hypot(end.x - anchor.x, end.y - anchor.y) <= tol) return beamList;
    const startP = map.get(beam.startId);
    const endP = map.get(beam.endId);
    if (!startP || !endP) return beamList;
    const beamA = buildBeamBetweenPillars(startP, anchor, beam.width);
    const beamB = buildBeamBetweenPillars(anchor, endP, beam.width);
    if (!beamA || !beamB) return beamList;
    return beamList.filter((b) => b.id !== beam.id).concat([beamA, beamB]);
  };

  const applySupportBeamToBeam = () => {
    if (!supportBeamMode) return;
    if (supportSourceBeamId == null || supportTargetBeamId == null) return;
    if (supportSourceBeamId === supportTargetBeamId) return;

    let curP = [...pillars];
    let curB = [...beams];
    const source = curB.find((b) => b.id === supportSourceBeamId);
    const support = curB.find((b) => b.id === supportTargetBeamId);
    if (!source || !support) return;

    const map = buildPillarMap(curP);
    const sourceEnds = getBeamEndpoints(source, map);
    const supportEnds = getBeamEndpoints(support, map);
    const rawAngle = supportAngleInput.trim();
    const angleVal = rawAngle === "" ? null : Number(rawAngle);
    const angle = angleVal != null && isFinite(angleVal) ? angleVal : null;

    const distStart = distancePointToSegment(
      sourceEnds.start,
      supportEnds.start,
      supportEnds.end
    );
    const distEnd = distancePointToSegment(
      sourceEnds.end,
      supportEnds.start,
      supportEnds.end
    );
    const order: Array<"start" | "end"> =
      distStart <= distEnd ? ["start", "end"] : ["end", "start"];
    let chosen: { endKey: "start" | "end"; point: Point3 } | null = null;
    for (const endKey of order) {
      const origin = endKey === "start" ? sourceEnds.start : sourceEnds.end;
      const hit = getSupportIntersection(
        origin,
        supportEnds.start,
        supportEnds.end,
        angle
      );
      if (!hit) continue;
      chosen = { endKey, point: hit };
      break;
    }
    if (!chosen) return;

    const anchorRes = ensureSupportAnchorAt(chosen.point, support, curP);
    curP = anchorRes.pillars;
    const anchor = anchorRes.pillar;

    const mapAfterAnchor = buildPillarMap(curP);
    curB = splitBeamAtAnchor(support, anchor, curB, mapAfterAnchor);

    const startP = mapAfterAnchor.get(source.startId);
    const endP = mapAfterAnchor.get(source.endId);
    if (!startP || !endP) return;

    let nextSource: Beam;
    if (chosen.endKey === "start") {
      nextSource = {
        ...source,
        startId: anchor.id,
        originStartId: anchor.id,
      };
    } else {
      nextSource = {
        ...source,
        endId: anchor.id,
        originEndId: anchor.id,
      };
    }

    const newStart = chosen.endKey === "start" ? anchor : startP;
    const newEnd = chosen.endKey === "start" ? endP : anchor;
    const dx = newEnd.x - newStart.x;
    const dy = newEnd.y - newStart.y;
    const span = Math.hypot(dx, dy);
    nextSource = {
      ...nextSource,
      x1: newStart.x,
      y1: newStart.y,
      x2: newEnd.x,
      y2: newEnd.y,
      height: span / 10,
      originStartId: nextSource.startId,
      originEndId: nextSource.endId,
    };

    curB = curB.map((b) => (b.id === source.id ? nextSource : b));

    const enforced = enforceAutoPillars(curP, curB);
    const refreshed = refreshBeamsFromAnchors(curB, enforced);
    setPillars(enforced);
    setBeams(refreshed);
    setSupportSourceBeamId(null);
    setSupportTargetBeamId(null);
  };

  const generateGridInsidePolygon = (
    poly: Point3[],
    basePillars: Pillar[] = pillars,
    baseBeams: Beam[] = beams,
    gridMode: "regular" | "contour" = "regular"
  ) => {
    if (!poly || poly.length < 3) return;
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

    const xsBase = buildGridPositions(minX, maxX, maxSpanX);
    const ysBase = buildGridPositions(minY, maxY, maxSpanY);

    const mergePositions = (base: number[], extra: number[]) => {
      const tol = 1e-4;
      const all = [...base, ...extra].sort((a, b) => a - b);
      const merged: number[] = [];
      all.forEach((v) => {
        if (merged.length === 0 || Math.abs(v - merged[merged.length - 1]) > tol) {
          merged.push(v);
        }
      });
      return merged;
    };

    const { xs: xsMerged, ys: ysMerged } =
      gridMode === "contour"
        ? {
            xs: mergePositions(xsBase, poly.map((p) => p.x)),
            ys: mergePositions(ysBase, poly.map((p) => p.y)),
          }
        : { xs: xsBase, ys: ysBase };

    let curPillars = [...basePillars];
    let curBeams = [...baseBeams];

    const gridTol = 0.02;
    const key = (x: number, y: number) => `${x.toFixed(4)}|${y.toFixed(4)}`;
    const gridPillars = new Map<string, Pillar>();
    const ensurePreAt = (x: number, y: number) => {
      const found = curPillars.find(
        (pp) =>
          isVisiblePillar(pp) &&
          Math.hypot(pp.x - x, pp.y - y) <= gridTol &&
          pointInPolygon(poly, pp.x, pp.y)
      );
      if (found) {
        if (isAutoLike(found)) {
          found.kind = "pre";
          found.homeX = found.x;
          found.homeY = found.y;
        }
        return found;
      }
      const created = addPillarDirect(x, y, "pre");
      curPillars.push(created);
      return created;
    };

    xsMerged.forEach((x) => {
      ysMerged.forEach((y) => {
        if (!pointInPolygon(poly, x, y)) return;
        const k = key(x, y);
        if (gridPillars.has(k)) return;
        const pillar = ensurePreAt(x, y);
        gridPillars.set(k, pillar);
      });
    });

    const ensureBeam = (a: Pillar, b: Pillar) => {
      const exists = curBeams.some(
        (bb) =>
          (bb.startId === a.id && bb.endId === b.id) ||
          (bb.startId === b.id && bb.endId === a.id)
      );
      if (exists) return;
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      if (span < 1e-6) return;
      const width = 0.15;
      const height = span / 10;
      curBeams.push({
        id: Date.now() + Math.random(),
        startId: a.id,
        endId: b.id,
        originStartId: a.id,
        originEndId: b.id,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        width,
        height,
      });
    };

    ysMerged.forEach((y) => {
      for (let i = 0; i < xsMerged.length - 1; i++) {
        const x1 = xsMerged[i];
        const x2 = xsMerged[i + 1];
        const k1 = key(x1, y);
        const k2 = key(x2, y);
        const a = gridPillars.get(k1);
        const b = gridPillars.get(k2);
        if (!a || !b) continue;
        const mid = { x: (x1 + x2) / 2, y, z: 0 };
        if (!pointInPolygon(poly, mid.x, mid.y)) continue;
        ensureBeam(a, b);
      }
    });

    xsMerged.forEach((x) => {
      for (let j = 0; j < ysMerged.length - 1; j++) {
        const y1 = ysMerged[j];
        const y2 = ysMerged[j + 1];
        const k1 = key(x, y1);
        const k2 = key(x, y2);
        const a = gridPillars.get(k1);
        const b = gridPillars.get(k2);
        if (!a || !b) continue;
        const mid = { x, y: (y1 + y2) / 2, z: 0 };
        if (!pointInPolygon(poly, mid.x, mid.y)) continue;
        ensureBeam(a, b);
      }
    });

    const enforced = enforceAutoPillars(curPillars, curBeams);
    const refreshed = refreshBeamsFromAnchors(curBeams, enforced);
    setPillars(enforced);
    setBeams(refreshed);
  };

  const addPillarAt = (x: number, y: number) => {
    let newX = x;
    let newY = y;

    const last = [...pillars].reverse().find(isVisiblePillar);

    if (last && alignMode === "horizontal") {
      newY = last.y;
    } else if (last && alignMode === "vertical") {
      newX = last.x;
    }

    const base = buildPillar(newX, newY, "pre");

    setPillars((prev) => {
      const next = [...prev, base];
      return next;
    });
  };

  const buildPillar = (
    x: number,
    y: number,
    kind: PillarKind,
    state: PillarState = "active"
  ): Pillar => {
    const id = Date.now() + Math.random();
    const base: Pillar = {
      id,
      type: pillarType,
      x,
      y,
      height: pillarHeight,
      kind,
      state,
    };
    if (kind === "pre") {
      base.homeX = x;
      base.homeY = y;
    }
    if (pillarType === "retangular") {
      base.width = pillarWidth;
      base.length = pillarLength;
    } else {
      base.diameter = pillarDiameter;
    }
    return base;
  };

  const buildAnchorPillar = (
    x: number,
    y: number,
    role: AnchorRole
  ): Pillar => {
    const base = buildPillar(x, y, "anchor");
    return { ...base, hidden: true, anchorRole: role };
  };

  const addPillarDirect = (
    x: number,
    y: number,
    kind: PillarKind = "auto"
  ): Pillar => buildPillar(x, y, kind);

  const makeAutoPillar = (
    x: number,
    y: number,
    kind: PillarKind = "auto"
  ): Pillar => buildPillar(x, y, kind);

  // Insere pilares autom?ticos dividindo v?os acima do limite e removendo autos redundantes
  const enforceAutoPillars = (pillarList: Pillar[], beamList: Beam[]) => {
    const tolPerp = 0.02;
    const tolPos = 0.02;
    const pillarsWork: Pillar[] = [...pillarList];
    const key = (x: number, y: number) => `${x.toFixed(4)}|${y.toFixed(4)}`;

    const findAt = (x: number, y: number) =>
      pillarsWork.find(
        (p) => isPillarActive(p) && Math.hypot(p.x - x, p.y - y) <= tolPos
      );

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
      const isDiagonal = Math.abs(dx) > tolPos && Math.abs(dy) > tolPos;
      const maxSpan = isDiagonal
        ? Math.max(maxSpanX, maxSpanY)
        : useX
          ? maxSpanX
          : maxSpanY;
      if (maxSpan <= 0) return;
      const ux = dx / len;
      const uy = dy / len;

      const aligned: { t: number; auto: boolean }[] = [];
      pillarsWork.forEach((p) => {
        if (!isPillarActive(p)) return;
        const vx = p.x - b.x1;
        const vy = p.y - b.y1;
        const t = vx * ux + vy * uy;
        if (t < -tolPos || t > len + tolPos) return;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp <= tolPerp)
          aligned.push({
            t: Math.max(0, Math.min(len, t)),
            auto: isAutoLike(p),
          });
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
        if (!isAutoLike(p)) continue;
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
        if (!isPillarActive(p)) return;
        const vx = p.x - b.x1;
        const vy = p.y - b.y1;
        const t = vx * ux + vy * uy;
        if (t < -tolPos || t > len + tolPos) return;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp <= tolPerp) usedKeys.add(key(p.x, p.y));
      });
    });

    return pillarsWork.filter(
      (p) => !isAutoLike(p) || usedKeys.has(key(p.x, p.y))
    );
  };

  const roundCoord = (v: number) => Math.round(v * 10000) / 10000;
  const coordKey = (v: number) => roundCoord(v).toFixed(4);
  const getPillarHome = (p: Pillar) => ({
    x: p.homeX ?? p.x,
    y: p.homeY ?? p.y,
  });
  const crossesOnPath = (
    prev: { x: number; y: number },
    next: { x: number; y: number },
    target: { x: number; y: number }
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

  const ensureBeamOrigins = (beamList: Beam[]): Beam[] =>
    beamList.map((b) => ({
      ...b,
      originStartId: b.originStartId ?? b.startId,
      originEndId: b.originEndId ?? b.endId,
    }));

  const computeBounds = (pillarList: Pillar[]) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    pillarList.forEach((p) => {
      if (!isVisiblePillar(p)) return;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    if (!isFinite(minX)) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    return { minX, maxX, minY, maxY };
  };

  const computeFullBorderOriginals = (
    targetIds: number[],
    pillarList: Pillar[]
  ) => {
    const tol = 1e-3;
    const selected = new Set(targetIds);
    const base = pillarList.filter(
      (p) => isVisiblePillar(p) && !isAutoLike(p) && !isMoveClone(p)
    );
    if (base.length === 0) return new Set<number>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    base.forEach((p) => {
      const x = roundCoord(p.x);
      const y = roundCoord(p.y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    const collect = (match: (x: number, y: number) => boolean) =>
      base
        .filter((p) => match(roundCoord(p.x), roundCoord(p.y)))
        .map((p) => p.id);
    const borders = [
      collect((x) => Math.abs(x - minX) <= tol),
      collect((x) => Math.abs(x - maxX) <= tol),
      collect((_, y) => Math.abs(y - minY) <= tol),
      collect((_, y) => Math.abs(y - maxY) <= tol),
    ];
    const result = new Set<number>();
    borders.forEach((ids) => {
      if (ids.length === 0) return;
      const allSelected = ids.every((id) => selected.has(id));
      if (!allSelected) return;
      ids.forEach((id) => result.add(id));
    });
    return result;
  };

  const remapBeamsForSuspension = (
    beamList: Beam[],
    originalId: number,
    cloneId: number
  ) =>
    beamList.map((b) => {
      const originStartId = b.originStartId ?? b.startId;
      const originEndId = b.originEndId ?? b.endId;
      let startId = b.startId;
      let endId = b.endId;
      if (originStartId === originalId) startId = cloneId;
      if (originEndId === originalId) endId = cloneId;
      return {
        ...b,
        startId,
        endId,
        originStartId,
        originEndId,
      };
    });

  const getExpansionInfo = (
    original: Pillar,
    clone: Pillar,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    tol = 1e-4
  ) => {
    const home = getPillarHome(original);
    const onLeft = Math.abs(home.x - bounds.minX) <= tol;
    const onRight = Math.abs(home.x - bounds.maxX) <= tol;
    const onBottom = Math.abs(home.y - bounds.minY) <= tol;
    const onTop = Math.abs(home.y - bounds.maxY) <= tol;
    const expandX =
      (onLeft && clone.x < bounds.minX - tol) ||
      (onRight && clone.x > bounds.maxX + tol);
    const expandY =
      (onBottom && clone.y < bounds.minY - tol) ||
      (onTop && clone.y > bounds.maxY + tol);
    return {
      expanding: expandX || expandY,
      expandX,
      expandY,
      onLeft,
      onRight,
      onBottom,
      onTop,
    };
  };

  const ensureExpansionBeams = (
    beamList: Beam[],
    pillarList: Pillar[],
    session: MoveSession
  ) => {
    const byId = new Map<number, Pillar>(
      pillarList.map((p) => [p.id, p])
    );
    const beamKey = (a: number, b: number) =>
      `${Math.min(a, b)}|${Math.max(a, b)}`;
    const existing = new Set<string>(
      beamList.map((b) => beamKey(b.startId, b.endId))
    );
    const expansionSet = new Set<string>();
    const expansionPairs: Array<[number, number]> = [];
    const getNeighbors = (originalId: number) => {
      const neighbors = new Set<number>();
      beamList.forEach((b) => {
        const os = b.originStartId ?? b.startId;
        const oe = b.originEndId ?? b.endId;
        if (os === originalId) neighbors.add(oe);
        if (oe === originalId) neighbors.add(os);
      });
      return Array.from(neighbors);
    };

    let nextBeams = [...beamList];

    const markExpansion = (aId: number, bId: number) => {
      const key = beamKey(aId, bId);
      if (expansionSet.has(key)) return;
      expansionSet.add(key);
      expansionPairs.push([aId, bId]);
    };

    session.cloneMap.forEach((cloneId, originalId) => {
      const original = byId.get(originalId);
      const clone = byId.get(cloneId);
      if (!original || !clone) return;
      if (session.fullBorderOriginals?.has(originalId)) return;
      const info = getExpansionInfo(original, clone, session.bounds);
      if (!info.expanding) return;

      const addBeam = (aId: number, bId: number, isExpansion = false) => {
        if (aId === bId) return;
        const key = beamKey(aId, bId);
        if (isExpansion) markExpansion(aId, bId);
        if (existing.has(key)) return;
        const a = byId.get(aId);
        const c = byId.get(bId);
        if (!a || !c) return;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const span = Math.hypot(dx, dy);
        if (span < 1e-6) return;
        const width = 0.15;
        const height = span / 10;
        nextBeams.push({
          id: Date.now() + Math.random(),
          startId: aId,
          endId: bId,
          originStartId: aId,
          originEndId: bId,
          x1: a.x,
          y1: a.y,
          x2: c.x,
          y2: c.y,
          width,
          height,
        });
        existing.add(key);
      };

      addBeam(originalId, cloneId, true);

      const neighbors = getNeighbors(originalId);
      neighbors.forEach((neighborId) => {
        if (neighborId === cloneId) return;
        const neighborCloneId = session.cloneMap.get(neighborId);
        if (neighborCloneId != null) {
          addBeam(neighborCloneId, cloneId, true);
          return;
        }
        const neighbor = byId.get(neighborId);
        if (!neighbor || !isVisiblePillar(neighbor)) return;
        const neighborHome = getPillarHome(neighbor);
        const borderTol = 1e-3;
        const onSameBorder =
          (info.onLeft && Math.abs(neighborHome.x - session.bounds.minX) <= borderTol) ||
          (info.onRight && Math.abs(neighborHome.x - session.bounds.maxX) <= borderTol) ||
          (info.onBottom && Math.abs(neighborHome.y - session.bounds.minY) <= borderTol) ||
          (info.onTop && Math.abs(neighborHome.y - session.bounds.maxY) <= borderTol);
        if (onSameBorder) return;
        const dx = neighbor.x - original.x;
        const dy = neighbor.y - original.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        let use = false;
        if (info.expandX && !info.expandY) use = absDy >= absDx;
        else if (info.expandY && !info.expandX) use = absDx >= absDy;
        else use = absDx + absDy > 0;
        if (!use) return;
        addBeam(neighborId, cloneId, true);
      });
    });

    return { beams: nextBeams, expansionPairs };
  };

  const ensureExpansionAutoPillars = (
    pillarList: Pillar[],
    beamList: Beam[],
    expansionPairs: Array<[number, number]>
  ) => {
    if (expansionPairs.length === 0) return pillarList;
    const tolPos = 0.02;
    const beamKey = (a: number, b: number) =>
      `${Math.min(a, b)}|${Math.max(a, b)}`;
    const beamByKey = new Map<string, Beam>();
    beamList.forEach((b) => {
      beamByKey.set(beamKey(b.startId, b.endId), b);
    });
    const next = [...pillarList];
    const findAt = (x: number, y: number) =>
      next.find((p) => Math.hypot(p.x - x, p.y - y) <= tolPos);

    expansionPairs.forEach(([aId, bId]) => {
      const beam = beamByKey.get(beamKey(aId, bId));
      if (!beam) return;
      const dx = beam.x2 - beam.x1;
      const dy = beam.y2 - beam.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const useX = Math.abs(dx) >= Math.abs(dy);
      const isDiagonal = Math.abs(dx) > tolPos && Math.abs(dy) > tolPos;
      const maxSpan = isDiagonal
        ? Math.max(maxSpanX, maxSpanY)
        : useX
          ? maxSpanX
          : maxSpanY;
      if (maxSpan <= 0) return;
      const ux = dx / len;
      const uy = dy / len;
      for (let t = maxSpan; t < len - tolPos; t += maxSpan) {
        const x = beam.x1 + ux * t;
        const y = beam.y1 + uy * t;
        if (findAt(x, y)) continue;
        next.push(makeAutoPillar(x, y));
      }
    });

    return next;
  };

  const isPillarOnBeam = (
    p: Pillar,
    b: Beam,
    tolPos = 0.02,
    tolPerp = 0.02
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
    pillarList.filter((p) => !isAutoLike(p) || isPillarOnAnyBeam(p, beams));

  const recalcPillarsForMove = (
    pillarList: Pillar[],
    beamList: Beam[],
    allBeams: Beam[]
  ) => {
    const tolPerp = 0.02;
    const tolPos = 0.02;
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
      const isDiagonal = Math.abs(dx) > tolPos && Math.abs(dy) > tolPos;
      const maxSpan = isDiagonal
        ? Math.max(maxSpanX, maxSpanY)
        : useX
          ? maxSpanX
          : maxSpanY;
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
        if (!findAt(x, y)) next.push(makeAutoPillar(x, y, "temp"));
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
      return !isAutoLike(p);
    });
  };

  const restoreBeamAnchors = (beamList: Beam[], pillarList: Pillar[]) => {
    const activeIds = new Set(
      pillarList.filter(isPillarActive).map((p) => p.id)
    );
    return beamList.map((b) => {
        const originStartId = b.originStartId ?? b.startId;
        const originEndId = b.originEndId ?? b.endId;
        const startId = activeIds.has(originStartId)
          ? originStartId
          : b.startId;
        const endId = activeIds.has(originEndId) ? originEndId : b.endId;
        if (
          startId === b.startId &&
          endId === b.endId &&
          originStartId === b.originStartId &&
          originEndId === b.originEndId
        ) {
          return b;
        }
        return {
          ...b,
          startId,
          endId,
          originStartId,
          originEndId,
        };
      });
  };

  const restoreSuspendedPrePillars = (
    pillarList: Pillar[],
    beamList: Beam[],
    movedIds: Set<number>,
    options?: {
      restoreOnEmpty?: boolean;
      prevPositions?: Map<number, { x: number; y: number }>;
      nextPositions?: Map<number, { x: number; y: number }>;
      suspendedIds?: Set<number>;
    }
  ) => {
    const restoreOnEmpty = options?.restoreOnEmpty ?? false;
    const prevPositions = options?.prevPositions;
    const nextPositions = options?.nextPositions;
    const suspendedIds = options?.suspendedIds;
    const nextPillars = pillarList.map((p) => ({ ...p }));
    const posKey = (x: number, y: number) =>
      `${coordKey(x)}|${coordKey(y)}`;
    const byId = new Map<number, Pillar>(nextPillars.map((p) => [p.id, p]));
    const session = moveSessionRef.current;
    const cloneIds = new Set<number>(session?.cloneOrigins.keys() ?? []);
    const sourceOriginalIds = new Set<number>(session?.cloneMap.keys() ?? []);
    const activeByKey = new Map<string, Pillar>();
    const approachSuspendedBy = new Map<number, number>();
    const approachProtected = new Set<number>();
    const approachLineTol = 1e-3;

    const registerApproachSuspension = (cloneId: number, originalId: number) => {
      const clone = byId.get(cloneId);
      const original = byId.get(originalId);
      if (!clone || !original) return;
      const home = getPillarHome(original);
      const prev = prevPositions?.get(cloneId);
      const next = nextPositions?.get(cloneId) ?? { x: clone.x, y: clone.y };
      const stepDx = prev ? next.x - prev.x : 0;
      const stepDy = prev ? next.y - prev.y : 0;
      let axis: "x" | "y" | null = null;
      let dir = 0;
      if (moveAllowX && !moveAllowY) {
        axis = "x";
        dir = Math.sign(stepDx);
      } else if (moveAllowY && !moveAllowX) {
        axis = "y";
        dir = Math.sign(stepDy);
      } else if (Math.abs(stepDx) >= Math.abs(stepDy)) {
        axis = "x";
        dir = Math.sign(stepDx);
      } else {
        axis = "y";
        dir = Math.sign(stepDy);
      }
      if (!axis || dir === 0) {
        const dx = clone.x - home.x;
        const dy = clone.y - home.y;
        if (moveAllowX && !moveAllowY) {
          axis = "x";
          dir = Math.sign(dx);
        } else if (moveAllowY && !moveAllowX) {
          axis = "y";
          dir = Math.sign(dy);
        } else if (Math.abs(dx) >= Math.abs(dy)) {
          axis = "x";
          dir = Math.sign(dx);
        } else {
          axis = "y";
          dir = Math.sign(dy);
        }
      }
      if (!axis || dir === 0) return;
      const lineVal = axis === "x" ? home.y : home.x;
      const coord = axis === "x" ? clone.x : clone.y;
      const maxSpan = axis === "x" ? maxSpanX : maxSpanY;

      const candidates = nextPillars.filter((p) => {
        if (!isPrePillar(p)) return false;
        if (!isPillarActive(p)) return false;
        if (isAutoLike(p)) return false;
        if (isMoveClone(p)) return false;
        if (cloneIds.has(p.id) || sourceOriginalIds.has(p.id)) return false;
        const pHome = getPillarHome(p);
        if (axis === "x") return Math.abs(pHome.y - lineVal) <= approachLineTol;
        return Math.abs(pHome.x - lineVal) <= approachLineTol;
      });
      if (candidates.length === 0) return;
      candidates.sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));

      let first: Pillar | null = null;
      let second: Pillar | null = null;
      if (dir > 0) {
        const ahead = candidates.filter(
          (p) => (axis === "x" ? p.x : p.y) > coord + approachLineTol
        );
        if (ahead.length === 0) return;
        first = ahead[0];
        second = ahead[1] ?? null;
      } else {
        const behind = candidates.filter(
          (p) => (axis === "x" ? p.x : p.y) < coord - approachLineTol
        );
        if (behind.length === 0) return;
        first = behind[behind.length - 1];
        second = behind[behind.length - 2] ?? null;
      }

      if (!first) return;
      if (!second) {
        approachProtected.add(first.id);
        return;
      }
      const secondCoord = axis === "x" ? second.x : second.y;
      const span = Math.abs(secondCoord - coord);
      if (span < maxSpan - approachLineTol) {
        approachSuspendedBy.set(first.id, cloneId);
      } else {
        approachProtected.add(first.id);
      }
    };

    if (session) {
      session.cloneOrigins.forEach((originalId, cloneId) => {
        registerApproachSuspension(cloneId, originalId);
      });
    }

    nextPillars.forEach((p) => {
      if (!isVisiblePillar(p)) return;
      activeByKey.set(posKey(p.x, p.y), p);
    });

    const remap = new Map<number, number>();
    const removed = new Set<number>();
    const restoredIds = new Set<number>();

    nextPillars.forEach((p) => {
      if (!isPrePillar(p)) return;
      if (p.state !== "suspended") return;
      if (movedIds.has(p.id)) return;
      const home = getPillarHome(p);
      const key = posKey(home.x, home.y);
      const occupant = activeByKey.get(key);
      let crossed = false;
      if (prevPositions && nextPositions && !suspendedIds?.has(p.id)) {
        for (const [movedId, prev] of prevPositions) {
          const next = nextPositions.get(movedId);
          if (!next) continue;
          if (crossesOnPath(prev, next, home)) {
            crossed = true;
            break;
          }
        }
      }

      if (!occupant) {
        if (restoreOnEmpty || crossed) {
          p.x = home.x;
          p.y = home.y;
          p.state = "active";
          activeByKey.set(key, p);
          restoredIds.add(p.id);
        }
        return;
      }

      if (occupant.id === p.id) {
        p.state = "active";
        restoredIds.add(p.id);
        return;
      }

      if (isAutoLike(occupant)) {
        remap.set(occupant.id, p.id);
        removed.add(occupant.id);
        p.x = home.x;
        p.y = home.y;
        p.state = "active";
        activeByKey.set(key, p);
        restoredIds.add(p.id);
      }
    });

    let nextBeams = beamList;
    if (remap.size > 0) {
      const remappedBeams = beamList.map((b) => {
        const startId = remap.get(b.startId) ?? b.startId;
        const endId = remap.get(b.endId) ?? b.endId;
        if (startId === b.startId && endId === b.endId) return b;
        return { ...b, startId, endId };
      });

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
      nextBeams = uniqueBeams;
    }

    const filteredPillars =
      removed.size > 0
        ? nextPillars.filter((p) => !removed.has(p.id))
        : nextPillars;

    return { pillars: filteredPillars, beams: nextBeams, restoredIds };
  };

  const updateMovedPillarHomes = (
    pillarList: Pillar[],
    movedIds: Set<number>
  ) =>
    pillarList.map((p) => {
      if (!isPrePillar(p)) return p;
      if (!movedIds.has(p.id)) return p;
      if (!isPillarActive(p)) return p;
      return { ...p, homeX: p.x, homeY: p.y };
    });

  const normalizeTempPillars = (pillarList: Pillar[], beamList: Beam[]) =>
    pillarList
      .map((p) => {
        if (p.kind !== "temp") return p;
        if (!isPillarOnAnyBeam(p, beamList)) return null;
        return { ...p, kind: "auto" };
      })
      .filter((p): p is Pillar => p != null);

  const startMoveSession = (targetIds: Set<number>) => {
    if (moveSessionRef.current?.active) return moveSessionRef.current;
    const activeTargets = Array.from(targetIds).filter((id) => {
      const p = pillars.find((pp) => pp.id === id);
      return p && isVisiblePillar(p) && !isMoveClone(p);
    });
    if (activeTargets.length === 0) return null;

    const bounds = computeBounds(pillars);
    const fullBorderOriginals = computeFullBorderOriginals(
      activeTargets,
      pillars
    );
    let nextPillars = pillars.map((p) => ({ ...p }));
    let nextBeams = ensureBeamOrigins(beams);
    const cloneMap = new Map<number, number>();
    const cloneOrigins = new Map<number, number>();
    const prevClonePositions = new Map<number, { x: number; y: number }>();

    activeTargets.forEach((id) => {
      const index = nextPillars.findIndex((p) => p.id === id);
      if (index === -1) return;
      const original = nextPillars[index];
      const cloneId = Date.now() + Math.random();
      const clone: Pillar = {
        ...original,
        id: cloneId,
        kind: "temp",
        state: "active",
        moveClone: true,
        cloneOfId: original.id,
        homeX: undefined,
        homeY: undefined,
      };
      cloneMap.set(original.id, cloneId);
      cloneOrigins.set(cloneId, original.id);
      prevClonePositions.set(cloneId, { x: clone.x, y: clone.y });
      nextPillars[index] = {
        ...original,
        state: "suspended",
        suspendedBy: cloneId,
      };
      nextPillars.push(clone);
      nextBeams = remapBeamsForSuspension(nextBeams, original.id, cloneId);
    });

    if (cloneMap.size === 0) return null;

    moveSessionRef.current = {
      active: true,
      cloneMap,
      cloneOrigins,
      bounds,
      prevClonePositions,
      fullBorderOriginals,
    };
    setPillars(nextPillars);
    setBeams(nextBeams);
    const cloneIds = Array.from(cloneOrigins.keys());
    setSelectedPillarIds(cloneIds);
    setSelectedPillarId(cloneIds[0] ?? null);
    return moveSessionRef.current;
  };

  const applyMoveDeltaWithSession = (
    dx: number,
    dy: number,
    origins: Map<number, { x: number; y: number }>,
    finalize = false
  ) => {
    const session = moveSessionRef.current;
    if (!session || !session.active) return;
    const cloneIds = new Set<number>(session.cloneOrigins.keys());
    const sourceOriginalIds = new Set<number>(session.cloneMap.keys());
    const fullBorderOriginals = session.fullBorderOriginals;
    let nextPillars = pillars.map((p) => ({ ...p }));
    let nextBeams = ensureBeamOrigins(beams);
    const byId = new Map<number, Pillar>(
      nextPillars.map((p) => [p.id, p])
    );
    session.cloneOrigins.forEach((originalId, cloneId) => {
      if (byId.has(cloneId)) return;
      const original = byId.get(originalId);
      if (!original) return;
      const clone: Pillar = {
        ...original,
        id: cloneId,
        kind: "temp",
        state: "active",
        moveClone: true,
        cloneOfId: original.id,
        homeX: undefined,
        homeY: undefined,
      };
      nextPillars.push(clone);
      byId.set(cloneId, clone);
    });

    const prevPositions = new Map(session.prevClonePositions);
    const nextPositions = new Map<number, { x: number; y: number }>();
    const originPositions = new Map<number, { x: number; y: number }>();

    cloneIds.forEach((cloneId) => {
      const clone = byId.get(cloneId);
      if (!clone) return;
      const origin = origins.get(cloneId) ?? { x: clone.x, y: clone.y };
      originPositions.set(cloneId, origin);
      clone.x = origin.x + dx;
      clone.y = origin.y + dy;
      nextPositions.set(cloneId, { x: clone.x, y: clone.y });
    });

    session.cloneMap.forEach((cloneId, originalId) => {
      const original = byId.get(originalId);
      const clone = byId.get(cloneId);
      if (!original || !clone) return;
      if (fullBorderOriginals.has(originalId)) {
        if (original.state !== "suspended") {
          original.state = "suspended";
          nextBeams = remapBeamsForSuspension(nextBeams, original.id, clone.id);
        }
        original.suspendedBy = clone.id;
        return;
      }
      const info = getExpansionInfo(original, clone, session.bounds);
      if (info.expanding) {
        if (original.state === "suspended") original.state = "active";
        original.suspendedBy = undefined;
      } else {
        if (original.state !== "suspended") {
          original.state = "suspended";
          nextBeams = remapBeamsForSuspension(nextBeams, original.id, clone.id);
        }
        original.suspendedBy = clone.id;
      }
    });

    const passesTargetWithTolerance = (
      origin: { x: number; y: number },
      next: { x: number; y: number },
      target: { x: number; y: number }
    ) => {
      const tol = 0.05;
      const dx = next.x - origin.x;
      const dy = next.y - origin.y;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return false;
      const useX =
        (moveAllowX && !moveAllowY) ||
        (!(moveAllowY && !moveAllowX) && Math.abs(dx) >= Math.abs(dy));
      if (useX) {
        if (Math.abs(target.y - origin.y) > tol) return false;
        const minX = Math.min(origin.x, next.x) - tol;
        const maxX = Math.max(origin.x, next.x) + tol;
        return target.x >= minX && target.x <= maxX;
      }
      if (Math.abs(target.x - origin.x) > tol) return false;
      const minY = Math.min(origin.y, next.y) - tol;
      const maxY = Math.max(origin.y, next.y) + tol;
      return target.y >= minY && target.y <= maxY;
    };

    const findCoveringClone = (target: { x: number; y: number }) => {
      for (const cloneId of cloneIds) {
        const clone = byId.get(cloneId);
        if (!clone) continue;
        const origin =
          originPositions.get(cloneId) ??
          prevPositions.get(cloneId) ??
          { x: clone.x, y: clone.y };
        if (crossesOnPath(origin, { x: clone.x, y: clone.y }, target) ||
            passesTargetWithTolerance(origin, { x: clone.x, y: clone.y }, target)) {
          return cloneId;
        }
      }
      return null;
    };
    const shouldKeepPreForSpan = (pillar: Pillar, cloneId: number) => {
      if (!isPrePillar(pillar)) return false;
      const clone = byId.get(cloneId);
      if (!clone) return false;
      const tol = 1e-3;
      const home = getPillarHome(pillar);
      const lockX = moveAllowX && !moveAllowY;
      const lockY = moveAllowY && !moveAllowX;
      let axis: "x" | "y" | null = null;
      if (lockX) axis = "x";
      else if (lockY) axis = "y";
      else if (Math.abs(clone.y - home.y) <= tol) axis = "x";
      else if (Math.abs(clone.x - home.x) <= tol) axis = "y";
      if (!axis) return false;
      const maxSpan = axis === "x" ? maxSpanX : maxSpanY;
      const homeVal = axis === "x" ? home.x : home.y;
      const cloneVal = axis === "x" ? clone.x : clone.y;
      const dir = cloneVal > homeVal + tol ? 1 : cloneVal < homeVal - tol ? -1 : 0;
      if (dir === 0) return false;

      let neighbor: Pillar | null = null;
      nextPillars.forEach((other) => {
        if (other.id === pillar.id || other.id === cloneId) return;
        if (!isVisiblePillar(other)) return;
        if (isAutoLike(other)) return;
        const otherHome = getPillarHome(other);
        if (axis === "x") {
          if (Math.abs(otherHome.y - home.y) > tol) return;
          const val = other.x;
          if (dir > 0 && val > homeVal + tol) {
            if (!neighbor || val < neighbor.x) neighbor = other;
          } else if (dir < 0 && val < homeVal - tol) {
            if (!neighbor || val > neighbor.x) neighbor = other;
          }
          return;
        }
        if (Math.abs(otherHome.x - home.x) > tol) return;
        const val = other.y;
        if (dir > 0 && val > homeVal + tol) {
          if (!neighbor || val < neighbor.y) neighbor = other;
        } else if (dir < 0 && val < homeVal - tol) {
          if (!neighbor || val > neighbor.y) neighbor = other;
        }
      });

      if (!neighbor) return false;
      const neighborVal =
        axis === "x" ? (neighbor as Pillar).x : (neighbor as Pillar).y;
      const span = Math.abs(neighborVal - cloneVal);
      return span > maxSpan + tol;
    };
    void shouldKeepPreForSpan;


    const approachSuspendedBy = new Map<number, number>();
    const approachProtected = new Set<number>();
    const approachLineTol = 1e-3;

    const registerApproachSuspension = (cloneId: number, originalId: number) => {
      const clone = byId.get(cloneId);
      const original = byId.get(originalId);
      if (!clone || !original) return;
      const home = getPillarHome(original);
      const dx = clone.x - home.x;
      const dy = clone.y - home.y;
      let axis: "x" | "y" | null = null;
      let dir = 0;
      if (moveAllowX && !moveAllowY) {
        axis = "x";
        dir = Math.sign(dx);
      } else if (moveAllowY && !moveAllowX) {
        axis = "y";
        dir = Math.sign(dy);
      } else if (Math.abs(dx) >= Math.abs(dy)) {
        axis = "x";
        dir = Math.sign(dx);
      } else {
        axis = "y";
        dir = Math.sign(dy);
      }
      if (!axis || dir === 0) return;

      const lineVal = axis === "x" ? home.y : home.x;
      const coord = axis === "x" ? clone.x : clone.y;
      const maxSpan = axis === "x" ? maxSpanX : maxSpanY;

      const candidates = nextPillars.filter((p) => {
        if (!isPrePillar(p)) return false;
        if (!isPillarActive(p)) return false;
        if (isAutoLike(p)) return false;
        if (isMoveClone(p)) return false;
        if (cloneIds.has(p.id) || sourceOriginalIds.has(p.id)) return false;
        const pHome = getPillarHome(p);
        if (axis === "x") return Math.abs(pHome.y - lineVal) <= approachLineTol;
        return Math.abs(pHome.x - lineVal) <= approachLineTol;
      });
      if (candidates.length === 0) return;
      candidates.sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));

      let first: Pillar | null = null;
      let second: Pillar | null = null;
      if (dir > 0) {
        const ahead = candidates.filter(
          (p) => (axis === "x" ? p.x : p.y) > coord + approachLineTol
        );
        if (ahead.length === 0) return;
        first = ahead[0];
        second = ahead[1] ?? null;
      } else {
        const behind = candidates.filter(
          (p) => (axis === "x" ? p.x : p.y) < coord - approachLineTol
        );
        if (behind.length === 0) return;
        first = behind[behind.length - 1];
        second = behind[behind.length - 2] ?? null;
      }

      if (!first) return;
      if (!second) {
        approachProtected.add(first.id);
        return;
      }
      const secondCoord = axis === "x" ? second.x : second.y;
      const span = Math.abs(secondCoord - coord);
      if (span < maxSpan - approachLineTol) {
        approachSuspendedBy.set(first.id, cloneId);
      } else {
        approachProtected.add(first.id);
      }
    };

    if (session) {
      session.cloneOrigins.forEach((originalId, cloneId) => {
        registerApproachSuspension(cloneId, originalId);
      });
    }

    nextPillars.forEach((p) => {
      if (cloneIds.has(p.id) || sourceOriginalIds.has(p.id)) return;
      if (fullBorderOriginals.has(p.id)) return;
      if (isAutoLike(p)) return;
      const target = getPillarHome(p);
      const approachCloneId = approachSuspendedBy.get(p.id);
      if (approachCloneId != null) {
        if (p.state !== "suspended" || p.suspendedBy !== approachCloneId) {
          p.state = "suspended";
          p.suspendedBy = approachCloneId;
          nextBeams = remapBeamsForSuspension(
            nextBeams,
            p.id,
            approachCloneId
          );
        }
        return;
      }
      if (approachProtected.has(p.id)) {
        if (p.state !== "active") {
          p.state = "active";
          p.suspendedBy = undefined;
        }
        return;
      }
      const coveringCloneId = findCoveringClone(target);
      if (coveringCloneId != null) {
        if (p.state !== "suspended" || p.suspendedBy !== coveringCloneId) {
          p.state = "suspended";
          p.suspendedBy = coveringCloneId;
          nextBeams = remapBeamsForSuspension(
            nextBeams,
            p.id,
            coveringCloneId
          );
        }
      } else if (
        p.state === "suspended" &&
        p.suspendedBy != null &&
        cloneIds.has(p.suspendedBy)
      ) {
        p.state = "active";
        p.suspendedBy = undefined;
      }
    });

    nextBeams = restoreBeamAnchors(nextBeams, nextPillars);
    const expansionResult = ensureExpansionBeams(
      nextBeams,
      nextPillars,
      session
    );
    nextBeams = expansionResult.beams;
    const alignedBeams = refreshBeamsFromAnchors(nextBeams, nextPillars);
    const enforced = enforceAutoPillars(nextPillars, alignedBeams);
    const refreshed = refreshBeamsFromAnchors(alignedBeams, enforced);
    const cleaned = pruneAutoOrphans(enforced, refreshed);
    const expandedPillars = ensureExpansionAutoPillars(
      cleaned,
      refreshed,
      expansionResult.expansionPairs
    );

    setPillars(expandedPillars);
    setBeams(refreshed);
    session.prevClonePositions = nextPositions;

    if (finalize) {
      finalizeMoveSession(expandedPillars, refreshed);
    }
  };

  const finalizeMoveSession = (
    pillarList: Pillar[] = pillars,
    beamList: Beam[] = beams
  ) => {
    const session = moveSessionRef.current;
    if (!session || !session.active) return;
    let nextPillars = pillarList.map((p) => ({ ...p }));
    let nextBeams = ensureBeamOrigins(beamList);
    const byId = new Map<number, Pillar>(
      nextPillars.map((p) => [p.id, p])
    );
    const removeIds = new Set<number>();

    session.cloneMap.forEach((cloneId, originalId) => {
      const original = byId.get(originalId);
      const clone = byId.get(cloneId);
      if (!clone) return;

      const discardOriginal =
        session.fullBorderOriginals?.has(originalId) ?? false;
      if (discardOriginal || (original && original.state === "suspended")) {
        removeIds.add(originalId);
        clone.kind = "pre";
        clone.state = "active";
        clone.moveClone = false;
        clone.cloneOfId = undefined;
        clone.homeX = clone.x;
        clone.homeY = clone.y;
        nextBeams = nextBeams.map((b) => {
          const originStartId = b.originStartId ?? b.startId;
          const originEndId = b.originEndId ?? b.endId;
          let startId = b.startId;
          let endId = b.endId;
          const nextOriginStartId =
            originStartId === originalId ? cloneId : originStartId;
          const nextOriginEndId =
            originEndId === originalId ? cloneId : originEndId;
          if (startId === originalId) startId = cloneId;
          if (endId === originalId) endId = cloneId;
          return {
            ...b,
            startId,
            endId,
            originStartId: nextOriginStartId,
            originEndId: nextOriginEndId,
          };
        });
      } else {
        clone.kind = "pre";
        clone.state = "active";
        clone.moveClone = false;
        clone.cloneOfId = undefined;
        clone.homeX = clone.x;
        clone.homeY = clone.y;
      }
    });

    if (removeIds.size > 0) {
      nextPillars = nextPillars.filter((p) => !removeIds.has(p.id));
    }

    nextBeams = restoreBeamAnchors(nextBeams, nextPillars);
    const refreshed = refreshBeamsFromAnchors(nextBeams, nextPillars);
    setPillars(nextPillars);
    setBeams(refreshed);
    setSelectedPillarIds([]);
    setSelectedPillarId(null);
    moveSessionRef.current = null;
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
      return {
        pillars: pillarList,
        beams: beamList,
        movedIds,
        suspendedIds: new Set<number>(),
      };
    }

    const remap = new Map<number, number>();
    const order = Array.from(movedIds).filter((id) => id !== primaryMovedId);
    if (primaryMovedId != null && movedIds.has(primaryMovedId)) {
      order.push(primaryMovedId);
    }

    order.forEach((movedId) => {
      const prev = prevPositions.get(movedId);
      const next = nextPositions.get(movedId);
      if (!prev || !next) return;
      pillarList.forEach((p) => {
        if (!isVisiblePillar(p)) return;
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
      return {
        pillars: pillarList,
        beams: beamList,
        movedIds,
        suspendedIds: new Set<number>(),
      };
    }

    const remappedBeams = beamList.map((b) => {
      const startId = remap.get(b.startId) ?? b.startId;
      const endId = remap.get(b.endId) ?? b.endId;
      if (startId === b.startId && endId === b.endId) return b;
      return { ...b, startId, endId };
    });

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

    const suspendedIds = new Set<number>();
    const nextPillars = pillarList
      .map((p) => {
        if (!remap.has(p.id)) return p;
        if (isPrePillar(p)) {
          if (p.state === "suspended") return p;
          suspendedIds.add(p.id);
          return { ...p, state: "suspended" };
        }
        return null;
      })
      .filter((p): p is Pillar => p != null);
    const nextMoved = new Set(
      Array.from(movedIds).map((id) => remap.get(id) ?? id)
    );
    return {
      pillars: nextPillars,
      beams: uniqueBeams,
      movedIds: nextMoved,
      suspendedIds,
    };
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
      if (!isVisiblePillar(p)) return;
      const k = posKey(p.x, p.y);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    });

    const remap = new Map<number, number>();
    const suspend = new Set<number>();
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
      if (!winner) {
        const preGroup = group.filter((p) => isPrePillar(p));
        if (preGroup.length) winner = preGroup[0];
      }
      if (!winner) winner = group[0];
      group.forEach((p) => {
        if (p.id !== winner!.id) {
          remap.set(p.id, winner!.id);
          if (isPrePillar(p)) suspend.add(p.id);
        }
      });
    });

    if (remap.size === 0) {
      return { pillars: pillarList, beams: beamList, movedIds };
    }

    const remappedBeams = beamList.map((b) => {
      const startId = remap.get(b.startId) ?? b.startId;
      const endId = remap.get(b.endId) ?? b.endId;
      if (startId === b.startId && endId === b.endId) return b;
      return { ...b, startId, endId };
    });

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

    const nextPillars = pillarList
      .map((p) => {
        if (!remap.has(p.id)) return p;
        if (suspend.has(p.id)) return { ...p, state: "suspended" };
        return null;
      })
      .filter((p): p is Pillar => p != null);
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
  isClearingRef.current = true;
  moveSessionRef.current = null;
  setDrawBeamMode(false);
  setDrawRectBeamMode(false);
  setDrawPolylineMode(false);
  setBeamCantileverMode(false);
  setSupportBeamMode(false);
  setSupportSourceBeamId(null);
  setSupportTargetBeamId(null);
  setSupportAngleInput("");
  setBeamTempStart(null);
  setRectTempStart(null);
  setPolyPoints([]);
  setPolyPreviewPoint(null);
  setPolyHoverPillarId(null);
  setSnapGuideX(null);
  setSnapGuideY(null);
  setInsertMode(false);
  setDeleteMode(false);
  setMeasureMode(false);
  setPillars([]);
  setSelectedPillarId(null);
  setSelectedPillarIds([]);
  setBeams([]);
  setSelectedBeamId(null);
  setSelectedBeamSegment(null);
  setMoveSelection({ start: null, current: null });
  setMoveMode(false);
  setIsDraggingPillars(false);
  setDragStartPoint(null);
  setDragInitialPositions(new Map());
  dragPrevPositionsRef.current = new Map();
  setTimeout(() => {
    setPillars([]);
    setBeams([]);
    isClearingRef.current = false;
  }, 0);
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
  if (drawPolylineMode) {
    const pillar = pillars.find((p) => p.id === id && isVisiblePillar(p));
    if (!pillar) return;
    const anchor = { x: pillar.x, y: pillar.y, z: 0 };
    const points = [...polyPoints];
    if (points.length === 0) {
      setPolyPoints([anchor]);
      setPolyPreviewPoint(anchor);
      setPolyHoverPillarId(pillar.id);
      return;
    }
    const first = points[0];
    if (
      points.length >= 2 &&
      Math.hypot(anchor.x - first.x, anchor.y - first.y) < 1e-6
    ) {
      finalizePolyline(points, pillars, beams);
      return;
    }
    const last = points[points.length - 1];
    const aligned =
      Math.abs(anchor.x - last.x) < 1e-6 ||
      Math.abs(anchor.y - last.y) < 1e-6;
    if (!aligned) return;
    if (Math.hypot(anchor.x - last.x, anchor.y - last.y) < 1e-6) return;
    let curP = [...pillars];
    let curB = [...beams];
    const res = applyAddBeamBetween(last, anchor, curP, curB, "pre");
    curP = res.pillars;
    curB = res.beams;
    setPillars(curP);
    setBeams(curB);
    setPolyPoints([...points, anchor]);
    setPolyPreviewPoint(anchor);
    setPolyHoverPillarId(pillar.id);
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
  if (drawBeamMode) {
    const pillar = pillars.find((p) => p.id === id && isVisiblePillar(p));
    if (!pillar) return;
    handleBeamPointClick({ x: pillar.x, y: pillar.y, z: 0 });
    return;
  }
  setSelectedPillarId(id);
  setSelectedPillarIds([id]);
  setSelectedBeamId(null);
  setSelectedBeamSegment(null);
};
const handlePillarPointerDown = (pillar: Pillar, e: any) => {
  if (isClearingRef.current) return;
  if (supportBeamMode) return;
  if (!moveMode || e?.nativeEvent?.buttons !== 1) return;
  const activeIds = new Set(
    pillars.filter((p) => isVisiblePillar(p) && !isMoveClone(p)).map((p) => p.id)
  );
  const ids = new Set<number>(
    selectedPillarIds.filter((id) => activeIds.has(id))
  );
  if (selectedPillarId != null && activeIds.has(selectedPillarId))
    ids.add(selectedPillarId);
  ids.add(pillar.id);
  const session = startMoveSession(ids);
  if (!session) return;
  const origins = new Map<number, { x: number; y: number }>();
  session.cloneOrigins.forEach((_origId, cloneId) => {
    const clone = pillars.find((p) => p.id === cloneId);
    if (clone) {
      origins.set(cloneId, { x: clone.x, y: clone.y });
    } else {
      const prev = session.prevClonePositions.get(cloneId);
      if (prev) origins.set(cloneId, prev);
    }
  });
  dragPrevPositionsRef.current = new Map(origins);
  const point = e.point;
  setDragInitialPositions(origins);
  setDragStartPoint({ x: point.x, y: point.y, z: point.z });
  setIsDraggingPillars(true);
  setMoveSelection({ start: null, current: null });
};

  const handleBeamClick = (item: Beam | BeamSegment) => {
    const beamId = "beamId" in item ? item.beamId : item.id;
    if (supportBeamMode) {
      setSelectedBeamId(beamId);
      setSelectedBeamSegment(null);
      setSelectedPillarId(null);
      setSelectedPillarIds([]);
      if (supportSourceBeamId == null || beamId === supportSourceBeamId) {
        setSupportSourceBeamId(beamId);
        if (beamId === supportSourceBeamId) setSupportTargetBeamId(null);
      } else if (supportTargetBeamId == null || beamId === supportTargetBeamId) {
        setSupportTargetBeamId(beamId);
      } else {
        setSupportSourceBeamId(beamId);
        setSupportTargetBeamId(null);
      }
      return;
    }
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
  if (isClearingRef.current) return;
  const adjDx = moveAllowX ? dx : 0;
  const adjDy = moveAllowY ? dy : 0;
  const activeIds = new Set(
    pillars.filter(isVisiblePillar).map((p) => p.id)
  );
  const targets = new Set<number>(
    selectedPillarIds.filter((id) => activeIds.has(id))
  );
  if (selectedPillarId != null && activeIds.has(selectedPillarId))
    targets.add(selectedPillarId);
  const session =
    moveSessionRef.current?.active && moveSessionRef.current
      ? moveSessionRef.current
      : startMoveSession(targets);
  if (!session) return;
  const origins = new Map<number, { x: number; y: number }>();
  session.cloneOrigins.forEach((_origId, cloneId) => {
    const clone = pillars.find((p) => p.id === cloneId);
    if (clone) {
      origins.set(cloneId, { x: clone.x, y: clone.y });
    } else {
      const prev = session.prevClonePositions.get(cloneId);
      if (prev) origins.set(cloneId, prev);
    }
  });
  applyMoveDeltaWithSession(adjDx, adjDy, origins, true);
};

const applyDragDelta = (
  dx: number,
  dy: number,
  origins: Map<number, { x: number; y: number }>
) => {
  if (isClearingRef.current) return;
  const adjDx = moveAllowX ? dx : 0;
  const adjDy = moveAllowY ? dy : 0;
  applyMoveDeltaWithSession(adjDx, adjDy, origins, false);
};

const handlePlaneClick = (p: Point3, e?: any) => {
  if (isClearingRef.current) return;
  if (supportBeamMode) return;
  if (beamHoverPillarId != null) setBeamHoverPillarId(null);
  if (
    moveMode &&
    (selectedPillarIds.length > 0 || selectedPillarId != null) &&
    e?.nativeEvent?.buttons === 1
  ) {
    let session = moveSessionRef.current?.active
      ? moveSessionRef.current
      : null;
    if (!session) {
      const activeIds = new Set(
        pillars
          .filter((pp) => isVisiblePillar(pp) && !isMoveClone(pp))
          .map((pp) => pp.id)
      );
      const ids = new Set<number>(
        selectedPillarIds.filter((id) => activeIds.has(id))
      );
      if (selectedPillarId != null && activeIds.has(selectedPillarId))
        ids.add(selectedPillarId);
      if (ids.size === 0) return;
      session = startMoveSession(ids);
      if (!session) return;
    }
    const origins = new Map<number, { x: number; y: number }>();
    session.cloneOrigins.forEach((_origId, cloneId) => {
      const clone = pillars.find((pp) => pp.id === cloneId);
      if (clone) {
        origins.set(cloneId, { x: clone.x, y: clone.y });
      } else {
        const prev = session.prevClonePositions.get(cloneId);
        if (prev) origins.set(cloneId, prev);
      }
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
        .filter(isVisiblePillar)
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

  if (drawRectBeamMode) {
    setSelectedBeamId(null);
    setSelectedPillarId(null);
    setSelectedBeamSegment(null);
    setSelectedPillarId(null);

    if (!rectTempStart) {
      const snapped = snapToPillarPoint(p);
      setRectTempStart(snapped);
    } else {
      const snapped = snapToPillarPoint(p);
      const xMin = Math.min(rectTempStart.x, snapped.x);
      const xMax = Math.max(rectTempStart.x, snapped.x);
      const yMin = Math.min(rectTempStart.y, snapped.y);
      const yMax = Math.max(rectTempStart.y, snapped.y);

      const pA: Point3 = { x: xMin, y: yMin, z: 0 };
      const pB: Point3 = { x: xMax, y: yMin, z: 0 };
      const pC: Point3 = { x: xMax, y: yMax, z: 0 };
      const pD: Point3 = { x: xMin, y: yMax, z: 0 };

      generateGridInsidePolygon([pA, pB, pC, pD], pillars, beams, "regular");

      setRectTempStart(null);
      setDrawRectBeamMode(false);
    }
    return;
  }

  if (drawPolylineMode) {
    setSelectedBeamId(null);
    setSelectedBeamSegment(null);
    let curP = [...pillars];
    let curB = [...beams];
    const points = [...polyPoints];
    const lastPoint = points[points.length - 1] ?? null;
    const guide = computeSnapGuides(p);
    setSnapGuideX(guide.x);
    setSnapGuideY(guide.y);
    const rawPoint = { x: p.x, y: p.y, z: 0 };
    const snappedPoint = lastPoint
      ? snapPolylinePoint(rawPoint, lastPoint, guide.x, guide.y)
      : snapToGuides(rawPoint, guide.x, guide.y);
    const hovered = lastPoint
      ? getNearestAlignedPillar(snappedPoint, lastPoint)
      : getNearestPillar(snappedPoint);
    const anchorPoint = hovered
      ? { x: hovered.x, y: hovered.y, z: 0 }
      : snappedPoint;
    const ensureVertex = (pt: Point3) => {
      if (hovered) return anchorPoint;
      const res = ensurePrePillarAtPoint(pt, curP);
      curP = res.pillars;
      return { x: res.pillar.x, y: res.pillar.y, z: 0 };
    };

    if (points.length === 0) {
      const first = ensureVertex(anchorPoint);
      setPillars(curP);
      setPolyPoints([first]);
      setPolyPreviewPoint(first);
      setPolyHoverPillarId(hovered ? hovered.id : null);
      return;
    }

    const last = points[points.length - 1];
    const next = ensureVertex(anchorPoint);
    if (Math.hypot(next.x - last.x, next.y - last.y) < 1e-6) return;

    const res = applyAddBeamBetween(last, next, curP, curB, "pre");
    curP = res.pillars;
    curB = res.beams;
    setPillars(curP);
    setBeams(curB);
    setPolyPoints([...points, next]);
    setPolyPreviewPoint(next);
    setPolyHoverPillarId(hovered ? hovered.id : null);
    return;
  }

  if (drawBeamMode) {
    handleBeamPointClick(p);
    return;
  }

  if (insertMode) {
    addPillarAt(p.x, p.y);
    return;
  }

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
    if (isClearingRef.current) return;
    if (drawPolylineMode) {
      const guide = computeSnapGuides(p);
      setSnapGuideX(guide.x);
      setSnapGuideY(guide.y);
      const last = polyPoints[polyPoints.length - 1] ?? null;
      const basePoint = last
        ? snapPolylinePoint(p, last, guide.x, guide.y)
        : snapToGuides(p, guide.x, guide.y);
      const hovered = last
        ? getNearestAlignedPillar(basePoint, last)
        : getNearestPillar(basePoint);
      if (hovered) {
        setPolyPreviewPoint({ x: hovered.x, y: hovered.y, z: 0 });
        setPolyHoverPillarId(hovered.id);
      } else {
        setPolyPreviewPoint({ x: basePoint.x, y: basePoint.y, z: 0 });
        setPolyHoverPillarId(null);
      }
    } else if (polyHoverPillarId != null) {
      setPolyHoverPillarId(null);
    }

    if (drawBeamMode) {
      const hovered = getNearestPillar(p);
      setBeamHoverPillarId(hovered ? hovered.id : null);
    } else if (beamHoverPillarId != null) {
      setBeamHoverPillarId(null);
    }

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
    finalizeMoveSession();
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
    ? pillars.find((p) => p.id === selectedPillarId && isVisiblePillar(p)) ||
      null
    : null;
  const polyPreviewSegment =
    drawPolylineMode && polyPoints.length > 0 && polyPreviewPoint
      ? {
          start: polyPoints[polyPoints.length - 1],
          end: polyPreviewPoint,
        }
      : null;
  const polyPreviewPillars = polyPreviewSegment
    ? getPreviewSegmentPoints(polyPreviewSegment.start, polyPreviewSegment.end)
    : [];
  const showPolyPreviewEnd =
    polyPreviewSegment &&
    !polyHoverPillarId &&
    Math.hypot(
      polyPreviewSegment.end.x - polyPreviewSegment.start.x,
      polyPreviewSegment.end.y - polyPreviewSegment.start.y
    ) > 1e-6;

  const showSnapGuides = drawPolylineMode;
  const snapGuideBounds = (() => {
    if (pdf) {
      const widthPaperMm = pdf.pageWidthPt * POINT_TO_MM;
      const heightPaperMm = pdf.pageHeightPt * POINT_TO_MM;
      const widthRealMm = widthPaperMm * scaleDenominator;
      const heightRealMm = heightPaperMm * scaleDenominator;
      const widthRealM = widthRealMm / 1000;
      const heightRealM = heightRealMm / 1000;
      return {
        minX: -widthRealM / 2,
        maxX: widthRealM / 2,
        minY: -heightRealM / 2,
        maxY: heightRealM / 2,
      };
    }
    const active = pillars.filter(isVisiblePillar);
    if (active.length > 0) {
      let minX = active[0].x;
      let maxX = active[0].x;
      let minY = active[0].y;
      let maxY = active[0].y;
      active.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
      const margin = Math.max(1, Math.max(maxSpanX, maxSpanY));
      return {
        minX: minX - margin,
        maxX: maxX + margin,
        minY: minY - margin,
        maxY: maxY + margin,
      };
    }
    return { minX: -25, maxX: 25, minY: -25, maxY: 25 };
  })();

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
      .filter(isVisiblePillar)
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

  void recalcPillarsForMove;
  void restoreSuspendedPrePillars;
  void updateMovedPillarHomes;
  void normalizeTempPillars;
  void absorbPassedPillars;
  void mergeOverlappingPillars;

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
          ?
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
            ?? Projeto (PDF)
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
                    setSupportBeamMode(false);
                    setSupportSourceBeamId(null);
                    setSupportTargetBeamId(null);
                    setSupportAngleInput("");
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
                    ? "?? Medindo (clique em 2 pontos)"
                    : "?? Medir distância"}
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
                ?? Resetar vista 3D
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
            ?? ELEMENTOS
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
                  setSupportBeamMode(false);
                  setSupportSourceBeamId(null);
                  setSupportTargetBeamId(null);
                  setSupportAngleInput("");
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
                  : "? Inserir Pilar (clicando no PDF)"}
              </button>

              <button
                onClick={() => {
                  setDeleteMode((v) => !v);
                  setSupportBeamMode(false);
                  setSupportSourceBeamId(null);
                  setSupportTargetBeamId(null);
                  setSupportAngleInput("");
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
                  ? "??? Clique em um pilar para apagar"
                  : "??? Apagar Pilar"}
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
                    setSupportBeamMode(false);
                    setSupportSourceBeamId(null);
                    setSupportTargetBeamId(null);
                    setSupportAngleInput("");
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
                    : "? Desenhar Viga (2 cliques no PDF)"}
                </button>
                {drawBeamMode && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={beamCantileverMode}
                      onChange={(e) => setBeamCantileverMode(e.target.checked)}
                    />
                    Viga em balan?o (n?o criar pilar no pr?ximo ponto)
                  </label>
                )}


                <button
                  onClick={() => {
                    const novo = !drawRectBeamMode;
                    setDrawRectBeamMode(novo);
                    setDrawBeamMode(false);
                    setDrawPolylineMode(false);
                    setSupportBeamMode(false);
                    setSupportSourceBeamId(null);
                    setSupportTargetBeamId(null);
                    setSupportAngleInput("");
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
                    : "? Retângulo de vigas (perímetro)"}
                </button>

                <button
                  onClick={() => {
                    const novo = !drawPolylineMode;
                    setDrawPolylineMode(novo);
                    setDrawBeamMode(false);
                    setDrawRectBeamMode(false);
                    setSupportBeamMode(false);
                    setSupportSourceBeamId(null);
                    setSupportTargetBeamId(null);
                    setSupportAngleInput("");
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
                    : "?? Polilinha de vigas"}
                </button>
                <button
                  onClick={() => {
                    const novo = !supportBeamMode;
                    setSupportBeamMode(novo);
                    setSupportSourceBeamId(null);
                    setSupportTargetBeamId(null);
                    setSupportAngleInput("");
                    if (novo) {
                      setDrawBeamMode(false);
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
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: supportBeamMode ? "#ffddaa" : "#225577",
                    color: supportBeamMode ? "#333" : "#fff",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {supportBeamMode
                    ? "Apoio viga em viga: selecione duas vigas"
                    : "Apoiar viga em viga"}
                </button>

                {supportBeamMode && (
                  <>
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                      Clique na viga a apoiar e depois na viga de apoio.
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                      Viga apoiada: {supportSourceBeamId ?? "-"} | Apoio: {supportTargetBeamId ?? "-"}
                    </div>
                    <input
                      type="number"
                      value={supportAngleInput}
                      onChange={(e) => setSupportAngleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applySupportBeamToBeam();
                        }
                      }}
                      placeholder="?ngulo (graus). Enter = ortogonal"
                      style={{
                        width: "100%",
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 4,
                        padding: "2px 4px",
                        marginBottom: 6,
                      }}
                    />
                    <button
                      onClick={applySupportBeamToBeam}
                      style={{
                        width: "100%",
                        padding: 6,
                        borderRadius: 4,
                        border: "1px solid #555",
                        cursor: "pointer",
                        background: "#222",
                        color: "#ccc",
                        fontSize: 12,
                        marginBottom: 6,
                      }}
                    >
                      Aplicar apoio
                    </button>
                  </>
                )}


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
                      onClick={() => finalizePolyline()}
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
            ?? Modificar
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
                      setSupportBeamMode(false);
                      setSupportSourceBeamId(null);
                      setSupportTargetBeamId(null);
                      setSupportAngleInput("");
                      setInsertMode(false);
                      setMeasureMode(false);
                      setDeleteMode(false);
                      setBeamTempStart(null);
                      setRectTempStart(null);
                      setPolyPoints([]);
                      setSelectedBeamId(null);
                      setSelectedBeamSegment(null);
                    } else {
                      finalizeMoveSession();
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
          isHoverAnchor={drawPolylineMode && polyHoverPillarId === p.id}
          isHoverSnap={drawBeamMode && beamHoverPillarId === p.id}
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
          isSupportSource={supportSourceBeamId === seg.beamId}
          isSupportTarget={supportTargetBeamId === seg.beamId}
          onClick={() => handleBeamClick(seg)}
        />
      ))}

      {polyPreviewSegment && (
        <group>
          <Line
            raycast={(_r: any, _i: any) => null}
            points={[
              [polyPreviewSegment.start.x, polyPreviewSegment.start.y, 0.05],
              [polyPreviewSegment.end.x, polyPreviewSegment.end.y, 0.05],
            ]}
            color="#00ffee"
            lineWidth={1}
            dashed
          />
          {polyPreviewPillars.map((pt, idx) => (
            <mesh
              key={`poly-preview-${idx}`}
              position={[pt.x, pt.y, 0.05]}
              raycast={(_r: any, _i: any) => null}
            >
              <boxGeometry args={[0.2, 0.2, 0.05]} />
              <meshBasicMaterial color="#00ffee" />
            </mesh>
          ))}
          {showPolyPreviewEnd && (
            <mesh
              position={[
                polyPreviewSegment.end.x,
                polyPreviewSegment.end.y,
                0.05,
              ]}
              raycast={(_r: any, _i: any) => null}
            >
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshBasicMaterial color="#00ffee" />
            </mesh>
          )}
        </group>
      )}

      {showSnapGuides && (snapGuideX != null || snapGuideY != null) && (
        <group>
          {snapGuideX != null && (
            <Line
              raycast={(_r: any, _i: any) => null}
              points={[
                [snapGuideX, snapGuideBounds.minY, 0.07],
                [snapGuideX, snapGuideBounds.maxY, 0.07],
              ]}
              color="#00aa55"
              lineWidth={1}
              dashed
            />
          )}
          {snapGuideY != null && (
            <Line
              raycast={(_r: any, _i: any) => null}
              points={[
                [snapGuideBounds.minX, snapGuideY, 0.07],
                [snapGuideBounds.maxX, snapGuideY, 0.07],
              ]}
              color="#00aa55"
              lineWidth={1}
              dashed
            />
          )}
        </group>
      )}
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



















