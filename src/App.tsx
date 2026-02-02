import { useState, useRef, useEffect } from "react";
import { Canvas, useThree, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Line,
  Html,
  GizmoHelper,
  Edges,
  PerspectiveCamera,
  OrthographicCamera,
  Text,
} from "@react-three/drei";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "./pdfWorker";
import { TextureLoader, MOUSE, Shape } from "three";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc as string;

type PdfInfo = {

  textureUrl: string;
  pageWidthPt: number;
  pageHeightPt: number;
};

type Point3 = { x: number; y: number; z: number };

type PillarKind = "pre" | "auto" | "temp" | "anchor";
type PillarState = "active" | "suspended";
type AnchorRole = "free" | "support" | "secondary";

type SteelProfile = {
  name: string;
  mass: number; // kg/m
  d: number; // m
  bf: number; // m
  tw: number; // m
  tf: number; // m
  r: number; // m
};

type MaterialType = "concreto" | "metalico";
type BeamRole = "primary" | "secondary";

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
  isSteel?: boolean;
  steelProfile?: string;
  steelAuto?: boolean;
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
  isSteel?: boolean;
  steelProfile?: string;
  steelAuto?: boolean;
  role?: BeamRole;
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
  isSteel?: boolean;
  steelProfile?: string;
  steelAuto?: boolean;
  role?: BeamRole;
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

