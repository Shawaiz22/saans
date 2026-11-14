/**
 * @file route.ts
 * @description API endpoint for generating tailored citizen air quality advisories.
 * Supports languages: 'en' | 'hi' | 'ur' and reading levels: 'simple' | 'detailed'.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "@/lib/rateLimit";

const AdvisoryRequestSchema = z.object({
  brief: z.any(),
  language: z.enum(["en", "hi", "ur"]).default("en"),
  level: z.enum(["simple", "detailed"]).default("simple"),
});

const AdvisoryResponseSchema = z.object({
  title: z.string(),
  generalNotice: z.string(),
  children: z.string(),
  olderAdults: z.string(),
  sensitive: z.string(),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
});

type AdvisoryResponse = z.infer<typeof AdvisoryResponseSchema>;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.json();
    const parsed = AdvisoryRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid advisory parameters." },
        { status: 400 }
      );
    }

    const { brief, language, level } = parsed.data;
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    let advisory: AdvisoryResponse;

    if (apiKey && apiKey.trim().length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const langName =
          language === "hi" ? "Hindi (हिंदी)" : language === "ur" ? "Urdu (اردو)" : "English";
        const levelPrompt =
          level === "simple"
            ? "Simple Grade-5 conversational reading level with no technical jargon."
            : "Detailed civic-grade advisory with health context and explanations.";

        const prompt = `You are a public health communicator. Create a citizen air quality advisory based on this brief:
${JSON.stringify(brief)}

Language: ${langName}
Level: ${levelPrompt}

Respond ONLY with valid JSON:
{
  "title": string,
  "generalNotice": string,
  "children": string,
  "olderAdults": string,
  "sensitive": string,
  "dos": [string],
  "donts": [string]
}`;

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const json = JSON.parse(response.text || "{}");
        advisory = AdvisoryResponseSchema.parse(json);
      } catch {
        advisory = generateFallbackAdvisory(language, level);
      }
    } else {
      advisory = generateFallbackAdvisory(language, level);
    }

    return NextResponse.json({
      success: true,
      language,
      level,
      isRtl: language === "ur",
      advisory,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to generate advisory at this moment." },
      { status: 500 }
    );
  }
}

function generateFallbackAdvisory(language: string, level: string): AdvisoryResponse {
  if (language === "ur") {
    return {
      title: "عوامی صحت کی ایڈوائزری - فضائی آلودگی کی وارننگ",
      generalNotice:
        level === "simple"
          ? "آج ہوا بہت خراب ہے۔ غیر ضروری باہر نہ نکلیں اور ماسک کا استعمال کریں۔"
          : "فضائی معیار کے حالیہ معائنے کے مطابق باریک ذرات (PM2.5) کی مقدار خطرے کی سطح سے تجاوز کر چکی ہے۔ احتیاطی تدابیر اختیار کریں۔",
      children: "بچوں کو باہر کھیلنے سے روکیں اور اسکول وین یا بس میں کھڑکیاں بند رکھیں۔",
      olderAdults: "بزرگ صبح کی سیر سے پرہیز کریں اور گھر پر ہی ہلکی ورزش کریں۔",
      sensitive: "دمہ اور سانس کے مریض اپنا انہیلر پاس رکھیں اور آلودہ فضا سے دور رہیں۔",
      dos: ["گھر کی کھڑکیاں بند رکھیں", "باہر نکلتے وقت N95 ماسک پہنیں", "پانی کا زیادہ استعمال کریں"],
      donts: ["کوڑا کرکٹ یا پتے نہ جلائیں", "صبح کی دھند میں ورزش نہ کریں"],
    };
  }

  if (language === "hi") {
    return {
      title: "नागरिक स्वास्थ्य परामर्श - वायु प्रदूषण चेतावनी",
      generalNotice:
        level === "simple"
          ? "हवा की गुणवत्ता खराब है। कृपया बाहर जाते समय मास्क पहनें और खिड़कियां बंद रखें।"
          : "वायु गुणवत्ता निगरानी के अनुसार कण प्रदूषण (PM2.5) चिंताजनक स्तर पर पहुंच गया है। सार्वजनिक स्वास्थ्य सुरक्षा के लिए दिशा-निर्देशों का पालन करें।",
      children: "बच्चों को खुली हवा में खेलने से रोकें और उन्हें इनडोर गतिविधियों में व्यस्त रखें।",
      olderAdults: "वरिष्ठ नागरिक सुबह की सैर से बचें और दोपहर में ही घर से बाहर निकलें।",
      sensitive: "अस्थमा और फेफड़ों के मरीज इन्हेलर हमेशा साथ रखें और तुरंत डॉक्टर से संपर्क करें।",
      dos: ["घर के दरवाजे और खिड़कियां बंद रखें", "बाहर जाते समय N95 मास्क पहनें", "पर्याप्त पानी पिएं"],
      donts: ["कूड़ा या पत्तियां न जलाएं", "धुंध के समय दौड़ने या भारी कसरत से बचें"],
    };
  }

  return {
    title: "Public Health Advisory - Air Quality Action Alert",
    generalNotice:
      level === "simple"
        ? "Air pollution is high today. Limit outdoor exposure and wear a mask when outside."
        : "Recent atmospheric telemetry indicates fine particulate matter (PM2.5) has breached safe civic thresholds across monitored sectors.",
    children: "Keep children indoors during recess and physical education periods to prevent airway irritation.",
    olderAdults: "Seniors should avoid early morning walks and engage in low-strain indoor exercise instead.",
    sensitive: "Persons with asthma, COPD, or cardiac history should keep rescue medication on hand and stay indoors.",
    dos: [
      "Keep residential windows and doors closed during peak pollution hours",
      "Wear certified N95 masks when stepping into outdoor public areas",
      "Stay well-hydrated throughout the day",
    ],
    donts: [
      "Do not burn biomass, leaves, or municipal waste",
      "Avoid high-intensity outdoor cardio exercises during smog episodes",
    ],
  };
}
