/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import mammoth from "mammoth";
import * as pdfParse from "pdf-parse";
import PDFDocument from "pdfkit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// High limits for documents
app.use(express.json({ limit: "25mb" }));

// Lazy initializer for Gemini client to prevent crash if key is missing during startup
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Check password matching
app.get("/api/check-password", (req, res) => {
  const masterPassword = process.env.APP_PASSWORD;
  const hasMasterPassword = !!masterPassword;
  const clientPass = req.query.password as string;

  if (!hasMasterPassword) {
    return res.json({ isPasswordRequired: false, isCorrect: true });
  }

  return res.json({
    isPasswordRequired: true,
    isCorrect: clientPass === masterPassword,
  });
});

// Middleware to protect core generator APIs
function requirePassword(req: express.Request, res: express.Response, next: express.NextFunction) {
  const masterPassword = process.env.APP_PASSWORD;
  if (!masterPassword) {
    return next();
  }

  const clientPass = req.headers["x-app-password"] as string;
  if (clientPass !== masterPassword) {
    return res.status(401).json({ error: "Unauthorized. Incorrect or missing access password." });
  }
  next();
}

// Parse document text from Base64
app.post("/api/parse-file", async (req, res) => {
  const { fileName, base64Content } = req.body;
  
  if (!fileName || !base64Content) {
    return res.status(400).json({ error: "Missing required file name or content" });
  }

  try {
    const buffer = Buffer.from(base64Content, "base64");
    const lowerName = fileName.toLowerCase();
    let text = "";

    if (lowerName.endsWith(".txt")) {
      text = buffer.toString("utf-8");
    } else if (lowerName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: buffer });
      text = result.value;
    } else if (lowerName.endsWith(".pdf")) {
      let parsedText = "";
      const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      if (pdfParse && typeof pdfParse.PDFParse === "function") {
        const instance = new pdfParse.PDFParse(uint8Array);
        const data = await instance.getText();
        parsedText = data.text;
      } else {
        const parseFn = typeof pdfParse === "function" ? pdfParse : ((pdfParse as any).default || pdfParse);
        if (typeof parseFn !== "function") {
          throw new Error("Could not find a valid PDF parsing function in the loaded module.");
        }
        const data = await parseFn(uint8Array);
        parsedText = data.text;
      }
      text = parsedText;
    } else {
      return res.status(400).json({ error: "Unsupported format. Use .txt, .docx, or .pdf files." });
    }

    res.json({ success: true, text, fileName });
  } catch (error: any) {
    res.status(500).json({ error: `File parsing error: ${error.message || error}` });
  }
});

// AI Core Tailoring logic
app.post("/api/tailor", requirePassword, async (req, res) => {
  const { baseResumeText, jobDescriptionText, companyName } = req.body;

  if (!baseResumeText || !jobDescriptionText) {
    return res.status(400).json({ error: "Please provide both base resume text and job description." });
  }

  const cleanCompanyName = (companyName || "Target Company").trim();

  try {
    const client = getGenAI();
    const prompt = `You are an elite Fortune 500 Executive Resume Writer & ATS Specialist.
Tailor this applicant's BASE RESUME against the target JOB DESCRIPTION.

CORE DIRECTIVES:
1. ZERO DATA LOSS: KEEP all roles, dates, companies, and project names and bullets! Do NOT summarize or shorten existing career history. Maintain the exact depth, timelines, and quantitative impact of the resume!
2. KEYWORD MAPPING: Interweave target Job Description skills, keywords, and action phrases into the bullets accurately, organically, and quantitatively.
3. ATS-Separators: Render clear headings for SUMMARY, SKILLS, EXPERIENCE, EDUCATION.
4. HEADINGS: SECTION HEADERS (like EXPERIENCE, EDUCATION) must occupy their own standalone lines, formatted in pure UPPERCASE.
5. ROLE DIVISION (Sub-Headings): Any Job Role / Company header must begin exactly with "### " (Example: "### Analyst | Google" or "### Engineer | Amazon").
6. BULLETS: Bullet points detailing achievements and metrics must start strictly with "- ". Do not use custom spacing lines, emojis, or asterisk multipliers like * or --.

COVER LETTER REQUIREMENTS:
Write a perfectly tailored, elegant professional business cover letter styled with distinct paragraphs separated by double linebreaks \\n\\n. Standard business dynamic alignment.

BASE RESUME:
${baseResumeText}

JOB DESCRIPTION:
${jobDescriptionText}
`;

    const aiResponse = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert dual ATS resume parser and recruitment copywriter. You accurately map skills while generating clear, structured layouts containing exact sections. Output must strictly respect the prompt schema rules.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            resume: {
              type: Type.STRING,
              description: "The tailored ATS resume layout maintaining all details, with ### subheadings for roles and uppercase headers.",
            },
            cover_letter: {
              type: Type.STRING,
              description: "The personalized executive cover letter for standard business applications.",
            },
          },
          required: ["resume", "cover_letter"],
        },
      },
    });

    const outputText = aiResponse.text;
    if (!outputText) {
      throw new Error("No response output returned from Gemini AI.");
    }

    const payload = JSON.parse(outputText.trim());
    res.json({
      success: true,
      resumeMarkdown: payload.resume,
      coverLetterMarkdown: payload.cover_letter,
      projectName: cleanCompanyName,
    });
  } catch (error: any) {
    res.status(500).json({ error: `AI tailoring failed: ${error.message || error}` });
  }
});

