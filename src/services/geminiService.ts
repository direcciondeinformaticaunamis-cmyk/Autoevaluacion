import { GoogleGenAI, Type } from "@google/genai";
import { OFFICIAL_MATRIX } from "../constants/matrix";
import { analyzeDocumentsOffline } from './offlineAnalyzer';

export interface DocumentInfo {
  filename: string;
  criterion: string;
  indicator: string;
  type: "Normativo" | "Académico" | "Evidencial";
  year: string;
  description: string;
}

export interface IndicatorAnalysis {
  indicator: string;
  description: string;
  documents: {
    name: string;
    type: string;
    year: string;
    focus: "alto" | "medio" | "bajo";
    status: "vigente" | "antiguo" | "duplicado";
    link: string;
    score?: number;
    matched?: string[];
  }[];
  technicalAnalysis: {
    complianceLevel: string;
    mathCoherence: string;
    resourceUsage: string;
    observations: string;
  };
  history: string;
  gaps: string[];
  recommendations: string[];
  finalSummary: string;
  state: "Completo" | "Parcial" | "Débil";
}

export async function analyzeDocuments(documentList: string): Promise<IndicatorAnalysis[]> {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  // Allow the app to run locally without any external dependency.
  if (!apiKey) {
    return analyzeDocumentsOffline(documentList);
  }

  const ai = new GoogleGenAI({ apiKey });
  const matrixContext = JSON.stringify(OFFICIAL_MATRIX);
  const prompt = `
    Actúa como un sistema experto en autoevaluación académica para la Licenciatura en Matemática (UNAMIS).
    
    TU TAREA ES CLASIFICAR los documentos según la MATRIZ OFICIAL.
    
    MATRIZ OFICIAL (Ground Truth):
    ${matrixContext}

    Instrucciones específicas:
    1. Si un nombre de archivo comienza con C1, C2 o C3, eso indica la Dimensión (C1=Dimensión 1, etc.).
    2. El ID del indicador suele estar presente en el nombre (ejemplo: 1.1.a, 2.1.b).
    3. Para cada indicador de la MATRIZ OFICIAL, identifica qué documentos de la lista del usuario le pertenecen.
    4. Evalúa si los documentos encontrados para un indicador cubren los "requiredDocs" listados.
    5. Solo genera resultados para los indicadores presentes en la MATRIZ OFICIAL proporcionada.

    Lista de documentos del usuario (Google Drive):
    ${documentList}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              indicator: { type: Type.STRING },
              description: { type: Type.STRING },
              documents: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING },
                    year: { type: Type.STRING },
                    focus: { type: Type.STRING },
                    status: { type: Type.STRING },
                    link: { type: Type.STRING }
                  }
                }
              },
              technicalAnalysis: {
                type: Type.OBJECT,
                properties: {
                  complianceLevel: { type: Type.STRING },
                  mathCoherence: { type: Type.STRING },
                  resourceUsage: { type: Type.STRING },
                  observations: { type: Type.STRING }
                }
              },
              history: { type: Type.STRING },
              gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              finalSummary: { type: Type.STRING },
              state: { type: Type.STRING }
            }
          }
        }
      }
    });

    const jsonStr = response.text;
    if (jsonStr) {
      return JSON.parse(jsonStr);
    }
    throw new Error("No se pudo obtener la respuesta en formato JSON.");
  } catch (error) {
    console.error("Error analyzing documents:", error);
    // If Gemini fails, keep the app functional by falling back to local analysis.
    return analyzeDocumentsOffline(documentList);
  }
}