const STEEL_PROFILE_DATA = `"BITOLA
mm x kg/m";"Massa Linear
kg/m";"d 
mm";"bf
 mm";"tw 
mm";"tf
mm";"h 
mm";"d' 
mm";R[mm];Área cm2;"lx 
cm4";"Wx 
cm3";"rx 
cm";"Zx 
cm3";"ly 
cm4";"Wy
cm3";"ry 
cm";"Zy 
cm3";"rt 
cm";"lt 
cm4";"Mesa - λf
bf/2.tf";"Alma - λw
d'/tw";"cw
cm6";"u
m2/m";"BITOLA
in x Ib/ft";"Massividade (m-1)
4 Faces Exp.
Pilares";"Massividade (m-1)
1 Face Protegida
Vigas"
W 150 x 13,0;13,0;148;100;4,3;4,9;138;118;10;16,6;635;85,8;6,2;96,4;82;16,4;2,2;25,5;2,6;1,7;10,2;27,5;4.181;0,67;W 6 x 8,5;403,61;343,37
W 150 x 18,0;18,0;153;102;5,8;7,1;139;119;10;23,4;939;122,8;6,3;139,4;126;24,7;2,3;38,5;2,7;4,3;7,2;20,5;6.683;0,69;W 6 x 12;294,87;251,28
W 150 x 22,5 (H);22,5;152;152;5,8;6,6;139;119;10;29,0;1229;161,7;6,5;179,6;387;50,9;3,7;77,9;4,1;4,8;11,5;20,5;20.417;0,88;W 6 x 15;303,45;251,03
W 150 x 24,0;24,0;160;102;6,6;10,3;139;115;12;31,5;1384;173,0;6,6;197,6;183;35,9;2,4;55,8;2,7;11,1;5,0;17,5;10.206;0,69;W 6 x 16;219,05;186,67
W 150 x 29,8 (H);29,8;157;153;6,6;9,3;138;118;10;38,5;1739;221,5;6,7;247,5;556;72,6;3,8;110,8;4,2;11,0;8,2;17,9;30.277;0,90;W 6 x 20;233,77;194,03
W 150 x 37,1 (H);37,1;162;154;8,1;11,6;139;119;10;47,8;2244;277,0;6,9;313,5;707;91,8;3,8;140,4;4,2;20,6;6,6;14,7;39.930;0,91;W 6 x 25;190,38;158,16
W 200 x 15,0;15,0;200;100;4,3;5,2;190;170;10;19,4;1305;130,5;8,2;147,9;87;17,4;2,1;27,3;2,6;2,1;9,6;39,4;8.222;0,77;W 8 x 10;396,91;345,36
W 200 x 19,3;19,3;203;102;5,8;6,5;190;170;10;25,1;1686;166,1;8,2;190,6;116;22,7;2,1;35,9;2,6;4,0;7,9;29,3;11.098;0,79;W 8 x 13;314,74;274,10
W 200 x 22,5;22,5;206;102;6,2;8,0;190;170;10;29,0;2029;197,0;8,4;225,5;142;27,9;2,2;43,9;2,6;6,2;6,4;27,4;13.868;0,79;W 8 x 15;272,41;237,24
W 200 x 26,6;26,6;207;133;5,8;8,4;190;170;10;34,2;2611;252,3;8,7;282,3;330;49,6;3,1;76,3;3,5;7,7;7,9;29,3;32.477;0,92;W 8 x 18;269,01;230,12
W 200 x 31,3;31,3;210;134;6,4;10,2;190;170;10;40,3;3168;301,7;8,9;338,6;410;61,2;3,2;94,0;3,6;12,6;6,6;26,5;40.822;0,93;W 8 x 21;230,77;197,52
W 200 x 35,9 (H);35,9;201;165;6,2;10,2;181;161;10;45,7;3437;342,0;8,7;379,2;764;92,6;4,1;141,0;4,5;14,5;8,1;25,9;69.502;1,03;W 8 x 24;225,38;189,28
W 200 x 41,7 (H);41,7;205;166;7,2;11,8;181;157;12;53,5;4114;401,4;8,8;448,6;901;108,5;4,1;165,7;4,5;23,2;7,0;21,9;83.948;1,04;W 8 x 28;194,39;163,36
W 200 x 46,1 (H);46,1;203;203;7,2;11,0;181;161;10;58,6;4543;447,6;8,8;495,3;1535;151,2;5,1;229,5;5,6;22,0;9,2;22,4;141.342;1,19;W 8 x 31;203,07;168,43
W 200 x 52,0 (H);52,0;206;204;7,9;12,6;181;157;12;66,9;5298;514,4;8,9;572,5;1784;174,9;5,2;265,8;5,6;33,3;8,1;19,9;166.710;1,19;W 8 x 35;177,88;147,38
HP 200 x 53,0 (H);53,0;204;207;11,3;11,3;181;161;10;68,1;4977;488,0;8,6;551,3;1673;161,7;5,0;248,6;5,6;31,9;9,2;14,3;155.075;1,20;HP 8 x 36;176,21;145,81
W 200 x 59,0 (H);59,0;210;205;9,1;14,2;182;158;12;76,0;6140;584,8;9,0;655,9;2041;199,1;5,2;303,0;5,6;47,7;7,2;17,3;195.418;1,20;W 8 x 40;157,89;130,92
W 200 x 71,0 (H);71,0;216;206;10,2;17,4;181;161;10;91,0;7660;709,2;9,2;803,2;2537;246,3;5,3;374,5;5,7;81,7;5,9;15,8;249.976;1,22;W 8 x 48;134,07;111,43
W 200 x 86,0 (H);86,0;222;209;13,0;20,6;181;157;12;110,9;9498;855,7;9,3;984,2;3139;300,4;5,3;458,7;5,8;142,2;5,1;12,1;317.844;1,23;W 8 x 58;110,91;92,06
W 200 x 100,0 (H)*;100,0;229;210;14,5;23,7;182;158;12;127,1;11355;991,7;9,5;1152,2;3664;349,0;5,4;533,4;5,8;212,6;4,4;10,9;385.454;1,25;W 8 x 67;98,35;81,83
W 250 x 17,9;17,9;251;101;4,8;5,3;240;220;10;23,1;2291;182,6;10,0;211,0;91;18,1;2,0;28,8;2,5;2,5;9,5;45,9;13.735;0,88;W 10 x 12;380,95;337,23
W 250 x 22,3;22,3;254;102;5,8;6,9;240;220;10;28,9;2939;231,4;10,1;267,7;123;24,1;2,1;38,4;2,5;4,8;7,4;38,0;18.629;0,89;W 10 x 15;307,96;272,66
W 250 x 25,3;25,3;257;102;6,1;8,4;240;220;10;32,6;3473;270,2;10,3;311,1;149;29,3;2,1;46,4;2,6;7,1;6,1;36,1;22.955;0,89;W 10 x 17;273,01;241,72
W 250 x 28,4;28,4;260;102;6,4;10,0;240;220;10;36,6;4046;311,2;10,5;357,3;178;34,8;2,2;54,9;2,6;10,3;5,1;34,4;27.636;0,90;W 10 x 19;245,90;218,03
W 250 x 32,7;32,7;258;146;6,1;9,1;240;220;10;42,1;4937;382,7;10,8;428,5;473;64,8;3,4;99,7;3,9;10,4;8,0;36,0;73.104;1,07;W 10 x 22;254,16;219,48
W 250 x 38,5;38,5;262;147;6,6;11,2;240;220;10;49,6;6057;462,4;11,1;517,8;594;80,8;3,5;124,1;3,9;17,6;6,6;33,3;93.242;1,08;W 10 x 26;217,74;188,10
W 250 x 44,8;44,8;266;148;7,6;13,0;240;220;10;57,6;7158;538,2;11,2;606,3;704;95,1;3,5;146,4;4,0;27,1;5,7;29,0;112.398;1,09;W 10 x 30;189,24;163,54
HP 250 x 62,0 (H);62,0;246;256;10,5;10,7;225;201;12;79,6;8728;709,6;10,5;790,5;2995;234,0;6,1;357,8;6,9;33,5;12,0;19,1;414.130;1,47;HP 10 x 42;184,67;152,51
W 250 x 73,0 (H);73,0;253;254;8,6;14,2;225;201;12;92,7;11257;889,9;11,0;983,3;3880;305,5;6,5;463,1;7,0;56,9;8,9;23,3;552.900;1,48;W 10 x 49;159,65;132,25
W 250 x 80,0 (H);80,0;256;255;9,4;15,6;225;201;12;101,9;12550;980,5;11,1;1088,7;4313;338,3;6,5;513,1;7,0;75,0;8,2;21,4;622.878;1,49;W 10 x 54;146,22;121,20
HP 250 x 85,0 (H);85,0;254;260;14,4;14,4;225;201;12;108,5;12280;966,9;10,6;1093,2;4225;325,0;6,2;499,6;7,0;82,1;9,0;14,0;605.403;1,50;HP 10 x 57;138,25;114,29
W 250 x 89,0 (H);89,0;260;256;10,7;17,3;225;201;12;113,9;14237;1095,1;11,2;1224,4;4841;378,2;6,5;574,3;7,1;102,8;7,4;18,8;712.351;1,50;W 10 x 60;131,69;109,22
W 250 x 101,0 (H);101,0;264;257;11,9;19,6;225;201;12;128,7;16352;1238,8;11,3;1395,0;5549;431,8;6,6;656,3;7,1;147,7;6,6;16,9;828.031;1,51;W 10 x 68;117,33;97,36
W 250 x 115,0 (H);115,0;269;259;13,5;22,1;225;201;12;146,1;18920;1406,7;11,4;1597,4;6405;494,6;6,6;752,7;7,2;212,0;5,9;14,9;975.265;1,53;W 10 x 77;104,72;87,00
W 250 x 131,0 (H)*;131,0;275;261;15,4;25,1;225;193;16;167,8;22243;1617,7;11,5;1855,6;7448;570,7;6,7;870,7;7,2;321,1;5,2;12,5;1.161.225;1,54;W 10 x 88;91,78;76,22
W 250 x 149,0 (H)*;149,0;282;263;17,3;28,4;225;193;16;190,5;26027;1845,9;11,7;2137,5;8624;655,8;6,7;1001,7;7,3;462,1;4,6;11,2;1.384.436;1,55;W 10 x 100;81,36;67,56
W 250 x 167,0 (H)*;167,0;289;265;19,2;31,8;225;193;16;214,0;30110;2083,7;11,9;2435,3;9880;745,7;6,8;1140,2;7,3;645,0;4,2;10,1;1.631.156;1,57;W 10 x 112;73,36;60,98
W 310 x 21,0;21,0;303;101;5,1;5,7;292;272;10;27,2;3776;249,2;11,8;291,9;98;19,5;1,9;31,4;2,4;3,3;8,9;53,3;21.628;0,98;W 12 x 14;360,29;323,16
W 310 x 23,8;23,8;305;101;5,6;6,7;292;272;10;30,7;4346;285,0;11,9;333,2;116;22,9;1,9;36,9;2,5;4,7;7,5;48,5;25.594;0,99;W 12 x 16;322,48;289,58
W 310 x 28,3;28,3;309;102;6,0;8,9;291;271;10;36,5;5500;356,0;12,3;412,0;158;31,0;2,1;49,4;2,6;8,1;5,7;45,2;35.441;1,00;W 12 x 19;273,97;246,03
W 310 x 32,7;32,7;313;102;6,6;10,8;291;271;10;42,1;6570;419,8;12,5;485,3;192;37,6;2,1;59,8;2,6;12,9;4,7;41,1;43.612;1,00;W 12 x 22;237,53;213,30
W 310 x 38,7;38,7;310;165;5,8;9,7;291;271;10;49,7;8581;553,6;13,1;615,4;727;88,1;3,8;134,9;4,4;13,2;8,5;46,7;163.728;1,25;W 12 x 26;251,51;218,31
W 310 x 44,5;44,5;313;166;6,6;11,2;291;271;10;57,2;9997;638,8;13,2;712,8;855;103,0;3,9;158,0;4,4;19,9;7,4;41,0;194.433;1,26;W 12 x 30;220,28;191,26
W 310 x 52,0;52,0;317;167;7,6;13,2;291;271;10;67,0;11909;751,4;13,3;842,5;1026;122,9;3,9;188,8;4,5;31,8;6,3;35,6;236.422;1,27;W 12 x 35;189,55;164,63
W 310 x 60,0*;60,0;303;203;7,5;13,1;277;245;16;76,1;12908;852,0;13,0;944,3;1829;180,2;4,9;275,4;5,5;40,5;7,8;32,6;383.747;1,38;W 12 x 40;181,34;154,66
W 310 x 67,0*;67,0;306;204;8,5;14,6;277;245;16;85,3;14559;951,5;13,1;1060,4;2069;202,8;4,9;310,5;5,5;55,4;7,0;28,8;438.542;1,38;W 12 x 45;161,78;137,87
W 310 x 74,0*;74,0;310;205;9,4;16,3;277;245;16;95,1;16501;1064,6;13,2;1192,0;2344;228,7;5,0;350,5;5,5;75,5;6,3;26,1;504.715;1,39;W 12 x 50;146,16;124,61
HP 310 x 79,0 (H);79,0;299;306;11,0;11,0;277;245;16;100,0;16316;1091,3;12,8;1210,1;5258;343,7;7,3;525,4;8,2;46,7;13,9;22,3;1.089.258;1,77;HP 12 x 53;177,00;146,40
HP 310 x 93,0 (H);93,0;303;308;13,1;13,1;277;245;16;119,2;19682;1299,1;12,9;1450,3;6387;414,7;7,3;635,5;8,3;77,3;11,8;18,7;1.340.320;1,78;HP 12 x 63;149,33;123,49
W 310 x 97,0 (H);97,0;308;305;9,9;15,4;277;245;16;123,6;22284;1447,0;13,4;1594,2;7286;477,8;7,7;725,0;8,4;92,1;9,9;24,8;1.558.682;1,79;W 12 x 65;144,82;120,15
W 310 x 107,0 (H);107,0;311;306;10,9;17,0;277;245;16;136,4;24839;1597,3;13,5;1768,2;8123;530,9;7,7;806,1;8,4;122,7;9,0;22,5;1.754.271;1,80;W 12 x 72;131,96;109,53
HP 310 x 110,0 (H);110,0;308;310;15,4;15,5;277;245;16;141,0;23703;1539,1;13,0;1730,6;7707;497,3;7,4;763,7;8,3;125,7;10,0;15,9;1.646.104;1,80;HP 12 x 74;127,66;105,67
W 310 x 117,0 (H);117,0;314;307;11,9;18,7;277;245;16;149,9;27563;1755,6;13,6;1952,6;9024;587,9;7,8;893,1;8,4;161,6;8,2;20,6;1.965.950;1,80;W 12 x 79;120,08;99,60
HP 310 x 125,0 (H);125,0;312;312;17,4;17,4;277;245;16;159,0;27076;1735,6;13,1;1963,3;8823;565,6;7,5;870,6;8,4;178,0;9,0;14,1;1.911.029;1,81;HP 12 x 84;113,84;94,21
W 310 x 129,0 (H)*;129,0;318;308;13,1;20,6;277;245;16;165,4;30819;1938,3;13,7;2167,6;10039;651,9;7,8;991,2;8,5;214,7;7,5;18,7;2.218.146;1,81;W 12 x 87;109,43;90,81
HP 310 x 132 (H)*;132,0;314;313;18,3;18,3;277;245;16;167,5;28731;1830,0;13,1;2075,5;9371;598,8;7,5;922,4;8,4;206,8;8,6;13,4;2.044.445;1,82;HP 12 x 89;108,66;89,97
W 310 x 143,0 (H)*;143,0;323;309;14,0;22,9;277;245;16;182,5;34812;2155,6;13,8;2422,2;11270;729,4;7,9;1109,2;8,5;288,8;6,8;17,5;2.535.314;1,83;W 12 x 96;100,27;83,34
W 310 x 158,0 (H)*;158,0;327;310;15,5;25,1;277;245;16;200,7;38681;2365,8;13,9;2675,7;12474;804,8;7,9;1225,2;8,6;380,0;6,2;15,8;2.839.709;1,84;W 12 x 106;91,68;76,23
W 310 x 179,0 (H)*;179,0;333;313;18,0;28,1;277;245;16;227,9;44580;2677,5;14,0;3056,2;14378;918,7;7,9;1401,7;8,6;541,0;5,6;13,6;3.337.666;1,85;W 12 x 120;81,18;67,44
W 310 x 202,0 (H)*;202,0;341;315;20,1;31,8;277;245;16;258,3;52030;3051,6;14,2;3513,7;16589;1053,2;8,0;1608,7;8,7;778,0;5,0;12,2;3.959.374;1,87;W 12 x 136;72,40;60,20
W 360 x 32,9;32,9;349;127;5,8;8,5;332;308;12;42,1;8358;479,0;14,1;547,6;291;45,9;2,6;72,0;3,2;9,2;7,5;53,1;84.111;1,17;W 14 x 22;277,91;247,74
W 360 x 39,0;39,0;353;128;6,5;10,7;332;308;12;50,2;10331;585,3;14,4;667,7;375;58,6;2,7;91,9;3,3;15,8;6,0;47,3;109.551;1,18;W 14 x 26;235,06;209,56
W 360 x 44,6;44,6;352;171;6,9;9,8;332;308;12;57,7;12258;696,5;14,6;784,3;818;95,7;3,8;148,0;4,4;16,7;8,7;44,7;239.091;1,35;W 14 x 30;233,97;204,33
W 360 x 51,0;51,0;355;171;7,2;11,6;332;308;12;64,8;14222;801,2;14,8;899,5;968;113,3;3,9;174,7;4,5;24,7;7,4;42,8;284.994;1,36;W 14 x 34;209,88;183,49
W 360 x 58,0;58,0;358;172;7,9;13,1;332;308;12;72,5;16143;901,8;14,9;1014,8;1113;129,4;3,9;199,8;4,5;34,5;6,6;39,0;330.394;1,37;W 14 x 38;188,97;165,24
W 360 x 64,0;64,0;347;203;7,7;13,5;320;288;16;81,7;17890;1031,1;14,8;1145,5;1885;185,7;4,8;284,5;5,4;44,6;7,5;37,4;523.362;1,46;W 14 x 43;178,70;153,86
W 360 x 72,0;72,0;350;204;8,6;15,1;320;288;16;91,3;20169;1152,5;14,9;1285,9;2140;209,8;4,8;321,8;5,5;61,2;6,8;33,5;599.082;1,47;W 14 x 48;161,01;138,66
W 360 x 79,0;79,0;354;205;9,4;16,8;320;288;16;101,2;22713;1283,2;15,0;1437,0;2416;235,7;4,9;361,9;5,5;82,4;6,1;30,7;685.701;1,48;W 14 x 53;146,25;125,99
W 360 x 91,0 (H);91,0;353;254;9,5;16,4;320;288;16;115,9;26755;1515,9;15,2;1680,1;4483;353,0;6,2;538,1;6,9;92,6;7,7;30,3;1.268.709;1,68;W 14 x 61;144,95;123,04
W 360 x 101,0 (H);101,0;357;255;10,5;18,3;320;286;17;129,5;30279;1696,3;15,3;1888,9;5063;397,1;6,3;606,1;6,9;128,5;7,0;27,3;1.450.410;1,68;W 14 x 68;129,73;110,04
W 360 x 110,0 (H);110,0;360;256;11,4;19,9;320;288;16;140,6;33155;1841,9;15,4;2059,3;5570;435,2;6,3;664,5;7,0;161,9;6,4;25,3;1.609.070;1,69;W 14 x 74;120,20;101,99
W 360 x 122,0 (H);122,0;363;257;13,0;21,7;320;288;16;155,3;36599;2016,5;15,4;2269,8;6147;478,4;6,3;732,4;7,0;212,7;5,9;22,1;1.787.806;1,70;W 14 x 82;109,47;92,92
W 410 x 38,8;38,8;399;140;6,4;8,8;381;357;12;50,3;12777;640,5;15,9;736,8;404;57,7;2,8;90,9;3,5;11,7;8,0;55,8;153.190;1,32;W 16 x 26;262,43;234,59
W 410 x 46,1;46,1;403;140;7,0;11,2;381;357;12;59,2;15690;778,7;16,3;891,1;514;73,4;3,0;115,2;3,6;20,1;6,3;50,9;196.571;1,33;W 16 x 31;224,66;201,01
W 410 x 53,0;53,0;403;177;7,5;10,9;381;357;12;68,4;18734;929,7;16,6;1052,2;1009;114,0;3,8;176,9;4,6;23,4;8,1;47,6;387.194;1,48;W 16 x 36;216,37;190,50
W 410 x 60,0;60,0;407;178;7,7;12,8;381;357;12;76,2;21707;1066,7;16,9;1201,5;1205;135,4;4,0;209,2;4,7;33,8;7,0;46,4;467.404;1,49;W 16 x 40;195,54;172,18
W 410 x 67,0;67,0;410;179;8,8;14,4;381;357;12;86,3;24678;1203,8;16,9;1362,7;1379;154,1;4,0;239,0;4,7;48,1;6,2;40,6;538.546;1,50;W 16 x 45;173,81;153,07
W 410 x 75,0;75,0;413;180;9,7;16,0;381;357;12;95,8;27616;1337,3;17,0;1518,6;1559;173,2;4,0;269,1;4,7;65,2;5,6;36,8;612.784;1,51;W 16 x 50;157,62;138,83
W 410 x 85,0;85,0;417;181;10,9;18,2;381;357;12;108,6;31658;1518,4;17,1;1731,7;1804;199,3;4,1;310,4;4,7;94,5;5,0;32,7;715.165;1,52;W 16 x 57;139,96;123,30
W 460 x 52,0;52,0;450;152;7,6;10,8;428;404;12;66,6;21370;949,8;17,9;1095,9;634;83,5;3,1;131,7;3,8;21,8;7,0;53,2;304.837;1,47;W 18 x 35;220,72;197,90
W 460 x 60,0;60,0;455;153;8,0;13,3;428;404;12;76,2;25652;1127,6;18,4;1292,1;796;104,1;3,2;163,4;3,9;34,6;5,8;50,6;387.230;1,49;W 18 x 40;195,54;175,46
W 460 x 68,0;68,0;459;154;9,1;15,4;428;404;12;87,6;29851;1300,7;18,5;1495,4;941;122,2;3,3;192,4;3,9;52,3;5,0;44,4;461.163;1,50;W 18 x 46;171,23;153,65
W 460 x 74,0;74,0;457;190;9,0;14,5;428;404;12;94,9;33415;1462,4;18,8;1657,4;1661;174,8;4,2;271,3;4,9;53,0;6,6;44,9;811.417;1,64;W 18 x 50;172,81;152,79
W 460 x 82,0;82,0;460;191;9,9;16,0;428;404;12;104,7;37157;1615,5;18,8;1836,4;1862;195,0;4,2;303,3;5,0;70,6;6,0;40,8;915.745;1,64;W 18 x 55;156,64;138,40
W 460 x 89,0;89,0;463;192;10,5;17,7;428;404;12;114,1;41105;1775,6;19,0;2019,4;2093;218,0;4,3;339,0;5,0;92,5;5,4;38,4;1.035.073;1,65;W 18 x 60;144,61;127,78
W 460 x 97,0;97,0;466;193;11,4;19,0;428;404;12;123,4;44658;1916,7;19,0;2187,4;2283;236,6;4,3;368,8;5,0;115,1;5,1;35,4;1.137.180;1,66;W 18 x 65;134,52;118,88
W 460 x 106,0;106,0;469;194;12,6;20,6;428;404;12;135,1;48978;2088,6;19,0;2394,6;2515;259,3;4,3;405,7;5,1;148,2;4,7;32,1;1.260.063;1,67;W 18 x 71;123,61;109,25
W 530 x 66,0;66,0;525;165;8,9;11,4;502;478;12;83,6;34971;1332,2;20,5;1558,0;857;103,9;3,2;166,0;4,0;31,5;7,2;53,7;562.854;1,67;W 21 x 44;199,76;180,02
W 530 x 72,0;72,0;524;207;9,0;10,9;502;478;12;91,6;39969;1525,5;20,9;1755,9;1615;156,0;4,2;244,6;5,2;33,4;9,5;53,1;1.060.548;1,84;W 21 x 48;200,87;178,28
W 530 x 74,0;74,0;529;166;9,7;13,6;502;478;12;95,1;40969;1548,9;20,8;1804,9;1041;125,5;3,3;200,1;4,1;47,4;6,1;49,3;688.558;1,68;W 21 x 50;176,66;159,20
W 530 x 82,0;82,0;528;209;9,5;13,3;501;477;12;104,5;47569;1801,8;21,3;2058,5;2028;194,1;4,4;302,7;5,3;51,2;7,9;50,3;1.340.255;1,85;W 21 x 55;177,03;157,03
W 530 x 85,0;85,0;535;166;10,3;16,5;502;478;12;107,7;48453;1811,3;21,2;2099,8;1263;152,2;3,4;241,6;4,2;72,9;5,0;46,4;845.463;1,69;W 21 x 57;156,92;141,50
W 530 x 92,0;92,0;533;209;10,2;15,6;502;478;12;117,6;55157;2069,7;21,7;2359,8;2379;227,6;4,5;354,7;5,4;75,5;6,7;46,8;1.588.565;1,86;W 21 x 62;158,16;140,39
W 530 x 101,0;101,0;537;210;10,9;17,4;502;470;16;130,0;62198;2316,5;21,9;2640,4;2693;256,5;4,6;400,6;5,4;106,0;6,0;43,1;1.812.734;1,86;W 21 x 68;143,08;126,92
W 530 x 109,0;109,0;539;211;11,6;18,8;501;469;16;139,7;67226;2494,5;21,9;2847,0;2952;279,8;4,6;437,4;5,4;131,4;5,6;40,5;1.991.291;1,87;W 21 x 73;133,86;118,75
W 530 x 123,0*;123,0;544;212;13,1;21,2;502;470;16;157,8;76577;2815,3;22,0;3228,1;3378;318,7;4,6;500,2;5,5;186,7;5,0;35,9;2.300.400;1,88;W 21 x 83;119,14;105,70
W 530 x 138,0*;138,0;549;214;14,7;23,8;501;469;16;177,8;87079;3172,3;22,1;3653,3;3904;364,8;4,7;574,5;5,5;262,8;4,5;31,9;2.680.751;1,90;W 21 x 93;106,86;94,83
W 610 x 82,0;82,0;599;178;10,0;12,8;573;541;16;105,1;56628;1890,8;23,2;2219,9;1210;135,9;3,4;219,0;4,3;51,8;7,0;54,1;1.033.595;1,86;W 24 x 55;176,97;160,04
W 610 x 92,0;92,0;603;179;10,9;15,0;573;541;16;118,4;65277;2165,1;23,5;2535,8;1442;161,1;3,5;259,3;4,4;74,7;6,0;49,6;1.239.349;1,87;W 24 x 62;157,94;142,82
W 610 x 101,0;101,0;603;228;10,5;14,9;573;541;16;130,3;77003;2554,0;24,3;2922,7;2951;258,8;4,8;405,0;5,8;81,7;7,7;51,5;2.544.966;2,07;W 24 x 68;158,86;141,37
W 610 x 113,0;113,0;608;228;11,2;17,3;573;541;16;145,3;88196;2901,2;24,6;3312,9;3426;300,5;4,9;469,7;5,8;116,5;6,6;48,3;2.981.078;2,08;W 24 x 76;143,15;127,46
W 610 x 125,0;125,0;612;229;11,9;19,6;573;541;16;160,1;99184;3241,3;24,9;3697,3;3933;343,5;5,0;536,3;5,9;159,5;5,8;45,5;3.441.766;2,09;W 24 x 84;130,54;116,24
W 610 x 140,0;140,0;617;230;13,1;22,2;573;541;16;179,3;112619;3650,5;25,1;4173,1;4515;392,6;5,0;614,0;5,9;225,0;5,2;41,3;3.981.687;2,10;W 24 x 94;117,12;104,29
W 610 x 153,0;154,2;623;229;14,0;24,9;573;541;16;196,5;125783;4038,0;25,3;4622,7;4999;436,6;5,0;683,3;5,9;303,3;4,6;38,7;4.456.995;2,11;W 24 x 103;107,38;95,73
W 610 x 155,0;155,0;611;324;12,7;19,0;573;541;16;198,1;129583;4241,7;25,6;4749,1;10783;665,6;7,4;1022,6;8,5;200,8;8,5;42,6;9.436.714;2,47;W 24 x 104;124,68;108,33
W 610 x 174,0;174,0;616;325;14,0;21,6;573;541;16;222,8;147754;4797,2;25,8;5383,3;12374;761,5;7,5;1171,1;8,6;286,9;7,5;38,6;10.915.665;2,48;W 24 x 117;111,31;96,72
W 610 x 195,0*;195,0;622;327;15,4;24,4;573;541;16;250,1;168484;5417,5;26,0;6095,4;14240;870,9;7,6;1341 ,0;8,7;405,3;6,7;35,1;12.695.302;2,49;W 24 x 131;99,56;86,49
W 610 x 217,0;217,0;628;328;16,5;27,7;573;541;16;278,4;191395;6095,4;26,2;6868,8;16316;994,9;7,7;1531,6;8,7;570,2;5,9;32,8;14.676.643;2,51;W 24 x 146`;