/**
 * 🎨 ATS TYPESETTING PDF GENERATOR
 */
function createResumePDF(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" }); // Standard A4, 0.5 in padding
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let isFirstLine = true;

    lines.forEach((line, index) => {
      const cleanLine = line.trim();
      if (!cleanLine) {
        doc.moveDown(0.25);
        return;
      }

      // Strips visual asterisk decorations or markdown weight blocks
      const cleanText = cleanLine.replace(/\*\*|\*/g, "").replace(/^[-•]\s*/, "- ");

      try {
        doc.x = 36; // Stabilize margins

        if (isFirstLine) {
          // Centered Header Name
          doc.font("Helvetica-Bold").fontSize(18).fillColor("#1a1a1a").text(cleanText, { align: "center" });
          doc.moveDown(0.2);
          isFirstLine = false;
          return;
        }

        // Check for Contact Details Row (typically Email / Phone / Links on lines 2-3)
        const lower = cleanText.toLowerCase();
        if (index < 3 && (lower.includes("@") || lower.includes("github") || lower.includes("linkedin") || lower.includes("|") || lower.includes("+"))) {
          doc.font("Helvetica").fontSize(9.5).fillColor("#4a4a4a").text(cleanText, { align: "center" });
          doc.moveDown(0.35);
          return;
        }

        // CAPS Headers -> Deep Executive Blue Separators
        if (cleanText.toUpperCase() === cleanText && cleanText.length < 32 && !cleanText.startsWith("-") && !cleanText.startsWith("#")) {
          doc.moveDown(0.7);
          doc.font("Helvetica-Bold").fontSize(11).fillColor("#003366").text(cleanText);
          
          // Draw bottom line
          const currentY = doc.y + 2;
          doc.strokeColor("#c0c0c0").lineWidth(0.8).moveTo(36, currentY).lineTo(559, currentY).stroke();
          doc.moveDown(0.4);
          return;
        }

        // Job Details Row (### prefix)
        if (cleanText.startsWith("### ")) {
          const content = cleanText.replace("### ", "").trim();
          doc.moveDown(0.3);
          doc.font("Helvetica-Bold").fontSize(10).fillColor("#222222").text(content);
          doc.moveDown(0.1);
          return;
        }

        // Bullet points with perfect indentation
        if (cleanText.startsWith("- ")) {
          const bulletContent = cleanText.substring(2).trim();
          doc.font("Helvetica").fontSize(9.5).fillColor("#2d2d2d");
          doc.text("•  ", { continued: true, indent: 15 });
          doc.text(bulletContent, { indent: 15, lineGap: 1.5 });
          return;
        }

        // Plain Normal Paragraph Text
        doc.font("Helvetica").fontSize(9.5).fillColor("#2d2d2d").text(cleanText, { lineGap: 1.5 });

      } catch (err) {
        // Safe fallback
        doc.x = 36;
        doc.font("Helvetica").fontSize(9.5);
        try {
          doc.text(cleanText.substring(0, 100));
        } catch (e) {}
      }
    });

    doc.end();
  });
}

/**
 * ✉️ COVER LETTER PDF GENERATOR
 */
function createCoverLetterPDF(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "A4" }); // Premium 0.75 in margins
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    doc.font("Helvetica").fontSize(11).fillColor("#2d2d2d");

    const lines = text.replace(/\r\n/g, "\n").split("\n");

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) {
        doc.moveDown(0.55);
        return;
      }

      const cleanText = cleanLine.replace(/\*\*|\*/g, "");
      doc.x = 54;

      if (cleanText.startsWith("Dear") || cleanText.startsWith("Sincerely") || cleanText.startsWith("Best regards") || cleanText.startsWith("Yours")) {
        doc.font("Helvetica-Bold").text(cleanText);
        doc.font("Helvetica");
      } else {
        doc.text(cleanText, { align: "justify", lineGap: 2.2 });
      }
    });

    doc.end();
  });
}

// REST endpoints to download generated PDFs
app.post("/api/download/resume", async (req, res) => {
  const { resumeText, companyName } = req.body;
  if (!resumeText) {
    return res.status(400).send("No resume content provided");
  }

  try {
    const pdfBuffer = await createResumePDF(resumeText);
    const filename = `${companyName || "Tailored"}_Resume.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).send(`PDF generation failed: ${error.message || error}`);
  }
});

app.post("/api/download/cover", async (req, res) => {
  const { coverText, companyName } = req.body;
  if (!coverText) {
    return res.status(400).send("No cover letter content provided");
  }

  try {
    const pdfBuffer = await createCoverLetterPDF(coverText);
    const filename = `${companyName || "Tailored"}_Cover_Letter.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).send(`PDF generation failed: ${error.message || error}`);
  }
});

// Setup dev server or static static assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AutoCV Service is online and listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
