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
};
type Beam = {
  id: number;
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


type OrthoView = "top" | "bottom" | "front" | "back" | "left" | "right";
type ViewMode = "3d" | OrthoView;

const POINT_TO_MM = 25.4 / 72;

// -------------------------------------------------------------
// CAMERA CONTROLLER
// -------------------------------------------------------------
function CameraController({
  viewMode,
  resetToken,
}: {
  viewMode: ViewMode;
  resetToken: number;
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
      enablePan
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
}: {
  pdf: PdfInfo;
  scaleDenominator: number;
  onPlaneClick?: (p: Point3) => void;
}) {
  const texture = useLoader(TextureLoader, pdf.textureUrl);

  const widthPaperMm = pdf.pageWidthPt * POINT_TO_MM;
  const heightPaperMm = pdf.pageHeightPt * POINT_TO_MM;

  const widthRealMm = widthPaperMm * scaleDenominator;
  const heightRealMm = heightPaperMm * scaleDenominator;

  const widthRealM = widthRealMm / 1000;
  const heightRealM = heightRealMm / 1000;

  const handlePointerDown = (e: any) => {
    if (!onPlaneClick) return;
    const p = e.point;
    onPlaneClick({ x: p.x, y: p.y, z: p.z });
  };

  return (
    <mesh onPointerDown={handlePointerDown}>
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
  isSelected,
}: {
  pillar: Pillar;
  onClick?: () => void;
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
  const finalizePolyline = () => {
    if (polyPoints.length < 2) {
      setPolyPoints([]);
      setDrawPolylineMode(false);
      return;
    }

    const first = polyPoints[0];
    const last = polyPoints[polyPoints.length - 1];
    const dist = Math.hypot(first.x - last.x, first.y - last.y);

    if (dist > 1e-6) {
      addBeamBetween(last, first, false);
    }

    if (polyPoints.length >= 3) {
      generateGridInsidePolygon(polyPoints);
    }

    setPolyPoints([]);
    setDrawPolylineMode(false);
  };

  const [selectedBeamId, setSelectedBeamId] = useState<number | null>(null);
  const [selectedBeamSegment, setSelectedBeamSegment] = useState<
    BeamSegment | null
  >(null);
  const [selectedPillarId, setSelectedPillarId] = useState<number | null>(null);
  const [editBeamWidth, setEditBeamWidth] = useState(0.15); // m
  const [editBeamHeight, setEditBeamHeight] = useState(0.3); // m (valor inicial qualquer)


  const [insertMode, setInsertMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [pillars, setPillars] = useState<Pillar[]>([]);

  const [alignMode, setAlignMode] = useState<
    "livre" | "horizontal" | "vertical"
  >("livre");

  const [activePanel, setActivePanel] = useState<"pdf" | "pillars">("pdf");

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
  
  // Gera pilares ao longo de um segmento de viga, respeitando vãos máximos em X/Y
  const generatePillarsForSegment = (p1: Point3, p2: Point3) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const span = Math.sqrt(dx * dx + dy * dy);
    if (span === 0) return;

    // Decide qual vão máximo usar (X ou Y) com base na direção dominante
    const useX = Math.abs(dx) >= Math.abs(dy);
    const maxSpan = useX ? maxSpanX : maxSpanY;
    if (maxSpan <= 0) return;

    const nSegments = Math.ceil(span / maxSpan);
    const spacing = span / nSegments;
    const ux = dx / span;
    const uy = dy / span;

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i <= nSegments; i++) {
      const s = spacing * i;
      positions.push({
        x: p1.x + ux * s,
        y: p1.y + uy * s,
      });
    }

    const tol = 0.01; // ~1 cm

    setPillars((prev) => {
      const out = [...prev];

      positions.forEach((pos) => {
        const exists = out.some((p) => {
          const ddx = p.x - pos.x;
          const ddy = p.y - pos.y;
          return Math.sqrt(ddx * ddx + ddy * ddy) < tol;
        });

        if (!exists) {
          const id = Date.now() + Math.random();
          const base: Pillar = {
            id,
            type: pillarType,
            x: pos.x,
            y: pos.y,
            height: pillarHeight,
          };

          if (pillarType === "retangular") {
            base.width = pillarWidth;
            base.length = pillarLength;
          } else {
            base.diameter = pillarDiameter;
          }

          out.push(base);
        }
      });

      return out;
    });
  };

  // lista de posições de grade incluindo bordas, respeitando vão máximo
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

  const isSameSegment = (b: Beam, p1: Point3, p2: Point3) => {
    const tol = 1e-4;
    const match = (x1: number, y1: number, x2: number, y2: number) =>
      Math.hypot(x1 - x2, y1 - y2) < tol;

    const direct =
      match(b.x1, b.y1, p1.x, p1.y) && match(b.x2, b.y2, p2.x, p2.y);
    const reverse =
      match(b.x1, b.y1, p2.x, p2.y) && match(b.x2, b.y2, p1.x, p1.y);
    return direct || reverse;
  };

  const addBeamBetween = (p1: Point3, p2: Point3, withPillars = true) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const span = Math.sqrt(dx * dx + dy * dy);

    if (span === 0) return;

    // Seção automática
    const width = 0.15;        // 15 cm
    const height = span / 10;  // h = vão / 10

    const id = Date.now() + Math.random();

    const newBeam: Beam = {
      id,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      width,
      height,
    };

    setBeams((prev) => {
      if (prev.some((b) => isSameSegment(b, p1, p2))) return prev;
      return [...prev, newBeam];
    });

    if (withPillars) {
      // 🔹 gera pilares automaticamente ao longo da viga
      generatePillarsForSegment(p1, p2);
    }
  };


  const generateGridInsidePolygon = (poly: Point3[]) => {
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

    const pointInPoly = (x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;

        // checa se está sobre a aresta
        const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
        const dot = (x - xi) * (x - xj) + (y - yi) * (y - yj);
        if (Math.abs(cross) < 1e-8 && dot <= 1e-8) {
          return true;
        }

        const intersect =
          yi > y !== yj > y &&
          x <
            ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };

    // interseções da linha vertical x = x0 com o polígono (paridade)
    const verticalSegments = (x0: number) => {
      const intersections: number[] = [];
      for (let i = 0; i < n; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % n];
        if (p1.x === p2.x) continue; // evita duplicar em arestas verticais
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
        addBeamBetween({ x: x0, y: y1, z: 0 }, { x: x0, y: y2, z: 0 }, false);
      }
    };

    // interseções da linha horizontal y = y0 com o polígono (paridade)
    const horizontalSegments = (y0: number) => {
      const intersections: number[] = [];
      for (let i = 0; i < n; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % n];
        if (p1.y === p2.y) continue; // evita duplicar em arestas horizontais
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
        addBeamBetween({ x: x1, y: y0, z: 0 }, { x: x2, y: y0, z: 0 }, false);
      }
    };

    xs.forEach(verticalSegments);
    ys.forEach(horizontalSegments);

    // pilares exatamente nas interseções da malha
    xs.forEach((x) => {
      ys.forEach((y) => {
        if (pointInPoly(x, y)) {
          addPillarAt(x, y);
        }
      });
    });
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

    setPillars((prev) => [...prev, base]);
  };

  const deletePillar = (id: number) => {
    setPillars((prev) => prev.filter((p) => p.id !== id));
    setSelectedPillarId((prev) => (prev === id ? null : prev));
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
    setSelectedPillarId(id);
    setSelectedBeamId(null);
    setSelectedBeamSegment(null);
  };

  const handleBeamClick = (item: Beam | BeamSegment) => {
    const beamId = "beamId" in item ? item.beamId : item.id;
    setSelectedBeamId(beamId);
    setSelectedBeamSegment("beamId" in item ? item : null);
    setSelectedPillarId(null);
    const beam = beams.find((b) => b.id === beamId);
    if (beam) {
      setEditBeamWidth(beam.width);
      setEditBeamHeight(beam.height);
    }
  };

  const handlePlaneClick = (p: Point3) => {
    const anyMode =
      drawRectBeamMode ||
      drawPolylineMode ||
      drawBeamMode ||
      insertMode ||
      measureMode ||
      deleteMode;
    if (!anyMode) {
      setSelectedBeamId(null);
      setSelectedPillarId(null);
      setSelectedBeamSegment(null);
    }
    
    // 0) MODO RETÂNGULO DE VIGAS (2 cliques = cantos opostos)
    if (drawRectBeamMode) {
      setSelectedBeamId(null);
      setSelectedPillarId(null);
      setSelectedBeamSegment(null);
      setSelectedPillarId(null);

      if (!rectTempStart) {
        // primeiro canto
        setRectTempStart(p);
      } else {
        // segundo canto -> cria os 4 lados de vigas
        const xMin = Math.min(rectTempStart.x, p.x);
        const xMax = Math.max(rectTempStart.x, p.x);
        const yMin = Math.min(rectTempStart.y, p.y);
        const yMax = Math.max(rectTempStart.y, p.y);

        const pA: Point3 = { x: xMin, y: yMin, z: 0 };
        const pB: Point3 = { x: xMax, y: yMin, z: 0 };
        const pC: Point3 = { x: xMax, y: yMax, z: 0 };
        const pD: Point3 = { x: xMin, y: yMax, z: 0 };

        addBeamBetween(pA, pB, false);
        addBeamBetween(pB, pC, false);
        addBeamBetween(pC, pD, false);
        addBeamBetween(pD, pA, false);
        generateGridInsidePolygon([pA, pB, pC, pD]);

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
        if (prev.length === 0) {
          return [p];
        } else {
          const last = prev[prev.length - 1];
          addBeamBetween(last, p, false);
          return [...prev, p];
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
        // primeiro clique: guarda início
        setBeamTempStart(p);
      } else {
        // segundo clique: cria viga e limpa início
        addBeamBetween(beamTempStart, p);
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
          <CameraController viewMode={viewMode} resetToken={resetToken} />

          {!pdf && <gridHelper args={[50, 50]} />}
          {!pdf && <axesHelper args={[10]} />}

          {pdf && (
            <PdfPlane
              pdf={pdf}
              scaleDenominator={scaleDenominator}
              onPlaneClick={handlePlaneClick}
            />
          )}

      {pillars.map((p) => (
        <PillarMesh
          key={p.id}
          pillar={p}
          isSelected={selectedPillarId === p.id}
          onClick={() => handlePillarClick(p.id)}
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