const parseNumberBR = (value: string) => {
  if (!value) return NaN;
  const cleaned = value
    .toString()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned);
};

const parseSteelProfiles = (data: string): SteelProfile[] => {
  const lines = data
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const profiles: SteelProfile[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length < 9) continue;
    const name = cols[0].replace(/\"/g, "").trim();
    if (!name || (!name.startsWith("W") && !name.startsWith("HP"))) continue;
    const mass = parseNumberBR(cols[1]);
    const d = parseNumberBR(cols[2]);
    const bf = parseNumberBR(cols[3]);
    const tw = parseNumberBR(cols[4]);
    const tf = parseNumberBR(cols[5]);
    const r = parseNumberBR(cols[8]);
    if ([mass, d, bf, tw, tf, r].some((v) => !isFinite(v))) continue;
    profiles.push({
      name,
      mass,
      d: d / 1000,
      bf: bf / 1000,
      tw: tw / 1000,
      tf: tf / 1000,
      r: r / 1000,
    });
  }
  return profiles;
};

const STEEL_PROFILES = parseSteelProfiles(STEEL_PROFILE_DATA);
const getSteelProfileByName = (name?: string) =>
  STEEL_PROFILES.find((p) => p.name === name) ?? null;

const selectSteelProfile = (spanM: number, ratio = 12): SteelProfile | null => {
  if (!STEEL_PROFILES.length) return null;
  const required = spanM / ratio;
  const candidates = STEEL_PROFILES.filter((p) => p.d >= required);
  if (candidates.length > 0) {
    return candidates.reduce((best, cur) =>
      cur.mass < best.mass ? cur : best
    );
  }
  const maxD = Math.max(...STEEL_PROFILES.map((p) => p.d));
  const biggest = STEEL_PROFILES.filter((p) => p.d === maxD);
  return biggest.reduce((best, cur) => (cur.mass < best.mass ? cur : best));
};

const getSteelProfileForBeam = (
  spanM: number,
  choice: string,
  ratio = 12
) => {
  if (choice && choice !== "auto") {
    return getSteelProfileByName(choice) ?? selectSteelProfile(spanM, ratio);
  }
  return selectSteelProfile(spanM, ratio);
};

