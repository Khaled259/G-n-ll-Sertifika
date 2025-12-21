import { jsPDF } from 'jspdf';
import { CertificateData } from '../types';

type CertificateExtras = {
  institution?: string;       // e.g. "Tıpta Profesyonellik Bloğu"
  departmentOrUnit?: string;  // e.g. "Araştırma ve Geliştirme Birimi"
  coordinatorTitle?: string;  // e.g. "Koordinatör" / "Sorumlu Öğretim Üyesi"
  coordinatorName?: string;   // e.g. "Dr. Öğr. Üyesi Ayşe Yılmaz"
  location?: string;          // e.g. "İstanbul"
  certificateNo?: string;     // e.g. "2025-TPB-0142"
};

type CertificateInput = CertificateData & CertificateExtras;

// ---------- Helper: Transliterate Turkish to ASCII ----------
// Used ONLY as a catastrophic fallback if fonts absolutely fail to load.
// This prevents the PDF from crashing or showing "0" rectangles.
const sanitizeText = (text: string): string => {
  return text
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/â/g, 'a').replace(/Â/g, 'A');
};

// ---------- Font loading (Unicode-safe) ----------

// Convert ArrayBuffer -> base64 (chunked for safety)
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; 
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const fetchFirstAvailable = async (urls: string[]): Promise<ArrayBuffer> => {
  let lastErr: unknown = null;

  for (const url of urls) {
    try {
      // mode: 'cors' is crucial for CDN font fetching
      const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.arrayBuffer();
    } catch (e) {
      console.warn(`Failed to fetch font from ${url}`, e);
      lastErr = e;
    }
  }

  throw lastErr ?? new Error('All font mirrors failed.');
};

// Returns true if fonts loaded successfully, false otherwise.
const loadCustomFonts = async (doc: jsPDF): Promise<boolean> => {
  try {
    // Using Cloudflare CDN (cdnjs) which is extremely reliable for pdfmake/Roboto
    const regularBuf = await fetchFirstAvailable([
      'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
      'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf'
    ]);

    const boldBuf = await fetchFirstAvailable([
      'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf', // Medium often works better as Bold in PDF
      'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.ttf'
    ]);

    const regularB64 = arrayBufferToBase64(regularBuf);
    const boldB64 = arrayBufferToBase64(boldBuf);

    doc.addFileToVFS('Roboto-Regular.ttf', regularB64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');

    doc.addFileToVFS('Roboto-Bold.ttf', boldB64);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    
    return true;
  } catch (e) {
    console.error("CRITICAL: Font loading failed. Turkish characters will be transliterated.", e);
    return false;
  }
};

// ---------- Decorations ----------

const drawAtom = (doc: jsPDF, x: number, y: number, scale: number) => {
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.4 * scale);

  doc.setFillColor(8, 51, 68);
  doc.circle(x, y, 2.5 * scale, 'F');

  doc.setDrawColor(8, 51, 68);
  doc.ellipse(x, y, 9 * scale, 3 * scale, 'S');
  doc.ellipse(x, y, 3 * scale, 9 * scale, 'S');
  doc.circle(x, y, 7 * scale, 'S');

  doc.setFillColor(6, 182, 212);
  doc.circle(x + 9 * scale, y, 1 * scale, 'F');
  doc.circle(x, y - 9 * scale, 1 * scale, 'F');
  doc.circle(x - 5 * scale, y + 5 * scale, 1 * scale, 'F');
};

const drawDNAHelix = (doc: jsPDF, x: number, y: number, height: number, scale: number) => {
  const width = 14 * scale;
  const steps = 12;
  const stepHeight = height / steps;

  for (let i = 0; i < steps; i++) {
    const curY = y + i * stepHeight;
    const offset1 = Math.sin(i * 0.9) * (width / 2);
    const offset2 = Math.sin(i * 0.9 + Math.PI) * (width / 2);

    const x1 = x + width / 2 + offset1;
    const x2 = x + width / 2 + offset2;

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.5 * scale);
    doc.line(x1, curY, x2, curY);

    doc.setFillColor(8, 51, 68);
    doc.circle(x1, curY, 1.2 * scale, 'F');
    doc.circle(x2, curY, 1.2 * scale, 'F');
  }
};

