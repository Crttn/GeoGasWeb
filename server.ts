import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { MOCK_STATIONS, CITIES } from "./src/data";
import { GasStation } from "./src/types";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Safe lazy-init helper for Gemini API
  let aiClient: GoogleGenAI | null = null;
  function getAiClient(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in the environment secrets.");
      }
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  }

  // Helper for computing Haversine distance
  function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Earth's Radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // API router health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Dynamic /api/stations route combining live government API maps & local fallback setups
  app.get("/api/stations", async (req, res) => {
    const cityId = (req.query.city as string) || "spain";
    const centerLat = cityId === "sf" ? 37.7749 : 40.4168;
    const centerLon = cityId === "sf" ? -122.4194 : -3.7038;

    const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";

    try {
      if (cityId === "spain") {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const apiRes = await fetch(
          `${API_BASE_URL}/api/stations`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!apiRes.ok) {
          throw new Error(`API responded with status ${apiRes.status}`);
        }

        const data: any = await apiRes.json();
        const rawList = data.stations || [];

        const mappedStations: GasStation[] = [];

        rawList.forEach((item: any) => {
          const lat = item.latitud;
          const lon = item.longitud;

          if (!lat || !lon) return;

          const distKm = getDistance(centerLat, centerLon, lat, lon);

          const rotulo = (item.rotulo || "GENERIC").toUpperCase();
          let brand: GasStation["brand"] = "generic";
          let logoUrl = undefined;

          if (rotulo.includes("REPSOL")) {
            brand = "repsol";
            logoUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1YvyTN9XAyyqpNNy10j8J9dGCfYFyB8-m_9bOrCUbkHFchRQEUCCB4KyHqrpSb5aSuJwmDGXUEJJTMdPD3f0HZ6Kxgx3Sxzq3UBr127hc0r7AGx-_3AEjULxLi28xFV2f0iPR992WcPa3gVGXG3qJ0TRxQXu1vpNQR8Jqa9KkcWjzRLEObwgHUN56SMpe64LuO1hJYnG-dzD_JzGljZgL8tnewO-s_w74-x-1TaVnTSt5zRsDKiE9pDFJr10ZD_nzzURzf2W2uxA';
          } else if (rotulo.includes("CEPSA")) {
            brand = "cepsa";
            logoUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCQ78cMkQA419g2Jhl9L7_ca5KVejUOma2I-oq51tJx4WkKCVUEKLSNhne3mxHPyz36dF2tfd9FPZaKWIDTZigeA9E1xO-aV6RqfIll6Iix1NkS3DjdCkYsGXrFjPyapvzDfTvDvuVFPOw3Tbn_g5kPU2_1sB9cZn_Yp7b3hMAdqXUrm54oYBAJuURxEx9-iqLZri6CIu9V0JCpDmO_TMQg7FjO67ZXxClxGPdIB7q7wnH7ZNaQ2zL8EMYxmqdhZBN2GPuoXwf5vaU';
          } else if (rotulo.includes("SHELL")) {
            brand = "shell";
            logoUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBiQhuV9FvE9rg19dXAHaRESys51DdG65jpOcwMoUdrc9XLL4Pb3Jph5Tbw8_zmsOSvrcglzmTHDvhhCagAvUrPRNF_SwHkHZGo6qNhEvWL7x0fQjAcxcRuh04XCnZPhD7QUoG-Rv75kWtwMbNOcNXKz7rXe5DPe32ghAWNlJyagCV6qZbkIKMmJpzGQNjWJroC4ogEGnI0ndQ9XzXXsyVP2YfL9ca8SmsZPHfo2U529JgIorIpgCrTkcip60rNr-nhEIAKhbs27Bs';
          } else if (rotulo.includes("DISA")) {
            brand = "disa";
          } else if (rotulo.includes("BP")) {
            brand = "bp";
            logoUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCriqCWrv-2bcvQtRMKS4Z2V4diu0YdvFuOeQ-uUYbeb_cHL3W6gqZtTYUSISryLT1nInb8QclUjkjvr2tqiPqAGJiB4F-3f9G3x5ww_hNRQvGBiSobAlLwsROshHnMcFtUaRkfKXLQlvt81z7ho64_gjnQg5WimCI8iO3R2g-NkCDWGTXk6bk6Nf-ykgdoVP8C-QUC52J6p8VgBmClUr2Hci43cOJnidrEzKtIMho-F-gNfHJD85JMn6fJwz19YCQ14HX2WeUZbI8';
          }

          // Map prices from database format to frontend fuel keys
          const prices: Record<string, number> = {};
          const priceMap: Record<string, string> = {
            "Gasolina 95 E5": "G95 E5",
            "Gasolina 98 E5": "G98 E5",
            "Gasóleo A": "DIÉSEL",
            "Gasóleo Premium": "DIÉSEL+"
          };
          if (item.precios) {
            item.precios.forEach((p: any) => {
              const key = priceMap[p.tipoCombustible];
              if (key && p.precio > 0) {
                prices[key] = p.precio;
              }
            });
          }

          if (prices["G95 E5"] > 0 || prices["DIÉSEL"] > 0) {
            mappedStations.push({
              id: String(item.idMinisterio) || `api-tf-${mappedStations.length}`,
              name: item.rotulo || "Gasolinera sin nombre",
              brand,
              address: item.direccion || "Dirección desconocida",
              municipality: item.municipio || "",
              distance: parseFloat(distKm.toFixed(1)),
              latitude: lat,
              longitude: lon,
              prices: {
                "G95 E5": prices["G95 E5"] || 1.459,
                "G98 E5": prices["G98 E5"] || 1.612,
                "DIÉSEL": prices["DIÉSEL"] || 1.342,
                "DIÉSEL+": prices["DIÉSEL+"] || 1.419,
              },
              isOpen: true,
              hours: "Abierto",
              logoUrl,
              provinciaId: item.provinciaId,
              provinciaNombre: item.provinciaNombre,
            });
          }
        });

        if (mappedStations.length > 0) {
          mappedStations.sort((a, b) => a.distance - b.distance);
          return res.json({ stations: mappedStations, source: "live_api" });
        } else {
          throw new Error("No stations mapped from API input.");
        }
      } else {
        // San Francisco: Create dynamic generated real-time stations reflecting US parameters
        const baseStations = MOCK_STATIONS["sf"];
        const todaySeed = new Date().getDate(); // Variation cycle
        
        const mappedStations = baseStations.map((s, idx) => {
          const priceVariance = (idx % 2 === 0 ? 1 : -1) * 0.05 * Math.sin(todaySeed + idx);
          
          const prices: Record<string, number> = {};
          Object.entries(s.prices).forEach(([fuel, price]) => {
            prices[fuel] = parseFloat((price + priceVariance).toFixed(2));
          });

          const distKm = getDistance(centerLat, centerLon, s.latitude, s.longitude);
          const distMiles = parseFloat((distKm * 0.621371).toFixed(1));

          return {
            ...s,
            distance: distMiles,
            prices
          };
        });

        return res.json({ stations: mappedStations, source: "live_api" });
      }
    } catch (e: any) {
      console.warn(`[GeoGas API Warning] Live API failed, falling back to data.ts defaults: ${e.message}`);
      return res.json({ 
        stations: MOCK_STATIONS[cityId as "sf" | "spain"] || [], 
        source: "local_fallback",
        error: e.message 
      });
    }
  });

  // Smart Fuel Advisor Endpoint
  app.post("/api/assistant", async (req, res) => {
    try {
      const { messages, city, selectedFuel, stations } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }

      // Lazy-get client or fail gracefully
      const ai = getAiClient();

      // System instructions grounded with details about user context
      const sysInstruction = `You are the GeoGas Smart Fuel Advisor. 
You help users optimize their refueling choices, find cheap stations, calculate fuel savings, and plan routes.
Here is the user's current context:
- Active City: ${city === 'sf' ? 'San Francisco, CA' : 'España'}
- Fuel Unit: ${city === 'sf' ? 'Gallons' : 'Liters'}
- Currency: ${city === 'sf' ? 'USD ($)' : 'Euro (€)'}
- Active Fuel Selected: ${selectedFuel}
- Nearby Gas Stations with real-time prices:
${JSON.stringify(stations, null, 2)}

Ground your recommendations strictly in these active stations. 
If asked for calculations, do the math (e.g., cost to fill a typical 50 Liter or 12 Gallon tank).
Keep descriptions concise, technical, and directly useful for motorists.
Respond in the language of the prompt (if Spanish, answer in Spanish, etc.), default to Spanish for Spain context / English for SF context unless requested otherwise.
Always list real prices, names, and address details.`;

      // Map messages to Gemini Content schema format
      const recentMessages = messages.slice(-10); // Keep last 10 messages for token context
      const prompt = recentMessages[recentMessages.length - 1]?.content || "Hola, ¿cómo puedo ahorrar hoy?";

      // Build chat background history omitting the last user prompt which goes inside contents
      const chatHistory = recentMessages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Call Gemini API using generateContent with system instruction config
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          ...chatHistory,
          { role: "user", parts: [{ text: prompt }] }
        ],
        config: {
          systemInstruction: sysInstruction,
          temperature: 0.7,
        },
      });

      const replyText = response.text || "Lo siento, no he podido procesar esa sugerencia en este momento.";
      return res.json({ response: replyText });

    } catch (error: any) {
      console.error("Gemini Advisor API Error:", error);
      return res.status(500).json({ 
        error: "Failed to query Smart Advisor.", 
        message: error.message || "An unexpected error occurred on the server."
      });
    }
  });

  // Vite integration
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
    console.log(`[GeoGas Server] running on http://0.0.0.0:${PORT} under NODE_ENV=${process.env.NODE_ENV}`);
  });
}

startServer();
