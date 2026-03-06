import { 
  collection, 
  addDoc, 
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { GoogleGenAI } from "@google/genai";
import { db, storage } from "../firebase";
import { REPORT_GENERATION_INSTRUCTIONS } from "../constants";
import { jsPDF } from "jspdf";

export async function generateAIReport(
  userId: string, 
  personalNote?: string, 
  onStatusUpdate?: (status: string) => void,
  onMarkdownUpdate?: (markdown: string) => void,
  signal?: AbortSignal
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API Key is missing.");

  const checkSignal = () => {
    if (signal?.aborted) {
      throw new Error("Report generation cancelled");
    }
  };

  onStatusUpdate?.("Fetching session data...");
  checkSignal();

  // 1. Fetch recent alerts for context
  const alertsQ = query(
    collection(db, "users", userId, "alerts"),
    orderBy("timestamp", "desc"),
    limit(50)
  );
  
  const alertsSnapshot = await getDocs(alertsQ);
  checkSignal();
  onStatusUpdate?.("Analyzing postural patterns...");

  const alerts = alertsSnapshot.docs.map(doc => doc.data());
  
  const alertsSummary = alerts.length > 0 
    ? alerts.map(a => {
        const date = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || Date.now());
        const timeStr = isNaN(date.getTime()) ? "Unknown Time" : date.toLocaleTimeString();
        return `[${timeStr}] ${String(a.type || 'ALERT').toUpperCase()}: ${a.message || 'No message'} (Severity: ${a.severity || 'medium'})`;
      }).join('\n')
    : "No specific alerts recorded in this session.";

  // 2. Generate AI Analysis in Markdown
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Generate a professional postural health report in MARKDOWN format based on the following session data and specific medical guidelines:
    
    MEDICAL GUIDELINES & INSTRUCTIONS:
    ${REPORT_GENERATION_INSTRUCTIONS}

    SESSION ALERTS:
    ${alertsSummary}

    ${personalNote ? `USER PERSONAL NOTE: ${personalNote}` : ''}
    
    Please structure the report with:
    # EXECUTIVE SUMMARY: Overall postural health assessment.
    ## OBSERVABLE SIGNS: Analysis of forward head posture, rounded shoulders, pelvic tilt, etc., based on the provided guidelines.
    ## ACTIONABLE DATA: Position change frequency, static hold durations, and asymmetry risks.
    ## RECOMMENDATIONS: Specific ergonomic advice and tips on how to setup an ergonomic workstation.
    
    Keep the tone professional, medical-grade, and actionable.
  `;

  let streamResponse;
  try {
    streamResponse = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
  } catch (apiError: any) {
    console.error("Gemini API Error:", apiError);
    throw new Error("Failed to connect to the AI analysis engine. Please try again later.");
  }

  let markdownContent = "";
  for await (const chunk of streamResponse) {
    checkSignal();
    const text = chunk.text || "";
    markdownContent += text;
    onMarkdownUpdate?.(markdownContent);
  }

  onStatusUpdate?.("Finalizing report document...");
  
  // 3. Create PDF version
  const doc = new jsPDF();
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  
  doc.setFontSize(18);
  doc.setTextColor(0, 128, 128); // Emerald-ish
  doc.text("MISI SYSTEMS - POSTURAL HEALTH REPORT", margin, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 30);
  doc.text(`User ID: ${userId}`, margin, 35);
  doc.line(margin, 40, pageWidth - margin, 40);
  
  let y = 50;
  const lines = markdownContent.split('\n');
  
  doc.setTextColor(0);
  lines.forEach(line => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }

    if (line.startsWith('# ')) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      const text = line.replace('# ', '');
      doc.text(text, margin, y);
      y += 10;
    } else if (line.startsWith('## ')) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      const text = line.replace('## ', '');
      doc.text(text, margin, y);
      y += 8;
    } else if (line.trim() === '') {
      y += 5;
    } else {
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      const wrappedText = doc.splitTextToSize(line, contentWidth);
      
      wrappedText.forEach((wrappedLine: string) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(wrappedLine, margin, y);
        y += 6;
      });
    }
  });
  
  const pdfBlob = doc.output('blob');
  
  // 4. Upload PDF to Storage
  const reportId = Math.random().toString(36).substring(7);
  const reportName = `Misi_Health_Report_${new Date().toISOString().split('T')[0]}_${reportId}.pdf`;
  const storagePath = `user_uploads/${userId}/${reportName}`;
  const storageRef = ref(storage, storagePath);
  
  let downloadURL = "";
  try {
    await uploadBytes(storageRef, pdfBlob);
    checkSignal();
    onStatusUpdate?.("Saving to dashboard...");
    downloadURL = await getDownloadURL(storageRef);
  } catch (uploadError) {
    console.warn("Failed to upload PDF to storage. The report will be saved without a PDF link.", uploadError);
    // Continue saving to Firestore even if Storage fails
  }

  // 5. Save to Firestore (including Markdown content)
  const docRef = await addDoc(collection(db, "users", userId, "reports"), {
    name: reportName,
    downloadURL,
    storagePath,
    markdownContent,
    createdAt: serverTimestamp(),
    personalNote: personalNote || null,
    type: 'pdf'
  });

  return { id: docRef.id, name: reportName, downloadURL };
}