const getSteelProfileForPillar = (choice: string) => {
  if (choice && choice !== "auto") {
    return getSteelProfileByName(choice);
  }
  if (!STEEL_PROFILES.length) return null;
  return STEEL_PROFILES.reduce((best, cur) =>
    cur.mass < best.mass ? cur : best
  );
};

const buildIShape = (profile: SteelProfile) => {
  const d = profile.d;
  const bf = profile.bf;
  const tf = profile.tf;
  const tw = profile.tw;
  const halfD = d / 2;
  const halfBF = bf / 2;
  const halfTW = tw / 2;
  const shape = new Shape();
  shape.moveTo(-halfBF, halfD);
  shape.lineTo(halfBF, halfD);
  shape.lineTo(halfBF, halfD - tf);
  shape.lineTo(halfTW, halfD - tf);
  shape.lineTo(halfTW, -halfD + tf);
  shape.lineTo(halfBF, -halfD + tf);
  shape.lineTo(halfBF, -halfD);
  shape.lineTo(-halfBF, -halfD);
  shape.lineTo(-halfBF, -halfD + tf);
  shape.lineTo(-halfTW, -halfD + tf);
  shape.lineTo(-halfTW, halfD - tf);
  shape.lineTo(-halfBF, halfD - tf);
  shape.closePath();
  return shape;
};

const getFilletMidpoints = (profile: SteelProfile) => {
  const { d, tf, tw, r } = profile;
  if (!isFinite(r) || r <= 0) return [];
  const halfD = d / 2;
  const halfTW = tw / 2;
  const offset = r / Math.SQRT2;
  const cxRight = halfTW + r;
  const cxLeft = -halfTW - r;
  const cyTop = halfD - tf - r;
  const cyBottom = -halfD + tf + r;
  return [
    { x: cxRight - offset, y: cyTop + offset },
    { x: cxLeft + offset, y: cyTop + offset },
    { x: cxRight - offset, y: cyBottom - offset },
    { x: cxLeft + offset, y: cyBottom - offset },
  ];
};

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
// VIEW CUBE   vers o que funcionou
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
            depthTest={false} // n o "briga" com a cena
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
  const isSteel = !!beam.isSteel;
  const steelProfile = isSteel ? getSteelProfileByName(beam.steelProfile) : null;

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
      : beam.role === "secondary"
        ? "#ffd200"
      : isSelected
        ? "#ffcc00"
        : "#8888ff";

  if (isSteel && steelProfile) {
    const shape = buildIShape(steelProfile);
    const filletPoints = getFilletMidpoints(steelProfile);
    return (
      <mesh
        position={[midX, midY, centerZ]}
        rotation={[0, 0, angle]}
        onClick={(e) => {
          e.stopPropagation();
          onClick && onClick();
        }}
      >
        <extrudeGeometry
          args={[
            shape,
            {
              depth: span,
              bevelEnabled: false,
            },
          ]}
          onUpdate={(geom) => {
            if (!geom.userData.centered) {
              // Alinha: extrusão no eixo X, altura no eixo Z (alma em pé)
              geom.rotateY(Math.PI / 2);
              geom.rotateX(Math.PI / 2);
              geom.translate(-span / 2, 0, 0);
              geom.userData.centered = true;
            }
          }}
        />
        <meshStandardMaterial color={color} />
        <Edges color="#111" />
        {filletPoints.map((pt, idx) => (
          <Line
            key={`fillet-${idx}`}
            points={[
              [-span / 2, pt.x, pt.y],
              [span / 2, pt.x, pt.y],
            ]}
            color="#111"
            lineWidth={1}
            raycast={(_r: any, _i: any) => null}
          />
        ))}
      </mesh>
    );
  }

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
  const isSteel = !!pillar.isSteel;
  const steelProfile = isSteel ? getSteelProfileByName(pillar.steelProfile) : null;

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

  if (isSteel && steelProfile) {
    const shape = buildIShape(steelProfile);
    const filletPoints = getFilletMidpoints(steelProfile);
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
        <extrudeGeometry
          args={[
            shape,
            {
              depth: h,
              bevelEnabled: false,
            },
          ]}
          onUpdate={(geom) => {
            if (!geom.userData.centered) {
              geom.translate(0, 0, -h / 2);
              geom.userData.centered = true;
            }
          }}
        />
        <meshStandardMaterial color={color} />
        <Edges color="#111" />
        {filletPoints.map((pt, idx) => (
          <Line
            key={`pillar-fillet-${idx}`}
            points={[
              [pt.x, pt.y, -h / 2],
              [pt.x, pt.y, h / 2],
            ]}
            color="#111"
            lineWidth={1}
            raycast={(_r: any, _i: any) => null}
          />
        ))}
      </mesh>
    );
  }

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
  // v os m ximos para gera  o autom tica de pilares
  const [maxSpanX, setMaxSpanX] = useState(6); // m
  const [maxSpanY, setMaxSpanY] = useState(6); // m

    // VIGAS
  const [beams, setBeams] = useState<Beam[]>([]);
  const [drawBeamMode, setDrawBeamMode] = useState(false);
  const [beamTempStart, setBeamTempStart] = useState<{
    point: Point3;
    pillarId: number;
  } | null>(null);
  const [beamChainStartId, setBeamChainStartId] = useState<number | null>(null);
  const [beamChainPoints, setBeamChainPoints] = useState<Point3[]>([]);
  const [beamHoverPillarId, setBeamHoverPillarId] = useState<number | null>(null);
  const [beamCantileverMode, setBeamCantileverMode] = useState(false);
  const [beamMaterial, setBeamMaterial] = useState<MaterialType>("concreto");
  const [beamSteelProfile, setBeamSteelProfile] = useState<string>("auto");
  const [secondaryEnabled, setSecondaryEnabled] = useState(false);
  const [deckSpan, setDeckSpan] = useState(4);
  const [secondaryMaterial, setSecondaryMaterial] =
    useState<MaterialType>("metalico");
  const [secondarySteelProfile, setSecondarySteelProfile] =
    useState<string>("auto");
  const [slabs, setSlabs] = useState<Point3[][]>([]);
  const primaryBeamsKeyRef = useRef<string>("");
  const [supportBeamMode, setSupportBeamMode] = useState(false);
  const [supportSourceBeamId, setSupportSourceBeamId] = useState<number | null>(null);
  const [supportTargetBeamId, setSupportTargetBeamId] = useState<number | null>(null);
  const [supportAngleInput, setSupportAngleInput] = useState("");
  // modo ret ngulo de vigas (per metro retangular)
  const [drawRectBeamMode, setDrawRectBeamMode] = useState(false);
  const [rectTempStart, setRectTempStart] = useState<Point3 | null>(null);

  // modo polilinha de vigas (per metro qualquer)
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
    const x = guideX != null ? guideX : target.x;
    const y = guideY != null ? guideY : target.y;
    return { ...target, x, y };
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
      const res = applyAddBeamBetween(last, first, curP, curB, "pre");
      curP = res.pillars;
      curB = res.beams;
    }

    if (points.length >= 3) {
      const polyPoints =
        dist <= 1e-6 ? closedPoints.slice(0, -1) : closedPoints;
      registerSlab(polyPoints);
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

  const resetBeamChain = () => {
    setBeamChainStartId(null);
    setBeamChainPoints([]);
  };

  const registerSlab = (poly: Point3[]) => {
    if (poly.length < 3) return;
    const norm = poly.map((p) => ({
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000,
      z: 0,
    }));
    setSlabs((prev) => [...prev, norm]);
  };

  const stripSecondaryArtifacts = (pillarList: Pillar[], beamList: Beam[]) => {
    const keptPillars = pillarList.filter(
      (p) => !(p.hidden && p.kind === "anchor" && p.anchorRole === "secondary")
    );
    const keptIds = new Set(keptPillars.map((p) => p.id));
    const keptBeams = beamList.filter(
      (b) =>
        b.role !== "secondary" &&
        keptIds.has(b.startId) &&
        keptIds.has(b.endId)
    );
    return { pillars: keptPillars, beams: keptBeams };
  };

  const rebuildSecondaryBeams = (
    pillarList: Pillar[],
    beamList: Beam[],
    slabList: Point3[][]
  ) => {
    const base = stripSecondaryArtifacts(pillarList, beamList);
    if (!secondaryEnabled || deckSpan <= 0 || slabList.length === 0) {
      return base;
    }
    let curP = [...base.pillars];
    let curB = [...base.beams];
    slabList.forEach((poly) => {
      const bounds = {
        minX: Math.min(...poly.map((p) => p.x)),
        maxX: Math.max(...poly.map((p) => p.x)),
        minY: Math.min(...poly.map((p) => p.y)),
        maxY: Math.max(...poly.map((p) => p.y)),
      };
      const lines = collectPrimaryLinesFromBeams(poly, curB);
      const res = appendSecondaryBeamsWithLines(
        poly,
        curP,
        curB,
        lines.xs,
        lines.ys,
        bounds
      );
      curP = res.pillars;
      curB = res.beams;
    });
    const refreshed = refreshBeamsFromAnchors(curB, curP);
    return { pillars: curP, beams: refreshed };
  };

  const recalcSecondaryFromCurrent = (
    pillarList: Pillar[] = pillars,
    beamList: Beam[] = beams
  ) => {
    const base = stripSecondaryArtifacts(pillarList, beamList);
    const derivedSlabs = recomputeSlabsFromBeams(base.pillars, base.beams);
    setSlabs(derivedSlabs);
    if (!secondaryEnabled || deckSpan <= 0) {
      setPillars(base.pillars);
      setBeams(base.beams);
      return;
    }
    const rebuilt = rebuildSecondaryBeams(
      base.pillars,
      base.beams,
      derivedSlabs
    );
    setPillars(rebuilt.pillars);
    setBeams(rebuilt.beams);
  };

  const getPrimaryBeamsKey = (beamList: Beam[]) =>
    beamList
      .filter((b) => b.role !== "secondary")
      .map(
        (b) =>
          `${Math.min(b.startId, b.endId)}|${Math.max(b.startId, b.endId)}|${b.x1.toFixed(3)}|${b.y1.toFixed(3)}|${b.x2.toFixed(3)}|${b.y2.toFixed(3)}`
      )
      .sort()
      .join(";");

  const coversRange = (segments: Array<[number, number]>, min: number, max: number, tol = 1e-4) => {
    if (segments.length === 0) return false;
    const sorted = segments
      .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let curStart = sorted[0][0];
    let curEnd = sorted[0][1];
    for (let i = 1; i < sorted.length; i++) {
      const [s, e] = sorted[i];
      if (s <= curEnd + tol) {
        curEnd = Math.max(curEnd, e);
      } else {
        if (curStart <= min + tol && curEnd >= max - tol) return true;
        curStart = s;
        curEnd = e;
      }
    }
    return curStart <= min + tol && curEnd >= max - tol;
  };

  const recomputeSlabsFromBeams = (
    pillarList: Pillar[],
    beamList: Beam[]
  ): Point3[][] => {
    const primaryBeams = beamList.filter((b) => b.role !== "secondary");
    if (primaryBeams.length === 0) return [];
    const quant = (v: number) => Math.round(v * 1000) / 1000;
    const axisTol = 1e-3;
    const beamsByPillar = new Map<number, Beam[]>();
    primaryBeams.forEach((b) => {
      const a = b.startId;
      const c = b.endId;
      if (!beamsByPillar.has(a)) beamsByPillar.set(a, []);
      if (!beamsByPillar.has(c)) beamsByPillar.set(c, []);
      beamsByPillar.get(a)!.push(b);
      beamsByPillar.get(c)!.push(b);
    });

    const visited = new Set<number>();
    const slabsOut: Point3[][] = [];
    const tol = 1e-4;

    primaryBeams.forEach((b) => {
      if (visited.has(b.id)) return;
      const queue = [b];
      const compBeams: Beam[] = [];
      visited.add(b.id);
      while (queue.length) {
        const cur = queue.pop()!;
        compBeams.push(cur);
        const nextPillars = [cur.startId, cur.endId];
        nextPillars.forEach((pid) => {
          const list = beamsByPillar.get(pid) ?? [];
          list.forEach((nb) => {
            if (visited.has(nb.id)) return;
            visited.add(nb.id);
            queue.push(nb);
          });
        });
      }

      const axisBeams = compBeams.filter(
        (bb) =>
          Math.abs(bb.x1 - bb.x2) <= axisTol ||
          Math.abs(bb.y1 - bb.y2) <= axisTol
      );
      if (axisBeams.length === 0) return;

      const horiz = axisBeams.filter(
        (bb) => Math.abs(bb.y1 - bb.y2) <= axisTol
      );
      const vert = axisBeams.filter(
        (bb) => Math.abs(bb.x1 - bb.x2) <= axisTol
      );
      if (horiz.length === 0 || vert.length === 0) return;

      const horizMap = new Map<number, Array<[number, number]>>();
      horiz.forEach((bb) => {
        const y = quant((bb.y1 + bb.y2) / 2);
        const list = horizMap.get(y) ?? [];
        list.push([bb.x1, bb.x2]);
        horizMap.set(y, list);
      });
      const vertMap = new Map<number, Array<[number, number]>>();
      vert.forEach((bb) => {
        const x = quant((bb.x1 + bb.x2) / 2);
        const list = vertMap.get(x) ?? [];
        list.push([bb.y1, bb.y2]);
        vertMap.set(x, list);
      });

      const yVals = uniqueSorted(Array.from(horizMap.keys()));
      const xVals = uniqueSorted(Array.from(vertMap.keys()));
      if (yVals.length < 2 || xVals.length < 2) return;

      const yMin = yVals[0];
      const yMax = yVals[yVals.length - 1];
      const xMin = xVals[0];
      const xMax = xVals[xVals.length - 1];

      const xDivs: number[] = [];
      xVals.forEach((x) => {
        const segments = vertMap.get(x) ?? [];
        if (coversRange(segments, yMin, yMax, axisTol)) xDivs.push(x);
      });
      const yDivs: number[] = [];
      yVals.forEach((y) => {
        const segments = horizMap.get(y) ?? [];
        if (coversRange(segments, xMin, xMax, axisTol)) yDivs.push(y);
      });

      const xs = uniqueSorted(xDivs);
      const ys = uniqueSorted(yDivs);
      if (xs.length < 2 || ys.length < 2) return;

      for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < ys.length - 1; j++) {
          const a = { x: xs[i], y: ys[j], z: 0 };
          const b2 = { x: xs[i + 1], y: ys[j], z: 0 };
          const c2 = { x: xs[i + 1], y: ys[j + 1], z: 0 };
          const d2 = { x: xs[i], y: ys[j + 1], z: 0 };
          slabsOut.push([a, b2, c2, d2]);
        }
      }
    });

    if (slabsOut.length > 0) return slabsOut;

    const tol2 = axisTol;
    const axisBeamsAll = primaryBeams.filter(
      (bb) =>
        Math.abs(bb.x1 - bb.x2) <= tol2 || Math.abs(bb.y1 - bb.y2) <= tol2
    );
    const horizAll = axisBeamsAll.filter(
      (bb) => Math.abs(bb.y1 - bb.y2) <= tol2
    );
    const vertAll = axisBeamsAll.filter(
      (bb) => Math.abs(bb.x1 - bb.x2) <= tol2
    );
    if (horizAll.length === 0 || vertAll.length === 0) return slabsOut;
    const horizAllMap = new Map<number, Array<[number, number]>>();
    horizAll.forEach((bb) => {
      const y = quant((bb.y1 + bb.y2) / 2);
      const list = horizAllMap.get(y) ?? [];
      list.push([bb.x1, bb.x2]);
      horizAllMap.set(y, list);
    });
    const vertAllMap = new Map<number, Array<[number, number]>>();
    vertAll.forEach((bb) => {
      const x = quant((bb.x1 + bb.x2) / 2);
      const list = vertAllMap.get(x) ?? [];
      list.push([bb.y1, bb.y2]);
      vertAllMap.set(x, list);
    });
    const yValsAll = uniqueSorted(Array.from(horizAllMap.keys()));
    const xValsAll = uniqueSorted(Array.from(vertAllMap.keys()));
    if (yValsAll.length < 2 || xValsAll.length < 2) return slabsOut;
    const yMin = yValsAll[0];
    const yMax = yValsAll[yValsAll.length - 1];
    const xMin = xValsAll[0];
    const xMax = xValsAll[xValsAll.length - 1];
    const leftSegs = vertAllMap.get(xMin) ?? [];
    const rightSegs = vertAllMap.get(xMax) ?? [];
    const bottomSegs = horizAllMap.get(yMin) ?? [];
    const topSegs = horizAllMap.get(yMax) ?? [];
    if (
      coversRange(leftSegs, yMin, yMax) &&
      coversRange(rightSegs, yMin, yMax) &&
      coversRange(bottomSegs, xMin, xMax) &&
      coversRange(topSegs, xMin, xMax)
    ) {
      slabsOut.push([
        { x: xMin, y: yMin, z: 0 },
        { x: xMax, y: yMin, z: 0 },
        { x: xMax, y: yMax, z: 0 },
        { x: xMin, y: yMax, z: 0 },
      ]);
    }

    return slabsOut;
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
  const [pillarMaterial, setPillarMaterial] = useState<MaterialType>("concreto");
  const [pillarSteelProfile, setPillarSteelProfile] =
    useState<string>("auto");

  const [alignMode, setAlignMode] = useState<
    "livre" | "horizontal" | "vertical"
  >("livre");

