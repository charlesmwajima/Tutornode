import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import * as googleTTS from 'google-tts-api';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';

// Safe dynamic loading of native 'canvas' to swallow errors on systems missing library dependencies
let canvasPkg: any = null;
let createCanvas: any = null;
let registerFont: any = null;
let loadImage: any = null;

async function ensureCanvasLoaded() {
  if (createCanvas) return;
  try {
    canvasPkg = await import('canvas');
  } catch (err: any) {
    console.warn("[NEURAL_VEO_LINK] Native 'canvas' package failed to load. Setting up dummy stubs.", err?.message || err);
  }
  
  const pkg = canvasPkg || {
    createCanvas: (w: number, h: number) => {
      return {
        getContext: () => ({
          fillRect: () => {},
          fillText: () => {},
          drawImage: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arcTo: () => {},
          closePath: () => {},
          stroke: () => {},
          fill: () => {},
          measureText: () => ({ width: 10 }),
          fillStyle: "",
          font: "",
          lineWidth: 1,
          strokeStyle: "",
          textAlign: "left",
          textBaseline: "top"
        }),
        toBuffer: () => Buffer.from([])
      };
    },
    loadImage: async () => null,
    registerFont: () => {}
  };
  
  createCanvas = pkg.createCanvas;
  registerFont = pkg.registerFont;
  loadImage = pkg.loadImage;
}

if (ffmpegStatic) {
  console.log(`[NEURAL_VEO_LINK] Setting FFmpeg path: ${ffmpegStatic}`);
  try {
    fs.chmodSync(ffmpegStatic, 0o755);
    console.log(`[NEURAL_VEO_LINK] Successfully set executable permissions for FFmpeg`);
  } catch (err: any) {
    console.warn(`[NEURAL_VEO_LINK] Failed to chmod FFmpeg: ${err.message}`);
  }
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic) {
  const probepath = (ffprobeStatic as any).path || ffprobeStatic;
  console.log(`[NEURAL_VEO_LINK] Setting FFprobe path: ${probepath}`);
  try {
    fs.chmodSync(probepath, 0o755);
    console.log(`[NEURAL_VEO_LINK] Successfully set executable permissions for FFprobe`);
  } catch (err: any) {
    console.warn(`[NEURAL_VEO_LINK] Failed to chmod FFprobe: ${err.message}`);
  }
  ffmpeg.setFfprobePath(probepath);
}

const STORAGE_PATH = path.join(process.cwd(), 'temp_videos');
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

interface Segment {
  content: string;
  speech: string;
}

function drawRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function drawEquation(ctx: any, eq: string, x: number, y: number, size: number, color: string, t: number = 0, animate: boolean = true) {
  ctx.save();
  ctx.font = `italic ${size}px "JetBrains Mono", monospace, Georgia, serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';

  // High-fidelity substitutions for LaTeX/Greek symbols
  let cleanEq = eq
    .replace(/\\mathcal\{L\}/g, "ℒ")
    .replace(/\\int/g, "∫")
    .replace(/\\infty/g, "∞")
    .replace(/\\Psi/g, "Ψ")
    .replace(/\\partial/g, "∂")
    .replace(/\\omega/g, "ω")
    .replace(/\\sigma/g, "σ")
    .replace(/\\theta/g, "θ")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\hat\{H\}/g, "Ĥ")
    .replace(/\\cdot/g, "·")
    .replace(/\\pi/g, "π")
    .replace(/\\approx/g, "≈")
    .replace(/\\ge/g, "≥")
    .replace(/\\le/g, "≤");

  // Animate the equation appearance character by character
  if (animate && t > 0) {
    const charsToShow = Math.floor(t * 18); // 18 characters per second
    cleanEq = cleanEq.substring(0, Math.min(cleanEq.length, charsToShow));
  }

  // Handle fractional forms like \frac{A}{B}
  if (cleanEq.includes('\\frac')) {
    const fracMatch = cleanEq.match(/\\frac\{([^}]+)\}\{([^}]+)\}/);
    if (fracMatch) {
      const num = fracMatch[1];
      const den = fracMatch[2];
      
      const startPart = cleanEq.substring(0, cleanEq.indexOf('\\frac'));
      const endPart = cleanEq.substring(cleanEq.indexOf(fracMatch[0]) + fracMatch[0].length);

      // Render start part
      ctx.fillText(startPart, x, y);
      const startWidth = ctx.measureText(startPart).width;

      const numW = ctx.measureText(num).width;
      const denW = ctx.measureText(den).width;
      const fracW = Math.max(numW, denW) + 12;

      // Draw numerator centered above fraction line
      ctx.save();
      ctx.font = `italic ${size - 3}px sans-serif`;
      ctx.fillText(num, x + startWidth + (fracW - numW) / 2, y - 11);
      
      // Draw denominator centered below fraction line
      ctx.fillText(den, x + startWidth + (fracW - denW) / 2, y + 11);
      ctx.restore();

      // Fraction bar
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x + startWidth + 2, y);
      ctx.lineTo(x + startWidth + fracW - 2, y);
      ctx.stroke();

      // Remainder of equation
      ctx.fillText(endPart, x + startWidth + fracW, y);
      ctx.restore();
      return;
    }
  }

  // Handle subscripts and superscripts and variable highlighting
  let currentX = x;
  for (let k = 0; k < cleanEq.length; k++) {
    const char = cleanEq[k];
    if (char === '^' && k < cleanEq.length - 1) {
      let exponent = cleanEq[k+1];
      let endIdx = k+1;
      if (exponent === '{') {
        const closeIdx = cleanEq.indexOf('}', k+1);
        if (closeIdx !== -1) {
          exponent = cleanEq.substring(k+2, closeIdx);
          endIdx = closeIdx;
        }
      }
      ctx.save();
      ctx.font = `bold ${size - 5}px sans-serif`;
      ctx.fillText(exponent, currentX, y - 7);
      ctx.restore();
      currentX += ctx.measureText(exponent).width * 0.75;
      k = endIdx;
    } else if (char === '_' && k < cleanEq.length - 1) {
      let subscript = cleanEq[k+1];
      let endIdx = k+1;
      if (subscript === '{') {
        const closeIdx = cleanEq.indexOf('}', k+1);
        if (closeIdx !== -1) {
          subscript = cleanEq.substring(k+2, closeIdx);
          endIdx = closeIdx;
        }
      }
      ctx.save();
      ctx.font = `bold ${size - 5}px sans-serif`;
      ctx.fillText(subscript, currentX, y + 7);
      ctx.restore();
      currentX += ctx.measureText(subscript).width * 0.75;
      k = endIdx;
    } else {
      // VARIABLE HIGHLIGHTING DETECTOR
      const isImportantVar = ['s', 't', 'y', 'x', 'Q', 'S', 'T', 'G', 'M', 'Z', 'K', 'B', 'ℒ', '∫', 'Δ'].includes(char);
      if (isImportantVar) {
        ctx.save();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.15)'; // warm yellow glow
        const charW = ctx.measureText(char).width;
        ctx.fillRect(currentX - 1, y - size/2, charW + 2, size);
        
        ctx.fillStyle = '#facc15'; // Golden highlighted variable
        ctx.font = `bold italic ${size}px "JetBrains Mono", monospace`;
        ctx.fillText(char, currentX, y);
        ctx.restore();
      } else {
        ctx.fillText(char, currentX, y);
      }
      currentX += ctx.measureText(char).width;
    }
  }
  ctx.restore();
}

function drawProceduralDiagram(ctx: any, title: string, x: number, y: number, w: number, h: number, t: number) {
  ctx.save();
  // Translucent diagram background panel
  ctx.fillStyle = 'rgba(10, 15, 30, 0.8)';
  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.stroke();

  const lTitle = title.toLowerCase();

  if (lTitle.includes("fire") || lTitle.includes("triangle") || lTitle.includes("moto") || lTitle.includes("pembetatu") || lTitle.includes("combustion")) {
    // 1. THE FIRE TRIANGLE (Enhanced with particle embers!)
    const cx = x + w/2;
    const cy = y + h/2 + 10;
    const size = 62;

    const p1 = { x: cx, y: cy - size }; 
    const p2 = { x: cx - size * 1.15, y: cy + size * 0.7 }; 
    const p3 = { x: cx + size * 1.15, y: cy + size * 0.7 }; 

    ctx.shadowBlur = 8;
    ctx.lineWidth = 4;

    // Fuel (Amber)
    ctx.shadowColor = 'rgba(234, 179, 8, 0.4)';
    ctx.strokeStyle = '#eab308';
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

    // Oxygen (Blue)
    ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();

    // Heat (Red)
    ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#ef4444'; ctx.textAlign = 'center'; ctx.fillText('HEAT / JOTO', cx, cy - size - 8);
    ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'right'; ctx.fillText('OXYGEN / HEWA', p2.x - 5, p2.y + 12);
    ctx.fillStyle = '#eab308'; ctx.textAlign = 'left'; ctx.fillText('FUEL / MAFUTA', p3.x + 5, p3.y + 12);

    // Glowing flickering flame in center
    ctx.save();
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#f97316';
    const flameSize = 18 + Math.sin(t * 15.0) * 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 15);
    ctx.bezierCurveTo(cx - flameSize, cy + 15, cx - flameSize/2, cy - flameSize, cx, cy - flameSize * 1.5);
    ctx.bezierCurveTo(cx + flameSize/2, cy - flameSize, cx + flameSize, cy + 15, cx, cy + 15);
    ctx.fill();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 10);
    ctx.bezierCurveTo(cx - flameSize/2, cy + 10, cx - flameSize/4, cy - flameSize/2, cx, cy - flameSize);
    ctx.bezierCurveTo(cx + flameSize/4, cy - flameSize/2, cx + flameSize/2, cy + 10, cx, cy + 10);
    ctx.fill();
    ctx.restore();

    // Add rising sparks/particles
    ctx.fillStyle = 'rgba(249, 115, 22, 0.8)';
    for (let p = 0; p < 5; p++) {
      const sparkY = cy - 5 - ((t * 40 + p * 15) % 50);
      const sparkX = cx + Math.sin(t * 8 + p) * 12;
      ctx.beginPath();
      ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE TRIANGLE SYSTEM', x + w/2, y + 25);

  } else if (lTitle.includes("stability curve") || lTitle.includes("righting arm") || lTitle.includes("gz curve")) {
    // 2. STABILITY CURVE (GZ righting arm curve chart)
    const cx = x + 45;
    const cy = y + h - 45;
    const chartW = w - 80;
    const chartH = h - 80;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let g = 1; g <= 4; g++) {
      const gy = cy - (chartH / 4) * g;
      ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + chartW, gy); ctx.stroke();
      const gx = cx + (chartW / 4) * g;
      ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx, cy - chartH); ctx.stroke();
    }

    // Draw Axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - chartH); ctx.lineTo(cx, cy); ctx.lineTo(cx + chartW, cy);
    ctx.stroke();

    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right'; ctx.fillText('GZ (Righting Arm, m)', cx - 5, cy - chartH + 5);
    ctx.textAlign = 'center'; ctx.fillText('Heel Angle (deg)', cx + chartW/2, cy + 18);

    ctx.fillText('0°', cx, cy + 10);
    ctx.fillText('30°', cx + chartW * 0.33, cy + 10);
    ctx.fillText('60°', cx + chartW * 0.66, cy + 10);
    ctx.fillText('90°', cx + chartW, cy + 10);

    ctx.textAlign = 'right';
    ctx.fillText('0.5m', cx - 5, cy - chartH * 0.33);
    ctx.fillText('1.0m', cx - 5, cy - chartH * 0.66);
    ctx.fillText('1.5m', cx - 5, cy - chartH);

    // Plot Stability Curve
    ctx.save();
    ctx.beginPath();
    for (let px = 0; px <= chartW; px += 2) {
      const pct = px / chartW;
      const angleRad = pct * Math.PI * 0.6; 
      const gzVal = Math.sin(angleRad) * 1.3 - Math.pow(Math.sin(angleRad), 3) * 0.35;
      const py = cy - (gzVal / 1.5) * chartH;
      if (px === 0) ctx.moveTo(cx, py);
      else ctx.lineTo(cx + px, py);
    }
    const areaGrad = ctx.createLinearGradient(cx, cy - chartH, cx, cy);
    areaGrad.addColorStop(0, 'rgba(52, 211, 153, 0.2)');
    areaGrad.addColorStop(1, 'rgba(52, 211, 153, 0)');
    ctx.lineTo(cx + chartW, cy);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    ctx.beginPath();
    for (let px = 0; px <= chartW; px += 2) {
      const pct = px / chartW;
      const angleRad = pct * Math.PI * 0.6;
      const gzVal = Math.sin(angleRad) * 1.3 - Math.pow(Math.sin(angleRad), 3) * 0.35;
      const py = cy - (gzVal / 1.5) * chartH;
      if (px === 0) ctx.moveTo(cx, py);
      else ctx.lineTo(cx + px, py);
    }
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Animated point
    const activePct = (t * 0.15) % 1.0;
    const activeAngleRad = activePct * Math.PI * 0.6;
    const activeGZ = Math.sin(activeAngleRad) * 1.3 - Math.pow(Math.sin(activeAngleRad), 3) * 0.35;
    const activeX = cx + activePct * chartW;
    const activeY = cy - (activeGZ / 1.5) * chartH;

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#eab308';
    ctx.fillStyle = '#eab308';
    ctx.beginPath(); ctx.arc(activeX, activeY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(activeX, activeY); ctx.lineTo(cx, activeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(activeX, activeY); ctx.lineTo(activeX, cy); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#eab308';
    ctx.textAlign = 'left';
    ctx.fillText(`Angle: ${(activePct * 110).toFixed(1)}°`, activeX + 8, activeY - 10);
    ctx.fillText(`GZ: ${activeGZ.toFixed(2)}m`, activeX + 8, activeY + 2);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'center';
    ctx.fillText('STATICAL STABILITY CURVE (GZ)', x + w/2, y + 25);

  } else if (lTitle.includes("cross section") || lTitle.includes("hull structure") || lTitle.includes("mnyambuliko") || lTitle.includes("ship cross")) {
    // 3. SHIP HULL CROSS SECTION
    const cx = x + w/2;
    const cy = y + h/2 + 20;

    ctx.fillStyle = 'rgba(15, 30, 60, 0.4)';
    ctx.fillRect(x + 5, cy, w - 10, h/2 - 25);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let wx = x + 10; wx < x + w - 10; wx += 15) {
      const wy = cy + Math.sin((wx - x) * 0.08 + t * 4.0) * 5;
      if (wx === x + 10) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy + 10);
    ctx.translate(0, Math.sin(t * 2.0) * 3);
    ctx.rotate(Math.sin(t * 1.5) * 0.02);

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-110, -55); 
    ctx.lineTo(-100, 30);  
    ctx.quadraticCurveTo(-90, 50, -60, 50); 
    ctx.lineTo(60, 50);   
    ctx.quadraticCurveTo(90, 50, 100, 30);  
    ctx.lineTo(110, -55); 
    ctx.lineTo(80, -55);  
    ctx.lineTo(80, -35);  
    ctx.lineTo(-80, -35); 
    ctx.lineTo(-80, -55); 
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-92, 30);
    ctx.lineTo(-60, 30);
    ctx.lineTo(60, 30); 
    ctx.lineTo(92, 30);
    ctx.stroke();

    for (let fx = -80; fx <= 80; fx += 20) {
      ctx.beginPath(); ctx.moveTo(fx, 30); ctx.lineTo(fx, 50); ctx.stroke();
    }

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, 50); ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    for (let fY = -30; fY <= 20; fY += 15) {
      ctx.beginPath(); ctx.moveTo(-102 + fY*0.1, fY); ctx.lineTo(-85, fY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(102 - fY*0.1, fY); ctx.lineTo(85, fY); ctx.stroke();
    }

    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    for (let row = 0; row < 3; row++) {
      for (let col = -2; col <= 1; col++) {
        ctx.fillStyle = colors[Math.abs(row * 3 + col) % colors.length];
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.fillRect(col * 30 + 5, -25 + row * 18, 26, 15);
        ctx.strokeRect(col * 30 + 5, -25 + row * 18, 26, 15);
      }
    }

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#eab308';
    ctx.fillText('KEEL (BACKBONE)', 15, 62);
    ctx.strokeStyle = '#eab308'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(10, 58); ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText('DOUBLE BOTTOM', -125, 42);
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath(); ctx.moveTo(-50, 40); ctx.lineTo(-75, 40); ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.fillText('CARGO HOLD', -115, -15);

    ctx.restore();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('SHIP TRANSVERSE CROSS SECTION', x + w/2, y + 25);

  } else if (lTitle.includes("stability") || lTitle.includes("ship") || lTitle.includes("ballast") || lTitle.includes("solas") || lTitle.includes("usiwaji") || lTitle.includes("mizani") || lTitle.includes("buoyancy") || lTitle.includes("metacent")) {
    // 4. METACENTRIC HEIGHT / HULL HEEL
    const cx = x + w/2;
    const cy = y + h/2 + 20;
    const rockAngle = Math.sin(t * 2.5) * 0.12; 

    ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
    ctx.fillRect(x + 5, cy, w - 10, h/2 - 25);

    ctx.save();
    ctx.translate(cx, cy - 10);
    ctx.rotate(rockAngle);

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-75, -25);
    ctx.lineTo(75, -25);
    ctx.lineTo(60, 20);
    ctx.quadraticCurveTo(0, 30, -60, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(0, 40); ctx.stroke();

    ctx.font = 'bold 10px sans-serif';
    
    ctx.fillStyle = '#34d399';
    ctx.beginPath(); ctx.arc(0, -32, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('M (Metacentre)', 8, -29);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, -5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('G (Gravity)', 8, -2);

    const bShiftX = rockAngle * 18;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(bShiftX, 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('B (Buoyancy)', bShiftX + 8, 18);

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(bShiftX, -5);
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(bShiftX, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('Z', bShiftX - 10, -8);

    ctx.restore();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let wx = x + 10; wx < x + w - 10; wx += 15) {
      const wy = cy + Math.sin((wx - x) * 0.12 + t * 4.5) * 4;
      if (wx === x + 10) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('METACENTRIC STABILITY THEORY', x + w/2, y + 25);

  } else if (lTitle.includes("thermodynamics") || lTitle.includes("cycle") || lTitle.includes("heat") || lTitle.includes("carnot") || lTitle.includes("p-v") || lTitle.includes("joto") || lTitle.includes("marine thermodynamics")) {
    // 5. THERMODYNAMIC CARNOT P-V CYCLE
    const oX = x + 40;
    const oY = y + h - 45;
    const dW = w - 130;
    const dH = h - 80;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(oX, oY - dH); ctx.lineTo(oX, oY); ctx.lineTo(oX + dW, oY);
    ctx.stroke();

    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right'; ctx.fillText('P (Pressure)', oX - 5, oY - dH + 5);
    ctx.textAlign = 'center'; ctx.fillText('V (Volume)', oX + dW, oY + 15);

    const s1 = { x: oX + dW * 0.20, y: oY - dH * 0.85 }; 
    const s2 = { x: oX + dW * 0.50, y: oY - dH * 0.60 }; 
    const s3 = { x: oX + dW * 0.85, y: oY - dH * 0.20 }; 
    const s4 = { x: oX + dW * 0.45, y: oY - dH * 0.40 }; 

    ctx.lineWidth = 2.5;
    
    ctx.strokeStyle = '#f97316';
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.quadraticCurveTo((s1.x+s2.x)/2, (s1.y+s2.y)/2 - 5, s2.x, s2.y); ctx.stroke();
    ctx.strokeStyle = '#eab308';
    ctx.beginPath(); ctx.moveTo(s2.x, s2.y); ctx.quadraticCurveTo((s2.x+s3.x)/2, (s2.y+s3.y)/2 - 2, s3.x, s3.y); ctx.stroke();
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath(); ctx.moveTo(s3.x, s3.y); ctx.quadraticCurveTo((s3.x+s4.x)/2, (s3.y+s4.y)/2 + 5, s4.x, s4.y); ctx.stroke();
    ctx.strokeStyle = '#10b981';
    ctx.beginPath(); ctx.moveTo(s4.x, s4.y); ctx.quadraticCurveTo((s4.x+s1.x)/2, (s4.y+s1.y)/2 + 2, s1.x, s1.y); ctx.stroke();

    const cycleT = (t * 0.25) % 1.0; 
    let px = s1.x, py = s1.y;
    let label = 'Expansion';

    if (cycleT < 0.25) {
      const segmentP = cycleT / 0.25;
      px = s1.x + (s2.x - s1.x) * segmentP;
      py = s1.y + (s2.y - s1.y) * segmentP - Math.sin(segmentP * Math.PI) * 4;
      label = "Isothermal Exp. (QH In)";
    } else if (cycleT < 0.5) {
      const segmentP = (cycleT - 0.25) / 0.25;
      px = s2.x + (s3.x - s2.x) * segmentP;
      py = s2.y + (s3.y - s2.y) * segmentP - Math.sin(segmentP * Math.PI) * 2;
      label = "Adiabatic Expansion";
    } else if (cycleT < 0.75) {
      const segmentP = (cycleT - 0.5) / 0.25;
      px = s3.x + (s4.x - s3.x) * segmentP;
      py = s3.y + (s4.y - s3.y) * segmentP + Math.sin(segmentP * Math.PI) * 4;
      label = "Isothermal Comp. (QL Out)";
    } else {
      const segmentP = (cycleT - 0.75) / 0.25;
      px = s4.x + (s1.x - s4.x) * segmentP;
      py = s4.y + (s1.y - s4.y) * segmentP + Math.sin(segmentP * Math.PI) * 2;
      label = "Adiabatic Compression";
    }

    ctx.fillStyle = '#f43f5e';
    ctx.save();
    ctx.shadowBlur = 8; ctx.shadowColor = '#f43f5e';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(label, px + 10, py - 6);

    const cylX = x + w - 75;
    const cylY = y + h/2 + 20;
    const cylW = 45;
    const cylH = 75;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cylX, cylY - cylH/2);
    ctx.lineTo(cylX, cylY + cylH/2);
    ctx.lineTo(cylX + cylW, cylY + cylH/2);
    ctx.lineTo(cylX + cylW, cylY - cylH/2);
    ctx.stroke();

    const volumeFactor = (px - oX) / dW; 
    const pistonY = cylY + cylH/2 - 12 - (volumeFactor * (cylH - 30));

    const gasGrad = ctx.createLinearGradient(cylX, cylY + cylH/2, cylX, pistonY);
    gasGrad.addColorStop(0, `rgba(244, 63, 94, ${0.1 + (1.0 - volumeFactor) * 0.65})`);
    gasGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gasGrad;
    ctx.fillRect(cylX + 2.5, pistonY, cylW - 5, (cylY + cylH/2) - pistonY - 2);

    ctx.fillStyle = '#475569';
    ctx.fillRect(cylX + 2, pistonY, cylW - 4, 10);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.strokeRect(cylX + 2, pistonY, cylW - 4, 10);

    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cylX + cylW/2 - 4, pistonY - 35, 8, 35);

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#f43f5e';
    ctx.textAlign = 'center';
    ctx.fillText('GAS', cylX + cylW/2, cylY + cylH/2 - 8);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'center';
    ctx.fillText('CARNOT THERMODYNAMIC ENGINE', x + w/2, y + 25);

  } else if (lTitle.includes("hydraulic") || lTitle.includes("cylinder") || lTitle.includes("piston") || lTitle.includes("pampu")) {
    // 6. HYDRAULIC SYSTEM
    const cy = y + h/2 + 10;
    ctx.save();

    const resX = x + 35;
    const resY = y + h - 55;
    const resW = 55;
    const resH = 35;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(resX, resY, resW, resH);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(resX, resY); ctx.lineTo(resX, resY + resH);
    ctx.lineTo(resX + resW, resY + resH); ctx.lineTo(resX + resW, resY);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(resX + 2, resY + 12 + Math.sin(t * 3.0)*2, resW - 4, resH - 14);

    const pumpX = resX + resW/2;
    const pumpY = resY - 35;
    const pumpR = 15;
    ctx.fillStyle = '#334155';
    ctx.beginPath(); ctx.arc(pumpX, pumpY, pumpR, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(pumpX, pumpY - 10);
    ctx.lineTo(pumpX - 7, pumpY + 4);
    ctx.lineTo(pumpX + 7, pumpY + 4);
    ctx.closePath();
    ctx.fill();

    const valX = x + 125;
    const valY = cy - 20;
    const valW = 42;
    const valH = 40;
    ctx.fillStyle = '#334155';
    ctx.fillRect(valX, valY, valW, valH);
    ctx.strokeRect(valX, valY, valW, valH);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(valX + valW/2, valY); ctx.lineTo(valX + valW/2, valY + valH); ctx.stroke();

    const cylX = x + 195;
    const cylY = y + 55;
    const cylW = 75;
    const cylH = 32;
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5;
    ctx.strokeRect(cylX, cylY, cylW, cylH);

    const pDisp = 18 + Math.sin(t * 2.0) * 15; 
    ctx.fillStyle = '#eab308';
    ctx.fillRect(cylX + pDisp, cylY + 2, 8, cylH - 4);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cylX + pDisp + 8, cylY + cylH/2 - 4, 45, 8);

    const strokeDir = Math.cos(t * 2.0); 
    const pColor = strokeDir > 0 ? '#ef4444' : '#38bdf8'; 
    const rColor = strokeDir > 0 ? '#38bdf8' : '#ef4444';

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath(); ctx.moveTo(pumpX, resY); ctx.lineTo(pumpX, pumpY + pumpR); ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(pumpX, pumpY - pumpR); ctx.lineTo(pumpX, valY + valH/2); ctx.lineTo(valX, valY + valH/2); ctx.stroke();

    ctx.strokeStyle = pColor;
    ctx.beginPath();
    ctx.moveTo(valX + valW*0.25, valY);
    ctx.lineTo(valX + valW*0.25, cylY + cylH + 12);
    ctx.lineTo(cylX + 10, cylY + cylH + 12);
    ctx.lineTo(cylX + 10, cylY + cylH);
    ctx.stroke();

    ctx.strokeStyle = rColor;
    ctx.beginPath();
    ctx.moveTo(valX + valW*0.75, valY);
    ctx.lineTo(valX + valW*0.75, cylY + cylH + 20);
    ctx.lineTo(cylX + cylW - 10, cylY + cylH + 20);
    ctx.lineTo(cylX + cylW - 10, cylY + cylH);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(valX + valW/2, valY + valH);
    ctx.lineTo(valX + valW/2, resY + 5);
    ctx.lineTo(resX + resW - 5, resY + 5);
    ctx.stroke();

    const flowT = (t * 1.5) % 1.0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pumpX + (valX - pumpX) * flowT, valY + valH/2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ef4444'; ctx.fillText('PUMP', pumpX + 22, pumpY + 4);
    ctx.fillStyle = '#eab308'; ctx.fillText('ACTUATOR', cylX + 15, cylY - 8);

    ctx.restore();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('DYNAMIC HYDRAULIC POWER LOOP', x + w/2, y + 25);

  } else if (lTitle.includes("electrical") || lTitle.includes("circuit") || lTitle.includes("rlc") || lTitle.includes("umeme") || lTitle.includes("feedback")) {
    // 7. ELECTRICAL RLC CIRCUIT WITH FLOWING ELECTRONS
    const cx = x + w/2;
    const cy = y + h/2 + 10;
    ctx.save();

    const cw = 210;
    const ch = 110;
    const cx0 = cx - cw/2;
    const cy0 = cy - ch/2;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx0, cy0, cw, ch);

    const batX = cx0;
    const batY = cy0 + ch/2;
    ctx.fillStyle = 'rgba(10,15,30,0.8)';
    ctx.fillRect(batX - 15, batY - 20, 30, 40); 
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(batX - 12, batY - 14); ctx.lineTo(batX + 12, batY - 14); ctx.stroke();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(batX - 6, batY + 12); ctx.lineTo(batX + 6, batY + 12); ctx.stroke();
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(batX - 12, batY - 4); ctx.lineTo(batX + 12, batY - 4); ctx.stroke();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(batX - 6, batY + 4); ctx.lineTo(batX + 6, batY + 4); ctx.stroke();

    const swX = cx0 + cw * 0.25;
    const swY = cy0;
    ctx.fillStyle = 'rgba(10,15,30,0.8)';
    ctx.fillRect(swX - 10, swY - 10, 25, 20);
    const isOpen = (t % 4.0) > 2.8; 
    ctx.strokeStyle = '#eab308'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(swX - 8, swY, 2.5, 0, Math.PI * 2);
    ctx.arc(swX + 8, swY, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(swX - 8, swY);
    if (isOpen) {
      ctx.lineTo(swX + 6, swY - 12); 
    } else {
      ctx.lineTo(swX + 8, swY); 
    }
    ctx.stroke();

    const resX = cx0 + cw * 0.65;
    const resY = cy0;
    ctx.fillStyle = 'rgba(10,15,30,0.8)';
    ctx.fillRect(resX - 22, resY - 12, 44, 24);
    ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(resX - 20, resY);
    ctx.lineTo(resX - 14, resY - 8);
    ctx.lineTo(resX - 8, resY + 8);
    ctx.lineTo(resX - 2, resY - 8);
    ctx.lineTo(resX + 4, resY + 8);
    ctx.lineTo(resX + 10, resY - 8);
    ctx.lineTo(resX + 16, resY + 8);
    ctx.lineTo(resX + 20, resY);
    ctx.stroke();

    const indX = cx0 + cw;
    const indY = cy0 + ch * 0.45;
    ctx.fillStyle = 'rgba(10,15,30,0.8)';
    ctx.fillRect(indX - 12, indY - 15, 24, 40);
    ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(indX, indY - 15);
    for (let c = 0; c < 4; c++) {
      const cyS = indY - 15 + c * 9;
      ctx.bezierCurveTo(indX + 10, cyS, indX + 10, cyS + 11, indX, cyS + 11);
      ctx.bezierCurveTo(indX - 8, cyS + 5, indX - 8, cyS + 1, indX, cyS + 2);
    }
    ctx.stroke();

    const capX = cx0 + cw/2;
    const capY = cy0 + ch;
    ctx.fillStyle = 'rgba(10,15,30,0.8)';
    ctx.fillRect(capX - 15, capY - 15, 30, 30);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(capX - 5, capY - 12); ctx.lineTo(capX - 5, capY + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(capX + 5, capY - 12); ctx.lineTo(capX + 5, capY + 12); ctx.stroke();

    if (!isOpen) {
      const elecSpeed = 65; 
      const totalLen = (cw + ch) * 2;
      ctx.fillStyle = '#eab308';
      ctx.shadowBlur = 6; ctx.shadowColor = '#eab308';
      for (let p = 0; p < 12; p++) {
        const offset = (t * elecSpeed + p * (totalLen / 12)) % totalLen;
        let px = 0, py = 0;
        if (offset < cw) {
          px = cx0 + offset; py = cy0;
        } else if (offset < cw + ch) {
          px = cx0 + cw; py = cy0 + (offset - cw);
        } else if (offset < cw * 2 + ch) {
          px = cx0 + cw - (offset - (cw + ch)); py = cy0 + ch;
        } else {
          px = cx0; py = cy0 + ch - (offset - (cw * 2 + ch));
        }
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#f472b6'; ctx.textAlign = 'center'; ctx.fillText('R (RESISTOR)', resX, resY - 12);
    ctx.fillStyle = '#34d399'; ctx.textAlign = 'left'; ctx.fillText('L (INDUCTOR)', indX + 12, indY + 5);
    ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center'; ctx.fillText('C (CAPACITOR)', capX, capY - 14);
    ctx.fillStyle = '#ef4444'; ctx.textAlign = 'right'; ctx.fillText('BATTERY (+)', batX - 16, batY - 10);

    ctx.restore();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('RLC OSCILLATORY CLOSED LOOP', x + w/2, y + 25);

  } else {
    // 8. QUANTUM PHYSICAL STATE ORBIT (DEFAULT SCHEMATICS, Highly polished)
    const dX = x + w/2;
    const dY = y + h/2 + 10;
    ctx.save();
    ctx.shadowBlur = 8;

    ctx.shadowColor = 'rgba(236, 72, 153, 0.4)';
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(dX - 10, dY, 80, 32, Math.PI / 5 + t * 0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(dX + 10, dY, 80, 32, -Math.PI / 5 - t * 0.25, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowColor = 'rgba(52, 211, 153, 0.4)';
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(dX, dY - 5, 85, 28, t * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.fillStyle = '#f43f5e'; 
    ctx.beginPath(); ctx.arc(dX - 4, dY - 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b82f6'; 
    ctx.beginPath(); ctx.arc(dX + 4, dY + 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eab308'; 
    ctx.beginPath(); ctx.arc(dX + 1, dY - 5, 6, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 10;
    ctx.fillStyle = '#38bdf8';
    const orbitAngle = t * 2.0;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath(); ctx.arc(dX + Math.cos(orbitAngle) * 80, dY + Math.sin(orbitAngle) * 32, 4, 0, Math.PI * 2); ctx.fill();
    
    ctx.restore();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('QUANTUM ORBITAL SCHEMATIC', x + w/2, y + 25);
  }
  ctx.restore();
}

export async function generateVideo(segments: Segment[], language: string = 'en', diagramUrl: string | null = null, teacherImageUrl: string | null = null, teacherName: string | null = null, onProgress?: (step: string, progress: number) => void, isCinematicEnabled: boolean = true): Promise<string> {
  onProgress?.("Initializing neural rendering session...", 3);
  await ensureCanvasLoaded();
  const sessionId = uuidv4();
  const sessionPath = path.join(STORAGE_PATH, sessionId);
  fs.mkdirSync(sessionPath);
  
  const videoSegments: string[] = [];
  
  const DEFAULT_TEACHER_URL = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1000&auto=format&fit=crop';
  const CLASSROOM_BG_URL = 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1280&auto=format&fit=crop';
  const TEACHER_URL = teacherImageUrl || DEFAULT_TEACHER_URL;

  let teacherImage: any = null;
  let diagramImage: any = null;
  let classroomBgImage: any = null;

  const fetchImageBuffer = async (url: string) => {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
      return Buffer.from(response.data);
    } catch (e: any) {
      console.warn(`Failed to fetch image from ${url}:`, e.message || String(e));
      return null;
    }
  };

  onProgress?.("Pre-loading educational background assets...", 7);
  try {
    const [teBuf, diBuf, bgBuf] = await Promise.all([
      fetchImageBuffer(TEACHER_URL),
      diagramUrl ? fetchImageBuffer(diagramUrl) : Promise.resolve(null),
      fetchImageBuffer(CLASSROOM_BG_URL)
    ]);

    if (teBuf) teacherImage = await loadImage(teBuf);
    if (diBuf) diagramImage = await loadImage(diBuf);
    if (bgBuf) classroomBgImage = await loadImage(bgBuf);
  } catch (e) {
    console.warn("Asset loading warning:", e);
  }

  onProgress?.("Educational background assets loaded successfully.", 10);

  try {
    const processSegment = async (i: number): Promise<string | null> => {
      const baseProgress = 10 + Math.floor((i / segments.length) * 80);
      onProgress?.(`Processing clip ${i+1}/${segments.length}: starting audio synthesis...`, baseProgress);
      console.log(`[NEURAL_VEO_LINK] Processing clip ${i+1}/${segments.length}...`);
      const segment = segments[i];
      const audioPath = path.join(sessionPath, `audio_${i}.mp3`);
      const clipPath = path.join(sessionPath, `clip_${i}.mp4`);

      try {
        // 1. Generate Audio
        console.log(`[NEURAL_VEO_LINK]   - Generating audio ${i+1}...`);
        const splitText = (text: string, maxLength: number): string[] => {
          const result: string[] = [];
          const sentences = text.match(/[^.!?]+[.!?]*|[^.!?]+/g) || [text];
          let currentChunk = '';

          for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxLength) {
              currentChunk += sentence;
            } else {
              if (currentChunk) result.push(currentChunk.trim());
              
              if (sentence.length > maxLength) {
                const words = sentence.split(' ');
                let wordChunk = '';
                for (const word of words) {
                  if ((wordChunk + ' ' + word).length <= maxLength) {
                    wordChunk += (wordChunk ? ' ' : '') + word;
                  } else {
                    if (wordChunk) result.push(wordChunk.trim());
                    wordChunk = word;
                  }
                }
                currentChunk = wordChunk;
              } else {
                currentChunk = sentence;
              }
            }
          }
          if (currentChunk) result.push(currentChunk.trim());
          return result;
        };

        const speechChunks = splitText(segment.speech, 200);
        const chunkPaths: string[] = [];

        for (let j = 0; j < speechChunks.length; j++) {
          const url = googleTTS.getAudioUrl(speechChunks[j], {
            lang: language === 'sw' ? 'sw' : 'en',
            slow: false,
            host: 'https://translate.google.com',
          });
          
          let response;
          let retries = 0;
          let success = false;
          while (retries < 2) {
            try {
              response = await axios.get(url, { 
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                  'User-Agent': 'Mozilla/5.0'
                }
              });
              success = true;
              break;
            } catch (err) {
              retries++;
              await new Promise(r => setTimeout(r, 500 * retries));
            }
          }
          
          if (success && response) {
            const chunkPath = path.join(sessionPath, `audio_${i}_chunk_${j}.mp3`);
            fs.writeFileSync(chunkPath, Buffer.from(response.data));
            chunkPaths.push(chunkPath);
          }
        }

        if (chunkPaths.length > 1) {
          await new Promise<void>((resolve, reject) => {
            const listPath = path.join(sessionPath, `audio_list_${i}.txt`);
            fs.writeFileSync(listPath, chunkPaths.map(p => `file '${p}'`).join('\n'));
            const timeout = setTimeout(() => reject(new Error("FFmpeg audio concat timeout")), 30000);
            ffmpeg()
              .input(listPath)
              .inputOptions(['-f concat', '-safe 0'])
              .outputOptions(['-c copy'])
              .save(audioPath)
              .on('end', () => { clearTimeout(timeout); resolve(); })
              .on('error', (err) => { clearTimeout(timeout); reject(err); });
          });
        } else if (chunkPaths.length === 1) {
          fs.renameSync(chunkPaths[0], audioPath);
        } else {
          console.warn(`Audio generation failed for segment ${i}, using fallback`);
          await createSilentAudio(audioPath, 3);
        }

        // 2. Determine Audio Duration
        let duration = 3.5;
        try {
          duration = await getAudioDuration(audioPath);
        } catch (e) {
          console.warn(`Could not get audio duration for segment ${i}, defaulting to 3.5s`);
        }

        let veoSuccess = false;
        if (isCinematicEnabled) {
          try {
            const key = process.env.GEMINI_API_KEY;
            if (!key) {
              throw new Error("GEMINI_API_KEY environment variable is missing.");
            }
            const ai = new GoogleGenAI({ apiKey: key });

            const cleanContentForPrompt = (segment.content || '')
              .replace(/[#*`_]/g, '')
              .replace(/\n+/g, ' ')
              .trim();

            const teacherTypePrompt = language === 'sw' ? 'a professional Swahili teacher' : 'a professional teacher';
            const teacherLabel = teacherName || (language === 'sw' ? 'Mwalimu Bora' : 'Professor');
            
            const veoPrompt = `An educational masterclass video. A realistic teacher named ${teacherLabel} (${teacherTypePrompt}) is standing in front of an interactive whiteboard, actively teaching. The whiteboard displays a clean, readable diagram and slides detailing: ${cleanContentForPrompt}. The teacher is lecturing with natural head movements and hand gestures, pointing at the board. Cinematic classroom background, high resolution 1080p, detailed and highly professional.`;

            onProgress?.(`Requesting real Veo video generation for segment ${i+1}/${segments.length}...`, baseProgress + 2);
            console.log(`[NEURAL_VEO_LINK]   - Requesting real Veo video generation for segment ${i+1}...`);
            const operation = await ai.models.generateVideos({
              model: 'veo-3.1-lite-generate-preview',
              prompt: veoPrompt,
              config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
              }
            });

            const op = new GenerateVideosOperation();
            op.name = operation.name;

            let done = false;
            let updated = null;
            let attempts = 0;
            const maxAttempts = 50; // Up to 4-5 minutes
            
            while (!done && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 6000));
              attempts++;
              try {
                updated = await ai.operations.getVideosOperation({ operation: op });
                done = !!updated?.done;
                onProgress?.(`Synthesizing Veo clip ${i+1}/${segments.length}: ${done ? 'DONE' : `PENDING (Attempt ${attempts}/${maxAttempts})` }`, baseProgress + 2 + Math.min(6, Math.floor(attempts * 0.15)));
                console.log(`[NEURAL_VEO_LINK]     Polling Veo operation: ${done ? 'DONE' : 'PENDING'} (attempt ${attempts}/${maxAttempts})`);
              } catch (pollErr: any) {
                console.warn(`[NEURAL_VEO_LINK]     Polling warning (attempt ${attempts}):`, pollErr.message || pollErr);
              }
            }

            if (!done || !updated) {
              throw new Error(`Veo video generation timed out after ${attempts} attempts.`);
            }

            const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
            if (!uri) {
              throw new Error("Veo video generation completed but no video URI was returned.");
            }

            onProgress?.(`Downloading high-fidelity Veo clip for segment ${i+1}...`, baseProgress + 9);
            console.log(`[NEURAL_VEO_LINK]   - Downloading Veo-generated video segment...`);
            const videoRes = await axios.get(uri, {
              headers: { 'x-goog-api-key': key },
              responseType: 'arraybuffer',
              timeout: 60000
            });

            const veoSilentVideoPath = path.join(sessionPath, `veo_silent_${i}.mp4`);
            fs.writeFileSync(veoSilentVideoPath, Buffer.from(videoRes.data));

            onProgress?.(`Synchronizing silent Veo video with TTS audio for segment ${i+1}...`, baseProgress + 12);
            console.log(`[NEURAL_VEO_LINK]   - Synchronizing Veo silent video with TTS audio using FFmpeg...`);
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error("FFmpeg sync timeout")), 60000);
              ffmpeg()
                .input(veoSilentVideoPath)
                .inputOptions(['-stream_loop -1'])
                .input(audioPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                  '-pix_fmt yuv420p',
                  '-shortest',
                  '-preset ultrafast',
                  '-crf 23',
                  '-threads 2',
                  '-b:a 192k',
                  '-ac 2'
                ])
                .save(clipPath)
                .on('end', () => {
                  clearTimeout(timeout);
                  console.log(`[NEURAL_VEO_LINK]   - Veo segment clip ${i+1} merged successfully.`);
                  resolve();
                })
                .on('error', (err) => {
                  clearTimeout(timeout);
                  reject(err);
                });
            });

            try {
              fs.unlinkSync(veoSilentVideoPath);
            } catch (e) {}

            veoSuccess = true;
          } catch (veoErr: any) {
            onProgress?.(`Veo offline/limit reached. Engaging chalkboard renderer...`, baseProgress + 2);
            console.log(`[NEURAL_VEO_LINK] Note: Veo video generation is currently unavailable (e.g. quota limit reached). Activating polished blackboard fallback engine.`);
          }
        } else {
          console.log(`[NEURAL_VEO_LINK] Cinematic/Veo mode is disabled by user configuration. Directly engaging polished blackboard engine.`);
        }

        if (veoSuccess) {
          return clipPath;
        }

        // 3. Render High-Resolution Sequenced Animated Slide Frames (Fallback)
        onProgress?.(`Generating textbook chalkboard slides and animating gestures for segment ${i+1}...`, baseProgress + 3);
        console.log(`[NEURAL_VEO_LINK]   - Rendering high-res animated frames for segment ${i+1}...`);
        const W = 1280;
        const H = 720;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const boardX = 425;
        const boardY = 65;
        const boardW = 790;
        const boardH = 475;

        let slideTitle = 'OmniTutor Neural Session';
        if (segment.content) {
          const lines = segment.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            slideTitle = lines[0].replace(/[#*`_]/g, '');
          }
        }

        let bodyLines: string[] = [];
        if (segment.content) {
          const lines = segment.content.split('\n').filter(l => l.trim().length > 0);
          const rawContent = lines.length > 1 ? lines.slice(1) : lines;
          rawContent.forEach(l => {
            const cleanLine = l.replace(/[#*`_]/g, '').trim();
            if (cleanLine.length > 0) {
              bodyLines.push(cleanLine);
            }
          });
        }

        // 4. Generate Animated Frames Sequence
        const fps = 3;
        const totalFrames = Math.max(5, Math.ceil(duration * fps));
        console.log(`[NEURAL_VEO_LINK]   - Rendering ${totalFrames} animated frames for segment ${i+1} (${duration.toFixed(2)}s @ ${fps}fps)...`);

        // Reuse canvas allocation to avoid heavy V8 heap and C++ memory fragmentation in loops
        const offscreenCanvas = createCanvas(W, H);
        const offCtx = offscreenCanvas.getContext('2d');

        for (let f = 0; f < totalFrames; f++) {
          const t = f / fps; // current time in seconds
          const progress = f / totalFrames;

          // Classify current scene type early for both board layout and camera zoompan
          let sceneType = "Explanation scene";
          if (i === 0) sceneType = "Teacher introduction";
          else if (slideTitle.toUpperCase().includes("FORMULA") || slideTitle.toUpperCase().includes("MUTATU") || slideTitle.toUpperCase().includes("MILINGANYO") || segment.content.includes("$$")) sceneType = "Formula scene";
          else if (diagramImage || 
                   slideTitle.toUpperCase().includes("DIAGRAM") || 
                   slideTitle.toUpperCase().includes("CHART") || 
                   slideTitle.toUpperCase().includes("MFUMO") || 
                   slideTitle.toUpperCase().includes("TRIANGLE") || 
                   slideTitle.toUpperCase().includes("STABILITY") || 
                   slideTitle.toUpperCase().includes("CYCLE") || 
                   slideTitle.toUpperCase().includes("CARNOT") || 
                   slideTitle.toUpperCase().includes("CROSS SECTION") || 
                   slideTitle.toUpperCase().includes("HYDRAULIC") || 
                   slideTitle.toUpperCase().includes("ELECTRICAL") || 
                   slideTitle.toUpperCase().includes("CIRCUIT") || 
                   slideTitle.toUpperCase().includes("RLC") ||
                   slideTitle.toUpperCase().includes("SYSTEM")) {
            sceneType = "Diagram scene";
          }
          else if (slideTitle.toUpperCase().includes("QUIZ") || slideTitle.toUpperCase().includes("MTIHANI")) sceneType = "Quiz scene";
          else if (i === segments.length - 1) sceneType = "Summary scene";

          // Clear reusable context
          offCtx.clearRect(0, 0, W, H);

          // Draw background
          if (classroomBgImage) {
            offCtx.drawImage(classroomBgImage, 0, 0, W, H);
            offCtx.fillStyle = 'rgba(15, 23, 42, 0.45)';
            offCtx.fillRect(0, 0, W, H);
          } else {
            const bgGrad = offCtx.createRadialGradient(W/2, H/2, 200, W/2, H/2, W * 0.8);
            bgGrad.addColorStop(0, '#0f172a');
            bgGrad.addColorStop(1, '#05070f');
            offCtx.fillStyle = bgGrad;
            offCtx.fillRect(0, 0, W, H);
          }

          // Architectural vertical glass beams
          offCtx.strokeStyle = 'rgba(56, 189, 248, 0.02)';
          offCtx.lineWidth = 6;
          for (let offset = 200; offset < W; offset += 380) {
            offCtx.beginPath();
            offCtx.moveTo(offset, 0);
            offCtx.lineTo(offset - 60, H);
            offCtx.stroke();
          }

          // Backlights
          offCtx.save();
          offCtx.globalCompositeOperation = 'screen';
          let lamp1 = offCtx.createRadialGradient(850, 200, 20, 850, 200, 350);
          lamp1.addColorStop(0, 'rgba(56, 189, 248, 0.07)');
          lamp1.addColorStop(1, 'rgba(0,0,0,0)');
          offCtx.fillStyle = lamp1;
          offCtx.beginPath(); offCtx.arc(850, 200, 350, 0, Math.PI * 2); offCtx.fill();

          let lamp2 = offCtx.createRadialGradient(200, 500, 5, 200, 500, 220);
          lamp2.addColorStop(0, 'rgba(52, 211, 153, 0.04)');
          lamp2.addColorStop(1, 'rgba(0,0,0,0)');
          offCtx.fillStyle = lamp2;
          offCtx.beginPath(); offCtx.arc(200, 500, 220, 0, Math.PI * 2); offCtx.fill();
          offCtx.restore();

          // Physical Smartboard post and base plate
          offCtx.save();
          const postGrad = offCtx.createLinearGradient(boardX + boardW/2 - 15, boardY + boardH, boardX + boardW/2 + 15, boardY + boardH);
          postGrad.addColorStop(0, '#1e293b');
          postGrad.addColorStop(0.5, '#475569');
          postGrad.addColorStop(1, '#0f172a');
          offCtx.fillStyle = postGrad;
          offCtx.fillRect(boardX + boardW/2 - 15, boardY + boardH - 5, 30, H - (boardY + boardH) - 10);

          const baseGrad = offCtx.createLinearGradient(boardX + boardW/2 - 100, H - 25, boardX + boardW/2 + 100, H - 25);
          baseGrad.addColorStop(0, '#0f172a');
          baseGrad.addColorStop(0.5, '#334155');
          baseGrad.addColorStop(1, '#020617');
          offCtx.fillStyle = baseGrad;
          offCtx.fillRect(boardX + boardW/2 - 100, H - 25, 200, 15);
          offCtx.restore();

          // Translucent smartboard glass screen
          offCtx.save();
          offCtx.fillStyle = 'rgba(10, 14, 26, 0.93)';
          drawRoundRect(offCtx, boardX, boardY, boardW, boardH, 24);
          offCtx.fill();

          offCtx.shadowColor = 'rgba(56, 189, 248, 0.5)';
          offCtx.shadowBlur = 18;
          offCtx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          offCtx.lineWidth = 3;
          drawRoundRect(offCtx, boardX, boardY, boardW, boardH, 24);
          offCtx.stroke();

          offCtx.shadowBlur = 0;
          offCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          offCtx.lineWidth = 1;
          drawRoundRect(offCtx, boardX + 6, boardY + 6, boardW - 12, boardH - 12, 18);
          offCtx.stroke();
          offCtx.restore();

          // Board header title
          offCtx.save();
          offCtx.font = 'bold 30px sans-serif';
          offCtx.fillStyle = '#ffffff';
          offCtx.shadowColor = 'rgba(56, 189, 248, 0.35)';
          offCtx.shadowBlur = 5;
          offCtx.fillText(slideTitle.substring(0, 42), boardX + 40, boardY + 60);
          offCtx.restore();

          // Interactive physics formula badge
          offCtx.save();
          offCtx.font = 'italic 16px monospace';
          offCtx.fillStyle = '#38bdf8';
          offCtx.textAlign = 'right';
          offCtx.fillText('ĤΨ = EΨ (Schrödinger bound state)', boardX + boardW - 40, boardY + 60);
          offCtx.restore();

          // Whitespace contents and formulas based on current scene type
          if (sceneType === "Formula scene" && bodyLines.length > 0) {
            const eqLineIdx = bodyLines.findIndex(l => l.includes('$$') || l.includes('$') || l.includes('\\frac') || l.includes('\\int'));
            const eqLine = eqLineIdx !== -1 ? bodyLines[eqLineIdx] : bodyLines[0];
            const eqText = eqLine.replace(/\$\$/g, '').replace(/\$/g, '');
            
            const mainEqY = boardY + 145;
            offCtx.save();
            const textWidthEstimate = offCtx.measureText(eqText).width || 300;
            const eqX = boardX + boardW / 2 - textWidthEstimate / 3;
            drawEquation(offCtx, eqText, Math.max(boardX + 40, eqX), mainEqY, 25, '#fbbf24', t, true);
            offCtx.restore();

            // Draw Variable Breakdown dashboard below the equation
            const dashY = boardY + 230;
            const dashW = boardW - 100;
            const dashX = boardX + 50;
            const dashH = boardH - 260;

            offCtx.fillStyle = 'rgba(15, 23, 42, 0.65)';
            drawRoundRect(offCtx, dashX, dashY, dashW, dashH, 12);
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(234, 179, 8, 0.25)';
            offCtx.lineWidth = 1;
            drawRoundRect(offCtx, dashX, dashY, dashW, dashH, 12);
            offCtx.stroke();

            offCtx.font = 'bold 12px sans-serif';
            offCtx.fillStyle = '#38bdf8';
            offCtx.textAlign = 'left';
            offCtx.fillText('VARIABLE BREAKDOWN & PHYSICAL INTERPRETATION:', dashX + 20, dashY + 25);

            // Render descriptive labels based on the formula
            let breakdownItems: string[] = [];
            if (eqText.includes('mathcal{L}') || eqText.includes('e^{-st}')) {
              breakdownItems = [
                'ℒ : Laplace Transform Operator (Time ➔ Frequency)',
                's : Complex Frequency Parameter (σ + iω)',
                't : Continuous Time Domain (Seconds)',
                'f(t) : Real-time System Input Signal'
              ];
            } else if (eqText.includes('d^2') || eqText.includes('dx^2')) {
              breakdownItems = [
                'd²y/dx² : Acceleration / Second Derivative',
                'p(x), q(x) : Spatially-varying Field Coeffs',
                'f(x) : External Boundary Driving Force'
              ];
            } else if (eqText.includes('S') || eqText.includes('dQ')) {
              breakdownItems = [
                'ΔS : Net Entropy Change (Thermal Disorder)',
                'dQ : Reversible Heat energy transferred',
                'T : Absolute Thermodynamic Temperature (Kelvin)'
              ];
            } else {
              breakdownItems = [
                'KB : Distance from Keel to Center of Buoyancy',
                'BM : Metacentric Radius (I / V_disp)',
                'KG : Vertical Center of Gravity height',
                'GM : Metacentric Height (Stability Margin)'
              ];
            }

            offCtx.font = '12px monospace';
            let itemY = dashY + 52;
            breakdownItems.forEach((item) => {
              const parts = item.split(':');
              offCtx.fillStyle = '#facc15';
              offCtx.fillText(parts[0].trim(), dashX + 25, itemY);
              offCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
              offCtx.fillText(' : ' + parts[1].trim(), dashX + 45, itemY);
              itemY += 22;
            });
          } else {
            // Left-pane text items / equations for normal slides
            offCtx.save();
            offCtx.fillStyle = 'rgba(241, 245, 249, 0.9)';
            offCtx.font = '19px Georgia, serif';
            
            let lY = boardY + 125;
            bodyLines.slice(0, 5).forEach((line) => {
              const formatted = line.startsWith('•') || line.startsWith('-') ? line : '• ' + line;
              const cleanText = formatted.replace(/[#*`_]/g, '').trim();
              if (cleanText.includes('$$') || cleanText.includes('$') || cleanText.includes('\\frac') || cleanText.includes('\\int')) {
                const eqText = cleanText.replace(/\$\$/g, '').replace(/\$/g, '');
                drawEquation(offCtx, eqText, boardX + 40, lY, 19, '#eab308', t, true);
              } else {
                offCtx.fillText(cleanText.substring(0, 42), boardX + 40, lY);
              }
              lY += 45;
            });
            offCtx.restore();
          }

          // Diagram panel (procedural or static)
          if (diagramImage) {
            offCtx.save();
            const diagX = boardX + 465;
            const diagY = boardY + 110;
            const diagW = 285;
            const diagH = 215;

            offCtx.fillStyle = 'rgba(15, 23, 42, 0.6)';
            drawRoundRect(offCtx, diagX, diagY, diagW, diagH, 16);
            offCtx.fill();

            offCtx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
            offCtx.lineWidth = 1.5;
            drawRoundRect(offCtx, diagX, diagY, diagW, diagH, 16);
            offCtx.stroke();

            offCtx.save();
            offCtx.beginPath();
            drawRoundRect(offCtx, diagX + 6, diagY + 6, diagW - 12, diagH - 12, 12);
            offCtx.clip();
            offCtx.drawImage(diagramImage, diagX + 6, diagY + 6, diagW - 12, diagH - 12);
            offCtx.restore();

            offCtx.font = 'bold 11px sans-serif';
            offCtx.fillStyle = '#34d399';
            offCtx.textAlign = 'center';
            offCtx.fillText('ACTIVE_DIAGRAM_SYNTHESIS', diagX + diagW/2, diagY + diagH + 30);
            offCtx.restore();
          } else {
            const diagX = boardX + 465;
            const diagY = boardY + 110;
            const diagW = 285;
            const diagH = 215;
            drawProceduralDiagram(offCtx, slideTitle, diagX, diagY, diagW, diagH, t);
          }

          // Talking AI Teacher Avatar
          if (teacherImage) {
            offCtx.save();
            const targetW = 370;
            const targetH = 500;
            const targetX = 25;
            const targetY = 80;

            offCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            offCtx.shadowBlur = 20;
            offCtx.fillStyle = 'rgba(10, 14, 26, 0.65)';
            drawRoundRect(offCtx, targetX, targetY, targetW, targetH, 24);
            offCtx.fill();

            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            offCtx.lineWidth = 2;
            drawRoundRect(offCtx, targetX, targetY, targetW, targetH, 24);
            offCtx.stroke();

            // Rotated head, neck and face rendering save
            offCtx.save();
            offCtx.beginPath();
            drawRoundRect(offCtx, targetX + 4, targetY + 4, targetW - 8, targetH - 8, 20);
            offCtx.clip();

            const swayX = Math.sin(t * 2.0) * 4;
            const tilt = Math.cos(t * 1.5) * 0.015;

            offCtx.translate(targetX + targetW / 2, targetY + targetH);
            offCtx.rotate(tilt);
            offCtx.translate(-(targetX + targetW / 2), -(targetY + targetH));

            const teacherAspect = teacherImage.width / teacherImage.height;
            const renderH = targetH - 8;
            const renderW = renderH * teacherAspect;
            const offsetX = targetX + 4 + (targetW - 8 - renderW) / 2 + swayX;
            offCtx.drawImage(teacherImage, offsetX, targetY + 4, renderW, renderH);

            const faceX = offsetX + renderW / 2;
            const faceY = targetY + 120;

            // Natural Blinking
            const isBlinking = (f % 40) < 3;
            if (isBlinking) {
              offCtx.fillStyle = '#222530'; 
              offCtx.beginPath();
              offCtx.ellipse(faceX - 18, faceY - 5, 10, 3, 0, 0, Math.PI * 2);
              offCtx.ellipse(faceX + 18, faceY - 5, 10, 3, 0, 0, Math.PI * 2);
              offCtx.fill();
            }

            // Lip Synchronization Mouth
            const isSpeaking = segment.speech && segment.speech.trim().length > 0;
            const talkingCycle = Math.abs(Math.sin(t * 14.0));
            const mouthOpen = isSpeaking ? talkingCycle * 8 : 0;

            offCtx.fillStyle = '#f43f5e';
            offCtx.beginPath();
            offCtx.ellipse(faceX, faceY + 18, 12, 3 + mouthOpen/2, 0, 0, Math.PI * 2);
            offCtx.fill();

            offCtx.fillStyle = '#0f172a';
            offCtx.beginPath();
            offCtx.ellipse(faceX, faceY + 18, 9, mouthOpen/2, 0, 0, Math.PI * 2);
            offCtx.fill();

            offCtx.restore(); // Restore clipping & head rotation context

            // Hand Gesturing sleeve arm pointing towards smartboard
            offCtx.save();
            offCtx.translate(targetX + 60, targetY + targetH - 40);
            const armAngle = -Math.PI / 4 + Math.sin(t * 2.2) * 0.12;
            offCtx.rotate(armAngle);

            const sleeveGrad = offCtx.createLinearGradient(0, 0, 100, 0);
            sleeveGrad.addColorStop(0, '#1e293b');
            sleeveGrad.addColorStop(1, '#334155');
            offCtx.fillStyle = sleeveGrad;
            offCtx.beginPath();
            offCtx.moveTo(-15, 0);
            offCtx.lineTo(0, -100);
            offCtx.lineTo(25, -100);
            offCtx.lineTo(15, 0);
            offCtx.closePath();
            offCtx.fill();

            offCtx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            offCtx.lineWidth = 4;
            offCtx.beginPath();
            offCtx.moveTo(10, -100);
            offCtx.lineTo(10, -125);
            offCtx.stroke();

            offCtx.shadowColor = '#38bdf8';
            offCtx.shadowBlur = 10;
            offCtx.fillStyle = '#ffffff';
            offCtx.beginPath();
            offCtx.arc(10, -125, 4, 0, Math.PI * 2);
            offCtx.fill();
            offCtx.restore();

            // Instructor label
            const badgeY = targetY + targetH - 60;
            const badgeH = 44;
            offCtx.fillStyle = 'rgba(3, 7, 18, 0.92)';
            drawRoundRect(offCtx, targetX + 16, badgeY, targetW - 32, badgeH, 12);
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            offCtx.lineWidth = 1;
            drawRoundRect(offCtx, targetX + 16, badgeY, targetW - 32, badgeH, 12);
            offCtx.stroke();

            offCtx.font = 'bold 15px sans-serif';
            offCtx.fillStyle = '#38bdf8';
            offCtx.textAlign = 'center';
            const nStr = teacherName ? teacherName.toUpperCase() : 'PROF. LI';
            offCtx.fillText(`• INSTRUCTOR: ${nStr} [NEURAL ACTIVE]`, targetX + targetW / 2, badgeY + 27);
            offCtx.restore();
          } else {
            // Procedural Vector AI Teacher Fallback
            offCtx.save();
            const targetW = 370;
            const targetH = 500;
            const targetX = 25;
            const targetY = 80;

            offCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            offCtx.shadowBlur = 20;
            offCtx.fillStyle = 'rgba(10, 14, 26, 0.65)';
            drawRoundRect(offCtx, targetX, targetY, targetW, targetH, 24);
            offCtx.fill();

            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            offCtx.lineWidth = 2;
            drawRoundRect(offCtx, targetX, targetY, targetW, targetH, 24);
            offCtx.stroke();

            // Clip the drawing inside the frame
            offCtx.save();
            offCtx.beginPath();
            drawRoundRect(offCtx, targetX + 4, targetY + 4, targetW - 8, targetH - 8, 20);
            offCtx.clip();

            const swayX = Math.sin(t * 2.0) * 4;
            const tilt = Math.cos(t * 1.5) * 0.015;

            offCtx.translate(targetX + targetW / 2, targetY + targetH);
            offCtx.rotate(tilt);
            offCtx.translate(-(targetX + targetW / 2), -(targetY + targetH));

            // Draw a stylish suit / shoulders
            const bodyX = targetX + targetW / 2 + swayX;
            const bodyY = targetY + targetH;

            // Suit shoulders
            const suitGrad = offCtx.createLinearGradient(bodyX - 110, bodyY - 180, bodyX + 110, bodyY);
            suitGrad.addColorStop(0, '#1e293b');
            suitGrad.addColorStop(1, '#0f172a');
            offCtx.fillStyle = suitGrad;
            offCtx.beginPath();
            offCtx.moveTo(bodyX - 110, bodyY);
            offCtx.quadraticCurveTo(bodyX - 90, bodyY - 160, bodyX - 40, bodyY - 180);
            offCtx.lineTo(bodyX + 40, bodyY - 180);
            offCtx.quadraticCurveTo(bodyX + 90, bodyY - 160, bodyX + 110, bodyY);
            offCtx.closePath();
            offCtx.fill();

            // Shirt collar / V-neck
            offCtx.fillStyle = '#f1f5f9';
            offCtx.beginPath();
            offCtx.moveTo(bodyX - 25, bodyY - 180);
            offCtx.lineTo(bodyX, bodyY - 145);
            offCtx.lineTo(bodyX + 25, bodyY - 180);
            offCtx.lineTo(bodyX, bodyY - 180);
            offCtx.closePath();
            offCtx.fill();

            // Tie
            offCtx.fillStyle = '#ef4444'; // Red tie
            offCtx.beginPath();
            offCtx.moveTo(bodyX - 6, bodyY - 145);
            offCtx.lineTo(bodyX + 6, bodyY - 145);
            offCtx.lineTo(bodyX + 10, bodyY - 80);
            offCtx.lineTo(bodyX, bodyY - 60);
            offCtx.lineTo(bodyX - 10, bodyY - 80);
            offCtx.closePath();
            offCtx.fill();

            // Neck
            offCtx.fillStyle = '#fbcfe8'; // Skin tone
            offCtx.fillRect(bodyX - 20, bodyY - 240, 40, 70);

            // Head / Face
            const faceX = bodyX;
            const faceY = bodyY - 260;
            
            offCtx.fillStyle = '#fbcfe8'; // Skin tone face
            offCtx.beginPath();
            offCtx.arc(faceX, faceY, 48, 0, Math.PI * 2);
            offCtx.fill();

            // Hair
            offCtx.fillStyle = '#475569'; // Grey professional hair
            offCtx.beginPath();
            offCtx.arc(faceX, faceY - 20, 52, Math.PI, 0);
            offCtx.fill();
            // Sideburns
            offCtx.fillStyle = '#475569';
            offCtx.fillRect(faceX - 52, faceY - 20, 10, 30);
            offCtx.fillRect(faceX + 42, faceY - 20, 10, 30);

            // Eyebrows
            offCtx.strokeStyle = '#334155';
            offCtx.lineWidth = 3;
            offCtx.beginPath();
            offCtx.moveTo(faceX - 28, faceY - 18);
            offCtx.quadraticCurveTo(faceX - 18, faceY - 24, faceX - 8, faceY - 18);
            offCtx.moveTo(faceX + 8, faceY - 18);
            offCtx.quadraticCurveTo(faceX + 18, faceY - 24, faceX + 28, faceY - 18);
            offCtx.stroke();

            // Eyes / Pupils (Normally open)
            offCtx.fillStyle = '#0f172a';
            offCtx.beginPath();
            offCtx.arc(faceX - 18, faceY - 5, 5, 0, Math.PI * 2);
            offCtx.arc(faceX + 18, faceY - 5, 5, 0, Math.PI * 2);
            offCtx.fill();

            // Glasses
            offCtx.strokeStyle = '#eab308'; // Golden frames
            offCtx.lineWidth = 2.5;
            offCtx.beginPath();
            offCtx.arc(faceX - 18, faceY - 5, 12, 0, Math.PI * 2);
            offCtx.arc(faceX + 18, faceY - 5, 12, 0, Math.PI * 2);
            offCtx.moveTo(faceX - 6, faceY - 5);
            offCtx.lineTo(faceX + 6, faceY - 5);
            offCtx.moveTo(faceX - 30, faceY - 5);
            offCtx.lineTo(faceX - 44, faceY - 10);
            offCtx.moveTo(faceX + 30, faceY - 5);
            offCtx.lineTo(faceX + 44, faceY - 10);
            offCtx.stroke();

            // Natural Blinking Overlays
            const isBlinking = (f % 40) < 3;
            if (isBlinking) {
              offCtx.fillStyle = '#fbcfe8'; // Skin tone matches eyelid
              offCtx.beginPath();
              offCtx.ellipse(faceX - 18, faceY - 5, 11, 4, 0, 0, Math.PI * 2);
              offCtx.ellipse(faceX + 18, faceY - 5, 11, 4, 0, 0, Math.PI * 2);
              offCtx.fill();
              // Eyelash line
              offCtx.strokeStyle = '#334155'; offCtx.lineWidth = 1.5;
              offCtx.beginPath();
              offCtx.moveTo(faceX - 29, faceY - 5); offCtx.lineTo(faceX - 7, faceY - 5);
              offCtx.moveTo(faceX + 7, faceY - 5); offCtx.lineTo(faceX + 29, faceY - 5);
              offCtx.stroke();
            }

            // Lip Synchronization Mouth
            const isSpeaking = segment.speech && segment.speech.trim().length > 0;
            const talkingCycle = Math.abs(Math.sin(t * 14.0));
            const mouthOpen = isSpeaking ? talkingCycle * 8 : 0;

            offCtx.fillStyle = '#f43f5e';
            offCtx.beginPath();
            offCtx.ellipse(faceX, faceY + 18, 12, 3 + mouthOpen/2, 0, 0, Math.PI * 2);
            offCtx.fill();

            offCtx.fillStyle = '#0f172a';
            offCtx.beginPath();
            offCtx.ellipse(faceX, faceY + 18, 9, mouthOpen/2, 0, 0, Math.PI * 2);
            offCtx.fill();

            offCtx.restore(); // Restore clipping & head rotation context

            // Hand Gesturing sleeve arm pointing towards smartboard
            offCtx.save();
            offCtx.translate(targetX + 60, targetY + targetH - 40);
            const armAngle = -Math.PI / 4 + Math.sin(t * 2.2) * 0.12;
            offCtx.rotate(armAngle);

            const sleeveGrad = offCtx.createLinearGradient(0, 0, 100, 0);
            sleeveGrad.addColorStop(0, '#1e293b');
            sleeveGrad.addColorStop(1, '#334155');
            offCtx.fillStyle = sleeveGrad;
            offCtx.beginPath();
            offCtx.moveTo(-15, 0);
            offCtx.lineTo(0, -100);
            offCtx.lineTo(25, -100);
            offCtx.lineTo(15, 0);
            offCtx.closePath();
            offCtx.fill();

            offCtx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            offCtx.lineWidth = 4;
            offCtx.beginPath();
            offCtx.moveTo(10, -100);
            offCtx.lineTo(10, -125);
            offCtx.stroke();

            offCtx.shadowColor = '#38bdf8';
            offCtx.shadowBlur = 10;
            offCtx.fillStyle = '#ffffff';
            offCtx.beginPath();
            offCtx.arc(10, -125, 4, 0, Math.PI * 2);
            offCtx.fill();
            offCtx.restore();

            // Instructor label badge
            const badgeY = targetY + targetH - 60;
            const badgeH = 44;
            offCtx.fillStyle = 'rgba(3, 7, 18, 0.92)';
            drawRoundRect(offCtx, targetX + 16, badgeY, targetW - 32, badgeH, 12);
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            offCtx.lineWidth = 1;
            drawRoundRect(offCtx, targetX + 16, badgeY, targetW - 32, badgeH, 12);
            offCtx.stroke();

            offCtx.font = 'bold 15px sans-serif';
            offCtx.fillStyle = '#38bdf8';
            offCtx.textAlign = 'center';
            const nStr = teacherName ? teacherName.toUpperCase() : 'PROF. LI';
            offCtx.fillText(`• INSTRUCTOR: ${nStr} [NEURAL ACTIVE]`, targetX + targetW / 2, badgeY + 27);
            offCtx.restore();
          }

          // Foreground Student silhouette
          offCtx.save();
          offCtx.shadowColor = 'rgba(3, 7, 18, 0.95)';
          offCtx.shadowBlur = 30;
          offCtx.fillStyle = 'rgba(10, 15, 25, 0.88)';
          
          const sHeadX = 1170;
          const sHeadY = 625;
          
          offCtx.beginPath();
          offCtx.moveTo(1020, 720);
          offCtx.bezierCurveTo(1060, 640, 1100, 630, sHeadX - 20, sHeadY + 45);
          offCtx.lineTo(sHeadX + 50, sHeadY + 45);
          offCtx.bezierCurveTo(1220, 620, 1260, 650, 1280, 720);
          offCtx.closePath();
          offCtx.fill();
          
          offCtx.beginPath();
          offCtx.arc(sHeadX, sHeadY, 44, 0, Math.PI * 2);
          offCtx.fill();

          // Cinematic Rim light
          offCtx.save();
          offCtx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          offCtx.lineWidth = 3.5;
          offCtx.shadowColor = 'rgba(56, 189, 248, 0.6)';
          offCtx.shadowBlur = 8;
          offCtx.beginPath();
          offCtx.moveTo(1020, 720);
          offCtx.bezierCurveTo(1060, 640, 1100, 630, sHeadX - 20, sHeadY + 45);
          offCtx.stroke();
          
          offCtx.beginPath();
          offCtx.arc(sHeadX, sHeadY, 44, Math.PI * 0.8, Math.PI * 1.5);
          offCtx.stroke();
          offCtx.restore();

          offCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          offCtx.lineWidth = 1.5;
          offCtx.beginPath();
          offCtx.arc(sHeadX - 10, sHeadY + 5, 12, 0, Math.PI * 2);
          offCtx.stroke();
          offCtx.restore();

          // Header text overlay
          offCtx.font = 'bold 20px sans-serif';
          offCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          offCtx.textAlign = 'left';
          offCtx.fillText('MASTERCLASS // NEURAL_LINK_v4.0', 40, 48);

          offCtx.font = 'bold 16px sans-serif';
          offCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          offCtx.textAlign = 'right';
          offCtx.fillText('Veo', W - 40, H - 25);

          // Subtitles with Word-Level Active Highlighting Capsule
          const subW = W * 0.82;
          const subY = H - 65;
          const textToDisplay = (segment.speech || segment.content || '').replace(/[#*`_]/g, '');
          const words = textToDisplay.split(' ');
          
          offCtx.font = 'bold 20px sans-serif';
          offCtx.textAlign = 'center';

          let subtitleLines: string[][] = [];
          let curLineWords: string[] = [];
          let testLine = '';
          
          for (let word of words) {
            const testLineWithWord = testLine + word + ' ';
            if (offCtx.measureText(testLineWithWord).width > subW - 100 && testLine !== '') {
              subtitleLines.push(curLineWords);
              curLineWords = [word];
              testLine = word + ' ';
            } else {
              curLineWords.push(word);
              testLine = testLineWithWord;
            }
          }
          if (curLineWords.length > 0) subtitleLines.push(curLineWords);

          const boxH = subtitleLines.length * 30 + 20;
          const boxY = subY - boxH;

          offCtx.fillStyle = 'rgba(8, 12, 28, 0.85)';
          offCtx.save();
          offCtx.shadowBlur = 20;
          offCtx.shadowColor = 'rgba(0,0,0,0.6)';
          offCtx.beginPath();
          drawRoundRect(offCtx, W/2 - subW/2, boxY, subW, boxH, 16);
          offCtx.fill();
          offCtx.restore();

          const currentWordIdx = Math.floor(progress * words.length);
          let absoluteWordCounter = 0;
          subtitleLines.forEach((lineWords, lineIdx) => {
            const lineStr = lineWords.join(' ');
            const startX = W/2 - offCtx.measureText(lineStr).width / 2;
            let currentX = startX;

            lineWords.forEach((word) => {
              const isActive = (absoluteWordCounter === currentWordIdx);
              offCtx.fillStyle = isActive ? '#38bdf8' : '#ffffff';
              offCtx.font = isActive ? 'bold 21px sans-serif' : '20px sans-serif';
              
              offCtx.textAlign = 'left';
              offCtx.fillText(word, currentX, boxY + 28 + (lineIdx * 30));
              currentX += offCtx.measureText(word + ' ').width;
              absoluteWordCounter++;
            });
          });

          // Camera zoompan calculations based on scene type
          let scale = 1.0;
          let cx = W/2;
          let cy = H/2;

          if (sceneType === "Teacher introduction") {
            // Slow push-in on the teacher introduction scene
            scale = 1.0 + progress * 0.10;
            cx = 210;
            cy = 330;
          } else if (sceneType === "Formula scene") {
            // Zoom toward the centered equation on the smartboard
            scale = 1.0 + progress * 0.15;
            cx = boardX + boardW / 2;
            cy = boardY + 160;
          } else if (sceneType === "Diagram scene") {
            // Focus on the diagram panel
            scale = 1.0 + progress * 0.18;
            cx = boardX + 590;
            cy = boardY + 235;
          } else if (sceneType === "Explanation scene") {
            // Teacher-focused framing for standard explanations
            scale = 1.05;
            cx = 210;
            cy = 330;
          } else if (sceneType === "Quiz scene") {
            // Zoom out slightly to reveal the entire quiz board clearly
            scale = 1.08 - progress * 0.08;
            cx = W/2;
            cy = H/2;
          } else {
            // Cinematic closing shot panning out
            scale = 1.04 - progress * 0.04;
            cx = W/2;
            cy = H/2;
          }

          const srcW = W / scale;
          const srcH = H / scale;
          const srcX = Math.max(0, Math.min(W - srcW, cx - srcW / 2));
          const srcY = Math.max(0, Math.min(H - srcH, cy - srcH / 2));

          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(offscreenCanvas, srcX, srcY, srcW, srcH, 0, 0, W, H);

          const framePath = path.join(sessionPath, `frame_${i}_${f}.jpg`);
          fs.writeFileSync(framePath, canvas.toBuffer('image/jpeg', { quality: 0.6 }));
        }

        // Encode segment sequence of frames using image2 demuxer in FFmpeg
        console.log(`[NEURAL_VEO_LINK]   - Encoding clip ${i+1} using FFmpeg Animated Frame Mode...`);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("FFmpeg clip encode timeout")), 180000);
          ffmpeg()
            .input(path.join(sessionPath, `frame_${i}_%d.jpg`))
            .inputOptions([
              '-f image2',
              '-framerate 3',
              '-start_number 0'
            ])
            .input(audioPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
              '-pix_fmt yuv420p',
              '-shortest',
              '-preset ultrafast',
              '-crf 25',
              '-threads 2',
              '-b:a 192k',
              '-ac 2'
            ])
            .save(clipPath)
            .on('end', () => {
              clearTimeout(timeout);
              console.log(`[NEURAL_VEO_LINK]   - Clip ${i+1} encoded successfully.`);
              resolve();
            })
            .on('error', (err) => {
              clearTimeout(timeout);
              console.error(`[NEURAL_VEO_LINK]   - Clip ${i+1} encoding fault:`, err);
              reject(err);
            });
        });

        // Cleanup temporary frame jpgs
        for (let f = 0; f < totalFrames; f++) {
          try {
            fs.unlinkSync(path.join(sessionPath, `frame_${i}_${f}.jpg`));
          } catch (e) {}
        }

        return clipPath;
      } catch (segErr) {
        console.error(`Failed to process segment ${i}:`, segErr);
        return null;
      }
    };

    const srtEntries: { index: number; start: string; end: string; text: string }[] = [];
    let srtIndex = 1;
    let elapsed = 0;

    const formatSRTTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    // Execute batch sequentially to control memory
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const clip = await processSegment(i);
      if (clip) {
        videoSegments.push(clip);

        let duration = 3.5;
        try {
          const audioPath = path.join(sessionPath, `audio_${i}.mp3`);
          duration = await getAudioDuration(audioPath);
        } catch (e) {}

        const startTime = elapsed;
        const endTime = elapsed + duration;
        elapsed += duration;

        const cleanSpeech = (segment.speech || '').replace(/[#*`_]/g, '').trim();
        if (cleanSpeech.length > 0) {
          const sentences = cleanSpeech.match(/[^.!?]+[.!?]*|[^.!?]+/g) || [cleanSpeech];
          const sentenceDur = duration / Math.max(1, sentences.length);
          for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
            const sText = sentences[sIdx].trim();
            if (sText.length === 0) continue;

            const sStart = startTime + sIdx * sentenceDur;
            const sEnd = startTime + (sIdx + 1) * sentenceDur;

            srtEntries.push({
              index: srtIndex++,
              start: formatSRTTime(sStart),
              end: formatSRTTime(sEnd),
              text: sText
            });
          }
        }
      }
    }

    if (videoSegments.length === 0) {
      throw new Error('No valid video segments were generated.');
    }

    // 5. Concatenate all segments
    onProgress?.("Stitching completed video clips together...", 92);
    const finalVideoPath = path.join(STORAGE_PATH, `${sessionId}.mp4`);
    const listPath = path.join(sessionPath, 'list.txt');
    const listContent = videoSegments.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(listPath, listContent);

    await new Promise<void>((resolve, reject) => {
      const concatTimeout = setTimeout(() => reject(new Error("FFmpeg final concat timeout")), 120000);
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .save(finalVideoPath)
        .on('end', () => { clearTimeout(concatTimeout); resolve(); })
        .on('error', (err) => { clearTimeout(concatTimeout); reject(err); });
    });

    // Write SRT file to storage alongside video
    onProgress?.("Generating synchronized subtitles...", 96);
    try {
      const srtContent = srtEntries.map(e => `${e.index}\n${e.start} --> ${e.end}\n${e.text}\n`).join('\n');
      const srtPath = path.join(STORAGE_PATH, `${sessionId}.srt`);
      fs.writeFileSync(srtPath, srtContent);
      console.log(`[NEURAL_VEO_LINK] Saved synchronized SRT file to ${srtPath}`);
    } catch (srtErr) {
      console.warn("Failed to write SRT file:", srtErr);
    }

    onProgress?.("Finalizing cinematic export...", 98);
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`[NEURAL_VEO_LINK] Cleaned up session ${sessionId}`);
      cleanupOldVideos();
    } catch (cleanupErr) {
      console.warn("Session cleanup warning:", cleanupErr);
    }

    onProgress?.("Export completed!", 100);
    return `${sessionId}.mp4`;
  } catch (error) {
    console.error('Final video generation error:', error);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
    } catch (e) {}

    try {
      const errorSessionId = `err_${uuidv4().slice(0, 8)}`;
      const errorVideoPath = path.join(STORAGE_PATH, `${errorSessionId}.mp4`);
      await createErrorVideo(errorVideoPath, "Video generation failed. Please try a shorter request.");
      return `${errorSessionId}.mp4`;
    } catch (fallbackErr) {
      console.error('Fallback video generation also failed:', fallbackErr);
      throw error;
    }
  }
}