const drawMicroscope = (doc: jsPDF, x: number, y: number, scale: number) => {
  doc.setDrawColor(8, 51, 68);
  doc.setFillColor(8, 51, 68);
  doc.setLineWidth(0.6 * scale);

  doc.rect(x - 6 * scale, y + 8 * scale, 12 * scale, 2 * scale, 'F');
  doc.line(x - 3 * scale, y + 8 * scale, x - 3 * scale, y - 2 * scale);
  doc.line(x - 3 * scale, y - 2 * scale, x + 2 * scale, y - 5 * scale);

  doc.rect(x + 1 * scale, y - 8 * scale, 2.5 * scale, 6 * scale, 'S');
  doc.line(x + 2 * scale, y - 8 * scale, x + 5 * scale, y - 8 * scale);

  doc.setLineWidth(1 * scale);
  doc.line(x - 3 * scale, y + 4 * scale, x + 4 * scale, y + 4 * scale);
};

const drawCheckBadge = (doc: jsPDF, x: number, y: number, scale: number) => {
  const radius = 6 * scale;
  doc.setDrawColor(6, 182, 212);
  doc.setFillColor(8, 51, 68);
  doc.circle(x, y, radius, 'F');

  doc.setDrawColor(236, 254, 255);
  doc.setLineWidth(1.5 * scale);
  doc.line(x - 2 * scale, y, x - 0.2 * scale, y + 2 * scale);
  doc.line(x - 0.2 * scale, y + 2 * scale, x + 3 * scale, y - 2 * scale);
};

const drawSparkle = (doc: jsPDF, x: number, y: number, scale: number) => {
  doc.setDrawColor(94, 234, 212);
  doc.setFillColor(16, 185, 129);
  doc.setLineWidth(0.6 * scale);

  doc.circle(x, y, 1.6 * scale, 'F');
  doc.line(x - 3 * scale, y, x + 3 * scale, y);
  doc.line(x, y - 3 * scale, x, y + 3 * scale);
};

