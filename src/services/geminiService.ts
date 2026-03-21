import { GoogleGenAI, Type } from "@google/genai";
import { Insight, Suggestion } from "../../types";

export interface AnalysisResult {
  score: number;
  event: string;
  action: string;
  suggestions: Suggestion[];
}

export const analyzeDesktopImage = async (base64Image: string, customApiKey?: string): Promise<AnalysisResult> => {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `你是一个专业的桌面整理专家。请分析这张桌面图片，并给出以下信息：
            1. 整洁度评分 (0-100)。
            2. 一个简短的总结事件 (例如：检测到桌面杂乱)。
            3. 一个简短的行动建议 (例如：建议启动机器人清理)。
            4. 具体的优化建议列表，每个建议包含：
               - label: 建议标题 (例如：清理水杯)
               - desc: 详细描述 (例如：将桌面上的空水杯移走)
               - impact: 量化的改进分数 (例如：整洁度 +10)
            
            请以 JSON 格式返回。`,
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1],
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "整洁度评分 (0-100)" },
          event: { type: Type.STRING, description: "总结事件" },
          action: { type: Type.STRING, description: "行动建议" },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                desc: { type: Type.STRING },
                impact: { type: Type.STRING },
              },
              required: ["label", "desc", "impact"],
            },
          },
        },
        required: ["score", "event", "action", "suggestions"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}");
  return result as AnalysisResult;
};