async function createSilentAudio(outputPath: string, duration: number = 2): Promise<void> {
  try {
    // A standard, clean, minimal 1-second silent MP3 clip in Base64
    const silentMp3Base64 = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGFtZTMuMTAwZXJrYgAAAAAAAAAAAP/4SMPAAGAeAAXQAAMEAABBbyEAS9gAABA1AAABNf/4SMPAAGAeAAXQAAMEAABBbyEAS9gAABA1AAABNf/4SMPAAGAeAAXQAAMEAABBbyEAS9gAABA1AAABNf/4SMPAAGAeAAXQAAMEAABBbyEAS9gAABA1AAABNf/4SMPAAGAeAAXQAAMEAABBbyEAS9gAABA1AAABNf8=";
    fs.writeFileSync(outputPath, Buffer.from(silentMp3Base64, 'base64'));
    return;
  } catch (err) {
    console.warn("Direct silent MP3 write failed, falling back to ffmpeg encoder:", err);
  }

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('anullsrc')
      .inputFormat('lavfi')
      .duration(duration)
      .audioCodec('libmp3lame')
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

async function createErrorImage(outputPath: string, message: string): Promise<void> {
  await ensureCanvasLoaded();
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SYSTEM ERROR: ' + message, 960, 540);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

async function createErrorVideo(outputPath: string, message: string): Promise<void> {
  const tempImgPath = path.join(STORAGE_PATH, `error_tmp_${uuidv4()}.png`);
  const tempAudioPath = path.join(STORAGE_PATH, `error_tmp_${uuidv4()}.mp3`);
  
  await createErrorImage(tempImgPath, message);
  await createSilentAudio(tempAudioPath, 5);
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempImgPath)
      .loop(5)
      .input(tempAudioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt yuv420p', 
        '-shortest',
        '-c:a aac',
        '-b:a 192k',
        '-ac 2'
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ffprobe duration timeout")), 10000);
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      clearTimeout(timeout);
      if (err) return reject(err);
      resolve(metadata.format.duration || 5);
    });
  });
}

/**
 * Periodically removes videos older than 1 hour to prevent disk exhaustion
 */
function cleanupOldVideos() {
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();
    
    fs.readdir(STORAGE_PATH, (err, files) => {
        if (err) return;
        
        files.forEach(file => {
            if (!file.endsWith('.mp4')) return;
            
            const filePath = path.join(STORAGE_PATH, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                if (now - stats.mtimeMs > ONE_HOUR) {
                    fs.unlink(filePath, () => {
                        console.log(`[NEURAL_VEO_LINK] Purged old video: ${file}`);
                    });
                }
            });
        });
    });
}