const drawSeal = (doc: jsPDF, x: number, y: number, scale: number) => {
  doc.setDrawColor(8, 47, 73);
  doc.setFillColor(6, 182, 212);
  doc.circle(x, y, 12 * scale, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.circle(x, y, 8 * scale, 'F');

  doc.setTextColor(8, 47, 73);
  doc.setFontSize(9 * scale);
  doc.text('BGP', x, y + 3 * scale, { align: 'center' });
};

// ---------- Main generator ----------

export const generateCertificatePDF = async (data: CertificateInput) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Attempt to load custom fonts. 
  const fontLoaded = await loadCustomFonts(doc);

  // If font loaded, use text as-is (Turkish supported).
  // If font failed, sanitize to ASCII (English letters) to prevent garbage.
  const t = (text: string) => fontLoaded ? text : sanitizeText(text);

  // Helper: Set font based on availability
  const setFont = (style: 'normal' | 'bold') => {
    if (fontLoaded) {
      doc.setFont('Roboto', style);
    } else {
      doc.setFont('times', style);
    }
  };

  setFont('normal');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;

  const palette = {
    deep: { r: 8, g: 47, b: 73 },
    accent: { r: 6, g: 182, b: 212 },
    ink: { r: 15, g: 23, b: 42 },
    muted: { r: 71, g: 85, b: 105 },
    soft: { r: 241, g: 245, b: 249 },
  };

  // Optional fields with professional defaults
  const institution = data.institution ?? 'Tıpta Profesyonellik Bloğu';
  const unit = data.departmentOrUnit ?? 'Bilimsel Araştırmalar ve Uygulamalar';
  const coordinatorTitle = data.coordinatorTitle ?? 'Koordinatör';
  const coordinatorName = data.coordinatorName ?? '';
  const location = data.location ?? '';
  const certificateNo = data.certificateNo ?? '';

  // Background layers
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFillColor(240, 253, 250);
  doc.rect(10, 12, pageWidth - 20, pageHeight - 24, 'F');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 16, pageWidth - 28, pageHeight - 32, 6, 6, 'F');

  // Borders
  doc.setDrawColor(8, 51, 68);
  doc.setLineWidth(2.5);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  doc.setDrawColor(22, 78, 99);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // Decorations
  drawDNAHelix(doc, 22, 38, 118, 0.9);
  drawDNAHelix(doc, pageWidth - 38, 38, 118, 0.9);

  drawAtom(doc, 26, 24, 1.2);
  drawAtom(doc, pageWidth - 26, 24, 1.2);
  drawAtom(doc, 26, pageHeight - 26, 1.2);
  drawAtom(doc, pageWidth - 26, pageHeight - 26, 1.2);

  // Header band
  doc.setFillColor(palette.deep.r, palette.deep.g, palette.deep.b);
  doc.rect(20, 24, pageWidth - 40, 20, 'F');
  doc.setFillColor(palette.accent.r, palette.accent.g, palette.accent.b);
  doc.rect(20, 44, pageWidth - 40, 1.2, 'F');

  // Header emblem
  doc.setDrawColor(22, 78, 99);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(1);
  doc.circle(centerX, 36, 11, 'FD');
  drawMicroscope(doc, centerX, 36, 0.85);
  drawSparkle(doc, centerX - 16, 32, 1);
  drawSparkle(doc, centerX + 16, 40, 0.9);

  // Institution lines
  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85);
  setFont('normal');
  doc.text(t(institution), centerX, 60, { align: 'center' });

  doc.setFontSize(10.5);
  doc.setTextColor(100, 116, 139);
  doc.text(t(unit), centerX, 66, { align: 'center' });

  // Title
  setFont('bold');
  doc.setFontSize(32);
  doc.setTextColor(22, 78, 99);
  doc.text(t('BİLİMSEL GÖNÜLLÜLÜK SERTİFİKASI'), centerX, 82, { align: 'center' });

  // Intro paragraph
  setFont('normal');
  doc.setFontSize(13.5);
  doc.setTextColor(51, 65, 85);

  const introRaw = 'Bu belge, topluluk bilim çalışmalarımıza gösterdiğiniz özenli katkıları ve bilimsel etik ilkelere bağlı gönüllü emeğinizi onurlandırmak amacıyla düzenlenmiştir.';
  const intro = t(introRaw);
  const introLines = doc.splitTextToSize(intro, pageWidth - 90);
  doc.text(introLines, centerX, 98, { align: 'center', lineHeightFactor: 1.35 });

  // Name (dynamic sizing)
  // We use standard toLocaleUpperCase. 
  // IMPORTANT: We do NOT force sanitized ASCII if font is loaded.
  const rawName = data.name.toLocaleUpperCase('tr-TR');
  const cleanName = t(rawName);

  setFont('bold');
  doc.setTextColor(15, 23, 42);

  let nameFontSize = 38;
  doc.setFontSize(nameFontSize);

  const maxNameWidth = pageWidth - 110;
  while (doc.getTextWidth(cleanName) > maxNameWidth && nameFontSize > 20) {
    nameFontSize -= 2;
    doc.setFontSize(nameFontSize);
  }

  const nameY = 114;
  doc.text(cleanName, centerX, nameY, { align: 'center' });

  // Underline
  doc.setDrawColor(palette.accent.r, palette.accent.g, palette.accent.b);
  doc.setLineWidth(1);
  doc.line(centerX - 60, nameY + 8, centerX + 60, nameY + 8);

  // Optional impact message
  const impactRaw = (data.impactMessage ?? '').trim();
  const impactTextBase = impactRaw.length > 0
      ? impactRaw
      : 'Katkılarınız; veri doğruluğu, topluluk katılımı ve bilimsel sürecin güvenilirliği için önemli bir fark yarattı.';
  
  const impactText = t(impactTextBase);

  setFont('normal');
  doc.setFontSize(12.5);
  doc.setTextColor(51, 65, 85);

  const boxX = 32;
  const boxY = 124;
  const boxWidth = pageWidth - 64;
  const contentWidth = boxWidth - 20;
  const impactLines = doc.splitTextToSize(impactText, contentWidth);
  const impactHeight = impactLines.length * 4.8 + 12;

  doc.setFillColor(236, 254, 255);
  doc.roundedRect(boxX, boxY, boxWidth, impactHeight, 4, 4, 'F');
  doc.setDrawColor(6, 182, 212);
  doc.setLineWidth(0.6);
  doc.roundedRect(boxX, boxY, boxWidth, impactHeight, 4, 4, 'S');

  setFont('bold');
  doc.setFontSize(12);
  doc.setTextColor(palette.deep.r, palette.deep.g, palette.deep.b);
  doc.text(t('Gönüllü Etki Notu'), boxX + 10, boxY + 10);

  setFont('normal');
  doc.setFontSize(11.5);
  doc.setTextColor(51, 65, 85);
  doc.text(impactLines, centerX, boxY + 18, { align: 'center', lineHeightFactor: 1.45 });

  // Highlights section
  const highlights = [
    {
      title: 'Özenli iş birliği',
      detail: 'Veri paylaşımında şeffaf kalıp ekip iletişimini güçlendirdiniz.'
    },
    {
      title: 'Etik duyarlılık',
      detail: 'Gizlilik ve güvenilirlik ilkelerini kararlılıkla gözetiyorsunuz.'
    }
  ];

  let highlightY = boxY + impactHeight + 12;
  setFont('bold');
  doc.setFontSize(12);
  doc.setTextColor(palette.deep.r, palette.deep.g, palette.deep.b);
  doc.text(t('Öne Çıkan Katkılar'), boxX + 4, highlightY);

  setFont('normal');
  doc.setFontSize(11);
  doc.setTextColor(palette.muted.r, palette.muted.g, palette.muted.b);
  highlightY += 6;

  highlights.forEach((item) => {
    drawCheckBadge(doc, boxX + 8, highlightY + 2, 1);
    setFont('bold');
    doc.setTextColor(palette.ink.r, palette.ink.g, palette.ink.b);
    doc.text(t(item.title), boxX + 18, highlightY + 2);

    setFont('normal');
    doc.setTextColor(71, 85, 105);
    const detailLines = doc.splitTextToSize(t(item.detail), pageWidth - 110);
    doc.text(detailLines, boxX + 18, highlightY + 8, { lineHeightFactor: 1.35 });

    highlightY += detailLines.length * 4 + 6;
  });

  // Closing line with seal
  drawSeal(doc, pageWidth - 34, highlightY - 6, 0.85);
  setFont('normal');
  doc.setFontSize(11.5);
  doc.setTextColor(51, 65, 85);
  const closingRaw = 'Bilimsel gönüllülük yolculuğunuz, sürdürülebilir bilgi üretimi ve topluluk bilimi için ilham verici bir örnek oluşturuyor.';
  const closing = t(closingRaw);
  const closingLines = doc.splitTextToSize(closing, pageWidth - 60);
  doc.text(closingLines, centerX, highlightY + 4, { align: 'center', lineHeightFactor: 1.3 });

  // Footer
  const footerY = pageHeight - 18;

  // Left: location + date + certificate no
  setFont('normal');
  doc.setFontSize(10.5);
  doc.setTextColor(100, 116, 139);

  const leftX = 30;
  const dateLabel = t('Düzenlenme Tarihi');
  const locPart = location ? `${t(location)}, ` : '';
  doc.text(`${locPart}${dateLabel}: ${data.date}`, leftX, footerY);

  if (certificateNo) {
    doc.setFontSize(9.5);
    doc.text(`${t('Belge No')}: ${certificateNo}`, leftX, footerY + 6);
  }

  // Right: signature
  const sigX = pageWidth - 78;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(sigX, footerY - 6, sigX + 48, footerY - 6);

  setFont('bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(t(coordinatorTitle), sigX + 24, footerY, { align: 'center' });

  if (coordinatorName.trim()) {
    setFont('normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(t(coordinatorName), sigX + 24, footerY + 5.5, { align: 'center' });
  }

  // Save
  // We sanitize the filename just to be safe for OS file systems
  const safeFileName = sanitizeText(data.name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_');

  doc.save(`${safeFileName}_GonulluKatilimSertifikasi.pdf`);
};