const [activePanel, setActivePanel] = useState<"pdf" | "pillars" | "modify">(
  "pdf"
);

  const pillarIsSteel = pillarMaterial === "metalico";
  const beamIsSteel = beamMaterial === "metalico";
  const secondaryIsSteel = secondaryMaterial === "metalico";

  const isOrtho = viewMode !== "3d";

  // SHIFT -> for a 3D/perspectiva
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

  useEffect(() => {
    if (!secondaryEnabled) {
      const stripped = stripSecondaryArtifacts(pillars, beams);
      setPillars(stripped.pillars);
      setBeams(stripped.beams);
      return;
    }
    const base = stripSecondaryArtifacts(pillars, beams);
    const derivedSlabs = recomputeSlabsFromBeams(base.pillars, base.beams);
    setSlabs(derivedSlabs);
    const rebuilt = rebuildSecondaryBeams(
      base.pillars,
      base.beams,
      derivedSlabs
    );
    setPillars(rebuilt.pillars);
    setBeams(rebuilt.beams);
  }, [secondaryEnabled, deckSpan, secondaryMaterial, secondarySteelProfile]);

  useEffect(() => {
    if (!secondaryEnabled) return;
    const key = getPrimaryBeamsKey(beams);
    if (key === primaryBeamsKeyRef.current) return;
    primaryBeamsKeyRef.current = key;
    recalcSecondaryFromCurrent();
  }, [beams, secondaryEnabled]);

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

  function pointInPolygon(
    poly: Point3[],
    x: number,
    y: number,
    includeEdge = true
  ) {
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
        return includeEdge;
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
      (p) => !pointInPolygon(poly, p.x, p.y, false)
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
    return { ...p, x: best.x, y: best.y };
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

  const getBeamDesignRatio = (beam: Beam) =>
    beam.role === "secondary" ? 24 : beam.isSteel ? 12 : 10;

  const computeBeamSection = (beam: Beam, span: number) => {
    const ratio = getBeamDesignRatio(beam);
    if (!beam.isSteel) {
      return {
        width: beam.width,
        height: span / ratio,
        steelProfile: beam.steelProfile,
      };
    }
    const profile =
      beam.steelAuto
        ? getSteelProfileForBeam(span, "auto", ratio)
        : getSteelProfileByName(beam.steelProfile);
    const resolved = profile ?? getSteelProfileForBeam(span, "auto", ratio);
    return {
      width: resolved ? resolved.bf : beam.width,
      height: resolved ? resolved.d : span / ratio,
      steelProfile: resolved?.name ?? beam.steelProfile,
    };
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
      const section = computeBeamSection(b, span);
      next.push({
        ...b,
        x1,
        y1,
        x2,
        y2,
        width: section.width,
        height: section.height,
        steelProfile: section.steelProfile,
      });
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

    const ratio = beamIsSteel ? 12 : 10;
    const steelProfile = beamIsSteel
      ? getSteelProfileForBeam(span, beamSteelProfile, ratio)
      : null;
    const width = steelProfile ? steelProfile.bf : 0.15;
    const height = steelProfile ? steelProfile.d : span / ratio;
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
      isSteel: beamIsSteel,
      steelProfile: steelProfile?.name,
      steelAuto: beamSteelProfile === "auto",
      role: "primary",
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
    width = 0.15,
    template?: Beam,
    role: BeamRole = "primary"
  ): Beam | null => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy);
    if (span === 0) return null;
    const beamRole = template?.role ?? role;
    const useSteel = template ? !!template.isSteel : beamIsSteel;
    const steelChoice = template
      ? template.steelAuto ||
        !template.steelProfile ||
        template.steelProfile === "auto"
        ? "auto"
        : template.steelProfile
      : beamSteelProfile;
    const steelAuto =
      template
        ? template.steelAuto ||
          !template.steelProfile ||
          template.steelProfile === "auto"
        : beamSteelProfile === "auto";
    const ratio = beamRole === "secondary" ? 24 : useSteel ? 12 : 10;
    const steelProfile = useSteel
      ? getSteelProfileForBeam(span, steelChoice, ratio)
      : null;
    const beamWidth = steelProfile ? steelProfile.bf : width;
    const beamHeight = steelProfile
      ? steelProfile.d
      : useSteel
        ? span / ratio
        : span / ratio;
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
      width: beamWidth,
      height: beamHeight,
      isSteel: useSteel,
      steelProfile: steelProfile?.name,
      steelAuto,
      role: beamRole,
    };
  };

  const buildSecondaryBeamBetweenPillars = (a: Pillar, b: Pillar): Beam | null => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy);
    if (span === 0) return null;
    const ratio = 24;
    const steelProfile = secondaryIsSteel
      ? getSteelProfileForBeam(span, secondarySteelProfile, ratio)
      : null;
    const beamWidth = steelProfile ? steelProfile.bf : 0.15;
    const beamHeight = steelProfile ? steelProfile.d : span / ratio;
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
      width: beamWidth,
      height: beamHeight,
      isSteel: secondaryIsSteel,
      steelProfile: steelProfile?.name,
      steelAuto: secondarySteelProfile === "auto",
      role: "secondary",
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

    const startPoint = beamTempStart?.point ?? null;
    const guide = computeSnapGuides(point);
    let target = snapToGuides({ x: point.x, y: point.y, z: 0 }, guide.x, guide.y);
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

    if (startPoint) {
      const aligned = getNearestAlignedPillar(target, startPoint, 0.4, 0.05);
      if (aligned) {
        target = { ...target, x: aligned.x, y: aligned.y };
      }
    } else {
      const nearestExact = findNearest(target, false, 0.4);
      if (nearestExact) {
        target = { ...target, x: nearestExact.x, y: nearestExact.y };
      }
    }

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
    let nextPillars = res.pillars;
    let nextBeams = res.beams;

    if (!endPillar.hidden) {
      const startId = beamChainStartId ?? startPillar.id;
      const startPoint =
        beamChainStartId == null
          ? { x: startPillar.x, y: startPillar.y, z: 0 }
          : beamChainPoints[0];
      const nextPoints =
        beamChainStartId == null
          ? [startPoint, { x: endPillar.x, y: endPillar.y, z: 0 }]
          : [...beamChainPoints, { x: endPillar.x, y: endPillar.y, z: 0 }];

      if (endPillar.id === startId && nextPoints.length >= 3) {
        const poly =
          nextPoints.length > 1 &&
          Math.hypot(
            nextPoints[0].x - nextPoints[nextPoints.length - 1].x,
            nextPoints[0].y - nextPoints[nextPoints.length - 1].y
          ) <= 1e-6
            ? nextPoints.slice(0, -1)
            : nextPoints;
        registerSlab(poly);
        const { xs, ys } = collectPrimaryLinesFromBeams(poly, nextBeams);
        const bounds = {
          minX: Math.min(...poly.map((p) => p.x)),
          maxX: Math.max(...poly.map((p) => p.x)),
          minY: Math.min(...poly.map((p) => p.y)),
          maxY: Math.max(...poly.map((p) => p.y)),
        };
        const secRes = appendSecondaryBeamsWithLines(
          poly,
          nextPillars,
          nextBeams,
          xs,
          ys,
          bounds
        );
        nextPillars = secRes.pillars;
        nextBeams = secRes.beams;
        resetBeamChain();
      } else {
        setBeamChainStartId(startId);
        setBeamChainPoints(nextPoints);
      }
    }

    setPillars(nextPillars);
    setBeams(nextBeams);
    if (secondaryEnabled) {
      recalcSecondaryFromCurrent(nextPillars, nextBeams);
    }
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
    const beamA = buildBeamBetweenPillars(startP, anchor, beam.width, beam);
    const beamB = buildBeamBetweenPillars(anchor, endP, beam.width, beam);
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
    const section = computeBeamSection(nextSource, span);
    nextSource = {
      ...nextSource,
      x1: newStart.x,
      y1: newStart.y,
      x2: newEnd.x,
      y2: newEnd.y,
      width: section.width,
      height: section.height,
      steelProfile: section.steelProfile,
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
    registerSlab(poly);
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
      const axisTol = 1e-4;
      const aligned =
        Math.abs(a.x - b.x) <= axisTol || Math.abs(a.y - b.y) <= axisTol;
      if (!aligned) return;
      const newBeam = buildBeamBetweenPillars(a, b);
      if (!newBeam) return;
      curBeams.push(newBeam);
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

    if (gridMode === "contour") {
      const tol = 1e-4;
      const isInList = (val: number, list: number[]) =>
        list.some((v) => Math.abs(v - val) <= tol);
      const nearestInList = (val: number, list: number[]) =>
        list.reduce((best, v) =>
          Math.abs(v - val) < Math.abs(best - val) ? v : best
        );
      const segmentInside = (a: Point3, b: Point3) => {
        const steps = 4;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          if (!pointInPolygon(poly, x, y)) return false;
        }
        return true;
      };
      const ensurePillarAt = (x: number, y: number) => {
        const found = curPillars.find(
          (p) => isVisiblePillar(p) && Math.hypot(p.x - x, p.y - y) <= gridTol
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
      const addBeamBetweenPillars = (a: Pillar, b: Pillar) => {
        const exists = curBeams.some(
          (bb) =>
            (bb.startId === a.id && bb.endId === b.id) ||
            (bb.startId === b.id && bb.endId === a.id)
        );
        if (exists) return;
        const newBeam = buildBeamBetweenPillars(a, b);
        if (!newBeam) return;
        curBeams.push(newBeam);
      };

      const diagonalBeams = baseBeams.filter(
        (b) =>
          Math.abs(b.x1 - b.x2) > tol && Math.abs(b.y1 - b.y2) > tol
      );
      if (diagonalBeams.length > 0) {
        const diagonalPillars = curPillars.filter(
          (p) =>
            isVisiblePillar(p) &&
            diagonalBeams.some((b) => isPillarOnBeam(p, b, 0.02, 0.02))
        );
        diagonalPillars.forEach((p) => {
          const hasX = isInList(p.x, xsMerged);
          const hasY = isInList(p.y, ysMerged);
          if (hasX && hasY) return;

          const nearestX = nearestInList(p.x, xsMerged);
          const nearestY = nearestInList(p.y, ysMerged);
          const horiz = { x: nearestX, y: p.y, z: 0 };
          const vert = { x: p.x, y: nearestY, z: 0 };
          const hDist = Math.abs(nearestX - p.x);
          const vDist = Math.abs(nearestY - p.y);

          const tryConnect = (target: Point3) => {
            if (!segmentInside({ x: p.x, y: p.y, z: 0 }, target)) return false;
            const targetPillar = ensurePillarAt(target.x, target.y);
            addBeamBetweenPillars(p, targetPillar);
            return true;
          };

          if (hasX && !hasY) {
            tryConnect(vert);
            return;
          }
          if (hasY && !hasX) {
            tryConnect(horiz);
            return;
          }
          if (hDist <= vDist) {
            if (!tryConnect(horiz)) {
              tryConnect(vert);
            }
          } else {
            if (!tryConnect(vert)) {
              tryConnect(horiz);
            }
          }
        });
      }
    }

    const primaryLines = collectPrimaryLinesFromBeams(poly, curBeams);
    const secondaryResult = appendSecondaryBeamsWithLines(
      poly,
      curPillars,
      curBeams,
      primaryLines.xs.length ? primaryLines.xs : xsMerged,
      primaryLines.ys.length ? primaryLines.ys : ysMerged,
      { minX, maxX, minY, maxY }
    );
    curPillars = secondaryResult.pillars;
    curBeams = secondaryResult.beams;

    const enforced = enforceAutoPillars(curPillars, curBeams);
    const refreshed = refreshBeamsFromAnchors(curBeams, enforced);

    const dedupeByPosition = (pillarsIn: Pillar[], beamsIn: Beam[]) => {
      const key = (p: Pillar) => `${p.x.toFixed(4)}|${p.y.toFixed(4)}`;
      const pickWinner = (a: Pillar, b: Pillar) => {
        const score = (p: Pillar) => {
          let s = 0;
          if (!p.hidden) s += 8;
          if (isPillarActive(p)) s += 4;
          if (p.kind === "pre") s += 3;
          else if (p.kind === "auto") s += 2;
          else if (p.kind === "temp") s += 1;
          return s;
        };
        return score(b) > score(a) ? b : a;
      };
      const chosenByKey = new Map<string, Pillar>();
      const remap = new Map<number, number>();
      pillarsIn.forEach((p) => {
        const k = key(p);
        const existing = chosenByKey.get(k);
        if (!existing) {
          chosenByKey.set(k, p);
          return;
        }
        const winner = pickWinner(existing, p);
        const loser = winner === existing ? p : existing;
        chosenByKey.set(k, winner);
        remap.set(loser.id, winner.id);
      });
      const nextPillars = Array.from(chosenByKey.values());
      const nextBeams = beamsIn.map((b) => {
        const startId = remap.get(b.startId) ?? b.startId;
        const endId = remap.get(b.endId) ?? b.endId;
        const originStartId = remap.get(b.originStartId ?? b.startId) ?? (b.originStartId ?? b.startId);
        const originEndId = remap.get(b.originEndId ?? b.endId) ?? (b.originEndId ?? b.endId);
        return { ...b, startId, endId, originStartId, originEndId };
      });
      const seen = new Set<string>();
      const uniqueBeams: Beam[] = [];
      nextBeams.forEach((b) => {
        const a = Math.min(b.startId, b.endId);
        const c = Math.max(b.startId, b.endId);
        const k = `${a}|${c}`;
        if (seen.has(k)) return;
        seen.add(k);
        uniqueBeams.push(b);
      });
      return { pillars: nextPillars, beams: uniqueBeams };
    };

    const deduped = dedupeByPosition(enforced, refreshed);
    setPillars(deduped.pillars);
    setBeams(deduped.beams);
    if (secondaryEnabled) {
      recalcSecondaryFromCurrent(deduped.pillars, deduped.beams);
    }
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
    if (pillarIsSteel && kind !== "anchor") {
      const profile = getSteelProfileForPillar(pillarSteelProfile);
      if (profile) {
        base.isSteel = true;
        base.steelProfile = profile.name;
        base.steelAuto = pillarSteelProfile === "auto";
      }
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
    const axisKey = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);

    const horizAlign = new Map<string, Set<number>>();
    const vertAlign = new Map<string, Set<number>>();

    beamList.forEach((b) => {
      if (b.role === "secondary") return;
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const isHoriz = Math.abs(dy) <= tolPos;
      const isVert = Math.abs(dx) <= tolPos;
      if (!isHoriz && !isVert) return;
      const minX = Math.min(b.x1, b.x2);
      const maxX = Math.max(b.x1, b.x2);
      const minY = Math.min(b.y1, b.y2);
      const maxY = Math.max(b.y1, b.y2);
      const mapKey = isHoriz
        ? `h|${axisKey(minX)}|${axisKey(maxX)}`
        : `v|${axisKey(minY)}|${axisKey(maxY)}`;
      const targetMap = isHoriz ? horizAlign : vertAlign;
      if (!targetMap.has(mapKey)) targetMap.set(mapKey, new Set());
      const set = targetMap.get(mapKey)!;
      const ux = dx / len;
      const uy = dy / len;
      pillarsWork.forEach((p) => {
        if (!isPillarActive(p)) return;
        const vx = p.x - b.x1;
        const vy = p.y - b.y1;
        const t = vx * ux + vy * uy;
        if (t < -tolPos || t > len + tolPos) return;
        const perp = Math.abs(vx * -uy + vy * ux);
        if (perp > tolPerp) return;
        if (isHoriz) set.add(p.x);
        else set.add(p.y);
      });
    });

    const findAt = (x: number, y: number) =>
      pillarsWork.find(
        (p) => isPillarActive(p) && Math.hypot(p.x - x, p.y - y) <= tolPos
      );

    const ensureAutoAt = (x: number, y: number) => {
      const found = findAt(x, y);
      if (found) {
        if (pillarIsSteel && isAutoLike(found) && !found.isSteel) {
          const profile = getSteelProfileForPillar(pillarSteelProfile);
          if (profile) {
            found.isSteel = true;
            found.steelProfile = profile.name;
            found.steelAuto = pillarSteelProfile === "auto";
          }
        }
        return found.id;
      }
      const created = makeAutoPillar(x, y);
      pillarsWork.push(created);
      return created.id;
    };

    beamList.forEach((b) => {
      if (b.role === "secondary") return;
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

      if (!isDiagonal) {
        if (useX) {
          const minX = Math.min(b.x1, b.x2);
          const maxX = Math.max(b.x1, b.x2);
          const mapKey = `h|${axisKey(minX)}|${axisKey(maxX)}`;
          const alignedXs = horizAlign.get(mapKey);
          if (alignedXs && alignedXs.size > 0) {
            alignedXs.forEach((x) => {
              const t = (x - b.x1) * ux;
              if (t < -tolPos || t > len + tolPos) return;
              const y = b.y1 + uy * t;
              ensureAutoAt(x, y);
            });
          }
        } else {
          const minY = Math.min(b.y1, b.y2);
          const maxY = Math.max(b.y1, b.y2);
          const mapKey = `v|${axisKey(minY)}|${axisKey(maxY)}`;
          const alignedYs = vertAlign.get(mapKey);
          if (alignedYs && alignedYs.size > 0) {
            alignedYs.forEach((y) => {
              const t = (y - b.y1) * uy;
              if (t < -tolPos || t > len + tolPos) return;
              const x = b.x1 + ux * t;
              ensureAutoAt(x, y);
            });
          }
        }
      }

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
      if (b.role === "secondary") return;
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
        const newBeam = buildBeamBetweenPillars(a, c);
        if (!newBeam) return;
        nextBeams.push(newBeam);
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
        hidden: true,
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
      original.hidden = true;
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

    const rebuilt = finalize
      ? rebuildSecondaryBeams(expandedPillars, refreshed, slabs)
      : { pillars: expandedPillars, beams: refreshed };
    setPillars(rebuilt.pillars);
    setBeams(rebuilt.beams);
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
      const clone = byId.get(cloneId);
      if (!clone) return;
      removeIds.add(originalId);
      clone.kind = "pre";
      clone.state = "active";
      clone.moveClone = false;
      clone.cloneOfId = undefined;
      clone.hidden = false;
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
  setSlabs([]);
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
  resetBeamChain();
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
  const target = beams.find((b) => b.id === selectedBeamId);
  if (target?.isSteel) return;
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
    if (beamHoverPillarId != null) {
      const hovered = pillars.find(
        (pp) => pp.id === beamHoverPillarId && isVisiblePillar(pp)
      );
      if (hovered) {
        handleBeamPointClick({ x: hovered.x, y: hovered.y, z: 0 });
        return;
      }
    }
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

    if (!drawPolylineMode && drawBeamMode) {
      const guide = computeSnapGuides(p);
      let guideX = guide.x;
      let guideY = guide.y;
      if (beamTempStart) {
        if (drawAxisLock === "x") guideX = beamTempStart.point.x;
        if (drawAxisLock === "y") guideY = beamTempStart.point.y;
      }
      setSnapGuideX(guideX);
      setSnapGuideY(guideY);
    } else if (!drawPolylineMode && (insertMode || moveMode)) {
      const guide = computeSnapGuides(p);
      setSnapGuideX(guide.x);
      setSnapGuideY(guide.y);
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

  const showSnapGuides =
    drawPolylineMode || drawBeamMode || insertMode || moveMode;
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
    const tolPerp = 0.05; // toler ncia transversal (m)
    const margin = 0.05; // margem longitudinal (m)

    const candidates = pillars
      .filter(isVisiblePillar)
      .map((p) => {
        const vx = p.x - x1;
        const vy = p.y - y1;
        const t = vx * ux + vy * uy; // proje  o ao longo da viga
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
      const ratio = getBeamDesignRatio(beam);
      const steelSection = beam.isSteel
        ? (() => {
            const span = Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1);
            const profile =
              beam.steelAuto || !beam.steelProfile || beam.steelProfile === "auto"
                ? getSteelProfileForBeam(span, "auto", ratio)
                : getSteelProfileByName(beam.steelProfile);
            const resolved = profile ?? getSteelProfileForBeam(span, "auto", ratio);
            return {
              width: resolved ? resolved.bf : beam.width,
              height: resolved ? resolved.d : span / ratio,
              steelProfile: resolved?.name ?? beam.steelProfile,
            };
          })()
        : null;
      return [
        {
          id: `${beam.id}-0`,
          beamId: beam.id,
          x1: beam.x1,
          y1: beam.y1,
          x2: beam.x2,
          y2: beam.y2,
          width: steelSection ? steelSection.width : beam.width,
          height: steelSection ? steelSection.height : beam.height,
          isSteel: beam.isSteel,
          steelProfile: steelSection?.steelProfile ?? beam.steelProfile,
          steelAuto: beam.steelAuto,
          role: beam.role,
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
      const ratio = getBeamDesignRatio(beam);
      const steelSection = beam.isSteel
        ? (() => {
            const profile =
              beam.steelAuto || !beam.steelProfile || beam.steelProfile === "auto"
                ? getSteelProfileForBeam(segLen, "auto", ratio)
                : getSteelProfileByName(beam.steelProfile);
            const resolved = profile ?? getSteelProfileForBeam(segLen, "auto", ratio);
            return {
              width: resolved ? resolved.bf : beam.width,
              height: resolved ? resolved.d : segLen / ratio,
              steelProfile: resolved?.name ?? beam.steelProfile,
            };
          })()
        : null;
      const segHeight = steelSection ? steelSection.height : segLen / ratio; // aço usa d do perfil

      const seg: BeamSegment = {
        id: `${beam.id}-${i}`,
        beamId: beam.id,
        x1: beam.x1 + (beam.x2 - beam.x1) * (t1 / len),
        y1: beam.y1 + (beam.y2 - beam.y1) * (t1 / len),
        x2: beam.x1 + (beam.x2 - beam.x1) * (t2 / len),
        y2: beam.y1 + (beam.y2 - beam.y1) * (t2 / len),
        width: steelSection ? steelSection.width : beam.width,
        height: segHeight,
        isSteel: beam.isSteel,
        steelProfile: steelSection?.steelProfile ?? beam.steelProfile,
        steelAuto: beam.steelAuto,
        role: beam.role,
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
          height: beam.isSteel
            ? beam.height
            : Math.sqrt(
                (beam.x2 - beam.x1) * (beam.x2 - beam.x1) +
                  (beam.y2 - beam.y1) * (beam.y2 - beam.y1)
              ) / getBeamDesignRatio(beam),
          isSteel: beam.isSteel,
          steelProfile: beam.steelProfile,
          steelAuto: beam.steelAuto,
          role: beam.role,
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

  const resolveSteelProfileName = (
    beamLike: {
      isSteel?: boolean;
      steelAuto?: boolean;
      steelProfile?: string;
      role?: BeamRole;
    } | null,
    span: number
  ) => {
    if (!beamLike?.isSteel) return null;
    const ratio = beamLike.role === "secondary" ? 24 : 12;
    const choice =
      beamLike.steelAuto ||
      !beamLike.steelProfile ||
      beamLike.steelProfile === "auto"
        ? "auto"
        : beamLike.steelProfile;
    const resolved =
      choice === "auto"
        ? getSteelProfileForBeam(span, "auto", ratio)
        : getSteelProfileByName(beamLike.steelProfile) ??
          getSteelProfileForBeam(span, "auto", ratio);
    return resolved?.name ?? beamLike.steelProfile ?? "auto";
  };

  const uniqueSorted = (values: number[], tol = 1e-4) => {
    const sorted = [...values].sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((v) => {
      if (out.length === 0 || Math.abs(v - out[out.length - 1]) > tol) {
        out.push(v);
      }
    });
    return out;
  };

  const medianSpacing = (values: number[]) => {
    if (values.length < 2) return null;
    const diffs: number[] = [];
    for (let i = 0; i < values.length - 1; i++) {
      const d = values[i + 1] - values[i];
      if (d > 1e-6) diffs.push(d);
    }
    if (diffs.length === 0) return null;
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)];
  };

  const pickSecondaryAxis = (spanX: number | null, spanY: number | null) => {
    if (!secondaryEnabled || deckSpan <= 0) return null;
    const score = (span: number | null) => {
      if (!span) return { rem: Infinity, span: Infinity };
      const mod = Math.abs(span % deckSpan);
      const rem = Math.min(mod, Math.abs(deckSpan - mod));
      return { rem, span };
    };
    const sx = score(spanX);
    const sy = score(spanY);
    if (sx.rem < sy.rem) return "y";
    if (sy.rem < sx.rem) return "x";
    if (sx.span < sy.span) return "y";
    if (sy.span < sx.span) return "x";
    return spanX != null ? "y" : spanY != null ? "x" : null;
  };

  const appendSecondaryBeamsWithLines = (
    poly: Point3[],
    basePillars: Pillar[],
    baseBeams: Beam[],
    xsLines: number[],
    ysLines: number[],
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
  ) => {
    if (!secondaryEnabled || deckSpan <= 0) {
      return { pillars: basePillars, beams: baseBeams };
    }

    const xs = uniqueSorted(xsLines);
    const ys = uniqueSorted(ysLines);
    if (xs.length < 2 || ys.length < 2) {
      return { pillars: basePillars, beams: baseBeams };
    }

    const spanX = medianSpacing(xs);
    const spanY = medianSpacing(ys);
    const secondaryAxis = pickSecondaryAxis(spanX, spanY);
    if (!secondaryAxis) return { pillars: basePillars, beams: baseBeams };

    let curPillars = [...basePillars];
    let curBeams = [...baseBeams];

    const lineTol = 1e-4;
    const gridTol = 0.02;
    const segmentInside = (a: Point3, b: Point3) => {
      const steps = 4;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (!pointInPolygon(poly, x, y)) return false;
      }
      return true;
    };

    const ensureAnchorAt = (x: number, y: number) => {
      const foundVisible = curPillars.find(
        (p) => isVisiblePillar(p) && Math.hypot(p.x - x, p.y - y) <= gridTol
      );
      if (foundVisible) return foundVisible;
      const existingAnchor = curPillars.find(
        (p) =>
          p.hidden &&
          p.kind === "anchor" &&
          Math.hypot(p.x - x, p.y - y) <= gridTol
      );
      if (existingAnchor) return existingAnchor;
      const created = buildAnchorPillar(x, y, "secondary");
      curPillars.push(created);
      return created;
    };

    const addSecondaryBeam = (a: Pillar, b: Pillar) => {
      const exists = curBeams.some(
        (bb) =>
          (bb.startId === a.id && bb.endId === b.id) ||
          (bb.startId === b.id && bb.endId === a.id)
      );
      if (exists) return;
      const newBeam = buildSecondaryBeamBetweenPillars(a, b);
      if (!newBeam) return;
      curBeams.push(newBeam);
    };

    if (secondaryAxis === "y") {
      const primaryX = xs;
      const positions = buildGridPositions(bounds.minX, bounds.maxX, deckSpan)
        .filter((v) => !primaryX.some((p) => Math.abs(p - v) <= lineTol));
      positions.forEach((x) => {
        for (let i = 0; i < ys.length - 1; i++) {
          const y1 = ys[i];
          const y2 = ys[i + 1];
          const a = { x, y: y1, z: 0 };
          const b = { x, y: y2, z: 0 };
          const mid = { x, y: (y1 + y2) / 2, z: 0 };
          if (!pointInPolygon(poly, mid.x, mid.y)) continue;
          if (!segmentInside(a, b)) continue;
          const pa = ensureAnchorAt(a.x, a.y);
          const pb = ensureAnchorAt(b.x, b.y);
          addSecondaryBeam(pa, pb);
        }
      });
    } else {
      const primaryY = ys;
      const positions = buildGridPositions(bounds.minY, bounds.maxY, deckSpan)
        .filter((v) => !primaryY.some((p) => Math.abs(p - v) <= lineTol));
      positions.forEach((y) => {
        for (let i = 0; i < xs.length - 1; i++) {
          const x1 = xs[i];
          const x2 = xs[i + 1];
          const a = { x: x1, y, z: 0 };
          const b = { x: x2, y, z: 0 };
          const mid = { x: (x1 + x2) / 2, y, z: 0 };
          if (!pointInPolygon(poly, mid.x, mid.y)) continue;
          if (!segmentInside(a, b)) continue;
          const pa = ensureAnchorAt(a.x, a.y);
          const pb = ensureAnchorAt(b.x, b.y);
          addSecondaryBeam(pa, pb);
        }
      });
    }

    return { pillars: curPillars, beams: curBeams };
  };

  const collectPrimaryLinesFromBeams = (poly: Point3[], beamList: Beam[]) => {
    const tol = 1e-4;
    const xs: number[] = [];
    const ys: number[] = [];
    beamList.forEach((b) => {
      if (b.role === "secondary") return;
      const mx = (b.x1 + b.x2) / 2;
      const my = (b.y1 + b.y2) / 2;
      if (!pointInPolygon(poly, mx, my)) return;
      if (Math.abs(b.x1 - b.x2) <= tol) xs.push(b.x1);
      if (Math.abs(b.y1 - b.y2) <= tol) ys.push(b.y1);
    });
    const mergedXs = uniqueSorted(xs.concat(poly.map((p) => p.x)));
    const mergedYs = uniqueSorted(ys.concat(poly.map((p) => p.y)));
    return { xs: mergedXs, ys: mergedYs };
  };

  const selectedBeamProfileName =
    selectedBeamSegment && selectedBeamSegment.isSteel
      ? resolveSteelProfileName(selectedBeamSegment, beamInfo?.span ?? 0)
      : selectedBeam
        ? resolveSteelProfileName(selectedBeam, beamInfo?.span ?? 0)
        : null;
  const selectedPillarProfileName =
    selectedPillar && selectedPillar.isSteel
      ? selectedPillar.steelAuto ||
        !selectedPillar.steelProfile ||
        selectedPillar.steelProfile === "auto"
        ? getSteelProfileForPillar("auto")?.name ?? "auto"
        : getSteelProfileByName(selectedPillar.steelProfile)?.name ??
          selectedPillar.steelProfile
      : null;
  const selectedBeamIsSteel = !!selectedBeam?.isSteel;

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

        {/* SE  O PDF */}
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
                  Carregando PDF 
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

              {/* medi  o */}
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
                    : "?? Medir dist ncia"}
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
                  Limpar medi  o
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

       {/* SE  O ELEMENTOS (PILARES + VIGAS) */}
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
                <div style={{ marginBottom: 4, opacity: 0.8 }}>Tipo do pilar:</div>
                <select
                  value={pillarMaterial}
                  onChange={(e) =>
                    setPillarMaterial(e.target.value as MaterialType)
                  }
                  style={{
                    width: "100%",
                    background: "#111",
                    color: "#fff",
                    border: "1px solid #333",
                    borderRadius: 4,
                    padding: "4px 6px",
                    marginTop: 4,
                    fontSize: 12,
                  }}
                >
                  <option value="concreto">Concreto</option>
                  <option value="metalico">Metalico</option>
                </select>
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

              {pillarMaterial === "concreto" && (
                <>
                  <div style={{ marginBottom: 10, fontSize: 13 }}>
                    <div style={{ marginBottom: 4, opacity: 0.8 }}>
                      Tipo de se  o:
                    </div>
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

                  {pillarType === "retangular" && (
                    <div style={{ marginBottom: 10, fontSize: 13 }}>
                      <div style={{ marginBottom: 4, opacity: 0.8 }}>
                        Dimens es (m):
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
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Di metro (m):
                      </div>
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
                </>
              )}

              <div style={{ marginBottom: 10, fontSize: 13 }}>
                <div style={{ marginBottom: 4, opacity: 0.8 }}>
                  Alinhamento dos pr ximos pilares:
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
                  Horizontal (mesmo Y do  ltimo)
                </label>
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="alignMode"
                    value="vertical"
                    checked={alignMode === "vertical"}
                    onChange={() => setAlignMode("vertical")}
                  />{" "}
                  Vertical (mesmo X do  ltimo)
                </label>
              </div>

              {pillarMaterial === "metalico" && (
                <div style={{ marginBottom: 10, fontSize: 13 }}>
                  <div style={{ marginBottom: 4, opacity: 0.8 }}>
                    Perfil met lico:
                  </div>
                  <select
                    value={pillarSteelProfile}
                    onChange={(e) => setPillarSteelProfile(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      background: "#111",
                      color: "#fff",
                      border: "1px solid #333",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontSize: 12,
                    }}
                  >
                    <option value="auto">Auto (menor massa)</option>
                    {STEEL_PROFILES.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                    V o m ximo entre pilares:
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11 }}>Dire  o X (m):</div>
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
                      <div style={{ fontSize: 11 }}>Dire  o Y (m):</div>
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

                <div style={{ marginBottom: 8, fontSize: 12 }}>
                  <div style={{ marginBottom: 4, opacity: 0.8 }}>Tipo da viga:</div>
                  <select
                    value={beamMaterial}
                    onChange={(e) =>
                      setBeamMaterial(e.target.value as MaterialType)
                    }
                    style={{
                      width: "100%",
                      background: "#111",
                      color: "#fff",
                      border: "1px solid #333",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontSize: 12,
                    }}
                  >
                    <option value="concreto">Concreto (L/10)</option>
                    <option value="metalico">Metalico (L/12)</option>
                  </select>
                  {beamMaterial === "metalico" && (
                    <select
                      value={beamSteelProfile}
                      onChange={(e) => setBeamSteelProfile(e.target.value)}
                      style={{
                        width: "100%",
                        marginTop: 6,
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontSize: 12,
                      }}
                    >
                      <option value="auto">Auto (menor massa / d ≥ L/12)</option>
                      {STEEL_PROFILES.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={{ marginBottom: 8, fontSize: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={secondaryEnabled}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setSecondaryEnabled(next);
                        if (next) {
                          recalcSecondaryFromCurrent();
                        } else {
                          const stripped = stripSecondaryArtifacts(pillars, beams);
                          setPillars(stripped.pillars);
                          setBeams(stripped.beams);
                        }
                      }}
                    />
                    Gerar vigas secundarias (L/24)
                  </label>
                  {secondaryEnabled && (
                    <>
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>
                          Vao do steel deck (m):
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          value={deckSpan}
                          onChange={(e) => setDeckSpan(Number(e.target.value))}
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
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>
                          Tipo da secundaria:
                        </div>
                        <select
                          value={secondaryMaterial}
                          onChange={(e) =>
                            setSecondaryMaterial(e.target.value as MaterialType)
                          }
                          style={{
                            width: "100%",
                            background: "#111",
                            color: "#fff",
                            border: "1px solid #333",
                            borderRadius: 4,
                            padding: "4px 6px",
                            fontSize: 12,
                            marginTop: 2,
                          }}
                        >
                          <option value="concreto">Concreto (L/24)</option>
                          <option value="metalico">Metalico (L/24)</option>
                        </select>
                        {secondaryMaterial === "metalico" && (
                          <select
                            value={secondarySteelProfile}
                            onChange={(e) =>
                              setSecondarySteelProfile(e.target.value)
                            }
                            style={{
                              width: "100%",
                              marginTop: 6,
                              background: "#111",
                              color: "#fff",
                              border: "1px solid #333",
                              borderRadius: 4,
                              padding: "4px 6px",
                              fontSize: 12,
                            }}
                          >
                            <option value="auto">
                              Auto (menor massa / d ≥ L/24)
                            </option>
                            {STEEL_PROFILES.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </>
                  )}
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
                    resetBeamChain();
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
                    resetBeamChain();
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
                    ? "Clique em 2 cantos para criar ret ngulo de vigas"
                    : "? Ret ngulo de vigas (per metro)"}
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
                    resetBeamChain();
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
                    ? "Clique nos v rtices da polilinha de vigas"
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
                    Primeiro canto do ret ngulo definido. Clique no canto oposto.
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
                    {selectedBeamIsSteel && (
                      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 6 }}>
                        Perfil met lico definido pela tabela.
                      </div>
                    )}

                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 12 }}>Largura (m): </span>
                      <input
                        type="number"
                        step="0.01"
                        value={editBeamWidth}
                        onChange={(e) =>
                          setEditBeamWidth(Number(e.target.value))
                        }
                        disabled={selectedBeamIsSteel}
                        style={{
                          width: "100%",
                          background: selectedBeamIsSteel ? "#333" : "#111",
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
                        disabled={selectedBeamIsSteel}
                        style={{
                          width: "100%",
                          background: selectedBeamIsSteel ? "#333" : "#111",
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
                      disabled={selectedBeamIsSteel}
                      style={{
                        width: "100%",
                        padding: 6,
                        borderRadius: 4,
                        border: "none",
                        cursor: selectedBeamIsSteel ? "not-allowed" : "pointer",
                        background: selectedBeamIsSteel ? "#444" : "#00aa66",
                        color: "#fff",
                        fontSize: 12,
                      }}
                    >
                      Aplicar altera  es na viga
                    </button>
                  </div>
                )}
              </div>
              {/* fim vigas */}
            </div>
          )}
        </div>

        {/* SE  O MODIFICAR */}
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

          {/* CUBO DE VISTAS   vers o que funcionou */}
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
                {selectedPillar.isSteel && (
                  <div>Perfil: {selectedPillarProfileName}</div>
                )}
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

                <div>
                  Tipo: {selectedBeam.role === "secondary" ? "Secundaria" : "Principal"}
                </div>
                {selectedBeam.isSteel && (
                  <div>Perfil: {selectedBeamProfileName}</div>
                )}
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



















